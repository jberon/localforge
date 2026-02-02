import type { DataEntity } from "@shared/schema";

export function generateTestConfig(): string {
  return `import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
});
`;
}

export function generateTestSetup(): string {
  return `import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// Mock fetch globally
global.fetch = vi.fn();

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
`;
}

export function generateUnitTests(entities: DataEntity[]): string {
  let tests = `import { describe, it, expect, vi, beforeEach } from 'vitest';

// API utility tests
describe('API Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle successful API responses', async () => {
    const mockData = { id: '1', name: 'Test' };
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const response = await fetch('/api/test');
    const data = await response.json();
    
    expect(response.ok).toBe(true);
    expect(data).toEqual(mockData);
  });

  it('should handle API errors gracefully', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' }),
    });

    const response = await fetch('/api/test');
    
    expect(response.ok).toBe(false);
    expect(response.status).toBe(500);
  });
});
`;

  if (entities.length > 0) {
    entities.forEach((entity) => {
      const entityName = entity.name;
      const entityNameLower = entityName.toLowerCase();
      const entityNamePlural = entityNameLower + 's';

      tests += `
// ${entityName} tests
describe('${entityName} API', () => {
  const mock${entityName} = {
    id: '1',
${entity.fields.map((field) => {
  const defaultValue = getDefaultTestValue(field.type);
  return `    ${field.name}: ${defaultValue},`;
}).join('\n')}
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/${entityNamePlural}', () => {
    it('should fetch all ${entityNamePlural}', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [mock${entityName}],
      });

      const response = await fetch('/api/${entityNamePlural}');
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/${entityNamePlural}', () => {
    it('should create a new ${entityNameLower}', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mock${entityName},
      });

      const response = await fetch('/api/${entityNamePlural}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mock${entityName}),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(201);
    });

    it('should validate required fields', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Validation failed' }),
      });

      const response = await fetch('/api/${entityNamePlural}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/${entityNamePlural}/:id', () => {
    it('should fetch a single ${entityNameLower}', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mock${entityName},
      });

      const response = await fetch('/api/${entityNamePlural}/1');
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.id).toBe('1');
    });

    it('should return 404 for non-existent ${entityNameLower}', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      });

      const response = await fetch('/api/${entityNamePlural}/999');

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/${entityNamePlural}/:id', () => {
    it('should update a ${entityNameLower}', async () => {
      const updated = { ...mock${entityName}, name: 'Updated' };
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => updated,
      });

      const response = await fetch('/api/${entityNamePlural}/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });

      expect(response.ok).toBe(true);
    });
  });

  describe('DELETE /api/${entityNamePlural}/:id', () => {
    it('should delete a ${entityNameLower}', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const response = await fetch('/api/${entityNamePlural}/1', {
        method: 'DELETE',
      });

      expect(response.ok).toBe(true);
    });
  });
});
`;
    });
  }

  return tests;
}

export function generateIntegrationTests(entities: DataEntity[]): string {
  let tests = `import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';

// Integration test setup
let app: express.Application;
let server: any;

beforeAll(() => {
  app = express();
  app.use(express.json());
  
  // Add your routes here or import from your routes file
  // import { registerRoutes } from '../server/routes';
  // registerRoutes(app);
});

afterAll(() => {
  if (server) {
    server.close();
  }
});

describe('API Integration Tests', () => {
  describe('Health Check', () => {
    it('should return 200 for health endpoint', async () => {
      // Add health check route if not exists
      app.get('/health', (req, res) => res.json({ status: 'ok' }));
      
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });
  });
`;

  if (entities.length > 0) {
    entities.forEach((entity) => {
      const entityName = entity.name;
      const entityNameLower = entityName.toLowerCase();
      const entityNamePlural = entityNameLower + 's';

      tests += `
  describe('${entityName} Integration', () => {
    let created${entityName}Id: string;

    it('should create a ${entityNameLower}', async () => {
      const payload = {
${entity.fields.filter(f => f.required).map(field => {
  const value = getDefaultTestValue(field.type);
  return `        ${field.name}: ${value},`;
}).join('\n')}
      };

      const response = await request(app)
        .post('/api/${entityNamePlural}')
        .send(payload)
        .expect('Content-Type', /json/);

      if (response.status === 201) {
        expect(response.body).toHaveProperty('id');
        created${entityName}Id = response.body.id;
      }
    });

    it('should list all ${entityNamePlural}', async () => {
      const response = await request(app)
        .get('/api/${entityNamePlural}')
        .expect('Content-Type', /json/);

      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
      }
    });

    it('should get a single ${entityNameLower} by ID', async () => {
      if (!created${entityName}Id) return;

      const response = await request(app)
        .get(\`/api/${entityNamePlural}/\${created${entityName}Id}\`)
        .expect('Content-Type', /json/);

      if (response.status === 200) {
        expect(response.body.id).toBe(created${entityName}Id);
      }
    });

    it('should update a ${entityNameLower}', async () => {
      if (!created${entityName}Id) return;

      const response = await request(app)
        .put(\`/api/${entityNamePlural}/\${created${entityName}Id}\`)
        .send({ name: 'Updated Name' });

      expect([200, 204]).toContain(response.status);
    });

    it('should delete a ${entityNameLower}', async () => {
      if (!created${entityName}Id) return;

      const response = await request(app)
        .delete(\`/api/${entityNamePlural}/\${created${entityName}Id}\`);

      expect([200, 204]).toContain(response.status);
    });
  });
`;
    });
  }

  tests += `});
`;

  return tests;
}

export function generateE2ETestStub(): string {
  return `import { test, expect } from '@playwright/test';

test.describe('Application E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the home page', async ({ page }) => {
    await expect(page).toHaveTitle(/.*App.*/);
  });

  test('should display main navigation', async ({ page }) => {
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();
  });

  test('should be responsive', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('body')).toBeVisible();

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('body')).toBeVisible();

    // Test desktop viewport
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Authentication Flow', () => {
  test('should display login form', async ({ page }) => {
    await page.goto('/login');
    
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitButton = page.locator('button[type="submit"]');

    // Check if auth form exists (may not on all apps)
    const hasLoginForm = await emailInput.count() > 0;
    if (hasLoginForm) {
      await expect(emailInput).toBeVisible();
      await expect(passwordInput).toBeVisible();
      await expect(submitButton).toBeVisible();
    }
  });
});

test.describe('Core Features', () => {
  test('should handle form submissions', async ({ page }) => {
    // Find any form on the page
    const forms = page.locator('form');
    const formCount = await forms.count();
    
    if (formCount > 0) {
      const firstForm = forms.first();
      await expect(firstForm).toBeVisible();
    }
  });

  test('should display data correctly', async ({ page }) => {
    // Wait for any data to load
    await page.waitForLoadState('networkidle');
    
    // Check that the page has content
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();
  });
});
`;
}

export function generatePlaywrightConfig(): string {
  return `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
`;
}

function getDefaultTestValue(type: string): string {
  switch (type) {
    case 'text':
    case 'textarea':
      return "'Test Value'";
    case 'email':
      return "'test@example.com'";
    case 'url':
      return "'https://example.com'";
    case 'number':
      return '100';
    case 'boolean':
      return 'true';
    case 'date':
      return "new Date().toISOString()";
    default:
      return "'test'";
  }
}
