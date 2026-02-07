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
- **Frontend Panels:** Feature Manifest Progress panel, Build Pipeline Progress tracker, and Project State Dashboard for real-time monitoring of build state, health history, and generation stats.

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