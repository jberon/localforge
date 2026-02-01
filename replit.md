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

### AI Dream Team
Expert advisory system that pauses to consult multiple AI personas for important decisions:

- **Default Expert Personas**:
  - **Alex (Senior Engineer)**: Inspired by Martin Fowler - focuses on code quality, maintainability, performance, technical debt
  - **Maya (Software Architect)**: Inspired by Werner Vogels - focuses on system design, scalability, integration, flexibility
  - **Jordan (UX Leader)**: Inspired by Don Norman - focuses on usability, clarity, flow, user experience
  - **Sam (Product Leader)**: Inspired by Marty Cagan - focuses on user value, differentiation, problem solving

- **Configurable Settings**:
  - Enable/disable Dream Team
  - Pause on major decisions (automatic consultation)
  - Discussion depth: Brief, Balanced, or Thorough
  - Add/remove/customize expert personas

- **Features**:
  - Animated discussion panel with expert avatars
  - Message types: opinions, concerns, suggestions, approvals, questions
  - Team recommendation synthesis
  - Manual "Consult Team" button for on-demand advice
  - Integration with Smart Mode planning workflow

- **API Endpoint**: `POST /api/dream-team/discuss` - Generates multi-persona discussion

### Visual Testing
- **Replit-Style Test Runner**: Full-featured visual test preview with animated progress
- **Animated Checkboxes**: Test steps show green checkmarks/red X marks with smooth animations
- **Real-time Thinking**: "Thinking" status bubbles show what the test is currently analyzing
- **Browser-Like Preview**: Traffic light window controls and address bar for familiar UX
- **Smart Code Analysis**: Detects buttons, inputs, forms, lists, cards, tables, charts
- **Cursor Tracking**: Animated cursor moves to test targets with ping effect
- **Progress Bar**: Visual completion percentage at top of test runner
- **Collapsible Steps**: Expand/collapse test step list for cleaner view

### UX Design (Steve Jobs-Inspired)
- **Quick Start Mode**: Click a template → describe your app → generate immediately (2 steps instead of 4)
- **Progressive Disclosure**: Search and Console tabs hidden behind "Dev Tools" toggle
- **Smart Connection**: Subtle green dot when connected, non-intrusive offline badge when disconnected
- **Polished Animations**: Smooth transitions for loading states, tab changes, and preview updates
- **Inline Connection Helper**: Friendly messaging when LM Studio is offline

### File Explorer (Replit-like Interface)
- **Tree View**: Hierarchical folder/file display with expand/collapse
- **Search Files**: Filter files by name in the search bar
- **File Icons**: Extension-based icons for common file types
- **Monaco Editor**: View and edit files with syntax highlighting
- **File Operations**:
  - Create new files with path and content
  - Edit files with "Modified" indicator for unsaved changes
  - Delete files with confirmation dialog
  - Save files with real-time sync to backend
- **Real-time Updates**: Files sync automatically during generation
- **API Endpoints**:
  - `POST /api/projects/:id/files` - Create a new file
  - `PATCH /api/projects/:id/files` - Update file content
  - `DELETE /api/projects/:id/files` - Delete a file

### Publishing & Packaging
- **Package Download**: Download complete project as ZIP file with all generated files
- **Build Configuration Options**:
  - Include Docker: Adds Dockerfile and docker-compose.yml
  - Include Env Template: Adds .env.example with placeholder variables
  - Include CI/CD: Adds GitHub Actions workflow for automated testing and deployment
- **Docker Support**: Production-ready multi-stage Dockerfile with Node.js 18 Alpine
- **Deployment Options**:
  - Self-hosted: VPS, bare metal, home server
  - Cloud Platforms: Fly.io, Railway, Render
  - Static Hosting: Vercel, Netlify, GitHub Pages
- **Security**: Path sanitization prevents Zip Slip vulnerabilities
- **API Endpoint**: `POST /api/projects/:id/package` - Generate downloadable ZIP

### Code Search & Console
- **Code Search**: Search across all generated files with file path, line number, and matching content
- **Console Tab**: Color-coded terminal output viewer (error, warn, info) with clear functionality

## Local LLM Optimization (Mac M4 Pro)

### LM Studio Integration
- Optimized for Mac M4 Pro with 48GB RAM
- Client connection caching for performance
- Extended timeout (120s) for complex generations
- Automatic retry logic (2 retries)
- Array-based streaming for memory efficiency
- Client disconnect handling to stop processing when clients leave

### API Endpoints for LM Studio
- `GET /api/llm/models` - List available models from LM Studio
- `POST /api/llm/status` - Check connection status and health

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

### Streaming Optimizations
- All streaming endpoints use array-based chunk accumulation
- Client disconnect detection to prevent unnecessary processing
- Proper SSE headers for reliable streaming

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