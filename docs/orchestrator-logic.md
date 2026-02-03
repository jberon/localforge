# Orchestrator Logic

This document describes the AI orchestration system in LocalForge, optimized for dual-model operation with Ministral 3 14B Reasoning (planner) and Qwen3 Coder 30B (builder).

## Overview

The orchestrator manages the complete lifecycle of code generation requests, coordinating between planning (reasoning) and building (coding) phases. It implements intelligent model routing, automatic temperature optimization, and model-specific instruction injection.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Request                              │
│  orchestrator.generate(prompt, existingCode?)                   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Planning Phase                               │
│  Model: Planner (Ministral 3 14B Reasoning recommended)         │
│  Temperature: 0.2-0.3 (structured output)                       │
│  • Injects model-specific instructions via getModelInstructions │
│  • JSON parse with retry (up to 3 attempts)                     │
│  Output: JSON plan with tasks, architecture, search queries     │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│         Web Search Phase (conditional on settings)               │
│  Triggered when ALL conditions are met:                         │
│  • plan.searchQueries is non-empty                              │
│  • settings.webSearchEnabled is true                            │
│  • settings.serperApiKey is configured                          │
│  Uses Serper.dev API; results injected into building context    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Building Phase                               │
│  Model: Builder (Qwen3 Coder 30B recommended)                   │
│  Temperature: 0.5 (creative but accurate)                       │
│  • Plan injected into system prompt                             │
│  • Streams code_chunk events for real-time output               │
│  Output: Production-ready code                                  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Validation Phase                              │
│  • validateCode(): Syntax validation (JSX/JS parse)             │
│  • Checks for common issues (unterminated strings, etc.)        │
│  • If invalid → Auto-fix phase                                  │
└─────────────────────────────────────────────────────────────────┘
                                │
                         (if invalid)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Auto-Fix Phase                               │
│  • diagnoseErrors(): Planner analyzes issues                    │
│  • fixCode(): Builder generates corrected code                  │
│  • Up to 3 fix attempts (maxFixAttempts)                        │
│  • Emits fix_attempt events                                     │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Complete                                   │
│  Emits: complete { code, summary }                              │
└─────────────────────────────────────────────────────────────────┘
```

## Dual-Model Configuration

### Model A: Reasoning Brain (Planner)

**Recommended**: Ministral 3 14B Reasoning

| Setting | Value | Rationale |
|---------|-------|-----------|
| Temperature | 0.2-0.3 | Structured, deterministic planning |
| Context Length | 32K | Handle complex requirements |
| Role | System architect, strategist | Multi-step reasoning |

**Strengths**:
- Multi-step reasoning and task decomposition
- Architecture design and API specification
- Low hallucination rate for structured output
- Clear constraint definition

**Injected Instructions**:
```
CRITICAL INSTRUCTIONS FOR REASONING MODEL:
- You will output a PLAN ONLY, no code.
- Break the task into clear, numbered steps.
- Describe each file needed and its contents.
- Define APIs, directories, and architecture.
- Spell out constraints and required styles.
- Output ONLY valid JSON. No explanations outside JSON.
```

### Model B: Coding Brain (Builder)

**Recommended**: Qwen3 Coder 30B (or Qwen2.5 Coder 14B for lighter load)

| Setting | Value | Rationale |
|---------|-------|-----------|
| Temperature | 0.5 | Creative but accurate code |
| Context Length | 32K | Multi-file generation |
| Role | Code generator, implementer | Production-ready output |

**Strengths**:
- Multi-file project generation
- API integration and type safety
- Production-ready, idiomatic code
- Test generation

**Injected Instructions**:
```
CRITICAL INSTRUCTIONS FOR CODING MODEL:
- Implement EXACTLY what the plan specifies. Do NOT change the architecture.
- Generate only valid, executable code. NO explanations.
- When writing multiple files, respond in tagged blocks.
- The code must be production-ready and error-free.
- Follow the plan precisely. Every file, every component as specified.
```

## Model Detection and Routing

The orchestrator automatically detects model type from the model name and applies appropriate configurations:

```typescript
function detectModelRole(modelName: string): "reasoning" | "coding" | "hybrid" {
  const name = modelName.toLowerCase();
  
  // Reasoning models
  if (name.includes("ministral") || name.includes("reasoning") || 
      name.includes("deepseek-r")) {
    return "reasoning";
  }
  
  // Coding models
  if (name.includes("coder") || name.includes("qwen") || 
      name.includes("codellama") || name.includes("starcoder")) {
    return "coding";
  }
  
  return "hybrid";
}
```

## Temperature Optimization

Temperatures are automatically optimized via `getOptimalTemperature()` based on detected model role:

| Model Role | Planner Temperature | Builder Temperature |
|------------|--------------------|--------------------|
| Reasoning  | 0.2                | 0.5                |
| Coding     | 0.3                | 0.5                |
| Hybrid     | 0.3                | 0.6                |

User-configured temperatures take precedence when explicitly set in settings.

## Planning Phase Details

### Input
- User's natural language request
- Existing code context (if refining)
- Web search results (if available)

### Processing
1. Model-specific instruction injection based on detected role
2. Dream Team persona activation (Marty Cagan + Martin Fowler)
3. Plan generation with JSON output
4. **JSON parse retry with exponential backoff** (maxRetries=2, up to 3 total attempts)
   - Failed parses trigger stricter prompt: "Your previous response was not valid JSON"
   - Exponential backoff delay: 500ms, 1000ms between retries
   - Uses `safeParseJSON()` which extracts JSON from markdown if needed
   - On final failure, falls back to `createSimplePlan()` with basic "Generate App" + "Validate" tasks

### Output Schema
```typescript
interface OrchestratorPlan {
  summary: string;           // Brief description of the application
  architecture: string;      // Technical architecture overview
  searchQueries?: string[];  // Web searches needed
  tasks: OrchestratorTask[]; // Implementation tasks
}

interface OrchestratorTask {
  id: string;
  title: string;
  description: string;
  type: "plan" | "search" | "build" | "validate" | "fix";
  status: "pending" | "in_progress" | "completed" | "failed";
}
```

## Building Phase Details

### Input
- Validated plan from planning phase
- Web search context (if applicable)
- Existing code (for refinements)

### Processing
1. Plan injection into system prompt
2. Streaming code generation
3. Real-time progress events

### Output
- Complete React/TypeScript application code
- Multi-file structure with proper imports
- Production-ready styling and state management

## Validation and Auto-Fix

### Syntax Validation
- Checks for JavaScript/TypeScript syntax errors
- Validates JSX structure
- Ensures proper imports/exports

### Auto-Fix Pipeline
1. Diagnose errors using planner model
2. Generate fixes using builder model
3. Re-validate (up to 3 attempts)
4. Surface limitation messages if unable to fix

## Event System

The orchestrator emits events throughout the generation process via Server-Sent Events (SSE):

| Event Type | Payload | Description |
|------------|---------|-------------|
| `phase_change` | `{ phase, message }` | Transitions between phases (planning, searching, building, validating, fixing, complete) |
| `thinking` | `{ model, content }` | LLM reasoning stream (model: "planner", "builder", "web_search") |
| `task_start` | `{ task }` | Task beginning execution |
| `task_complete` | `{ task }` | Task finished successfully |
| `tasks_updated` | `{ tasks, completedCount, totalCount }` | Task list state change |
| `code_chunk` | `{ content }` | Streaming code generation delta |
| `search` | `{ query }` | Web search initiated |
| `search_result` | `{ query, resultCount }` | Web search completed |
| `validation` | `{ valid, errors }` | Code validation result |
| `fix_attempt` | `{ attempt, maxAttempts }` | Auto-fix attempt started |
| `complete` | `{ code, summary }` | Generation finished successfully |
| `status` | `{ message }` | General status updates |
| `error` | `{ message }` | Error occurred |

## Dream Team Integration

When dual-model mode is active, the Dream Team personas participate:

| Persona | Role | Phase |
|---------|------|-------|
| Marty Cagan | Product Vision | Planning |
| Martin Fowler | Architecture | Planning, Building |
| Julie Zhuo | Design | Validation |
| Kent Beck | Quality/TDD | Building, Validation |
| Ben Thompson | Strategy | Research |

## LM Studio Configuration

Recommended settings for M4 Pro (48GB RAM):

| Setting | Value |
|---------|-------|
| GPU Layers | -1 (all on GPU) |
| Context Length | 32768 |
| Batch Size | 512 |
| Threads | 10 |

## Graceful Degradation

### Model Availability Fallback
If the configured planner model is unavailable:
1. `checkModelAvailability()` detects missing model
2. System reconfigures to use builder model for planning
3. User is notified via `status` event: "Reasoning model unavailable, using builder model for all tasks"
4. Dream Team service falls back to single-model configuration

### Single-Model Mode
When dual models are not configured:
1. Same model handles both planning and building
2. Planner temperature defaults apply (0.3)
3. Model-specific instructions adapt based on detected role
4. All Dream Team features remain functional

## Performance Considerations

- **Connection caching**: LLM client is reused across requests
- **Extended timeouts**: 2+ minutes for large generations
- **Streaming**: Real-time output reduces perceived latency
- **Queue management**: Backpressure prevents overload (max 20 concurrent)

## File Structure

```
server/services/
├── orchestrator.ts           # Main orchestration logic
├── productionOrchestrator.ts # Multi-file production generator
├── dreamTeam.ts              # Dream Team service
└── webSearch.ts              # Serper.dev integration

shared/
└── schema.ts                 # Model presets, types, validation
```

## Error Handling

1. **JSON parse failures**: Retry with exponential backoff (500ms, 1000ms) and stricter prompt
2. **Validation failures**: Auto-fix pipeline with up to 3 attempts (`maxFixAttempts`)
3. **Model limitations**: Surface helpful error messages to user via `error` event
4. **LLM API errors**: Caught and emitted as `error` events with descriptive messages
