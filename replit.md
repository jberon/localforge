# LocalForge - AI App Builder

## Overview
LocalForge is an AI-powered web application builder that generates working React code from natural language descriptions using local Large Language Models (LLMs) via LM Studio. Its core purpose is to accelerate web development by providing rapid prototyping and full-stack application generation, enabling users to preview, modify, and download applications. The platform aims to simplify complex web development workflows into an intuitive chat-based interface.

## User Preferences
- Uses dark mode by default
- LM Studio endpoint configurable via settings dialog
- Temperature slider for LLM creativity control
- Dual model support: Configure separate models for planning vs building phases

## System Architecture

### Core Functionality
LocalForge provides a chat-based interface with streaming responses for real-time code generation, project management, live preview, and code validation. It includes an AI-powered prompt enhancement and iterative refinement system. The system intelligently routes requests, automatically detecting intent (plan/build/refine/question) and optimizing LLM configurations.

### AI Dream Team (Autonomous Dual-Model Orchestration)
When dual models are configured (planner + builder), LocalForge activates an AI Dream Team mode with expert personas (e.g., Marty Cagan for product vision, Martin Fowler for architecture, Julie Zhuo for design, Kent Beck for quality). This team collectively handles project planning, business case generation, task tracking, specialist recruitment, web search integration, code generation, validation, and documentation (including README auto-generation). All team member actions are logged in a Project Team Panel UI.

### Production-Grade Output
Generated applications are production-grade by default, featuring:
- **Multi-File Architecture**: Organized project structure (components/, hooks/, services/, __tests__/).
- **TypeScript by Default**: Strict typing with interfaces and generics.
- **Automated Test Generation**: Vitest/React Testing Library tests for components.
- **Quality Analysis**: Code quality scoring with auto-fix capabilities.
- **Documentation**: Auto-generated README.md.
- **File-by-File Progress**: Real-time streaming of file generation.

### App Classification & Content Validation
LocalForge classifies requests into 12+ app types (e.g., calculator, todo, dashboard). Each app type uses specific templates with suggested files, key features, state management, and UI patterns. App-specific guidance is injected into prompts. After generation, the system validates that the code implements required features and attempts auto-fixes if validation fails.

### Production-Grade Security & Infrastructure
- **Security Headers**: Implements standard security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy, HSTS).
- **Rate Limiting**: Applies rate limits to generation and LLM endpoints.
- **Structured Logging**: Provides detailed logging with context objects and error stack traces.
- **Input Validation**: Uses Zod schemas for robust validation of project, settings, files, and versions.
- **Request Size Limits**: Sets limits for JSON and urlencoded bodies.
- **Error Boundary**: Graceful error handling with retry/reload options for the frontend.

### Frontend
Built with React + TypeScript, Vite, Tailwind CSS, and Shadcn UI. It uses Monaco Editor for code and TanStack Query for data management. Key UI elements include a chat panel, live preview, project sidebar, generation wizard, command palette, voice input, and a Replit-like file explorer. Custom hooks manage LLM connections, SSE streaming, project mutations, and generation state. Header status indicators provide real-time feedback on connection, queue status, and model configuration.

### Backend
An Express.js API server with modular routes for projects, files, versions, packaging, LLM interactions, analytics, and code generation. It uses the OpenAI SDK for LM Studio interaction, Server-Sent Events (SSE) for streaming, and PostgreSQL with Drizzle ORM for persistence.

### Code Generation & Quality
Generates full-stack applications including database schemas, API routes, and React components. Features agentic auto-fix capabilities for syntax errors with LLM retries and surfaces LLM limitation messages directly in the chat.

### Version Control
Includes built-in version control with checkpoints, allowing users to save snapshots, view history, and rollback. Auto-save provides automatic checkpoints.

### Publishing & Packaging
Supports downloading complete projects as ZIP files with options for Docker configurations, environment templates, and CI/CD pipelines, ensuring secure path sanitization.

### Local LLM Optimization
Optimized for Mac M4 Pro, integrating with LM Studio via client connection caching, extended timeouts, automatic retry logic, and array-based streaming. Supports configurable temperature presets and token limits. Environment variables allow tuning LLM client configuration. Backpressure UX provides queue status and warnings. Database connection pooling is configured for performance. Dream Team service includes guards for safe member lookups. Recommended LM Studio settings and model configurations are provided for optimal performance on M4 Pro.

## Recommended Dual-Model Configuration

### Best Local Stack for M4 Pro (48GB RAM)

**Model A - Reasoning Brain (Planner):**
- **Recommended**: Ministral 3 14B Reasoning
- **Role**: System architect, strategist, planner, debugging explainer
- **Optimal Temperature**: 0.2-0.3 (structured planning)
- **Strengths**: Multi-step reasoning, decomposition, architecture design, low hallucination

**Model B - Development & Code Execution (Builder):**
- **Recommended**: Qwen3 Coder 30B (preferred) or Qwen2.5 Coder 14B (lighter)
- **Role**: Code generator, implementer, refactorer, test writer
- **Optimal Temperature**: 0.5 (creative but accurate)
- **Strengths**: Multi-file projects, API integration, production-ready output

### Division of Responsibilities

**Reasoning Model (Model A) Instructions:**
- "You will output a plan only, no code."
- "Break the task into steps."
- "Describe each file needed and its contents."
- "Define APIs, directories, and architecture."
- "Spell out constraints and required styles."

**Coding Model (Model B) Instructions:**
- "Implement exactly what Model A planned. Do not change it."
- "Generate only valid code; no explanations."
- "When writing multiple files, respond in tagged blocks."

### Why Dual Models Work
- Coder models hallucinate structure; reasoning models write sloppy code
- Separating brain from hands gives: cleaner code, stable multi-file scaffolding, fewer hallucinations, better planning, easier refactoring

### LM Studio Settings for M4 Pro
- GPU Layers: -1 (all layers on GPU for Metal acceleration)
- Context Length: 32768 (32K context for large applications)
- Batch Size: 512 (optimal for M4 Pro)
- Threads: 10 (leave 4 cores for system)

## External Dependencies
- **LM Studio**: Local LLM inference.
- **PostgreSQL**: Primary database.
- **OpenAI SDK**: Backend interaction with LM Studio.
- **React**: Frontend UI.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Styling.
- **Shadcn UI**: UI components.
- **Monaco Editor**: Code editing.
- **TanStack Query**: Data fetching.
- **Express.js**: Backend framework.
- **Drizzle ORM**: PostgreSQL ORM.