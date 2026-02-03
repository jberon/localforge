# LocalForge - AI App Builder

## Overview
LocalForge is an AI-powered web application builder that generates working React code from natural language descriptions using local Large Language Models (LLMs) via LM Studio. It aims to accelerate web development by providing rapid prototyping and full-stack application generation, enabling users to preview, modify, and download applications directly. The platform simplifies complex web development workflows into an intuitive chat-based interface.

## User Preferences
- Uses dark mode by default
- LM Studio endpoint configurable via settings dialog
- Temperature slider for LLM creativity control
- Dual model support: Configure separate models for planning vs building phases

## System Architecture

### Core Functionality
LocalForge provides a chat-based interface with streaming responses for real-time code generation. It includes project management, live preview, and code validation. An AI-powered prompt enhancement and iterative refinement system allows users to evolve applications through follow-up requests. The system intelligently routes requests, automatically detecting intent (plan/build/refine/question) and optimizing LLM configurations for each task.

### AI Dream Team (Autonomous Dual-Model Orchestration)
When dual models are configured (planner + builder), LocalForge activates the AI Dream Team mode with named AI agents:

**Core Team Members** (always present):
- **Aria** (Product Architect): System design, architecture, planning - analyzes requests and creates business cases
- **Forge** (Senior Engineer): React/TypeScript implementation - writes and fixes code
- **Pixel** (UX Designer): Interface design, accessibility, styling
- **Scout** (Research Analyst): Market research, API documentation, web searches
- **Sentinel** (Quality Guardian): Testing, code review, security validation

**Dynamic Specialists**: The reasoning model analyzes each project's business case and automatically recruits industry-specific specialists (healthcare expert, finance advisor, etc.) when needed.

**Business Case Generation**: For each project, Aria automatically generates a comprehensive business case including:
- App name, tagline, and problem statement
- Target audience and value proposition
- Core features with priorities (must-have, should-have, nice-to-have)
- Industry analysis, competitors, and differentiators
- Monetization and pricing model suggestions

**README Auto-Generation**: Forge automatically generates a professional README.md based on the business case.

**Activity Logging**: All team member actions (thinking, deciding, building, reviewing, etc.) are logged and visible in the Project Team Panel UI.

**Workflow**:
- **Planning Phase**: Aria analyzes the request and creates business case + implementation plan
- **Task Progress Tracking**: Real-time TaskProgressPanel shows planning-generated tasks with X/Y completion counter
- **Specialist Recruitment**: Aria evaluates if domain experts are needed for the project
- **Web Search Integration**: Scout searches Serper.dev when external information is needed
- **Building Phase**: Forge generates complete applications based on the plan
- **Validation & Auto-Fix Loop**: Sentinel validates code; Forge fixes any issues (up to 3 retries)
- **Documentation**: Forge generates README after successful build
- **Progress Streaming**: Real-time SSE events show current phase, team member actions, tasks_updated, and task completion

The orchestrator is implemented in `server/services/orchestrator.ts` and the Dream Team service in `server/services/dreamTeam.ts`. Exposed via `/api/projects/:id/dream-team` and `/api/dream-team/*` endpoints.

### Production-Grade Output (Default)
All generated applications are production-grade by default - no toggle required. LocalForge generates sellable, enterprise-grade applications:
- **Multi-File Architecture**: Proper project structure (components/, hooks/, services/, __tests__/)
- **TypeScript by Default**: Strict typing with proper interfaces and generics
- **Automated Test Generation**: Vitest/React Testing Library tests for each component
- **Quality Analysis**: Code quality scoring (0-100) with auto-fix for issues
- **Documentation**: Auto-generated README.md with project overview and usage
- **File-by-File Progress**: Real-time streaming of each file being generated

The production orchestrator is in `server/services/productionOrchestrator.ts` and uses `/api/projects/:id/production`.

### Frontend
The frontend is built with React + TypeScript using Vite, styled with Tailwind CSS and Shadcn UI components. It integrates the Monaco Editor for code interaction and TanStack Query for data management. Key UI elements include a chat panel, live preview, project sidebar, and a modular generation wizard. UX design principles focus on quick start, progressive disclosure, polished animations, and contextual error recovery. Features include a command palette, voice input, and keyboard shortcuts. The file explorer provides a Replit-like tree view, file operations, and real-time synchronization.

**Custom Hooks** (client/src/hooks/):
- `use-llm-connection.ts`: LLM connection state with queue status, health metrics, and telemetry (tokens/sec)
- `use-sse-stream.ts`: Reusable SSE streaming with exponential backoff reconnection and AbortController cancellation
- `use-project-mutations.ts`: Project CRUD operations (create, delete, rename)
- `use-generation.ts`: Code generation state and handlers with cancellation support

**Header Status Indicators**:
- Connection indicator: Green dot (connected) / Amber pulsing (requests queued)
- Dual model display: Brain icon (planner) + Hammer icon (builder) when configured
- Tooltip shows queue depth and tokens/second performance

**Bundle Optimization**:
- Lazy loading for routes via `React.lazy()` and `Suspense`
- Memoized panel components to prevent unnecessary re-renders

### Backend
The backend is an Express.js API server with a modular route architecture for projects, files, versions, packaging, LLM interactions, analytics, and code generation. It uses the OpenAI SDK configured for LM Studio, implements Server-Sent Events (SSE) for streaming LLM responses, and uses PostgreSQL with Drizzle ORM for persistent storage. The backend includes modular code generators for various application components and supports production-grade features like authentication, testing suites, CI/CD pipelines, Docker support, and API documentation.

### Code Generation & Quality
LocalForge generates full-stack applications including database schemas, API routes, and React components. It features agentic auto-fix capabilities for generated code, automatically detecting and correcting syntax errors with LLM retries. It also surfaces LLM limitation messages in the chat rather than embedding them in the code.

### Version Control
The system includes built-in version control with checkpoints, allowing users to save project snapshots, view history, and rollback to previous states. Auto-save supports automatic checkpoints during key operations.

### Publishing & Packaging
Users can download complete projects as ZIP files, with configurable options to include Docker configurations, environment templates, and CI/CD pipelines. It supports various deployment options and ensures security through path sanitization.

### Local LLM Optimization
Optimized for Mac M4 Pro, LocalForge integrates with LM Studio for local LLM inference, featuring client connection caching, extended timeouts, automatic retry logic, and array-based streaming for efficiency. It supports configurable temperature presets and token limits optimized for different generation phases and hardware capabilities.

### M4 Pro Performance Configuration
LocalForge is specifically optimized for MacBook Pro M4 Pro (14-core CPU, 20-core GPU, 16-core Neural Engine, 48GB unified memory):

**Electron Desktop App (electron/main.cjs):**
- GPU acceleration: Metal, zero-copy, GPU rasterization, Canvas OOP rasterization for macOS
- 2D canvas acceleration and VSync optimization for high refresh rate displays
- V8 heap: 8GB (--max-old-space-size=8192) with exposed GC for large code generation
- Renderer backgrounding disabled to maintain performance during code generation
- Traffic light positioning optimized for macOS titlebar

**LLM Client Configuration (server/llm-client.ts):**
- Memory allocation: 16GB for context, 24GB for model weights, 8GB system reserved
- Concurrency: Single request at a time (LM Studio limitation) with 20-request queue
- Streaming chunk size: 1024 bytes with 50ms SSE throttling to prevent UI flooding
- Timeouts: 120s per request, 30s warning threshold
- Connection health tracking with consecutive failure detection
- Performance telemetry: tokens/sec monitoring with M4 Pro threshold validation

**Recommended LM Studio Settings:**
- GPU Layers: -1 (all layers on GPU for Metal acceleration)
- Context Length: 32768 (32K context for large applications)
- Batch Size: 512 (optimal for M4 Pro)
- Threads: 10 (leave 4 cores for system)

**Token Limits by Generation Type:**
- Quick App: 8,192 tokens
- Full Stack: 16,384 tokens
- Production: 32,768 tokens
- Planning: 4,096 tokens

**Recommended Models for 48GB Memory:**
- Coding: qwen2.5-coder-32b-instruct, deepseek-coder-v2-lite-instruct
- General: qwen2.5-32b-instruct, llama-3.1-70b-instruct-q4
- Fast: qwen2.5-coder-7b-instruct, codellama-7b-instruct

## External Dependencies
- **LM Studio**: For local LLM inference via its OpenAI-compatible API.
- **PostgreSQL**: Primary database for persistent project storage.
- **OpenAI SDK**: Backend interaction with LM Studio.
- **React**: Frontend UI library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Utility-first CSS framework.
- **Shadcn UI**: UI component library.
- **Monaco Editor**: Code editor component.
- **TanStack Query**: Data fetching library for React.
- **Express.js**: Backend web application framework.
- **Drizzle ORM**: TypeScript ORM for PostgreSQL.