import express, { Request, Response, NextFunction } from 'express';
import { nanoid } from 'nanoid';
import { config } from '../core/config.js';
import { CAPABILITIES, getCapability } from '../core/capabilities.js';
import { verifyApiKey } from '../core/security.js';
import { hasPermission, validateRole } from '../core/roles.js';
import { auditCapabilityCall } from '../core/audit.js';
import type { Role, ExecutionContext } from '../core/types.js';

interface AuthRequest extends Request {
  role?: Role;
}

export async function startHTTPServer(): Promise<void> {
  const app = express();
  
  app.use(express.json());
  
  // Authentication middleware
  app.use((req: AuthRequest, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'] as string;
    const role = req.headers['x-role'] as string;
    
    if (!apiKey) {
      res.status(401).json({ error: 'API key required' });
      return;
    }
    
    if (!verifyApiKey(apiKey)) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }
    
    if (!role || !validateRole(role)) {
      res.status(400).json({ error: 'Valid role required (observer, operator, builder, admin)' });
      return;
    }
    
    req.role = role as Role;
    next();
  });
  
  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'healthy', version: '2.0.0' });
  });
  
  // List capabilities
  app.get('/capabilities', (_req: AuthRequest, res: Response) => {
    res.json({
      capabilities: CAPABILITIES.map(cap => ({
        name: cap.name,
        description: cap.description,
        requiredRole: cap.requiredRole,
        schema: cap.schema,
      })),
    });
  });
  
  // Execute capability
  app.post('/execute/:capability', async (req: AuthRequest, res: Response) => {
    const capabilityName = req.params.capability;
    const args = req.body;
    const role = req.role!;
    
    const capability = getCapability(capabilityName);
    
    if (!capability) {
      res.status(404).json({ error: 'Capability not found' });
      return;
    }
    
    if (!hasPermission(role, capability.requiredRole)) {
      res.status(403).json({
        error: 'Insufficient permissions',
        required: capability.requiredRole,
        current: role,
      });
      return;
    }
    
    const requestId = nanoid();
    const context: ExecutionContext = {
      role,
      requestId,
      timestamp: new Date(),
    };
    
    try {
      const result = await auditCapabilityCall(
        requestId,
        capabilityName,
        role,
        args,
        () => capability.handler(args, context)
      );
      
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  
  app.listen(config.httpPort, () => {
    console.log(`IKOMA HTTP Server listening on port ${config.httpPort}`);
    console.log(`Tools available: ${CAPABILITIES.length}`);
    console.log('Tool names:', CAPABILITIES.map(c => c.name).join(', '));
  });
}