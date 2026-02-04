export function generateEnvExample(): string {
  return `# Application
NODE_ENV=development
PORT=5000

# Database
DATABASE_URL=postgres://user:password@localhost:5432/dbname

# Session/Auth
SESSION_SECRET=your-secure-session-secret-here

# API Keys (add your own)
# OPENAI_API_KEY=sk-...
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_PUBLISHABLE_KEY=pk_test_...

# Redis (optional)
# REDIS_URL=redis://localhost:6379

# Email (optional)
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=your-email@example.com
# SMTP_PASS=your-password

# Feature Flags
ENABLE_ANALYTICS=true
ENABLE_RATE_LIMITING=true

# Logging
LOG_LEVEL=info
`;
}

export function generateEnvDevelopment(): string {
  return `# Development Environment Configuration
NODE_ENV=development
PORT=5000

# Local Database
DATABASE_URL=postgres://postgres:postgres@localhost:5432/dev_db

# Session
SESSION_SECRET=dev-secret-not-for-production

# Debug Settings
LOG_LEVEL=debug
ENABLE_SOURCE_MAPS=true

# Feature Flags
ENABLE_ANALYTICS=false
ENABLE_RATE_LIMITING=false
`;
}

export function generateEnvProduction(): string {
  return `# Production Environment Configuration
# WARNING: Never commit this file with real values!

NODE_ENV=production
PORT=5000

# Database (use environment variable injection)
DATABASE_URL=

# Session (generate a secure random string)
SESSION_SECRET=

# API Keys
# These should be injected from your hosting provider's secrets

# Logging
LOG_LEVEL=warn

# Feature Flags
ENABLE_ANALYTICS=true
ENABLE_RATE_LIMITING=true
`;
}

export function generateConfigLoader(): string {
  return `import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment-specific .env file
const envFile = process.env.NODE_ENV === 'production' 
  ? '.env.production' 
  : '.env.development';

dotenv.config({ path: envFile });
dotenv.config(); // Also load base .env

// Environment schema with validation
const envSchema = z.object({
  // Required
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32, 'Session secret must be at least 32 characters'),

  // Optional - with defaults
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  ENABLE_ANALYTICS: z.coerce.boolean().default(false),
  ENABLE_RATE_LIMITING: z.coerce.boolean().default(true),

  // Optional - may not be present
  REDIS_URL: z.string().url().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
});

// Parse and validate environment
function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => {
        return \`  - \${issue.path.join('.')}: \${issue.message}\`;
      }).join('\\n');
      
      console.error('❌ Environment validation failed:\\n' + issues);
      
      if (process.env.NODE_ENV === 'production') {
        process.exit(1);
      } else {
        console.warn('⚠️ Running with invalid config in development mode');
        return envSchema.partial().parse(process.env);
      }
    }
    throw error;
  }
}

export const config = validateEnv();

// Type-safe config access
export type Config = z.infer<typeof envSchema>;

// Helper functions for common config patterns
export function isDevelopment(): boolean {
  return config.NODE_ENV === 'development';
}

export function isProduction(): boolean {
  return config.NODE_ENV === 'production';
}

export function isTest(): boolean {
  return config.NODE_ENV === 'test';
}

export function getPort(): number {
  return config.PORT;
}

export function getDatabaseUrl(): string {
  return config.DATABASE_URL;
}
`;
}

export function generateMigrationScript(): string {
  return `#!/usr/bin/env node
/**
 * Database Migration Script
 * 
 * Usage:
 *   npm run db:migrate        # Run pending migrations
 *   npm run db:migrate:down   # Rollback last migration
 *   npm run db:migrate:status # Check migration status
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

async function runMigrations() {
  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql);

  console.log('🚀 Running migrations...');

  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('✅ Migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigrations();
`;
}

export function generateHealthCheck(): string {
  return `import express from 'express';
import type { Pool } from 'pg';

interface HealthCheckConfig {
  db?: Pool;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database?: { status: string; latency?: number };
    memory?: { status: string; usage: number };
  };
}

export function createHealthRouter(config: HealthCheckConfig = {}) {
  const router = express.Router();
  const startTime = Date.now();

  // Basic liveness check
  router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Detailed readiness check
  router.get('/health/ready', async (req, res) => {
    const health: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - startTime,
      checks: {},
    };

    // Check database connection
    if (config.db) {
      try {
        const start = Date.now();
        await config.db.query('SELECT 1');
        health.checks.database = {
          status: 'connected',
          latency: Date.now() - start,
        };
      } catch (error) {
        health.status = 'unhealthy';
        health.checks.database = { status: 'disconnected' };
      }
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    health.checks.memory = {
      status: heapUsedPercent < 90 ? 'ok' : 'warning',
      usage: Math.round(heapUsedPercent),
    };

    if (heapUsedPercent >= 90) {
      health.status = 'degraded';
    }

    const statusCode = health.status === 'healthy' ? 200 : 
                       health.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(health);
  });

  return router;
}
`;
}

export function generateLoggingMiddleware(): string {
  return `import express from 'express';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  method?: string;
  url?: string;
  status?: number;
  duration?: number;
  userId?: string;
  requestId?: string;
  meta?: Record<string, unknown>;
}

class Logger {
  private minLevel: LogLevel;
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(level: LogLevel = 'info') {
    this.minLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.minLevel];
  }

  private format(entry: LogEntry): string {
    if (process.env.NODE_ENV === 'production') {
      return JSON.stringify(entry);
    }
    
    const { timestamp, level, message, method, url, status, duration } = entry;
    const levelColors: Record<LogLevel, string> = {
      debug: '\\x1b[36m', // Cyan
      info: '\\x1b[32m',  // Green
      warn: '\\x1b[33m',  // Yellow
      error: '\\x1b[31m', // Red
    };
    const reset = '\\x1b[0m';
    
    let log = \`[\${timestamp}] \${levelColors[level]}\${level.toUpperCase()}\${reset}: \${message}\`;
    
    if (method && url) {
      log += \` \${method} \${url}\`;
    }
    if (status !== undefined) {
      const statusColor = status >= 400 ? '\\x1b[31m' : '\\x1b[32m';
      log += \` \${statusColor}\${status}\${reset}\`;
    }
    if (duration !== undefined) {
      log += \` \${duration}ms\`;
    }
    
    return log;
  }

  log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      meta,
    };

    console.log(this.format(entry));
  }

  debug(message: string, meta?: Record<string, unknown>) {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>) {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>) {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>) {
    this.log('error', message, meta);
  }
}

export const logger = new Logger(
  (process.env.LOG_LEVEL as LogLevel) || 'info'
);

// Express middleware for request logging
export function requestLogger(): express.RequestHandler {
  return (req, res, next) => {
    const start = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    
    // Attach request ID to request object
    (req as any).requestId = requestId;

    res.on('finish', () => {
      const duration = Date.now() - start;
      const level: LogLevel = res.statusCode >= 500 ? 'error' :
                              res.statusCode >= 400 ? 'warn' : 'info';

      logger.log(level, 'Request completed', {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration,
        requestId,
        userAgent: req.get('User-Agent'),
      });
    });

    next();
  };
}
`;
}
