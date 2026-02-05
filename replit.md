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

## System Architecture

### Core Functionality
LocalForge offers a chat-based interface with streaming responses, project management, live preview, and code validation. It incorporates AI-powered prompt enhancement and iterative refinement, intelligently routing requests to optimize LLM configurations based on intent (plan/build/refine/question).

### Plan/Build Modes
A Replit-style Plan/Build mode toggle allows AI to either generate a structured task list for user approval (Plan Mode) or directly write code (Build Mode). Build Mode executes tasks from an approved plan with progress indicators.

### Build Speed Options
- **Fast Mode**: Quick, targeted edits (10-60 seconds) for small fixes, skipping non-essential services.
- **Full Build Mode**: Comprehensive full-stack generation (5-15 minutes) with all automation services, producing production-grade output including tests and documentation. The system auto-detects the appropriate mode.

### Autonomy Levels
A four-tier autonomy control system: Low, Medium (default), High, and Max, controlling the level of AI intervention and action confirmation.

### Extended Thinking Mode
Deep reasoning capabilities for complex tasks, with three levels (Standard, Extended, Deep) and automatic triggering for complex prompts, detected loops, or ambiguous requirements.

### Design Mode
Enables rapid mockup and wireframe generation with five design styles and pre-built templates. Approved mockups are then used to automatically generate full code.

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
Allows instant publishing of generated apps to Vercel, Netlify, Railway, Render, and Replit. Features platform auto-detection, config generation, Dockerfile generation, environment templates, deployment tracking, and history.

### Local LLM Optimization
Optimized for Mac M4 Pro, integrating with LM Studio via client connection caching, extended timeouts, automatic retry logic, and array-based streaming. Supports configurable temperature presets and token limits.

### Multi-Agent Architecture
Five specialized services collaborate for intelligent code generation:
- **Task Decomposition Service**: Parses complex prompts into subtasks with dependency ordering and strategy patterns.
- **Project Memory Service**: Persistent storage for file metadata, architectural decisions, and project context.
- **Code Runner Service**: Executes TypeScript/Node.js code in a sandbox, runs validation, and npm scripts.
- **Auto-Fix Loop Service**: Automated error detection with LLM feedback loop and configurable retry logic.
- **Refactoring Agent Service**: Post-generation cleanup applying DRY/SOLID patterns and detecting code smells.

### Autonomous Development Loop
Enhanced autonomous development capabilities for self-supervised development:
- **Runtime Feedback Service**: Real-time error capture from various sources with automatic classification and LLM-ready formatting.
- **UI/UX Agent Service**: Automated design system analysis detecting inconsistencies and accessibility violations.
- **Enhanced Auto-Fix Loop**: Applies LLM-generated code patches with line-based and string replacement strategies.
- **Enhanced Project Memory**: Dependency graph building with cycle detection and smart diffing.

### Local LLM Optimization Services (v1.9.0)
Maximizing local LLM performance through intelligent context management and model-specific optimizations:
- **Local Model Optimizer Service** (`server/services/local-model-optimizer.service.ts`): Model family detection (Qwen, Ministral, Llama, CodeLlama, DeepSeek, Mistral), model-specific instruction formats (ChatML, Llama, Alpaca, Vicuna), optimal temperature per task type, context window awareness (4K-32K tokens), smart context compression with priority-based line selection
- **Enhanced Smart Context Service** (`server/services/smart-context.service.ts`): Semantic compression with relevance scoring, priority-based file selection, code compression preserving structure, `buildOptimizedContext()` with 55% files / 25% history / 20% memory allocation
- **Enhanced Context Budget Service** (`server/services/context-budget.service.ts`): Dynamic token budgeting with model detection, 6 task profiles (planning, coding, debugging, refactoring, review, documentation), adaptive allocation redistributing unused tokens (60% code, 30% history, 10% examples)
- **Few-Shot Cache Service** (`server/services/few-shot-cache.service.ts`): 5 built-in examples (React component, API route, form handling, error boundary, database CRUD), model-family-specific formatting, relevance scoring based on keyword match + tags + success rate + usage
- **Enhanced Auto-Fix Loop**: Runtime error injection into LLM prompts, code patch parsing from responses
- **Code Runner Auto-Retry**: `runWithAutoRetry()` and `validateAndFix()` with automatic retries
- **Enhanced Project Memory**: Error history learning, similar error detection, successful fix tracking, active dependency prioritization
- **Orchestrator Integration**: `optimizeForLocalModel()` wired into planning/building phases, `buildOptimizedContext()` for smart context assembly with few-shot examples, `runRuntimeAutoFix()` for enhanced error correction, `recordErrorsToMemory()` for learning from errors

### Local LLM Optimization Services (v2.0.0)
Advanced local LLM optimization features for maximum performance on MacBook Pro M4 Pro:

- **Speculative Decoding Service** (`server/services/speculative-decoding.service.ts`): Uses fast draft models to generate initial responses, then verifies/refines with primary model for 2-3x speedup. Configurable draft token limits, verification thresholds, and model pair selection.

- **Quantization-Aware Context Service** (`server/services/quantization-detector.service.ts`): Automatic detection of Q2-Q8 quantization levels from model names, memory footprint calculation, context window adjustment based on quantization profile, and quality retention scoring.

- **KV Cache Persistence Service** (`server/services/kv-cache.service.ts`): Persists and reuses key-value cache between related requests, prefix matching for partial cache hits, configurable TTL and capacity limits, avoiding full context reprocessing.

- **Local Embedding Service** (`server/services/local-embedding.service.ts`): Integration with local embedding models (nomic-embed-text) for semantic code search, batch processing, cosine similarity calculations, and fallback to simple embeddings.

- **Hardware Optimizer Service** (`server/services/hardware-optimizer.service.ts`): Automatic detection of Apple Silicon (M1-M4) capabilities, GPU layer recommendations, batch size optimization, Neural Engine utilization, and memory-aware configuration.

- **Model Router Service** (`server/services/model-router.service.ts`): Intelligent task routing between fast/balanced/powerful model tiers, complexity analysis, task type detection, and automatic model selection based on context requirements.

- **Streaming Budget Service** (`server/services/streaming-budget.service.ts`): Real-time token budget monitoring during streaming, quality signal detection (repetition, completion patterns), dynamic output length adjustment, and early stopping.

- **Conversation Compressor Service** (`server/services/conversation-compressor.service.ts`): Intelligent summarization of old conversation turns, topic segmentation, critical info extraction, code block preservation, and decision tracking.

- **Performance Profiler Service** (`server/services/performance-profiler.service.ts`): Comprehensive metrics tracking for tokens/sec, latency percentiles (p50/p95/p99), success rates, model performance comparison, and optimization recommendations.

- **Pattern Library Service** (`server/services/pattern-library.service.ts`): Pre-computed code patterns (React components, hooks, API routes, forms, CRUD operations), pattern matching with relevance scoring, user pattern learning, and success tracking.

- **V2 Orchestrator Service** (`server/services/v2-orchestrator.service.ts`): Unified integration layer that coordinates all v2.0.0 services with proper sequencing, fallbacks, and metrics collection.

### In-Browser Bundler
Uses esbuild-wasm for in-browser bundling of multi-file TypeScript/React projects with a virtual file system and hot refresh.

### Local Build
Enables building generated apps locally using npm/Vite tooling, supporting full npm ecosystem, real Vite dev server, auto-scaffolding, port management, real-time logs, and process control.

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