# LocalForge - AI App Builder

## Overview
LocalForge is an AI-powered application builder that connects to your local LLM (via LM Studio) to generate web applications from natural language descriptions. Users can describe what they want to build, and the AI generates working React code that can be previewed live and downloaded as a standalone HTML file.

## Current State
- Fully functional MVP with chat interface, live preview, and project management
- Connects to LM Studio's OpenAI-compatible API (default: http://localhost:1234/v1)
- In-memory storage for projects (data persists during session)

## Project Architecture

### Frontend (client/)
- **React + TypeScript** with Vite
- **Tailwind CSS** for styling with dark mode support
- **Shadcn UI** components
- **Monaco Editor** for code viewing
- **TanStack Query** for data fetching

### Backend (server/)
- **Express.js** API server
- **OpenAI SDK** configured for LM Studio compatibility
- In-memory storage for projects and messages

### Key Components
- `client/src/pages/home.tsx` - Main application layout with resizable panels
- `client/src/components/chat-panel.tsx` - Chat interface with example prompts
- `client/src/components/preview-panel.tsx` - Live app preview and code viewer
- `client/src/components/project-sidebar.tsx` - Project list and LLM settings
- `server/routes.ts` - API endpoints for projects and LLM chat

### Data Models (shared/schema.ts)
- **Project**: id, name, description, messages, generatedCode, createdAt, updatedAt
- **Message**: id, role (user/assistant), content, timestamp
- **LLMSettings**: endpoint, model, temperature

## User Preferences
- Uses dark mode by default
- LM Studio endpoint configurable via settings dialog
- Temperature slider for LLM creativity control

## Recent Changes
- Initial implementation of LocalForge AI App Builder
- Added Zod validation for API endpoints
- Fixed scroll handling in chat panel
- Fixed delete project mutation logic

## Running Locally
To run this app on your MacBook:
1. Start LM Studio and enable the local server (default port 1234)
2. Load your preferred model in LM Studio
3. Run `npm run dev` in this directory
4. Open http://localhost:5000 in your browser
5. Configure the LLM endpoint in settings if needed
