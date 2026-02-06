import logger from "../lib/logger";

interface AuthTemplate {
  id: string;
  name: string;
  description: string;
  type: "email-password" | "social-oauth" | "jwt-token" | "session-based" | "api-key";
  files: TemplateFile[];
  dependencies: string[];
  envVars: string[];
  setupInstructions: string[];
}

interface DatabaseTemplate {
  id: string;
  name: string;
  description: string;
  type: "postgres" | "sqlite" | "mongodb" | "supabase" | "firebase";
  files: TemplateFile[];
  dependencies: string[];
  envVars: string[];
  schemaExample: string;
  setupInstructions: string[];
}

interface TemplateFile {
  path: string;
  content: string;
  description: string;
}

const AUTH_INTENT_PATTERNS = [
  /\b(auth|authentication|authorize|authorization)\b/i,
  /\b(login|log\s*in|sign\s*in|signin)\b/i,
  /\b(signup|sign\s*up|register|registration)\b/i,
  /\b(password|passwd|credential)\b/i,
  /\b(oauth|social\s*login|google\s*login|github\s*login)\b/i,
  /\b(jwt|json\s*web\s*token|bearer\s*token)\b/i,
  /\b(session|cookie\s*auth)\b/i,
  /\b(api\s*key|api\s*token|access\s*key)\b/i,
  /\b(protected\s*route|middleware\s*auth|guard)\b/i,
  /\b(user\s*account|user\s*management)\b/i,
];

const DATABASE_INTENT_PATTERNS = [
  /\b(database|db|data\s*store|data\s*storage)\b/i,
  /\b(postgres|postgresql|pg)\b/i,
  /\b(sqlite|sql\s*lite)\b/i,
  /\b(mongo|mongodb|mongoose)\b/i,
  /\b(supabase)\b/i,
  /\b(firebase|firestore)\b/i,
  /\b(crud|create\s*read\s*update\s*delete)\b/i,
  /\b(schema|migration|model|table|collection)\b/i,
  /\b(orm|drizzle|prisma|sequelize|typeorm)\b/i,
  /\b(persist|persistence|storage\s*layer)\b/i,
];

class AuthDbTemplatesService {
  private static instance: AuthDbTemplatesService;
  private authTemplates: Map<string, AuthTemplate> = new Map();
  private databaseTemplates: Map<string, DatabaseTemplate> = new Map();
  private usageStats = { authLookups: 0, dbLookups: 0, codeGenerations: 0 };

  private constructor() {
    this.initializeAuthTemplates();
    this.initializeDatabaseTemplates();
    logger.info("AuthDbTemplatesService initialized", {
      authTemplates: this.authTemplates.size,
      databaseTemplates: this.databaseTemplates.size,
    });
  }

  static getInstance(): AuthDbTemplatesService {
    if (!AuthDbTemplatesService.instance) {
      AuthDbTemplatesService.instance = new AuthDbTemplatesService();
    }
    return AuthDbTemplatesService.instance;
  }

  private initializeAuthTemplates(): void {
    const emailPassword: AuthTemplate = {
      id: "auth_email_password",
      name: "Email & Password Authentication",
      description: "Classic email/password signup and login with bcrypt hashing and JWT tokens",
      type: "email-password",
      files: [
        {
          path: "server/auth/auth.routes.ts",
          description: "Express routes for signup, login, logout, and profile",
          content: `import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { authMiddleware } from "./auth.middleware";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

router.post("/api/auth/signup", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const [user] = await db.insert(users).values({ email, password: hashedPassword, name }).returning();

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ user: { id: user.id, email: user.email, name: user.name }, token });
  } catch (error) {
    res.status(500).json({ error: "Failed to create account" });
  }
});

router.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ user: { id: user.id, email: user.email, name: user.name }, token });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/api/auth/me", authMiddleware, async (req, res) => {
  res.json({ user: req.user });
});

export default router;`,
        },
        {
          path: "server/auth/auth.middleware.ts",
          description: "JWT verification middleware for protected routes",
          content: `import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; email: string };
    (req as any).user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}`,
        },
      ],
      dependencies: ["bcryptjs", "jsonwebtoken", "@types/bcryptjs", "@types/jsonwebtoken"],
      envVars: ["JWT_SECRET"],
      setupInstructions: [
        "Install dependencies: npm install bcryptjs jsonwebtoken",
        "Set JWT_SECRET environment variable with a strong random string",
        "Add users table to your database schema with email, password, and name columns",
        "Register auth routes in your Express app: app.use(authRouter)",
        "Use authMiddleware on any route that requires authentication",
      ],
    };

    const socialOauth: AuthTemplate = {
      id: "auth_social_oauth",
      name: "Social OAuth Authentication",
      description: "OAuth 2.0 login with Google, GitHub, and other providers using Passport.js",
      type: "social-oauth",
      files: [
        {
          path: "server/auth/passport.config.ts",
          description: "Passport.js strategy configuration for Google and GitHub OAuth",
          content: `import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: "/api/auth/google/callback",
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let [user] = await db.select().from(users).where(eq(users.oauthId, profile.id)).limit(1);
    if (!user) {
      [user] = await db.insert(users).values({
        email: profile.emails?.[0]?.value || "",
        name: profile.displayName,
        oauthProvider: "google",
        oauthId: profile.id,
      }).returning();
    }
    done(null, user);
  } catch (error) {
    done(error as Error);
  }
}));

passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  callbackURL: "/api/auth/github/callback",
}, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
  try {
    let [user] = await db.select().from(users).where(eq(users.oauthId, profile.id)).limit(1);
    if (!user) {
      [user] = await db.insert(users).values({
        email: profile.emails?.[0]?.value || "",
        name: profile.displayName || profile.username,
        oauthProvider: "github",
        oauthId: String(profile.id),
      }).returning();
    }
    done(null, user);
  } catch (error) {
    done(error as Error);
  }
}));

passport.serializeUser((user: any, done) => done(null, user.id));
passport.deserializeUser(async (id: number, done) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    done(null, user || null);
  } catch (error) {
    done(error);
  }
});

export default passport;`,
        },
        {
          path: "server/auth/oauth.routes.ts",
          description: "OAuth callback routes for Google and GitHub",
          content: `import { Router } from "express";
import passport from "./passport.config";

const router = Router();

router.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
router.get("/api/auth/google/callback", passport.authenticate("google", {
  successRedirect: "/",
  failureRedirect: "/login",
}));

router.get("/api/auth/github", passport.authenticate("github", { scope: ["user:email"] }));
router.get("/api/auth/github/callback", passport.authenticate("github", {
  successRedirect: "/",
  failureRedirect: "/login",
}));

router.post("/api/auth/logout", (req, res) => {
  req.logout(() => {
    res.json({ success: true });
  });
});

export default router;`,
        },
      ],
      dependencies: ["passport", "passport-google-oauth20", "passport-github2", "express-session"],
      envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "SESSION_SECRET"],
      setupInstructions: [
        "Install dependencies: npm install passport passport-google-oauth20 passport-github2 express-session",
        "Create OAuth apps on Google Cloud Console and GitHub Developer Settings",
        "Set environment variables for client IDs and secrets",
        "Add oauthProvider and oauthId columns to your users table",
        "Initialize passport in your Express app with session middleware",
        "Register OAuth routes in your Express app",
      ],
    };

    const jwtToken: AuthTemplate = {
      id: "auth_jwt_token",
      name: "JWT Token Authentication",
      description: "Stateless JWT authentication with access and refresh token rotation",
      type: "jwt-token",
      files: [
        {
          path: "server/auth/jwt.service.ts",
          description: "JWT token generation, verification, and refresh logic",
          content: `import jwt from "jsonwebtoken";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "access-secret-change-me";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "refresh-secret-change-me";
const ACCESS_EXPIRY = "15m";
const REFRESH_EXPIRY = "7d";

interface TokenPayload {
  userId: number;
  email: string;
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
}

export function generateTokenPair(payload: TokenPayload) {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    expiresIn: 900,
  };
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, REFRESH_SECRET) as TokenPayload;
}`,
        },
        {
          path: "server/auth/jwt.middleware.ts",
          description: "Express middleware for JWT access token verification",
          content: `import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "./jwt.service";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    const token = authHeader.split(" ")[1];
    const payload = verifyAccessToken(token);
    (req as any).user = payload;
    next();
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired", code: "TOKEN_EXPIRED" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
}`,
        },
        {
          path: "server/auth/jwt.routes.ts",
          description: "Routes for token refresh and revocation",
          content: `import { Router } from "express";
import { verifyRefreshToken, generateTokenPair } from "./jwt.service";

const router = Router();
const revokedTokens = new Set<string>();

router.post("/api/auth/refresh", (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: "Refresh token required" });
  }

  if (revokedTokens.has(refreshToken)) {
    return res.status(401).json({ error: "Token has been revoked" });
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    revokedTokens.add(refreshToken);
    const tokens = generateTokenPair({ userId: payload.userId, email: payload.email });
    res.json(tokens);
  } catch (error) {
    return res.status(401).json({ error: "Invalid refresh token" });
  }
});

router.post("/api/auth/revoke", (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    revokedTokens.add(refreshToken);
  }
  res.json({ success: true });
});

export default router;`,
        },
      ],
      dependencies: ["jsonwebtoken", "@types/jsonwebtoken"],
      envVars: ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"],
      setupInstructions: [
        "Install dependencies: npm install jsonwebtoken",
        "Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET environment variables",
        "Use requireAuth middleware on protected routes",
        "Implement token refresh on the frontend when receiving TOKEN_EXPIRED errors",
        "Store refresh tokens securely (httpOnly cookies recommended)",
      ],
    };

    const sessionBased: AuthTemplate = {
      id: "auth_session_based",
      name: "Session-Based Authentication",
      description: "Traditional server-side sessions with express-session and secure cookies",
      type: "session-based",
      files: [
        {
          path: "server/auth/session.config.ts",
          description: "Express session configuration with secure cookie settings",
          content: `import session from "express-session";
import connectPgSimple from "connect-pg-simple";

const PgSession = connectPgSimple(session);

export const sessionMiddleware = session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: "user_sessions",
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || "change-me-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: "lax",
  },
});

export function requireSession(req: any, res: any, next: any) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}`,
        },
        {
          path: "server/auth/session.routes.ts",
          description: "Login, logout, and session check routes",
          content: `import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    (req.session as any).userId = user.id;
    res.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/api/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

router.get("/api/auth/session", (req, res) => {
  if ((req.session as any).userId) {
    res.json({ authenticated: true, userId: (req.session as any).userId });
  } else {
    res.json({ authenticated: false });
  }
});

export default router;`,
        },
      ],
      dependencies: ["express-session", "connect-pg-simple", "bcryptjs", "@types/express-session"],
      envVars: ["SESSION_SECRET", "DATABASE_URL"],
      setupInstructions: [
        "Install dependencies: npm install express-session connect-pg-simple bcryptjs",
        "Set SESSION_SECRET environment variable",
        "Apply sessionMiddleware before your routes: app.use(sessionMiddleware)",
        "The session store will automatically create the user_sessions table",
        "Use requireSession middleware on protected routes",
      ],
    };

    const apiKey: AuthTemplate = {
      id: "auth_api_key",
      name: "API Key Authentication",
      description: "API key generation and validation for service-to-service or developer API access",
      type: "api-key",
      files: [
        {
          path: "server/auth/api-key.service.ts",
          description: "API key generation, hashing, and validation",
          content: `import crypto from "crypto";
import { db } from "../db";
import { apiKeys } from "@shared/schema";
import { eq } from "drizzle-orm";

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = "lf_" + crypto.randomBytes(32).toString("hex");
  const prefix = key.substring(0, 10);
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return { key, prefix, hash };
}

export async function createApiKey(userId: number, name: string) {
  const { key, prefix, hash } = generateApiKey();
  const [record] = await db.insert(apiKeys).values({
    userId,
    name,
    keyPrefix: prefix,
    keyHash: hash,
  }).returning();
  return { ...record, key };
}

export async function validateApiKey(key: string) {
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const [record] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash)).limit(1);
  return record || null;
}`,
        },
        {
          path: "server/auth/api-key.middleware.ts",
          description: "Express middleware for API key validation via header",
          content: `import { Request, Response, NextFunction } from "express";
import { validateApiKey } from "./api-key.service";

export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers["x-api-key"] as string;
  if (!apiKey) {
    return res.status(401).json({ error: "API key required. Pass it via x-api-key header." });
  }

  const record = await validateApiKey(apiKey);
  if (!record) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  (req as any).apiKeyUser = { userId: record.userId, keyId: record.id };
  next();
}`,
        },
      ],
      dependencies: [],
      envVars: [],
      setupInstructions: [
        "Add apiKeys table to your schema with userId, name, keyPrefix, and keyHash columns",
        "Create an endpoint for users to generate API keys (returns the key once, store only the hash)",
        "Use requireApiKey middleware on API routes that accept key-based auth",
        "API keys are sent via the x-api-key header",
        "The key prefix (first 10 chars) is stored for display purposes without exposing the full key",
      ],
    };

    this.authTemplates.set("email-password", emailPassword);
    this.authTemplates.set("social-oauth", socialOauth);
    this.authTemplates.set("jwt-token", jwtToken);
    this.authTemplates.set("session-based", sessionBased);
    this.authTemplates.set("api-key", apiKey);
  }

  private initializeDatabaseTemplates(): void {
    const postgres: DatabaseTemplate = {
      id: "db_postgres",
      name: "PostgreSQL with Drizzle ORM",
      description: "Production-ready PostgreSQL setup with Drizzle ORM, typed schema, and migrations",
      type: "postgres",
      files: [
        {
          path: "server/db.ts",
          description: "Database connection setup using Drizzle ORM with connection pooling",
          content: `import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });`,
        },
        {
          path: "shared/schema.ts",
          description: "Drizzle ORM schema with users table and insert schemas",
          content: `import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  authorId: integer("author_id").references(() => users.id).notNull(),
  published: boolean("published").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertPostSchema = createInsertSchema(posts).omit({ id: true, createdAt: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof posts.$inferSelect;`,
        },
        {
          path: "drizzle.config.ts",
          description: "Drizzle Kit configuration for migrations",
          content: `import type { Config } from "drizzle-kit";

export default {
  schema: "./shared/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;`,
        },
      ],
      dependencies: ["drizzle-orm", "@neondatabase/serverless", "drizzle-kit", "drizzle-zod"],
      envVars: ["DATABASE_URL"],
      schemaExample: `export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});`,
      setupInstructions: [
        "Install dependencies: npm install drizzle-orm @neondatabase/serverless drizzle-zod",
        "Install dev dependency: npm install -D drizzle-kit",
        "Set DATABASE_URL environment variable with your PostgreSQL connection string",
        "Define your schema in shared/schema.ts using Drizzle ORM table builders",
        "Run migrations: npx drizzle-kit push",
        "Import db from server/db.ts in your routes to query the database",
      ],
    };

    const sqlite: DatabaseTemplate = {
      id: "db_sqlite",
      name: "SQLite with better-sqlite3",
      description: "Lightweight SQLite database for local development or small applications",
      type: "sqlite",
      files: [
        {
          path: "server/db.ts",
          description: "SQLite database setup with better-sqlite3",
          content: `import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.SQLITE_PATH || path.join(process.cwd(), "data", "app.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initializeDatabase() {
  db.exec(\`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author_id INTEGER NOT NULL REFERENCES users(id),
      published INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  \`);
}

export default db;`,
        },
        {
          path: "server/repositories/user.repository.ts",
          description: "Type-safe repository pattern for user CRUD operations",
          content: `import db from "../db";

interface User {
  id: number;
  email: string;
  name: string | null;
  password: string;
  created_at: string;
}

export const userRepository = {
  findById(id: number): User | undefined {
    return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
  },

  findByEmail(email: string): User | undefined {
    return db.prepare("SELECT * FROM users WHERE email = ?").get(email) as User | undefined;
  },

  create(data: { email: string; password: string; name?: string }): User {
    const stmt = db.prepare("INSERT INTO users (email, password, name) VALUES (?, ?, ?)");
    const result = stmt.run(data.email, data.password, data.name || null);
    return this.findById(result.lastInsertRowid as number)!;
  },

  update(id: number, data: Partial<{ email: string; name: string }>): boolean {
    const fields = Object.entries(data).filter(([, v]) => v !== undefined);
    if (fields.length === 0) return false;
    const setClause = fields.map(([k]) => \`\${k} = ?\`).join(", ");
    const values = fields.map(([, v]) => v);
    const stmt = db.prepare(\`UPDATE users SET \${setClause} WHERE id = ?\`);
    const result = stmt.run(...values, id);
    return result.changes > 0;
  },

  delete(id: number): boolean {
    const result = db.prepare("DELETE FROM users WHERE id = ?").run(id);
    return result.changes > 0;
  },

  list(limit = 50, offset = 0): User[] {
    return db.prepare("SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset) as User[];
  },
};`,
        },
      ],
      dependencies: ["better-sqlite3", "@types/better-sqlite3"],
      envVars: ["SQLITE_PATH"],
      schemaExample: `CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  password TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`,
      setupInstructions: [
        "Install dependencies: npm install better-sqlite3",
        "Install dev dependency: npm install -D @types/better-sqlite3",
        "Optionally set SQLITE_PATH environment variable (defaults to data/app.db)",
        "Call initializeDatabase() on server startup to create tables",
        "Use the repository pattern for type-safe database operations",
        "SQLite file is created automatically on first run",
      ],
    };

    const mongodb: DatabaseTemplate = {
      id: "db_mongodb",
      name: "MongoDB with Mongoose",
      description: "MongoDB document database with Mongoose ODM for schema validation and queries",
      type: "mongodb",
      files: [
        {
          path: "server/db.ts",
          description: "MongoDB connection setup with Mongoose",
          content: `import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/myapp";

export async function connectDatabase() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
}

mongoose.connection.on("error", (err) => {
  console.error("MongoDB error:", err);
});

export default mongoose;`,
        },
        {
          path: "server/models/user.model.ts",
          description: "Mongoose User model with schema validation",
          content: `import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  email: string;
  name?: string;
  password: string;
  createdAt: Date;
}

const userSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, trim: true },
  password: { type: String, required: true, minlength: 8 },
}, { timestamps: true });

userSchema.index({ email: 1 });

export const User = mongoose.model<IUser>("User", userSchema);`,
        },
      ],
      dependencies: ["mongoose"],
      envVars: ["MONGODB_URI"],
      schemaExample: `const userSchema = new Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String },
  password: { type: String, required: true },
}, { timestamps: true });`,
      setupInstructions: [
        "Install dependencies: npm install mongoose",
        "Set MONGODB_URI environment variable",
        "Call connectDatabase() on server startup",
        "Define models in server/models/ directory",
        "Use Mongoose query methods for CRUD operations",
      ],
    };

    const supabase: DatabaseTemplate = {
      id: "db_supabase",
      name: "Supabase",
      description: "Supabase BaaS with auto-generated APIs, auth, and real-time subscriptions",
      type: "supabase",
      files: [
        {
          path: "server/supabase.ts",
          description: "Supabase client initialization",
          content: `import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function getUser(token: string) {
  const { data, error } = await supabase.auth.getUser(token);
  if (error) throw error;
  return data.user;
}`,
        },
      ],
      dependencies: ["@supabase/supabase-js"],
      envVars: ["SUPABASE_URL", "SUPABASE_ANON_KEY"],
      schemaExample: `-- Create tables in Supabase SQL editor
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;`,
      setupInstructions: [
        "Create a Supabase project at supabase.com",
        "Install dependency: npm install @supabase/supabase-js",
        "Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables from your project settings",
        "Create tables using the Supabase SQL editor or Dashboard",
        "Enable Row Level Security (RLS) policies for production",
        "Use supabase.from('table').select() for queries",
      ],
    };

    const firebase: DatabaseTemplate = {
      id: "db_firebase",
      name: "Firebase Firestore",
      description: "Firebase Firestore NoSQL database with real-time listeners and offline support",
      type: "firebase",
      files: [
        {
          path: "server/firebase.ts",
          description: "Firebase Admin SDK initialization",
          content: `import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");

const app = initializeApp({
  credential: cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID,
});

export const db = getFirestore(app);

export async function getDocument<T>(collection: string, id: string): Promise<T | null> {
  const doc = await db.collection(collection).doc(id).get();
  return doc.exists ? (doc.data() as T) : null;
}

export async function createDocument<T extends Record<string, any>>(collection: string, data: T): Promise<string> {
  const ref = await db.collection(collection).add({ ...data, createdAt: new Date() });
  return ref.id;
}`,
        },
      ],
      dependencies: ["firebase-admin"],
      envVars: ["FIREBASE_PROJECT_ID", "FIREBASE_SERVICE_ACCOUNT"],
      schemaExample: `// Firestore is schemaless, but you can define TypeScript interfaces:
interface User {
  email: string;
  name?: string;
  createdAt: Date;
}

// Usage: db.collection("users").add(userData);`,
      setupInstructions: [
        "Create a Firebase project at console.firebase.google.com",
        "Install dependency: npm install firebase-admin",
        "Generate a service account key from Firebase Console > Project Settings > Service Accounts",
        "Set FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT environment variables",
        "Use db.collection('name') for Firestore operations",
        "Firestore is schemaless - define TypeScript interfaces for type safety",
      ],
    };

    this.databaseTemplates.set("postgres", postgres);
    this.databaseTemplates.set("sqlite", sqlite);
    this.databaseTemplates.set("mongodb", mongodb);
    this.databaseTemplates.set("supabase", supabase);
    this.databaseTemplates.set("firebase", firebase);
  }

  getAuthTemplates(): AuthTemplate[] {
    this.usageStats.authLookups++;
    return Array.from(this.authTemplates.values());
  }

  getAuthTemplate(type: AuthTemplate["type"]): AuthTemplate | null {
    this.usageStats.authLookups++;
    return this.authTemplates.get(type) || null;
  }

  getDatabaseTemplates(): DatabaseTemplate[] {
    this.usageStats.dbLookups++;
    return Array.from(this.databaseTemplates.values());
  }

  getDatabaseTemplate(type: DatabaseTemplate["type"]): DatabaseTemplate | null {
    this.usageStats.dbLookups++;
    return this.databaseTemplates.get(type) || null;
  }

  detectAuthIntent(prompt: string): boolean {
    return AUTH_INTENT_PATTERNS.some((pattern) => pattern.test(prompt));
  }

  detectDatabaseIntent(prompt: string): boolean {
    return DATABASE_INTENT_PATTERNS.some((pattern) => pattern.test(prompt));
  }

  generateAuthCode(type: AuthTemplate["type"]): TemplateFile[] {
    const template = this.authTemplates.get(type);
    if (!template) {
      logger.warn("Auth template not found", { type });
      return [];
    }
    this.usageStats.codeGenerations++;
    logger.info("Auth code generated", { type, fileCount: template.files.length });
    return template.files;
  }

  generateDatabaseCode(type: DatabaseTemplate["type"], schemaDescription?: string): TemplateFile[] {
    const template = this.databaseTemplates.get(type);
    if (!template) {
      logger.warn("Database template not found", { type });
      return [];
    }

    this.usageStats.codeGenerations++;

    if (schemaDescription) {
      const customized = template.files.map((f) => ({ ...f }));
      const schemaFile = customized.find(
        (f) => f.path.includes("schema") || f.path.includes("model") || f.path.includes("db")
      );
      if (schemaFile) {
        schemaFile.content = `// Custom schema based on: ${schemaDescription}\n// Modify the template below to match your requirements\n\n${schemaFile.content}`;
      }
      logger.info("Database code generated with custom schema", { type, fileCount: customized.length });
      return customized;
    }

    logger.info("Database code generated", { type, fileCount: template.files.length });
    return template.files;
  }

  getStats(): {
    authTemplateCount: number;
    databaseTemplateCount: number;
    authLookups: number;
    dbLookups: number;
    codeGenerations: number;
  } {
    return {
      authTemplateCount: this.authTemplates.size,
      databaseTemplateCount: this.databaseTemplates.size,
      ...this.usageStats,
    };
  }

  destroy(): void {
    this.authTemplates.clear();
    this.databaseTemplates.clear();
    this.usageStats = { authLookups: 0, dbLookups: 0, codeGenerations: 0 };
    logger.info("AuthDbTemplatesService destroyed");
  }
}

export const authDbTemplatesService = AuthDbTemplatesService.getInstance();
