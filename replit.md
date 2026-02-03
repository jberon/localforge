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

### Plan/Build Mode (Replit-style)
LocalForge features a Replit-style Plan/Build mode toggle. In **Plan Mode**, AI generates a structured task list for user review and approval before execution. In **Build Mode**, AI directly writes code. A task list with progress indicators is displayed when building from a plan.

### AI Dream Team (Autonomous Dual-Model Orchestration)
When dual models (planner + builder) are configured, LocalForge activates an "AI Dream Team" mode. This team, comprised of expert personas, collectively handles project planning, task tracking, code generation, validation, and documentation (including README auto-generation). All team actions are logged in a Project Team Panel UI.

### Production-Grade Output
Generated applications are production-grade, featuring multi-file architecture, TypeScript by default, automated test generation (Vitest/React Testing Library), code quality analysis with auto-fix, and auto-generated `README.md` documentation. Real-time file generation progress is streamed.

### App Classification & Content Validation
LocalForge classifies requests into 12+ app types, using specific templates and injecting app-specific guidance into prompts. After generation, the system validates the code against required features and attempts auto-fixes if validation fails.

### Production-Grade Security & Infrastructure
The system implements standard security headers, rate limiting, structured logging, Zod schema-based input validation, request size limits, and a frontend error boundary for graceful handling.

### Frontend
Built with React + TypeScript, Vite, Tailwind CSS, and Shadcn UI. It uses Monaco Editor for code and TanStack Query for data management. Key UI elements include a chat panel, live preview, project sidebar, generation wizard, command palette, voice input, and a Replit-like file explorer.

### Backend
An Express.js API server with modular routes for projects, files, versions, packaging, LLM interactions, analytics, and code generation. It uses the OpenAI SDK for LM Studio interaction, Server-Sent Events (SSE) for streaming, and PostgreSQL with Drizzle ORM for persistence.

### Code Generation & Quality
Generates full-stack applications. Features agentic auto-fix capabilities for syntax errors with LLM retries and surfaces LLM limitation messages directly in the chat.

### Version Control
Includes built-in version control with checkpoints, allowing users to save snapshots, view history, and rollback. Auto-save provides automatic checkpoints.

### Publishing & Packaging
Supports downloading complete projects as ZIP files with options for Docker configurations, environment templates, and CI/CD pipelines, ensuring secure path sanitization.

### Local LLM Optimization
Optimized for Mac M4 Pro, integrating with LM Studio via client connection caching, extended timeouts, automatic retry logic, and array-based streaming. Supports configurable temperature presets and token limits. Backpressure UX provides queue status and warnings.

### Recommended Dual-Model Configuration for M4 Pro
- **Model A (Reasoning Brain/Planner)**: Ministral 3 14B Reasoning (Temperature: 0.2-0.3) for planning and architecture.
- **Model B (Development & Code Execution/Builder)**: Qwen3 Coder 30B or Qwen2.5 Coder 14B (Temperature: 0.5) for code generation.
This division minimizes hallucinations and improves multi-file scaffolding.

### LM Studio Settings for M4 Pro
Recommended settings include GPU Layers: -1, Context Length: 65536, Batch Size: 1024, Threads: 10, Flash Attention enabled, and Memory Map enabled.

### Connection Resilience
A Circuit Breaker pattern is implemented for LLM connection resilience with configurable failure thresholds, recovery timeouts, and monitoring.

### Automation Services (28 Total)

**Core Automation (7 Services):**
- **Auto-Validation Pipeline**: Integrates ESLint, TypeScript checking, and test runners (Vitest/Jest) with auto-fix support.
- **Intelligent Context Pruning**: Manages LLM context window efficiently through token estimation, auto-summarization, and code block compression.
- **Model Hot-Swapping**: Automatically detects memory pressure and switches to lighter models (e.g., Qwen2.5 14B) when necessary.
- **Health Monitoring Alerts**: Provides real-time SSE alerts for critical system events like circuit breaker status, memory pressure, and queue backlog.
- **Auto-Dependency Resolution**: Detects and suggests installs for missing npm packages and validates local file imports.
- **Generation Checkpoints**: Auto-saves progress during long generations and allows manual checkpoints with recovery capabilities.
- **Smart Retry Strategies**: Implements intelligent error recovery by reducing context, simplifying prompts, and adjusting temperature.

**Advanced Automation (9 Services):**
- **Auto-Documentation Generator**: Generates README.md and JSDoc comments for projects, analyzes tech stack and features.
- **Security Scanning**: Detects XSS, SQL injection, exposed secrets, command injection, and other vulnerabilities with severity ratings.
- **Bundle Size Optimizer**: Analyzes bundle size, identifies large dependencies, suggests code splitting/tree-shaking/lazy loading.
- **Test Coverage Analyzer**: Tracks test coverage, identifies untested functions, generates test templates for components and utilities.
- **Accessibility Checker**: Validates WCAG compliance including alt text, labels, keyboard accessibility, heading structure, and color contrast.
- **Code Deduplication**: Detects duplicate code patterns, suggests refactoring into hooks/components/utilities.
- **API Contract Validation**: Ensures frontend API calls match backend endpoints, detects method/path mismatches.
- **Import Optimizer**: Identifies unused imports, duplicate imports, namespace imports that block tree-shaking.
- **Performance Profiler**: Tracks LLM generation times, database queries, API requests with percentiles and trend analysis.

**Learning & Adaptation Intelligence (3 Services):**
- **User Preference Learning**: Tracks code modifications to learn user patterns - indentation style, quote preferences, library choices, naming conventions. Automatically enhances prompts with learned preferences.
- **Style Memory**: Remembers project-specific coding conventions, preferred libraries, component patterns, and file structure. Generates style guides for consistent code generation.
- **Feedback Loop**: Thumbs up/down tracking with prompt refinement. Records feedback, categorizes issues, learns from negative feedback, and automatically refines future prompts based on common issues.

**Intelligent Context Management (2 Services):**
- **Semantic Code Search**: Embedding-based code similarity search. Indexes projects into searchable chunks (functions, components, hooks, types) with semantic matching, token weighting, and cosine similarity scoring.
- **Auto-Context Injection**: Automatically includes related files based on import dependencies. Builds dependency graphs, identifies related type definitions, and optimizes context window usage.

**Predictive Capabilities (3 Services):**
- **Error Prevention**: Proactively analyzes code for patterns that lead to bugs - null references, missing awaits, state mutations, memory leaks, race conditions, security issues. Provides risk scores and recommendations.
- **Proactive Refactoring**: Suggests improvements when complexity exceeds thresholds. Calculates cyclomatic/cognitive complexity, detects long functions, complex conditionals, and naming issues with prioritized actions.
- **Dependency Health Monitor**: Alerts on outdated/vulnerable dependencies. Checks against known vulnerability database, generates health scores, and provides update recommendations with critical action commands.

**Cross-Project Intelligence (2 Services):**
- **Pattern Library**: Stores and retrieves successful component patterns - hooks, components, forms, API handlers, error handling. Includes built-in patterns with usage tracking and success scoring.
- **Smart Templates**: Generates boilerplate based on past projects. Includes templates for React components, CRUD features, forms, API routes, auth-protected pages. Adapts to project conventions automatically.

**Advanced Generation (2 Services):**
- **Multi-Step Reasoning**: Breaks complex features into validated micro-steps. Decomposes tasks into analyze, plan, generate, validate, refine, integrate, and test phases with dependency tracking and progress monitoring.
- **Self-Validation Loop**: Has builder verify output before returning. Implements syntax checking, import validation, security checks, TypeScript type analysis, and auto-fix with configurable retry logic.

### In-Browser Bundler
Uses esbuild-wasm for in-browser bundling of multi-file TypeScript/React projects, featuring a virtual file system, hot refresh, React/ReactDOM support, and an error overlay.

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
- **esbuild-wasm**: In-browser bundling.