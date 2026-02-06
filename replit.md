# LocalForge - AI App Builder

## Overview
LocalForge is an AI-powered web application builder that generates working React code from natural language descriptions using local Large Language Models (LLMs) via LM Studio. Its core purpose is to accelerate web development by providing rapid prototyping and full-stack application generation, enabling users to preview, modify, and download applications. The platform aims to simplify complex web development workflows into an intuitive chat-based interface with a vision to democratize web development.

## User Preferences
- Uses dark mode by default
- LM Studio endpoint configurable via settings dialog
- Temperature slider for LLM creativity control
- Dual model support: Configure separate models for planning vs building phases
- Cloud LLM provider support: OpenAI, Groq, Together AI (with API key configuration)
- Test Mode: Built-in Replit AI Integration for testing without local LM Studio
- Mobile-friendly: Responsive layout with bottom tab navigation (Chat/Preview/Tools) for ideation on-the-go

## System Architecture

### Core Functionality
LocalForge offers a chat-based interface with streaming responses, project management, live preview, and code validation. It incorporates AI-powered prompt enhancement and iterative refinement, intelligently routing requests to optimize LLM configurations based on intent (plan/build/refine/question).

### Plan/Build Modes & Build Speed Options
A Replit-style Plan/Build mode toggle allows AI to either generate a structured task list (Plan Mode) or directly write code (Build Mode). Build Mode executes tasks from an approved plan with progress indicators. Users can choose between **Fast Mode** for quick, targeted edits, and **Full Build Mode** for comprehensive full-stack generation with all automation services, producing production-grade output.

### Autonomy Levels & Extended Thinking Mode
A four-tier autonomy control system (Low, Medium, High, Max) governs AI intervention. For complex tasks, an "Extended Thinking Mode" provides deep reasoning capabilities with three levels (Standard, Extended, Deep), automatically triggering based on prompt complexity or detected issues.

### Discussion Mode
A third mode alongside Plan and Build, enabling brainstorming and architectural exploration without generating code. Uses teal accent color to differentiate from Plan (purple) and Build (orange). Intent classification detects questions, brainstorming, comparison, and exploration requests.

### Design Mode & Design Style Keywords
Enables rapid mockup and wireframe generation with five design styles and pre-built templates. Approved mockups are then used to automatically generate full code. 10 design style keywords (glassmorphism, neumorphism, brutalism, retro, gradient-mesh, aurora, cyberpunk, organic, material-3, claymorphism) enhance prompts with CSS properties and Tailwind classes via DesignKeywordPicker in the chat panel.

### Visual Editor
Click-to-edit UI manipulation via iframe inspector using postMessage communication. VisualEditorOverlay provides property editing panel for inspected elements, supporting style changes, text editing, and layout adjustments.

### Smart Model Auto-Selection
ModelRouterService with intelligent routing between local LLMs and cloud providers (OpenAI, Groq, Together AI). Features 3-tier routing (fast/balanced/powerful), outcome tracking, cloud fallback, and configurable provider priorities via SmartModelSettings panel.

### Self-Testing Loop
SelfTestingService generates comprehensive test suites by analyzing code to detect features (forms, navigation, auth, CRUD, lists, modals, accessibility). Produces test scenarios with steps/assertions and generates fix suggestions for failed tests.

### Image/Design Import
ImageImportService handles design-to-code conversion from uploaded images (PNG, JPG, SVG). Generates analysis prompts for LLM vision processing, extracts design elements (headers, cards, buttons, forms), and produces code generation prompts.

### One-Click Auth & Database Templates
AuthDbTemplatesService provides 5 auth templates (email-password, social-oauth, JWT, session-based, API-key) and 5 database templates (PostgreSQL, SQLite, MongoDB, Supabase, Firebase) with production-quality code, dependencies, and setup instructions.

### Static Deploy
Generates deployable static HTML bundles from generated code with inline React/Babel CDN loading and Tailwind CSS. Supports single-file and multi-file projects.

### AI Dream Team
When dual LLMs are configured (planner + builder), an "AI Dream Team" orchestrates project planning, task tracking, code generation, validation, and documentation, with actions logged in a Project Team Panel UI.

### Production-Grade Output & App Classification
Generated applications are production-grade, featuring multi-file architecture, TypeScript, automated test generation, code quality analysis with auto-fix, and auto-generated `README.md`. LocalForge classifies requests into 12+ app types, applying specific templates, and validates generated code against required features with auto-fix attempts.

### Production-Grade Security & Infrastructure
Implements standard security headers, rate limiting, structured logging, Zod schema validation, request size limits, and frontend error boundaries.

### Frontend
Built with React + TypeScript, Vite, Tailwind CSS, and Shadcn UI. Features Monaco Editor, TanStack Query, a chat panel, live preview, project sidebar, generation wizard, command palette, voice input, and a Replit-like file explorer.

### Backend
An Express.js API server with modular routes for project management, LLM interactions, and code generation. Uses OpenAI SDK for LM Studio, Server-Sent Events (SSE) for streaming, and PostgreSQL with Drizzle ORM.

### Code Generation & Quality
Generates full-stack applications with agentic auto-fix capabilities for syntax errors, retrying with LLMs, and surfacing LLM limitation messages.

### Version Control & Publishing
Includes built-in version control with manual and auto-save checkpoints, history viewing, and rollback functionality. Supports downloading projects as ZIP files with options for Docker, environment templates, and CI/CD pipelines, and one-click deployment to various platforms (Vercel, Netlify, Railway, Render, Replit).

### Local LLM Optimization & Multi-Agent Architecture
Optimized for local LLM performance, integrating with LM Studio via client connection caching, extended timeouts, automatic retry logic, and array-based streaming. A multi-agent architecture utilizes specialized services for task decomposition, project memory, code execution, auto-fixing, and refactoring. Recent enhancements focus on speculative decoding, quantization-aware context, KV cache persistence, local embedding, hardware optimization, intelligent model routing, streaming budget management, conversation compression, and performance profiling.

### Intelligence Services (Feb 2026)
Five specialized services for local LLM optimization, all extending BaseService with ManagedMap for memory safety:
- **PromptChunkingService** (`server/services/prompt-chunking.service.ts`): Breaks complex requests into 6K-token chunks with dependency tracking and parallel/sequential execution hints. Analyzes prompt complexity (lines, features, dependencies) to decide chunking strategy.
- **OutputParserService** (`server/services/output-parser.service.ts`): Structural parsing of raw LLM output with code fence extraction, JSON validation, truncation detection, markdown artifact cleanup, and language-aware block parsing.
- **AdaptiveTemperatureService** (`server/services/adaptive-temperature.service.ts`): Learns optimal temperature per model and task type (planning/building/refining/discussion) from quality signals. Uses exponential moving average with configurable learning rate. Applied to planning phase via config override.
- **ConversationMemoryService** (`server/services/conversation-memory.service.ts`): Compresses multi-turn history into structured project state summaries (files, components, endpoints, decisions, tech stack). Preserves recent messages while aggressively compressing older ones. Used when messages > 6.
- **SmartRetryService** (`server/services/smart-retry.service.ts`): Intelligent retry with 6 strategies (rephrase, simplify, add-examples, decompose, constrain-output, increase-context) selected based on failure mode detection (syntax-error, incomplete-output, wrong-format, off-topic, repetition, empty-output, timeout). Planning retries enforce JSON-only output.
- **API Routes**: All services exposed via `/api/optimization/intelligence/*` endpoints for status, configuration, and manual triggering.

### Autonomous Development Loop & Error Learning
Features an autonomous development loop with runtime feedback capture, UI/UX analysis, enhanced auto-fix capabilities, and improved project memory. An error learning service tracks common LLM mistakes, learns new patterns, generates prevention prompts, and provides auto-fix suggestions.

### In-Browser Bundler & Local Build
Uses esbuild-wasm for in-browser bundling of multi-file TypeScript/React projects with a virtual file system and hot refresh. Enables building generated apps locally using npm/Vite tooling, supporting the full npm ecosystem, a real Vite dev server, auto-scaffolding, port management, real-time logs, and process control.

### Memory Safety & Performance Optimization
All 18+ singleton services with unbounded Maps/arrays now have TTL/eviction policies with configurable max sizes (500 for histories, 1000 for caches, 200 for reasoning chains). Every service with `setInterval` timers has a `destroy()` method that clears intervals and resets state. EventEmitter-based services (HealthAlerts, RuntimeFeedback) call `removeAllListeners()` on destroy. The V2 Orchestrator is optimized with `Promise.all` parallelization, prompt hash caching, and streaming session cleanup. Hardware optimizer uses direct CPU model string parsing ("Apple M4 Pro") for accurate Apple Silicon chip detection, falling back to memory-based heuristics only when the variant isn't in the model string. `FORCE_M4_PRO_PROFILE` env var enables testing M4 Pro optimizations on non-Mac hardware. `M4_PRO_MEMORY_GB` env var overrides the default 36GB memory assumption.

### Production Readiness Audit (Feb 2026)
- **SSE Memory Leak Prevention**: All streaming endpoints (discussion.ts, dream-team.ts, chat.routes.ts, plan-build.routes.ts, team.routes.ts) have `req.on('close')` handlers to abort LLM generation and clean up when clients disconnect.
- **Rate Limiting**: `apiRateLimiter` middleware applied at router mount level to all API routes (projects, llm, analytics, dream-team, database, optimization, local-build, intelligence, runtime, discussion). Health endpoint intentionally excluded.
- **Input Validation**: Zod `safeParse` validation added to 130+ mutation endpoints across 12 route files. Returns 400 with structured error details on validation failure. Uses `.optional()` for flexible fields and `.passthrough()` for dynamic config objects.
- **M4 Pro Configuration**: Corrected from 48GB→36GB unified memory assumption. Context length reduced from 65536→32768 tokens. Batch size set to 1024 (safe for 36GB). Concurrent requests fixed to 1 (matches LM Studio serial execution). `m4-pro-config.ts` updated with `getOptimalConfig()` supporting 4 memory tiers (48GB+, 36GB+, 24GB+, <24GB). `llm-client.ts` inline `M4_PRO_CONFIG` aligned with 36GB defaults.

### Service Architecture & Lifecycle (Feb 2026)
- **BaseService** (`server/lib/base-service.ts`): Abstract class providing standardized logging, `ManagedMap` with LRU/FIFO eviction, and auto-registration with `ServiceRegistry`. 68 services migrated.
- **ServiceRegistry** (`server/lib/service-registry.ts`): Central registry that auto-discovers all `BaseService` instances. `destroyAll()` destroys all registered services in one call.
- **Unified Shutdown** (`server/lib/graceful-shutdown.ts`): Single shutdown handler using `ServiceRegistry.destroyAll()` — replaces previous 24 hardcoded service imports in `server/index.ts`.
- **asyncHandler** (`server/lib/async-handler.ts`): DRY wrapper for Express route handlers that catches async errors and forwards to centralized error middleware via `next(error)`. Adopted across all 15 route files, eliminating 252+ try/catch blocks.
- **Route Modules** (`server/routes/optimization/`): 20 domain-specific route files extracted from the original 2,029-line optimization.ts (now 225 lines). Generation routes split from 1,383 lines into 4 focused modules (chat, plan-build, team, index).
- **Orchestrator Modules** (`server/services/orchestrator/`): Types, model-instructions helper, and JSON parser extracted from the 1,885-line orchestrator.ts (now 1,659 lines). Three orchestrators serve distinct purposes: main generation, production builds, and optimization layer.
- **Home Page Contexts** (`client/src/contexts/`): `HomePanelsContext` (useReducer for 8 panel toggles) and `GenerationContext` (5 generation states) with useMemo-wrapped values to prevent unnecessary re-renders.
- **Frontend Extractions**: `usePlanBuild` hook (15 state variables), `HomeHeader` component, and `PreviewPanel` split into 3 sub-components (PreviewToolbar, PreviewIframe, CodeEditorPane).

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