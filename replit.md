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
When dual models are configured (planner + builder), LocalForge activates the AI Dream Team mode:
- **Planning Phase**: The reasoning model analyzes requests and creates structured implementation plans
- **Web Search Integration**: Automatically searches Serper.dev when models need external information (APIs, docs, etc.)
- **Building Phase**: The code model generates complete applications based on the plan
- **Validation & Auto-Fix Loop**: Code is validated; if errors are found, the planner diagnoses issues and the builder fixes them (up to 3 retries)
- **Progress Streaming**: Real-time SSE events show current phase, model thinking, and task completion

The orchestrator is implemented in `server/services/orchestrator.ts` and exposed via the `/api/projects/:id/dream-team` endpoint.

### Frontend
The frontend is built with React + TypeScript using Vite, styled with Tailwind CSS and Shadcn UI components. It integrates the Monaco Editor for code interaction and TanStack Query for data management. Key UI elements include a chat panel, live preview, project sidebar, and a modular generation wizard. UX design principles focus on quick start, progressive disclosure, polished animations, and contextual error recovery. Features include a command palette, voice input, and keyboard shortcuts. The file explorer provides a Replit-like tree view, file operations, and real-time synchronization.

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