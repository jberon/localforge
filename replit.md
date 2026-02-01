# LocalForge - AI App Builder

## Overview
LocalForge is an AI-powered application builder that connects to your local LLM (via LM Studio) to generate web applications from natural language descriptions. Users can describe what they want to build, and the AI generates working React code that can be previewed live and downloaded as a standalone HTML file.

## Current State
- Fully functional MVP with chat interface, live preview, and project management
- Streaming responses - see code being generated in real-time
- Connection status indicator shows if LM Studio is reachable
- Connects to LM Studio's OpenAI-compatible API (default: http://localhost:1234/v1)
- **PostgreSQL database** for persistent project storage (projects survive restarts)
- **Code validation** - generated code is checked for syntax errors before showing "Ready" state

## Project Architecture

### Frontend (client/)
- **React + TypeScript** with Vite
- **Tailwind CSS** for styling with dark mode support
- **Shadcn UI** components
- **Monaco Editor** for code viewing
- **TanStack Query** for data fetching

### Backend (server/)
- **Express.js** API server
- **OpenAI SDK** configured for LM Studio compatibility
- **Server-Sent Events (SSE)** for streaming LLM responses
- **PostgreSQL + Drizzle ORM** for persistent storage
- **Modular code generators** in `server/generators/` (schema, routes, frontend, docker, validator)

### Key Components
- `client/src/pages/home.tsx` - Main application layout with resizable panels
- `client/src/components/chat-panel.tsx` - Chat interface with example prompts
- `client/src/components/preview-panel.tsx` - Live app preview and code viewer
- `client/src/components/project-sidebar.tsx` - Project list and LLM settings
- `client/src/components/error-boundary.tsx` - Error handling for React components
- `client/src/components/connection-helper.tsx` - LLM connection troubleshooting UI
- `client/src/components/onboarding-modal.tsx` - First-run tutorial for new users
- `client/src/components/refinement-panel.tsx` - Iterative refinement UI for modifying generated apps
- `client/src/components/wizard/` - Modular wizard components (template-selector, configure-step, data-model-builder, review-step, freeform-prompt)
- `server/routes.ts` - API endpoints for projects, LLM chat, prompt enhancement, refinement, and error recovery
- `server/generators/` - Modular code generators (schema, routes, frontend, docker, validator)

### API Endpoints
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create a new project
- `DELETE /api/projects/:id` - Delete a project
- `POST /api/projects/:id/chat` - Chat with LLM (streaming SSE response)
- `POST /api/projects/:id/refine` - Iterative refinement (streaming SSE response)
- `POST /api/llm/status` - Check LM Studio connection status
- `POST /api/llm/enhance-prompt` - AI-powered prompt enhancement
- `POST /api/llm/fix-code` - Smart error recovery for broken code

### Data Models (shared/schema.ts)
- **Project**: id, name, description, messages, generatedCode, generatedFiles, dataModel, lastPrompt, validation, generationMetrics, createdAt, updatedAt
- **Message**: id, role (user/assistant), content, timestamp
- **LLMSettings**: endpoint, model, temperature
- **ValidationResult**: valid, errors[], warnings[]
- **GenerationMetrics**: startTime, endTime, durationMs, promptLength, responseLength, status, errorMessage, retryCount, tokenCount

## User Preferences
- Uses dark mode by default
- LM Studio endpoint configurable via settings dialog
- Temperature slider for LLM creativity control

## Recent Changes

### Feb 2026 - Major UX & LLM Features Update
- **Modular Wizard Refactor** - Split 891-line generation-wizard.tsx into 8 focused components:
  - `wizard/types.ts` - TypeScript interfaces and types
  - `wizard/templates.ts` - Template configurations and defaults
  - `wizard/template-selector.tsx` - Steve Jobs-inspired template selection
  - `wizard/configure-step.tsx` - Field configuration with Quick Generate button
  - `wizard/data-model-builder.tsx` - Visual entity/field editor
  - `wizard/review-step.tsx` - Pre-generation review
  - `wizard/freeform-prompt.tsx` - Freeform text input with AI enhancement
- **First-Run Onboarding** - 4-step modal tutorial explaining LocalForge and LM Studio setup
- **Quick Generate** - Generate directly from configure step without going through all wizard steps
- **Prompt Enhancement** - AI-powered improvement of simple prompts before generation
  - Adds detail, UI/UX suggestions, accessibility considerations
  - Available for short prompts (<100 chars) via "Enhance" button
- **Iterative Refinement** - Modify generated apps with follow-up requests
  - Quick refinement buttons: Dark mode, Make bigger/smaller, Better fonts
  - Custom refinement input for any changes
  - Streams updated code like initial generation
- **Smart Error Recovery** - API endpoint to fix broken generated code using LLM
- **Generation Metrics** - Track duration, success/failure, prompt length in database
- **Code Validation** - Generated code is validated for syntax errors before showing "Ready" state
  - Checks for mismatched braces, parentheses, brackets
  - Validates JSON files
  - Shows validation status badges in UI (errors/warnings)
- **Error Handling** - React error boundaries catch crashes and show recovery UI
  - Global ErrorBoundary wraps entire app
  - PreviewErrorBoundary for preview-specific errors
  - ConnectionHelper shows LLM troubleshooting when disconnected
- **Regenerate Feature** - Edit and regenerate projects with same data model
  - Stores lastPrompt for each project
  - Dialog to modify prompt before regenerating
- **Modular Code Generators** - Refactored into organized modules
  - server/generators/schema.ts - Database schema generation
  - server/generators/routes.ts - API route generation
  - server/generators/frontend.ts - React component generation
  - server/generators/docker.ts - Docker and deployment files
  - server/generators/validator.ts - Code validation
- **Launch Guide** - Post-generation "Run & Deploy" experience with:
  - Prerequisites checklist (Node.js, PostgreSQL, etc.)
  - Step-by-step copyable terminal commands
  - Auto-generated .env content with sensible defaults
  - Docker deployment templates (Dockerfile, docker-compose.yml)
  - Cloud platform deployment guides (Railway, Render, Fly.io, Vercel)
- **Full-Stack Generation** - Can now generate complete backend + database + frontend projects
- **Data Model Builder** - Visual entity/field editor to define data structures without coding
- **Default Data Models** - Templates like Task Manager come with pre-configured data models
- **ZIP Download** - Full-stack projects download as ZIP with all files + README + Docker files
- **Files Tab** - Browse all generated files with syntax-highlighted code viewer
- Added Generation Wizard with template selection and structured inputs
- Templates: Dashboard, Task Manager, Data Analyzer, Landing Page, Calculator, Creative Apps
- Smart prompt generation from wizard selections
- Preflight LLM connection check before generation
- Added streaming responses with real-time code preview
- Added LLM connection status indicator

## Full-Stack Generation
When you enable "Full-Stack with Database" in the Data Model step:
- **Database Schema** - Generates Drizzle ORM schema for PostgreSQL
- **API Routes** - Creates CRUD endpoints for each entity
- **React Components** - Generates pages with forms and data display
- **Package.json** - Includes all dependencies and scripts
- **README** - Setup instructions and API documentation

The generated project can be downloaded as a ZIP and run locally with `npm install && npm run dev`.

## Running Locally
To run this app on your MacBook:
1. Start LM Studio and enable the local server (default port 1234)
2. Load your preferred model in LM Studio
3. Run `npm run dev` in this directory
4. Open http://localhost:5000 in your browser
5. Configure the LLM endpoint in settings if needed
