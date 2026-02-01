# LocalForge - AI App Builder

## Overview
LocalForge is an AI-powered application builder that leverages local Large Language Models (LLMs) via LM Studio to generate web applications from natural language descriptions. It allows users to describe their desired application, and the AI produces working React code. This code can be previewed live within the application and downloaded as a standalone HTML file or a complete full-stack project. The platform aims to streamline web application development by enabling rapid prototyping and generation of functional applications directly from user intent.

## User Preferences
- Uses dark mode by default
- LM Studio endpoint configurable via settings dialog
- Temperature slider for LLM creativity control

## System Architecture

### Core Functionality
LocalForge offers a chat-based interface for application generation, supporting streaming responses for real-time code generation. It includes project management features such as saving projects to a PostgreSQL database, live preview of generated applications, and code validation to ensure syntax correctness. The system also features an AI-powered prompt enhancement mechanism and iterative refinement capabilities, allowing users to modify generated applications through follow-up requests. A "Smart Mode" intelligently routes requests to different LLM configurations (planner vs. builder) based on user intent, allowing for more structured plan-and-build workflows.

### Frontend
The frontend is built with **React + TypeScript** using **Vite**, styled with **Tailwind CSS** and **Shadcn UI** components. It integrates the **Monaco Editor** for code viewing and editing, and **TanStack Query** for data fetching. Key UI components include a chat panel, live preview, project sidebar, and a modular generation wizard.

### Backend
The backend utilizes an **Express.js** API server. It uses the **OpenAI SDK** configured for LM Studio compatibility and implements **Server-Sent Events (SSE)** for streaming LLM responses. **PostgreSQL** with **Drizzle ORM** is used for persistent storage. The backend incorporates modular code generators for schema, routes, frontend components, and Docker configurations.

### Key Features
- **Project Management**: Create, delete, rename, and update projects with persistent storage.
- **LLM Integration**: Connects to LM Studio's OpenAI-compatible API, with configurable endpoint and model temperature.
- **Code Generation**: Generates full-stack applications including database schemas, API routes, and React components.
- **Real-time Interaction**: Streaming responses, live code preview, and instant preview updates on code changes.
- **Intelligent Workflows**: "Smart Mode" for routing requests, AI-powered prompt enhancement, and iterative refinement.
- **Code Quality**: Built-in code validation and AI-powered error recovery and code assistance (explain, fix, improve).
- **User Onboarding**: First-run tutorial modal for new users.
- **Data Model Builder**: Visual tool for defining data structures without coding.
- **Analytics & Learning System**: Tracks user actions, collects feedback, and uses LLM-powered analysis to generate insights and optimize template defaults. Includes a portfolio view of generated projects.

### Production-Grade Development
LocalForge supports building production-ready applications with enterprise features:

- **Production Templates**: Six production-grade starter templates:
  - **SaaS Starter**: Auth, billing, user management, subscription tiers
  - **Marketplace**: Two-sided marketplace with listings, search, transactions
  - **Admin Dashboard**: Internal tools with analytics, CRUD, user management
  - **API Service**: RESTful API with auth, rate limiting, documentation
  - **E-commerce**: Online store with cart, checkout, orders
  - **Content Platform**: Blog/CMS with rich content management

- **Production Modules**: Configurable enterprise features:
  - Authentication & Authorization (RBAC)
  - Testing Suite (unit, integration, e2e)
  - CI/CD Pipeline (GitHub Actions)
  - Docker Support
  - Database Migrations
  - Structured Logging
  - Error Handling
  - API Documentation (OpenAPI)
  - Environment Configuration
  - Rate Limiting & Caching
  - Monitoring & Health Checks
  - Billing Integration (Stripe stubs)

- **Code Generators** (server/generators/):
  - `testing.ts`: Unit tests, integration tests, e2e stubs, Playwright config
  - `cicd.ts`: GitHub Actions, Dockerfile, docker-compose, Makefile
  - `environment.ts`: .env templates, config loader, health checks, logging middleware

### Version Control
LocalForge includes built-in version control for projects:
- **Checkpoints**: Save snapshots of project state at any point
- **Version History**: View all saved versions with timestamps and descriptions
- **Rollback**: Restore projects to any previous checkpoint
- **Auto-save support**: Automatic checkpoints during key operations

### Visual Testing
- **Test Preview**: Visual test runner with cursor tracking
- **Test Steps**: Auto-generated test scenarios based on code analysis
- **Visual Feedback**: See test progress with animated cursor overlay

## Local LLM Optimization (Mac M4 Pro)

### LM Studio Integration
- Optimized for Mac M4 Pro with 48GB RAM
- Client connection caching for performance
- Extended timeout (120s) for complex generations
- Automatic retry logic (2 retries)

### Temperature Presets
- **Planner**: 0.3 (structured, deterministic planning)
- **Builder**: 0.5 (balanced code generation)
- **Creative**: 0.7 (exploratory features)
- **Deterministic**: 0.1 (precise, repeatable outputs)

### Token Limits by Use Case
- Quick Apps: 4,096 tokens
- Full-Stack: 8,192 tokens
- Production: 16,384 tokens
- Plans: 2,048 tokens

## External Dependencies
- **LM Studio**: Used for local LLM inference via its OpenAI-compatible API.
- **PostgreSQL**: Primary database for persistent project storage.
- **OpenAI SDK**: Used by the backend to interact with LM Studio.
- **React**: Frontend UI library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Utility-first CSS framework.
- **Shadcn UI**: UI component library.
- **Monaco Editor**: Code editor component.
- **TanStack Query**: Data fetching library for React.
- **Express.js**: Backend web application framework.
- **Drizzle ORM**: TypeScript ORM for PostgreSQL.