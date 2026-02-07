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

### Core Functionality
LocalForge offers a chat-based interface with streaming responses, project management, live preview, and code validation. It incorporates AI-powered prompt enhancement and iterative refinement, intelligently routing requests to optimize LLM configurations based on intent.

### Plan/Build Modes & Build Speed Options
A Replit-style Plan/Build mode toggle allows AI to either generate a structured task list (Plan Mode) or directly write code (Build Mode). Users can choose between **Fast Mode** for quick, targeted edits, and **Full Build Mode** for comprehensive full-stack generation.

### Autonomy Levels & Extended Thinking Mode
A four-tier autonomy control system governs AI intervention. For complex tasks, an "Extended Thinking Mode" provides deep reasoning capabilities with three levels, automatically triggering based on prompt complexity or detected issues.

### Discussion Mode
A third mode enabling brainstorming and architectural exploration without generating code, differentiated by a teal accent color.

### Design Mode & Design Style Keywords
Enables rapid mockup and wireframe generation with five design styles and pre-built templates. Approved mockups are used to automatically generate full code. Ten design style keywords enhance prompts with CSS properties and Tailwind classes.

### Visual Editor
Click-to-edit UI manipulation via iframe inspector using postMessage communication, with a property editing panel for inspected elements.

### Smart Model Auto-Selection
A ModelRouterService intelligently routes between local LLMs and cloud providers (OpenAI, Groq, Together AI). It features 3-tier routing (fast/balanced/powerful), outcome tracking, cloud fallback, and configurable provider priorities.

### Self-Testing Loop
A SelfTestingService generates comprehensive test suites by analyzing code features, producing test scenarios with steps/assertions, and generating fix suggestions for failed tests.

### Image/Design Import
An ImageImportService handles design-to-code conversion from uploaded images, generating analysis prompts for LLM vision processing, extracting design elements, and producing code generation prompts.

### One-Click Auth & Database Templates
An AuthDbTemplatesService provides 5 authentication templates and 5 database templates with production-quality code and setup instructions.

### Static Deploy
Generates deployable static HTML bundles from generated code with inline React/Babel CDN loading and Tailwind CSS.

### AI Dream Team
When dual LLMs are configured, an "AI Dream Team" orchestrates project planning, task tracking, code generation, validation, and documentation.

### Production-Grade Output & App Classification
Generated applications are production-grade, featuring multi-file architecture, TypeScript, automated test generation, code quality analysis, and auto-generated `README.md`. LocalForge classifies requests into 12+ app types, applying specific templates, and validates generated code.

### Production-Grade Security & Infrastructure
Implements standard security headers, rate limiting, structured logging, Zod schema validation, request size limits, and frontend error boundaries.

### Frontend
Built with React + TypeScript, Vite, Tailwind CSS, and Shadcn UI. Features Monaco Editor, TanStack Query, a chat panel, live preview, project sidebar, generation wizard, command palette, voice input, and a Replit-like file explorer.

### Backend
An Express.js API server with modular routes for project management, LLM interactions, and code generation. Uses OpenAI SDK for LM Studio, Server-Sent Events (SSE) for streaming, and PostgreSQL with Drizzle ORM.

### Code Generation & Quality
Generates full-stack applications with agentic auto-fix capabilities for syntax errors, retrying with LLMs, and surfacing LLM limitation messages. Features a Multi-Pass Code Quality Pipeline with 5 deterministic fix passes that run automatically after every generation, producing a quality score and auto-fixing issues without LLM calls.

### Smart Template Gallery
Provides 12+ app templates in Quick Start and Production categories with search/filter capabilities and optimized prompt builders.

### One-Click Integrations Panel
Offers 12 common integrations that enhance generation prompts with detailed implementation instructions.

### Iterative Refinement Engine
Uses regex-based intent classification to build targeted surgical prompts for focused code changes, tracking refinement history with diff summaries.

### Enhanced Deployment Packages
Generates platform-specific deployment configurations for Vercel, Netlify, Docker, Railway, and static HTML bundles.

### Auto Self-Testing
SelfTestingService is auto-triggered after code generation, producing test suites with coverage metrics.

### Version Control & Publishing
Includes built-in version control with checkpoints, history viewing, and rollback. Supports downloading projects as ZIP files and one-click deployment to various platforms.

### Local LLM Optimization & Multi-Agent Architecture
Optimized for local LLM performance, integrating with LM Studio via client connection caching, extended timeouts, automatic retry logic, and array-based streaming. A multi-agent architecture utilizes specialized services for task decomposition, project memory, code execution, auto-fixing, and refactoring.

### Intelligence Services
Five specialized services for local LLM optimization:
- **PromptChunkingService**: Breaks complex requests into chunks with dependency tracking.
- **OutputParserService**: Structurally parses raw LLM output, extracting code fences, validating JSON, and cleaning markdown.
- **AdaptiveTemperatureService**: Learns optimal temperature per model and task type from quality signals.
- **ConversationMemoryService**: Compresses multi-turn history into structured project state summaries.
- **SmartRetryService**: Intelligent retry with 6 strategies selected based on failure mode detection.

### Autonomous Development Loop & Error Learning
Features an autonomous development loop with runtime feedback capture, UI/UX analysis, enhanced auto-fix capabilities, and improved project memory. An error learning service tracks common LLM mistakes and generates prevention prompts.

### In-Browser Bundler & Local Build
Uses esbuild-wasm for in-browser bundling of multi-file TypeScript/React projects with a virtual file system and hot refresh. Enables building generated apps locally using npm/Vite tooling.

### Memory Safety & Performance Optimization
All singleton services with unbounded Maps/arrays now have TTL/eviction policies. Services with `setInterval` timers have `destroy()` methods. The V2 Orchestrator is optimized with `Promise.all` parallelization, prompt hash caching, and streaming session cleanup. Hardware optimizer uses direct CPU model string parsing for accurate Apple Silicon chip detection.

### Production Readiness Audit
Includes SSE memory leak prevention, rate limiting via `apiRateLimiter` middleware, and Zod `safeParse` validation for input. M4 Pro configuration has been refined for optimal performance.

### Service Architecture & Lifecycle
Standardized service architecture with `BaseService` for logging and `ManagedMap`, a `ServiceRegistry` for auto-discovery and unified shutdown, and `asyncHandler` for error handling in Express routes. Route and Orchestrator modules have been refactored for better organization, and frontend contexts extracted into dedicated hooks and components.

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