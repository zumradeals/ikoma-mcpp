import { describe, it, expect, vi, beforeEach } from 'vitest';
import { repoClone, supabaseEnsure, supabaseApply, releaseDeploy } from '../core/v1_tools.js';
import { ExecutionContext } from '../core/types.js';
import { config } from '../core/config.js';
import * as security from '../core/security.js';
import { mkdir, access, writeFile, readFile } from 'fs/promises';
import { exec } from 'child_process';

vi.mock('fs/promises');
vi.mock('child_process');
vi.mock('../core/docker.js', () => ({
  dockerComposeUp: vi.fn().mockResolvedValue('docker output'),
  dockerComposeDown: vi.fn().mockResolvedValue('docker output'),
  dockerComposeRestart: vi.fn().mockResolvedValue('docker output'),
}));
vi.mock('../core/security.js', async () => {
  const actual = await vi.importActual('../core/security.js');
  return {
    ...actual as any,
    validatePath: vi.fn().mockReturnValue(true),
    sanitizeAppName: vi.fn().mockImplementation((name) => name),
  };
});

describe('V1 Tools', () => {
  const context: ExecutionContext = {
    role: 'builder',
    requestId: 'test-id',
    timestamp: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('repo.clone', () => {
    it('should reject non-GitHub URLs', async () => {
      const args = {
        release_id: 'rel-1',
        app_slug: 'test-app',
        git_url: 'https://gitlab.com/repo',
      };
      const result = await repoClone(args, context);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('REPO_CLONE_FAILED');
      expect(result.error?.message).toContain('Only GitHub URLs are allowed');
    });

    it('should reject path traversal', async () => {
      (security.validatePath as any).mockReturnValue(false);
      const args = {
        release_id: 'rel-1',
        app_slug: 'test-app',
        git_url: 'https://github.com/repo',
      };
      const result = await repoClone(args, context);
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('Path safety violation');
    });
  });

  describe('supabase.ensure', () => {
    it('should return success when stack is up', async () => {
      const args = {
        release_id: 'rel-1',
        app_slug: 'test-app',
      };
      const result = await supabaseEnsure(args, context);
      expect(result.ok).toBe(true);
      expect(result.artifacts).toHaveProperty('supabase_url');
    });
  });

  describe('supabase.apply', () => {
    it('should reject if project_path is incorrect', async () => {
      const args = {
        release_id: 'rel-1',
        app_slug: 'test-app',
        project_path: '/wrong/path',
      };
      const result = await supabaseApply(args, context);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('DB_MIGRATION_FAILED');
    });
  });

  describe('release.deploy', () => {
    it('should reject if environment variables are missing', async () => {
      (readFile as any).mockResolvedValue('EXISTING_KEY=value');
      const args = {
        release_id: 'rel-1',
        app_slug: 'test-app',
        project_path: `${config.appsRoot}/test-app/src`,
        type: 'docker',
        service: 'web',
        port: 3000,
        env_required: ['MISSING_KEY'],
      };
      const result = await releaseDeploy(args, context);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('ENV_MISSING_KEYS');
      expect(result.error?.message).toContain('MISSING_KEY');
    });
  });
});
