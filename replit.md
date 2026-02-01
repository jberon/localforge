# LocalForge - AI App Builder

## Overview
LocalForge is an AI-powered application builder that leverages local Large Language Models (LLMs) via LM Studio to generate web applications from natural language descriptions. It allows users to describe their desired application, and the AI produces working React code. This code can be previewed live within the application and downloaded as a standalone HTML file or a complete full-stack project. The platform aims to streamline web application development by enabling rapid prototyping and generation of functional applications directly from user intent.

## User Preferences
- Uses dark mode by default
- LM Studio endpoint configurable via settings dialog
- Temperature slider for LLM creativity control

## System Architecture

### Core Functionality
LocalForge offers a chat-based interface for application generation, supporting streaming responses for real-time code generation. It includes project management features such as saving projects to a PostgreSQL database, live preview of generated applications, and code validation to ensure syntax correctness. The system also features an AI-powered prompt enhancement mechanism and iterative refinement capabilities, allowing users to modify generated applications through follow-up requests. A "Smart Mode" intelligently routes requests to different LLM configurations (planner vs. builder) based on user intent, allowing for more structured plan-and-build workflows.

### Frontend
The frontend is built with **React + TypeScript** using **Vite**, styled with **Tailwind CSS** and **Shadcn UI** components. It integrates the **Monaco Editor** for code viewing and editing, and **TanStack Query** for data fetching. Key UI components include a chat panel, live preview, project sidebar, and a modular generation wizard.

### Backend
The backend utilizes an **Express.js** API server. It uses the **OpenAI SDK** configured for LM Studio compatibility and implements **Server-Sent Events (SSE)** for streaming LLM responses. **PostgreSQL** with **Drizzle ORM** is used for persistent storage. The backend incorporates modular code generators for schema, routes, frontend components, and Docker configurations.

### Key Features
- **Project Management**: Create, delete, rename, and update projects with persistent storage.
- **LLM Integration**: Connects to LM Studio's OpenAI-compatible API, with configurable endpoint and model temperature.
- **Code Generation**: Generates full-stack applications including database schemas, API routes, and React components.
- **Real-time Interaction**: Streaming responses, live code preview, and instant preview updates on code changes.
- **Intelligent Workflows**: "Smart Mode" for routing requests, AI-powered prompt enhancement, and iterative refinement.
- **Code Quality**: Built-in code validation and AI-powered error recovery and code assistance (explain, fix, improve).
- **User Onboarding**: First-run tutorial modal for new users.
- **Data Model Builder**: Visual tool for defining data structures without coding.
- **Analytics & Learning System**: Tracks user actions, collects feedback, and uses LLM-powered analysis to generate insights and optimize template defaults. Includes a portfolio view of generated projects.

## External Dependencies
- **LM Studio**: Used for local LLM inference via its OpenAI-compatible API.
- **PostgreSQL**: Primary database for persistent project storage.
- **OpenAI SDK**: Used by the backend to interact with LM Studio.
- **React**: Frontend UI library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Utility-first CSS framework.
- **Shadcn UI**: UI component library.
- **Monaco Editor**: Code editor component.
- **TanStack Query**: Data fetching library for React.
- **Express.js**: Backend web application framework.
- **Drizzle ORM**: TypeScript ORM for PostgreSQL.