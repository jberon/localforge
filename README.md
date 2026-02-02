# LocalForge

**AI-Powered App Builder for macOS** - Generate working React applications from natural language using local LLMs via LM Studio.

LocalForge is a native macOS desktop application that connects to LM Studio on your Mac, providing a privacy-focused, offline-capable AI development experience. Built specifically for Apple Silicon (M4 Pro optimized), it features a Steve Jobs-inspired minimalist design and maximum automation.

## Features

### Core Capabilities
- **Natural Language to Code** - Describe what you want to build and get working React/TypeScript applications
- **Local LLM Processing** - All AI processing happens locally via LM Studio for complete privacy
- **Real-time Preview** - See your app come to life as it's generated with live preview
- **Three-Panel Interface** - Chat (left), Preview (center), Files (right) for efficient workflow

### AI Dream Team
When dual models are configured, LocalForge activates the AI Dream Team - a collaborative system of specialized AI agents:

| Agent | Role | Expertise |
|-------|------|-----------|
| **Aria** | Product Architect | System design, planning, business case generation |
| **Forge** | Senior Engineer | React/TypeScript implementation |
| **Pixel** | UX Designer | Interface design, accessibility, styling |
| **Scout** | Research Analyst | Market research, API documentation |
| **Sentinel** | Quality Guardian | Testing, code review, security |

Plus **Dynamic Specialists** - The reasoning model automatically recruits industry experts (healthcare, finance, etc.) when needed.

### Smart Features
- **Business Case Generation** - Automatic analysis of app name, target audience, value proposition, competitors, and monetization
- **Auto-Fix Loop** - Code validation with automatic error correction (up to 3 retries)
- **README Auto-Generation** - Professional documentation created for each project
- **Activity Logging** - Real-time visibility into AI team decisions and contributions
- **Web Search Integration** - Serper.dev integration for external information lookup

### Production Mode
Generate enterprise-grade applications with:
- Multi-file TypeScript architecture
- Automated Vitest test generation
- Code quality scoring (0-100)
- Proper project structure (components/, hooks/, services/, __tests__/)

### Additional Features
- Voice input for hands-free coding
- File attachments support
- Keyboard shortcuts & command palette
- Version control with checkpoints
- Project export as ZIP with optional Docker/CI-CD configs

## Requirements

- **macOS** (Apple Silicon recommended - M1/M2/M3/M4)
- **LM Studio** running locally with compatible models
- **48GB+ RAM** recommended for optimal 32B+ parameter models

### Recommended Models (48GB RAM)
- **Coding**: qwen2.5-coder-32b-instruct, deepseek-coder-v2-lite-instruct
- **General**: qwen2.5-32b-instruct, llama-3.1-70b-instruct-q4
- **Fast**: qwen2.5-coder-7b-instruct, codellama-7b-instruct

## Installation

### Option 1: Download Release
1. Go to the **Releases** page of this repository and download the latest `.dmg` for your architecture
2. Open the DMG and drag LocalForge to Applications
3. Launch LocalForge

### Option 2: Build from Source

```bash
# Clone the repository
git clone <repository-url>
cd localforge

# Install dependencies
npm install

# Setup Electron
chmod +x scripts/setup-electron.sh
./scripts/setup-electron.sh

# Build the application
npm run build

# Run in development mode
npm run dev

# Build desktop app
npx electron-builder --mac
```

## Quick Start

1. **Start LM Studio** and load your preferred model
2. **Launch LocalForge**
3. **Configure Settings** (gear icon):
   - Set LM Studio endpoint (default: `http://localhost:1234/v1`)
   - Select your model
   - Optionally enable Dual Models for AI Dream Team
4. **Create a Project** and start chatting!

### Example Prompts

```
Build a task manager with categories, due dates, and priority levels

Create a recipe app where I can save and search my favorite recipes

Make a habit tracker with streaks and weekly statistics
```

## Configuration

### LM Studio Settings
- **GPU Layers**: -1 (all layers on GPU for Metal acceleration)
- **Context Length**: 32768 (32K context for large applications)
- **Batch Size**: 512 (optimal for M4 Pro)
- **Threads**: 10 (leave 4 cores for system)

### Dual Model Setup (AI Dream Team)
For best results, configure two models:
- **Planner Model**: A reasoning-focused model (e.g., qwen2.5-32b-instruct)
- **Builder Model**: A code-focused model (e.g., qwen2.5-coder-32b-instruct)

### Web Search (Optional)
For Scout's research capabilities, add a Serper.dev API key in settings.

## Development

```bash
# Run development server
npm run dev

# Type checking
npm run typecheck

# Database migrations
npm run db:push

# Build for production
npm run build
```

## Architecture

```
localforge/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utilities
│   │   └── pages/          # Page components
├── server/                 # Express backend
│   ├── routes/             # API routes
│   ├── services/           # Business logic
│   │   ├── dreamTeam.ts    # AI Dream Team service
│   │   ├── orchestrator.ts # Dual-model orchestration
│   │   └── ...
│   └── storage.ts          # Database interface
├── shared/                 # Shared types
│   └── schema.ts           # Drizzle ORM schema
├── electron/               # Desktop app
│   ├── main.cjs            # Electron main process
│   └── assets/             # App icons
└── .github/workflows/      # CI/CD
```

## Building Desktop Releases

The project includes GitHub Actions for automated builds:

```bash
# Tag a release
git tag v1.2.0
git push origin v1.2.0
```

This triggers builds for:
- macOS ARM64 (Apple Silicon)
- macOS x64 (Intel)

Release artifacts (DMG, ZIP) are automatically uploaded to GitHub Releases.

## Troubleshooting

### LM Studio Connection Issues
- Ensure LM Studio is running and a model is loaded
- Check the endpoint matches your LM Studio server URL
- Verify no firewall is blocking localhost connections

### Slow Generation
- Use a smaller model (7B-14B parameters for faster responses)
- Reduce context length in LM Studio settings
- Ensure GPU acceleration is enabled in LM Studio

### Build Errors
- Run `npm ci` for clean dependency installation
- Ensure Node.js 20+ is installed
- Check that all required build tools are available

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

**Built with love for local AI development**
