# LocalForge - AI App Builder

## Overview
LocalForge is an AI-powered web application builder that generates working React code from natural language descriptions using local Large Language Models (LLMs) via LM Studio. Its core purpose is to accelerate web development by providing rapid prototyping and full-stack application generation. The platform aims to simplify complex web development workflows into an intuitive chat-based interface with a vision to democratize web development by enabling users to preview, modify, and download applications.

## User Preferences
- Uses dark mode by default
- LM Studio endpoint configurable via settings dialog
- Temperature slider for LLM creativity control
- Dual model support: Configure separate models for planning vs building phases
- Cloud LLM provider support: OpenAI, Groq, Together AI (with API key configuration)
- Test Mode: Built-in Replit AI Integration for testing without local LM Studio
- Mobile-friendly: Responsive layout with bottom tab navigation (Chat/Preview/Tools) for ideation on-the-go

## System Architecture
LocalForge features a chat-based interface with streaming responses, project management, live preview, and code validation. It employs AI-powered prompt enhancement and iterative refinement, routing requests to optimize LLM configurations.

**Core Modes & Features:**
- **Plan/Build Modes:** Toggle between generating a task list (Plan Mode) or direct code generation (Build Mode) with Fast and Full Build options.
- **Autonomy Levels:** Four-tier control for AI intervention, including an "Extended Thinking Mode" for complex tasks.
- **Discussion Mode:** For brainstorming without code generation.
- **Design Mode:** Rapid mockup and wireframe generation with five design styles and ten design style keywords for enhanced prompting.
- **Visual Editor:** Click-to-edit UI manipulation within the live preview iframe.
- **Smart Model Auto-Selection:** A ModelRouterService intelligently routes between local LLMs and cloud providers (OpenAI, Groq, Together AI) based on a 3-tier routing system with cloud fallback.
- **Self-Testing Loop:** Generates and executes comprehensive test suites, provides real-time progress, and suggests fixes for failed tests. Tests are executable via postMessage injection into the preview iframe.
- **Image/Design Import:** Converts uploaded images into design analysis and code generation prompts.
- **One-Click Auth & Database Templates:** Provides 5 authentication and 5 database templates with production-quality code.
- **Static Deploy:** Generates deployable static HTML bundles.
- **AI Dream Team:** Orchestrates project planning, task tracking, and code generation when dual LLMs are configured.
- **Production-Grade Output:** Generates full-stack applications with multi-file architecture, TypeScript, automated test generation, code quality analysis, and auto-generated `README.md`. It classifies requests into 12+ app types and validates generated code.
- **Production-Grade Security:** Implements standard security headers, rate limiting, structured logging, Zod schema validation, and frontend error boundaries.

**Technical Implementations:**
- **Frontend:** Built with React, TypeScript, Vite, Tailwind CSS, and Shadcn UI. Includes Monaco Editor, TanStack Query, a chat panel, live preview, project sidebar, generation wizard, command palette, voice input, and a Replit-like file explorer.
- **Backend:** Express.js API server with modular routes for project management, LLM interactions, and code generation. Utilizes OpenAI SDK for LM Studio, Server-Sent Events (SSE) for streaming, and PostgreSQL with Drizzle ORM.
- **Code Generation & Quality:** Features agentic auto-fix capabilities for syntax errors, a Multi-Pass Code Quality Pipeline with 5 deterministic fix passes, and auto-fixing without LLM calls to produce a quality score.
- **Smart Template Gallery:** Provides 12+ app templates with search/filter and optimized prompt builders.
- **One-Click Integrations Panel:** Offers 12 common integrations that enhance generation prompts.
- **Iterative Refinement Engine:** Uses regex-based intent classification for surgical prompts and integrates a DependencyGraphService for multi-file awareness.
- **Code Scaffold Library:** Provides 25+ production-ready code patterns, auto-matched and injected into generation prompts.
- **Autonomous Self-Healing Loop:** Captures preview iframe errors and triggers LLM-powered auto-fix through the code quality pipeline. Pre-refinement and post-refinement health checks auto-trigger ClosedLoopAutoFixService to heal broken code before compounding bugs.
- **Dependency Graph Service:** Analyzes import/export relationships for relevant context file selection during refinement.
- **Environment Variable Detection:** Scans generated code for API keys and secrets, providing setup instructions.
- **Prompt Decomposer:** Analyzes prompt complexity and decomposes complex requests into sequential sub-tasks for smaller local models. Includes context window optimization that merges small steps and splits oversized ones to fit within model limits.
- **Enhanced Deployment Packages:** Generates platform-specific deployment configurations for Vercel, Netlify, Docker, Railway, and static HTML.
- **Version Control & Publishing:** Built-in version control with checkpoints, history, rollback, and project download.
- **Local LLM Optimization & Multi-Agent Architecture:** Optimized for local LLM performance with client connection caching, extended timeouts, and a multi-agent architecture for task decomposition, project memory, code execution, auto-fixing, and refactoring.
- **Intelligence Services:** Five specialized services: PromptChunkingService, OutputParserService, AdaptiveTemperatureService, ConversationMemoryService, and SmartRetryService.
- **Autonomous Development Loop & Error Learning:** Features runtime feedback, UI/UX analysis, enhanced auto-fix, improved project memory, and an error learning service.
- **In-Browser Bundler & Local Build:** Uses `esbuild-wasm` for in-browser bundling of multi-file TypeScript/React projects with hot refresh and local build capabilities.
- **Project State Tracking:** Provides cross-session memory, tracking features, changes, health, and generation/refinement history per project.
- **Health Check Before Refinement:** Validates code integrity before refinement to prevent compounding bugs.
- **Feature Manifest:** Generates structured JSON feature lists with acceptance criteria from user prompts, tracking feature completion.
- **Sequential Build Pipeline:** Decomposes complex prompts into step-by-step build pipelines with quality gates. Features autonomous pipeline execution that auto-runs all steps end-to-end with quality gates between each step.
- **Two-Pass Context Reduction:** Reduces token usage for refinements by analyzing relevant parts of related files and generating focused summaries.
- **Multi-file Refinement:** Parses LLM output for per-file changes using `// FILE:` / `// END FILE` markers, enabling simultaneous updates to all affected files during refinement.
- **Lifecycle Hooks:** Provides user-configurable lifecycle automation with events and actions. Includes built-in health-check and auto-fix action types.
- **Performance-Based Model Routing:** ModelRouterService learns from outcome history (success rates, durations) to auto-adjust model selection. Upgrades tier when success rate drops below 50%.
- **Frontend Panels:** Feature Manifest Progress panel, Build Pipeline Progress tracker, Project State Dashboard, and Parallel Execution Dashboard for real-time monitoring of build state, health history, generation stats, and model pool utilization.
- **Parallel Model Execution:** ModelPoolManager discovers loaded models from LM Studio, manages concurrent model slots with checkout/return semantics, supports role assignments (planner/builder/reviewer/any). ParallelPipelineOrchestrator runs pipeline steps concurrently across multiple model instances with lookahead planning, concurrent quality analysis, and parallel file generation. Exposed via `/api/parallel/*` routes.

## Recent Changes (Feb 2026 - Intelligence Engine v2)
- **Outcome-Driven Learning Loop**: OutcomeLearningService tracks generation outcomes (quality scores, test results, user acceptance) with weighted exponential decay scoring. Continuously recalculates model performance per taskType for optimal routing.
- **Semantic Context Retrieval**: SemanticContextService builds embedding indices over project files. Tries LM Studio embeddings, falls back to TF-IDF (256-dim word-hash vectors). Retrieves most relevant code chunks by cosine similarity for generation/refinement context.
- **Predictive Error Prevention**: PredictiveErrorPreventionService scans prompts before generation against 15+ risk patterns (complex-state, async-fetch, auth-flow, etc.). Injects preventive scaffolding for high-risk prompts. Learns new patterns from outcomes.
- **Adaptive Prompt Decomposition**: AdaptiveDecompositionService tracks which decomposition strategies work best per model/taskType. Auto-tunes step count, granularity, merge/split thresholds using weighted outcome history.
- **Cross-Project Knowledge Transfer**: CrossProjectKnowledgeService extracts reusable patterns (hooks, API routes, components, forms, auth, etc.) from successful generations. Searchable library auto-injects relevant patterns into future prompts.
- **Speculative Generation with Verification**: SpeculativeGenerationService generates 2-5 candidate solutions in parallel with diversity modes (temperature/model/prompt). Evaluates each for quality, ranks, selects best. Configurable via UI.
- **Intelligence Dashboard**: Frontend panel showing real-time status of all 6 intelligence services with key metrics, model leaderboards, risk patterns, and knowledge library stats.
- **Intelligence API v2**: 32 REST endpoints under `/api/intelligence-v2/*` exposing all 6 services.

### Earlier Changes (Code Quality & Architecture Phase)
- **Type Safety Audit**: Replaced 32+ `as any` casts with proper TypeScript types; replaced 14 `Record<string, any>` with `Record<string, unknown>` for type safety
- **Orchestrator Refactoring**: Split orchestrator.ts from 1796 → 1367 lines; extracted prompts (orchestrator/prompts.ts), validation (orchestrator/validation.ts), enhanced operations (orchestrator/enhanced-ops.ts) into sub-modules
- **Code Quality Pipeline Refactoring**: Split code-quality-pipeline.service.ts from 1774 → 217 lines; extracted 5 analysis passes (structural, react-jsx, import, completeness, llm-cleanup) to code-quality/ directory
- **Structured Logging**: Replaced all stray console.log/warn/error calls with structured logger (lib/logger.ts)
- **Unit Tests**: Added 115 tests across 3 test suites (auto-fix-loop, sequential-build, code-quality-pipeline) in server/tests/
- **Heap Monitoring**: New HeapMonitorService with periodic memory sampling, trend detection, peak tracking, and `/api/health/heap` endpoint

### Earlier Changes (Local LLM Optimization Phase 2)
- **LLM Timeout**: Increased default from 120s to 300s (configurable via `LLM_REQUEST_TIMEOUT_MS` env var) for long local generations
- **Request Abort Controller**: Streaming requests now have timeout-based auto-abort, preventing stuck requests
- **Client Cache**: Bounded to 10 entries with LRU eviction to prevent memory leaks
- **Connection Pool**: Timeout synced with configurable `LLM_REQUEST_TIMEOUT_MS`, pool destroyed during graceful shutdown
- **Circuit Breaker**: Removed console.log, uses structured logger only
- **Graceful Shutdown**: Now cleans up LLM connection pool; unhandled rejections tracked with auto-shutdown after 10 in 60s window
- **Hardware Auto-Detection**: M4 Pro config now uses `os` module to detect actual memory, CPU cores, and Apple Silicon; supports 16GB+ machines dynamically
- **Project Listing Optimization**: GET /api/projects returns slim summaries (no generatedCode/messages payload); full data via `?full=true` or individual project endpoint
- **Response Logging**: Truncated to 500 chars to prevent massive log lines from large project data

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