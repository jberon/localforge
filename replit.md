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

### Plan/Build Modes & Build Speed Options
A Replit-style Plan/Build mode toggle allows AI to either generate a structured task list (Plan Mode) or directly write code (Build Mode). Build Mode executes tasks from an approved plan with progress indicators. Users can choose between **Fast Mode** for quick, targeted edits, and **Full Build Mode** for comprehensive full-stack generation with all automation services, producing production-grade output.

### Autonomy Levels & Extended Thinking Mode
A four-tier autonomy control system (Low, Medium, High, Max) governs AI intervention. For complex tasks, an "Extended Thinking Mode" provides deep reasoning capabilities with three levels (Standard, Extended, Deep), automatically triggering based on prompt complexity or detected issues.

### Design Mode
Enables rapid mockup and wireframe generation with five design styles and pre-built templates. Approved mockups are then used to automatically generate full code.

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

### Autonomous Development Loop & Error Learning
Features an autonomous development loop with runtime feedback capture, UI/UX analysis, enhanced auto-fix capabilities, and improved project memory. An error learning service tracks common LLM mistakes, learns new patterns, generates prevention prompts, and provides auto-fix suggestions.

### In-Browser Bundler & Local Build
Uses esbuild-wasm for in-browser bundling of multi-file TypeScript/React projects with a virtual file system and hot refresh. Enables building generated apps locally using npm/Vite tooling, supporting the full npm ecosystem, a real Vite dev server, auto-scaffolding, port management, real-time logs, and process control.

### Memory Safety & Performance Optimization
All 18+ singleton services with unbounded Maps/arrays now have TTL/eviction policies with configurable max sizes (500 for histories, 1000 for caches, 200 for reasoning chains). Every service with `setInterval` timers has a `destroy()` method that clears intervals and resets state. EventEmitter-based services (HealthAlerts, RuntimeFeedback) call `removeAllListeners()` on destroy. The V2 Orchestrator is optimized with `Promise.all` parallelization, prompt hash caching, and streaming session cleanup. A graceful shutdown handler in `server/index.ts` calls `destroy()` on all 18 services on SIGTERM/SIGINT. Hardware optimizer uses direct CPU model string parsing ("Apple M4 Pro") for accurate Apple Silicon chip detection, falling back to memory-based heuristics only when the variant isn't in the model string. `FORCE_M4_PRO_PROFILE` env var enables testing M4 Pro optimizations on non-Mac hardware.

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