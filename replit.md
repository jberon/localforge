# LocalForge - AI App Builder

## Overview
LocalForge is an AI-powered web application builder that generates working React code from natural language descriptions using local Large Language Models (LLMs) via LM Studio. Its core purpose is to accelerate web development by providing rapid prototyping and full-stack application generation, enabling users to preview, modify, and download applications. The platform aims to simplify complex web development workflows into an intuitive chat-based interface with a vision to democratize web development.

## User Preferences
- Uses dark mode by default
- LM Studio endpoint configurable via settings dialog
- Temperature slider for LLM creativity control
- Dual model support: Configure separate models for planning vs building phases
- Cloud LLM provider support: OpenAI, Groq, Together AI (with API key configuration)

## System Architecture

### Core Functionality
LocalForge offers a chat-based interface with streaming responses for real-time code generation, project management, live preview, and code validation. It incorporates AI-powered prompt enhancement and iterative refinement, intelligently routing requests to optimize LLM configurations based on intent (plan/build/refine/question).

### Plan/Build Modes
A Replit-style Plan/Build mode toggle allows AI to either generate a structured task list for user approval (Plan Mode) or directly write code (Build Mode). Build Mode executes tasks from an approved plan with progress indicators.

### Build Speed Options
- **Fast Mode**: Quick, targeted edits (10-60 seconds) for small fixes, skipping non-essential services.
- **Full Build Mode**: Comprehensive full-stack generation (5-15 minutes) with all automation services, producing production-grade output including tests and documentation. The system auto-detects the appropriate mode.

### Autonomy Levels
A four-tier autonomy control system:
- **Low**: Confirms every action.
- **Medium** (default): Confirms destructive actions only, auto-runs tests.
- **High**: Auto-fixes errors, self-testing loops enabled.
- **Max**: Full autonomy with extended self-supervised development.

### Extended Thinking Mode
Deep reasoning capabilities for complex tasks, with three levels: Standard (3 steps), Extended (7 steps), and Deep (15 steps). Auto-triggers for complex prompts, detected loops, or ambiguous requirements.

### Design Mode
Enables rapid mockup and wireframe generation (~2 minutes) with five design styles and pre-built templates. Approved mockups are then used to automatically generate full code.

### AI Dream Team
When dual LLMs are configured (planner + builder), an "AI Dream Team" orchestrates project planning, task tracking, code generation, validation, and documentation. Actions are logged in a Project Team Panel UI.

### Production-Grade Output
Generated applications are production-grade, featuring multi-file architecture, TypeScript, automated test generation (Vitest/React Testing Library), code quality analysis with auto-fix, and auto-generated `README.md`.

### App Classification & Content Validation
LocalForge classifies requests into 12+ app types, applying specific templates. Post-generation, code is validated against required features with auto-fix attempts on failure.

### Production-Grade Security & Infrastructure
Implements standard security headers, rate limiting, structured logging, Zod schema validation, request size limits, and frontend error boundaries.

### Frontend
Built with React + TypeScript, Vite, Tailwind CSS, and Shadcn UI. Features Monaco Editor, TanStack Query, a chat panel, live preview, project sidebar, generation wizard, command palette, voice input, and a Replit-like file explorer.

### Backend
An Express.js API server with modular routes for project management, LLM interactions, and code generation. Uses OpenAI SDK for LM Studio, Server-Sent Events (SSE) for streaming, and PostgreSQL with Drizzle ORM.

### Code Generation & Quality
Generates full-stack applications with agentic auto-fix capabilities for syntax errors, retrying with LLMs, and surfacing LLM limitation messages.

### Version Control
Includes built-in version control with manual and auto-save checkpoints, history viewing, and rollback functionality.

### Publishing & Packaging
Supports downloading projects as ZIP files with options for Docker, environment templates, and CI/CD pipelines.

### One-Click Deployment
Allows instant publishing of generated apps to Vercel, Netlify, Railway, Render, and Replit. Features platform auto-detection, config generation (vercel.json, netlify.toml, railway.json, render.yaml), Dockerfile generation, environment templates, deployment tracking, and history.

### Local LLM Optimization
Optimized for Mac M4 Pro, integrating with LM Studio via client connection caching, extended timeouts, automatic retry logic, and array-based streaming. Supports configurable temperature presets and token limits.

### Recommended Dual-Model Configuration for M4 Pro
- **Model A (Reasoning/Planner)**: Ministral 3 14B Reasoning (Temperature: 0.2-0.3)
- **Model B (Development/Builder)**: Qwen3 Coder 30B or Qwen2.5 Coder 14B (Temperature: 0.5)

### Connection Resilience
A Circuit Breaker pattern is implemented for LLM connection resilience.

### Automation Services (Key Examples)
- **Auto-Validation Pipeline**: Integrates ESLint, TypeScript, and test runners with auto-fix.
- **Intelligent Context Pruning**: Manages LLM context via token estimation, summarization, and compression.
- **Model Hot-Swapping**: Switches to lighter models under memory pressure.
- **Auto-Documentation Generator**: Generates `README.md` and JSDoc comments.
- **Security Scanning**: Detects XSS, SQL injection, exposed secrets.
- **User Preference Learning**: Learns user coding patterns and enhances prompts.
- **Style Memory**: Remembers project-specific coding conventions.
- **Feedback Loop**: Refines prompts based on user feedback.
- **Semantic Code Search**: Embedding-based code similarity search for context.
- **Auto-Context Injection**: Injects related files based on dependencies.
- **Error Prevention**: Proactively analyzes code for potential bugs.
- **Proactive Refactoring**: Suggests improvements based on complexity metrics.
- **Dependency Health Monitor**: Alerts on outdated/vulnerable dependencies.
- **Multi-Step Reasoning**: Breaks complex features into validated micro-steps.
- **Self-Validation Loop**: Builder verifies output before returning.

### In-Browser Bundler
Uses esbuild-wasm for in-browser bundling of multi-file TypeScript/React projects with a virtual file system and hot refresh.

### Local Build
Enables building generated apps locally using npm/Vite tooling on the user's machine, supporting full npm ecosystem, real Vite dev server, auto-scaffolding, port management, real-time logs, and process control.

## External Dependencies
- **LM Studio**: Local LLM inference.
- **PostgreSQL**: Primary database.
- **OpenAI SDK**: Backend interaction with LM Studio.
- **React**: Frontend UI framework.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Styling framework.
- **Shadcn UI**: UI component library.
- **Monaco Editor**: Code editor.
- **TanStack Query**: Data fetching library.
- **Express.js**: Backend web framework.
- **Drizzle ORM**: PostgreSQL ORM.
- **esbuild-wasm**: In-browser bundler.