import { CapabilityDefinition, AppStatus, PlatformInfo, DeploymentResult, DatabaseInfo, RunbookData, VerificationResult } from './types.js';
import { config } from './config.js';
import { sanitizeAppName } from './security.js';
import { validateArgs, AppNameSchema, EnvVarSchema, MigrationFileSchema, BackupNameSchema } from './validate.js';
import { writeFile, mkdir, access, readdir } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';
import * as docker from './docker.js';
import * as db from './database.js';
import * as v1 from './v1_tools.js';

// Platform Capabilities

async function platformInfo(): Promise<PlatformInfo> {
  return {
    version: '2.0.0',
    uptime: process.uptime(),
    capabilities: getAllCapabilityNames(),
    limits: {
      maxApps: 50,
      maxDbSize: '10GB',
    },
  };
}

async function platformCheck(): Promise<{ healthy: boolean; checks: Record<string, boolean> }> {
  const checks: Record<string, boolean> = {};
  
  // Check Docker
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    await promisify(exec)('docker info');
    checks.docker = true;
  } catch {
    checks.docker = false;
  }
  
  // Check PostgreSQL
  try {
    const pool = db.getPool();
    await pool.query('SELECT 1');
    checks.postgres = true;
  } catch {
    checks.postgres = false;
  }
  
  // Check apps directory
  try {
    await access(config.appsRoot);
    checks.appsRoot = true;
  } catch {
    checks.appsRoot = false;
  }
  
  return {
    healthy: Object.values(checks).every(v => v),
    checks,
  };
}

// Application Capabilities

async function appsList(): Promise<string[]> {
  try {
    const entries = await readdir(config.appsRoot, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}

async function appsStatus(args: Record<string, unknown>): Promise<AppStatus> {
  const { appName } = validateArgs(z.object({ appName: AppNameSchema }), args);
  
  const appPath = join(config.appsRoot, sanitizeAppName(appName));
  
  let exists = false;
  try {
    await access(appPath);
    exists = true;
  } catch {
    exists = false;
  }
  
  const dockerRunning = exists ? await docker.isDockerRunning(appPath) : false;
  const dbExists = await db.databaseExists(appName);
  
  let health: 'healthy' | 'unhealthy' | 'unknown' = 'unknown';
  if (exists && dockerRunning && dbExists) {
    health = 'healthy';
  } else if (exists && (!dockerRunning || !dbExists)) {
    health = 'unhealthy';
  }
  
  return {
    name: appName,
    exists,
    dockerRunning,
    dbExists,
    health,
  };
}

async function appsHealth(args: Record<string, unknown>): Promise<{ status: string; details: Record<string, unknown> }> {
  const { appName } = validateArgs(z.object({ appName: AppNameSchema }), args);
  
  const status = await appsStatus({ appName });
  
  return {
    status: status.health,
    details: {
      docker: status.dockerRunning ? 'running' : 'stopped',
      database: status.dbExists ? 'exists' : 'missing',
    },
  };
}

async function appsInit(args: Record<string, unknown>): Promise<DeploymentResult> {
  const { appName } = validateArgs(z.object({ appName: AppNameSchema }), args);
  
  const safeName = sanitizeAppName(appName);
  const appPath = join(config.appsRoot, safeName);
  
  // Create app directory
  await mkdir(appPath, { recursive: true });
  
  // Create subdirectories
  await mkdir(join(appPath, 'config'), { recursive: true });
  await mkdir(join(appPath, 'migrations'), { recursive: true });
  await mkdir(join(appPath, 'seeds'), { recursive: true });
  
  // Create default docker-compose.yml
  const defaultCompose = `version: '3.8'

services:
  app:
    image: node:20-alpine
    working_dir: /app
    command: npm start
    ports:
      - "\${PORT:-3000}:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@postgres:5432/\${POSTGRES_DB}
    volumes:
      - ./src:/app
    depends_on:
      - postgres
  
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: \${POSTGRES_DB}
      POSTGRES_USER: \${POSTGRES_USER}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  postgres-data:
`;
  
  await writeFile(join(appPath, 'docker-compose.yml'), defaultCompose, 'utf-8');
  
  return {
    success: true,
    message: `Application ${appName} initialized`,
    details: { path: appPath },
  };
}

async function appsRemove(args: Record<string, unknown>): Promise<DeploymentResult> {
  const { appName } = validateArgs(z.object({ appName: AppNameSchema }), args);
  
  const safeName = sanitizeAppName(appName);
  const appPath = join(config.appsRoot, safeName);
  
  // Stop Docker containers
  try {
    await docker.dockerComposeDown({ cwd: appPath });
  } catch {
    // Ignore if already stopped
  }
  
  // Drop database
  try {
    await db.dropDatabase(appName);
  } catch {
    // Ignore if doesn't exist
  }
  
  // Remove directory
  const { rm } = await import('fs/promises');
  await rm(appPath, { recursive: true, force: true });
  
  return {
    success: true,
    message: `Application ${appName} removed`,
  };
}

async function appsEnvExample(args: Record<string, unknown>): Promise<string> {
  const { appName } = validateArgs(z.object({ appName: AppNameSchema }), args);
  
  return `# Environment variables for ${appName}

PORT=3000
NODE_ENV=production

POSTGRES_DB=${appName}
POSTGRES_USER=${config.postgres.user}
POSTGRES_PASSWORD=change_me_in_production
`;
}

async function appsValidate(args: Record<string, unknown>): Promise<{ valid: boolean; errors: string[] }> {
  const { appName } = validateArgs(z.object({ appName: AppNameSchema }), args);
  
  const errors: string[] = [];
  const safeName = sanitizeAppName(appName);
  const appPath = join(config.appsRoot, safeName);
  
  // Check directory exists
  try {
    await access(appPath);
  } catch {
    errors.push('App directory does not exist');
  }
  
  // Check docker-compose.yml exists
  try {
    await access(join(appPath, 'docker-compose.yml'));
  } catch {
    errors.push('docker-compose.yml not found');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// Deployment Capabilities

async function deployUp(args: Record<string, unknown>): Promise<DeploymentResult> {
  const { appName, env } = validateArgs(
    z.object({ 
      appName: AppNameSchema,
      env: EnvVarSchema.optional(),
    }), 
    args
  );
  
  const safeName = sanitizeAppName(appName);
  const appPath = join(config.appsRoot, safeName);
  
  const output = await docker.dockerComposeUp({
    cwd: appPath,
    env: env || {},
  });
  
  return {
    success: true,
    message: `Application ${appName} deployed`,
    details: { output },
  };
}

async function deployDown(args: Record<string, unknown>): Promise<DeploymentResult> {
  const { appName } = validateArgs(z.object({ appName: AppNameSchema }), args);
  
  const safeName = sanitizeAppName(appName);
  const appPath = join(config.appsRoot, safeName);
  
  const output = await docker.dockerComposeDown({ cwd: appPath });
  
  return {
    success: true,
    message: `Application ${appName} stopped`,
    details: { output },
  };
}

async function deployRestart(args: Record<string, unknown>): Promise<DeploymentResult> {
  const { appName } = validateArgs(z.object({ appName: AppNameSchema }), args);
  
  const safeName = sanitizeAppName(appName);
  const appPath = join(config.appsRoot, safeName);
  
  const output = await docker.dockerComposeRestart({ cwd: appPath });
  
  return {
    success: true,
    message: `Application ${appName} restarted`,
    details: { output },
  };
}

// Database Capabilities

async function dbCreate(args: Record<string, unknown>): Promise<DatabaseInfo> {
  const { appName } = validateArgs(z.object({ appName: AppNameSchema }), args);
  
  await db.createDatabase(appName);
  
  return db.getDatabaseInfo(appName);
}

async function dbMigrate(args: Record<string, unknown>): Promise<DeploymentResult> {
  const { appName, sql } = validateArgs(
    z.object({
      appName: AppNameSchema,
      sql: MigrationFileSchema,
    }),
    args
  );
  
  await db.executeMigration(appName, sql);
  
  return {
    success: true,
    message: `Migration executed for ${appName}`,
  };
}

async function dbSeed(args: Record<string, unknown>): Promise<DeploymentResult> {
  const { appName, sql } = validateArgs(
    z.object({
      appName: AppNameSchema,
      sql: MigrationFileSchema,
    }),
    args
  );
  
  await db.executeSeed(appName, sql);
  
  return {
    success: true,
    message: `Seed data inserted for ${appName}`,
  };
}

async function dbBackup(args: Record<string, unknown>): Promise<{ backupPath: string }> {
  const { appName, backupName } = validateArgs(
    z.object({
      appName: AppNameSchema,
      backupName: BackupNameSchema,
    }),
    args
  );
  
  const backupPath = await db.createBackup(appName, backupName);
  
  return { backupPath };
}

async function dbStatus(args: Record<string, unknown>): Promise<DatabaseInfo> {
  const { appName } = validateArgs(z.object({ appName: AppNameSchema }), args);
  
  return db.getDatabaseInfo(appName);
}

// Artifact Capabilities

async function artifactGenerateRunbook(args: Record<string, unknown>): Promise<RunbookData> {
  const { appName } = validateArgs(z.object({ appName: AppNameSchema }), args);
  
  const status = await appsStatus({ appName });
  
  return {
    appName,
    version: '1.0.0',
    deployedAt: new Date().toISOString(),
    config: {
      docker: status.dockerRunning,
      database: status.dbExists,
    },
    healthChecks: [
      'docker compose ps',
      'curl http://localhost:3000/health',
      'psql -c "SELECT 1"',
    ],
    rollbackProcedure: 'Run: deploy.down, restore database backup, deploy.up',
  };
}

async function artifactVerifyRelease(args: Record<string, unknown>): Promise<VerificationResult> {
  const { appName } = validateArgs(z.object({ appName: AppNameSchema }), args);
  
  const checks = [];
  
  // Check app exists
  const status = await appsStatus({ appName });
  checks.push({
    name: 'app_exists',
    passed: status.exists,
    details: status.exists ? 'Application directory found' : 'Application not initialized',
  });
  
  // Check Docker running
  checks.push({
    name: 'docker_running',
    passed: status.dockerRunning,
    details: status.dockerRunning ? 'Containers running' : 'Containers not running',
  });
  
  // Check database
  checks.push({
    name: 'database_exists',
    passed: status.dbExists,
    details: status.dbExists ? 'Database exists' : 'Database not created',
  });
  
  const allPassed = checks.every(c => c.passed);
  
  return {
    verified: allPassed,
    checks,
    summary: allPassed 
      ? `Release verified for ${appName}` 
      : `Release verification failed for ${appName}`,
  };
}

// Registry

export const CAPABILITIES: CapabilityDefinition[] = [
  // Platform
  {
    name: 'platform.info',
    description: 'Get platform information and available capabilities',
    requiredRole: 'observer',
    schema: {
      type: 'object',
      properties: {},
    },
    handler: platformInfo,
  },
  {
    name: 'platform.check',
    description: 'Check platform health (Docker, PostgreSQL, filesystem)',
    requiredRole: 'observer',
    schema: {
      type: 'object',
      properties: {},
    },
    handler: platformCheck,
  },
  
  // Applications
  {
    name: 'apps.list',
    description: 'List all deployed applications',
    requiredRole: 'observer',
    schema: {
      type: 'object',
      properties: {},
    },
    handler: appsList,
  },
  {
    name: 'apps.status',
    description: 'Get status of a specific application',
    requiredRole: 'observer',
    schema: {
      type: 'object',
      properties: {
        appName: { type: 'string' },
      },
      required: ['appName'],
    },
    handler: appsStatus,
  },
  {
    name: 'apps.health',
    description: 'Check health of a specific application',
    requiredRole: 'observer',
    schema: {
      type: 'object',
      properties: {
        appName: { type: 'string' },
      },
      required: ['appName'],
    },
    handler: appsHealth,
  },
  {
    name: 'apps.init',
    description: 'Initialize a new application directory structure',
    requiredRole: 'builder',
    schema: {
      type: 'object',
      properties: {
        appName: { type: 'string' },
      },
      required: ['appName'],
    },
    handler: appsInit,
  },
  {
    name: 'apps.remove',
    description: 'Remove an application completely (containers, database, files)',
    requiredRole: 'admin',
    schema: {
      type: 'object',
      properties: {
        appName: { type: 'string' },
      },
      required: ['appName'],
    },
    handler: appsRemove,
  },
  {
    name: 'apps.env.example',
    description: 'Generate example environment variables for an application',
    requiredRole: 'observer',
    schema: {
      type: 'object',
      properties: {
        appName: { type: 'string' },
      },
      required: ['appName'],
    },
    handler: appsEnvExample,
  },
  {
    name: 'apps.validate',
    description: 'Validate application configuration and structure',
    requiredRole: 'observer',
    schema: {
      type: 'object',
      properties: {
        appName: { type: 'string' },
      },
      required: ['appName'],
    },
    handler: appsValidate,
  },
  
  // Deployment
  {
    name: 'deploy.up',
    description: 'Start application containers',
    requiredRole: 'operator',
    schema: {
      type: 'object',
      properties: {
        appName: { type: 'string' },
        env: { type: 'object' },
      },
      required: ['appName'],
    },
    handler: deployUp,
  },
  {
    name: 'deploy.down',
    description: 'Stop application containers',
    requiredRole: 'operator',
    schema: {
      type: 'object',
      properties: {
        appName: { type: 'string' },
      },
      required: ['appName'],
    },
    handler: deployDown,
  },
  {
    name: 'deploy.restart',
    description: 'Restart application containers',
    requiredRole: 'operator',
    schema: {
      type: 'object',
      properties: {
        appName: { type: 'string' },
      },
      required: ['appName'],
    },
    handler: deployRestart,
  },
  
  // Database
  {
    name: 'db.create',
    description: 'Create a new PostgreSQL database for an application',
    requiredRole: 'builder',
    schema: {
      type: 'object',
      properties: {
        appName: { type: 'string' },
      },
      required: ['appName'],
    },
    handler: dbCreate,
  },
  {
    name: 'db.migrate',
    description: 'Execute SQL migration on application database',
    requiredRole: 'builder',
    schema: {
      type: 'object',
      properties: {
        appName: { type: 'string' },
        sql: { type: 'string' },
      },
      required: ['appName', 'sql'],
    },
    handler: dbMigrate,
  },
  {
    name: 'db.seed',
    description: 'Insert seed data into application database',
    requiredRole: 'builder',
    schema: {
      type: 'object',
      properties: {
        appName: { type: 'string' },
        sql: { type: 'string' },
      },
      required: ['appName', 'sql'],
    },
    handler: dbSeed,
  },
  {
    name: 'db.backup',
    description: 'Create a backup of application database',
    requiredRole: 'operator',
    schema: {
      type: 'object',
      properties: {
        appName: { type: 'string' },
        backupName: { type: 'string' },
      },
      required: ['appName', 'backupName'],
    },
    handler: dbBackup,
  },
  {
    name: 'db.status',
    description: 'Get database status and information',
    requiredRole: 'observer',
    schema: {
      type: 'object',
      properties: {
        appName: { type: 'string' },
      },
      required: ['appName'],
    },
    handler: dbStatus,
  },
  
  // Artifacts
  {
    name: 'artifact.generate_runbook',
    description: 'Generate deployment runbook for an application',
    requiredRole: 'observer',
    schema: {
      type: 'object',
      properties: {
        appName: { type: 'string' },
      },
      required: ['appName'],
    },
    handler: artifactGenerateRunbook,
  },
  {
    name: 'artifact.verify_release',
    description: 'Verify application release status and readiness',
    requiredRole: 'observer',
    schema: {
      type: 'object',
      properties: {
        appName: { type: 'string' },
      },
      required: ['appName'],
    },
    handler: artifactVerifyRelease,
  },
  
  // V1 Tools
  {
    name: 'repo.clone',
    description: 'Clone/checkout a repository into the app source directory',
    requiredRole: 'builder',
    schema: {
      type: 'object',
      properties: {
        release_id: { type: 'string' },
        app_slug: { type: 'string' },
        git_url: { type: 'string' },
        ref: { type: 'string' },
      },
      required: ['release_id', 'app_slug', 'git_url'],
    },
    handler: v1.repoClone,
  },
  {
    name: 'supabase.ensure',
    description: 'Ensure Supabase self-host stack for this app is up',
    requiredRole: 'builder',
    schema: {
      type: 'object',
      properties: {
        release_id: { type: 'string' },
        app_slug: { type: 'string' },
      },
      required: ['release_id', 'app_slug'],
    },
    handler: v1.supabaseEnsure,
  },
  {
    name: 'supabase.apply',
    description: 'Apply migrations and deploy edge functions',
    requiredRole: 'builder',
    schema: {
      type: 'object',
      properties: {
        release_id: { type: 'string' },
        app_slug: { type: 'string' },
        project_path: { type: 'string' },
        functions: { type: 'array', items: { type: 'string' } },
      },
      required: ['release_id', 'app_slug', 'project_path'],
    },
    handler: v1.supabaseApply,
  },
  {
    name: 'release.deploy',
    description: 'Deploy application and configure reverse proxy',
    requiredRole: 'builder',
    schema: {
      type: 'object',
      properties: {
        release_id: { type: 'string' },
        app_slug: { type: 'string' },
        project_path: { type: 'string' },
        type: { type: 'string' },
        service: { type: 'string' },
        port: { type: 'number' },
        domain: { type: 'string' },
        healthcheck: { type: 'string' },
        env_required: { type: 'array', items: { type: 'string' } },
      },
      required: ['release_id', 'app_slug', 'project_path', 'type', 'service', 'port'],
    },
    handler: v1.releaseDeploy,
  },
];

export function getCapability(name: string): CapabilityDefinition | undefined {
  return CAPABILITIES.find(c => c.name === name);
}

export function getAllCapabilityNames(): string[] {
  return CAPABILITIES.map(c => c.name);
}

export async function getCapabilitiesForRole(role: string): Promise<CapabilityDefinition[]> {
  const { getRoleLevel } = await import('./roles.js');
  const userLevel = getRoleLevel(role as any);
  
  return CAPABILITIES.filter(c => {
    const requiredLevel = getRoleLevel(c.requiredRole);
    return userLevel >= requiredLevel;
  });
}