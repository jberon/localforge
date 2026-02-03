export function generateGitHubActions(): string {
  return `name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '20'

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint --if-present

      - name: Check TypeScript
        run: npx tsc --noEmit

  test:
    name: Test
    runs-on: ubuntu-latest
    needs: lint
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm test
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/testdb

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        if: always()
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: false

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: test
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build
          path: dist/
          retention-days: 7

  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/develop'
    environment:
      name: staging
      url: \${{ steps.deploy.outputs.url }}
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Download build artifacts
        uses: actions/download-artifact@v4
        with:
          name: build
          path: dist/

      - name: Deploy to staging
        id: deploy
        run: |
          echo "Deploying to staging environment..."
          echo "url=https://staging.example.com" >> $GITHUB_OUTPUT

  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
    environment:
      name: production
      url: \${{ steps.deploy.outputs.url }}
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Download build artifacts
        uses: actions/download-artifact@v4
        with:
          name: build
          path: dist/

      - name: Deploy to production
        id: deploy
        run: |
          echo "Deploying to production environment..."
          echo "url=https://app.example.com" >> $GITHUB_OUTPUT
`;
}

export function generateDockerfile(): string {
  return `# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \\
    adduser -S nextjs -u 1001

# Copy built assets from builder
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./

# Set user
USER nextjs

# Expose port
EXPOSE 5000

# Set environment
ENV NODE_ENV=production
ENV PORT=5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
`;
}

export function generateDockerCompose(): string {
  return `version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgres://postgres:postgres@db:5432/app
      - SESSION_SECRET=\${SESSION_SECRET}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - app-network

  db:
    image: postgres:15-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql:ro
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=app
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - app-network

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - app-network

volumes:
  postgres_data:
  redis_data:

networks:
  app-network:
    driver: bridge
`;
}

export function generateDockerignore(): string {
  return `# Dependencies
node_modules
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build output
dist
build
.next

# Environment files
.env
.env.local
.env.*.local

# IDE
.vscode
.idea
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Testing
coverage
.nyc_output
tests

# Git
.git
.gitignore

# Docker
Dockerfile*
docker-compose*
.docker

# Documentation
README.md
docs
*.md

# Misc
.editorconfig
.eslintcache
*.log
`;
}

export function generateMakefile(): string {
  return `# Makefile for common development tasks

.PHONY: help install dev build test lint clean docker-build docker-up docker-down db-push db-migrate

# Default target
help:
\t@echo "Available commands:"
\t@echo "  install     - Install dependencies"
\t@echo "  dev         - Start development server"
\t@echo "  build       - Build for production"
\t@echo "  test        - Run tests"
\t@echo "  lint        - Run linter"
\t@echo "  clean       - Clean build artifacts"
\t@echo "  docker-build - Build Docker image"
\t@echo "  docker-up   - Start Docker containers"
\t@echo "  docker-down - Stop Docker containers"
\t@echo "  db-push     - Push database schema"
\t@echo "  db-migrate  - Run database migrations"

install:
\tnpm ci

dev:
\tnpm run dev

build:
\tnpm run build

test:
\tnpm test

lint:
\tnpm run lint

clean:
\trm -rf dist node_modules coverage .next

docker-build:
\tdocker build -t myapp:latest .

docker-up:
\tdocker-compose up -d

docker-down:
\tdocker-compose down

db-push:
\tnpm run db:push

db-migrate:
\tnpm run db:migrate
`;
}
