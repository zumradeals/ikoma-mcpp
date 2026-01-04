// Core types for IKOMA MCP

export type Role = 'observer' | 'operator' | 'builder' | 'admin';

export interface Config {
  serverMode: 'mcp' | 'http' | 'hybrid';
  mcpEnabled: boolean;
  httpEnabled: boolean;
  httpPort: number;
  postgres: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  apiKeyHash: string;
  appsRoot: string;
  auditLog: string;
  dockerSocket: string;
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
}

export interface AuditEntry {
  timestamp: string;
  requestId: string;
  capability: string;
  role: Role;
  arguments: Record<string, unknown>;
  result: 'success' | 'error';
  error?: string;
  duration: number;
}

export interface CapabilityDefinition {
  name: string;
  description: string;
  requiredRole: Role;
  schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (args: Record<string, unknown>, context: ExecutionContext) => Promise<unknown>;
}

export interface ExecutionContext {
  role: Role;
  requestId: string;
  timestamp: Date;
}

export interface AppStatus {
  name: string;
  exists: boolean;
  dockerRunning: boolean;
  dbExists: boolean;
  health: 'healthy' | 'unhealthy' | 'unknown';
}

export interface PlatformInfo {
  version: string;
  uptime: number;
  capabilities: string[];
  limits: {
    maxApps: number;
    maxDbSize: string;
  };
}

export interface V1ResponseEnvelope {
  ok: boolean;
  release_id: string;
  action: string;
  started_at: string;
  ended_at: string;
  summary: string;
  warnings: string[];
  artifacts: Record<string, any>;
  error?: {
    code: string;
    message: string;
    hint?: string;
  };
}

export interface DeploymentResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface DatabaseInfo {
  exists: boolean;
  name: string;
  size?: string;
  tables?: string[];
}

export interface RunbookData {
  appName: string;
  version: string;
  deployedAt: string;
  config: Record<string, unknown>;
  healthChecks: string[];
  rollbackProcedure: string;
}

export interface VerificationResult {
  verified: boolean;
  checks: {
    name: string;
    passed: boolean;
    details?: string;
  }[];
  summary: string;
}