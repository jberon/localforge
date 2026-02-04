# Orchestrator Logic

This document describes the AI orchestration system in LocalForge, optimized for dual-model operation with:

- **Planner (Reasoning Brain):** Ministral 3 14B Reasoning  
- **Builder (Coding Brain):** Qwen3 Coder 30B (or Qwen2.5 Coder 14B)  

It is designed so apps can **plan, design, implement, validate, and harden themselves** to production-grade standards with minimal human intervention.

---

## High-Level Goals

The orchestrator aims to:

1. **Turn natural language requests into production-grade applications**, not just code snippets.
2. **Separate thinking from doing**:
   - Planner: requirements, architecture, constraints, quality standards.
   - Builder: implementation, tests, and refactors.
3. **Enforce high standards** via:
   - Architecture & design conventions
   - Tests, validation, and auto-fix cycles
   - Explicit quality profiles (e.g., “production”, “prototype”)
4. **Gracefully leverage web search and existing code** when needed, while avoiding hallucinated APIs.
5. **Provide a clear event stream** so the UI can show progress, thinking, and code streaming in real time.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                          User Request                          │
│            orchestrator.generate(prompt, existingCode?)        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Planning Phase                          │
│  Model: Planner (Ministral 3 14B Reasoning)                    │
│  • Requirements + architecture + tasks                         │
│  • JSON plan with tasks, architecture, quality profile         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                Design & UX Guidance Phase (optional)           │
│  Model: Planner (design-focused instructions)                  │
│  • Layouts, flows, UX patterns, accessibility notes            │
│  • Design guidelines merged into build context                 │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              Web Search Phase (conditional on settings)        │
│  • Triggered when plan.searchQueries is non-empty              │
│  • Uses Serper.dev; results injected into build context        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Building Phase                         │
│  Model: Builder (Qwen3 Coder 30B)                              │
│  • Implements plan + design to full codebase                   │
│  • Streams [FILE: ...] code_chunk events                       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Validation Phase                          │
│  • Syntax & type validation                                    │
│  • Optional: run tests, lint, basic static checks              │
└─────────────────────────────────────────────────────────────────┘
                                │
                         (if invalid or failing)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Auto-Fix Phase                           │
│  • Planner diagnoses issues (reasoning)                        │
│  • Builder applies fixes                                       │
│  • Up to maxFixAttempts (default: 3)                           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Review & Hardening Phase                      │
│  Model: Planner (Principal Engineer mode)                      │
│  • Reviews architecture, code quality, security, UX            │
│  • Produces issue list + refactor suggestions                  │
│  • Optional: send back to Builder for final polish             │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                           Complete                             │
│  • Emits: complete { code, summary, reviewSummary }            │
└─────────────────────────────────────────────────────────────────┘
````

---

## Dual-Model Configuration

### Model A: Reasoning Brain (Planner)

**Recommended:** Ministral 3 14B Reasoning

| Setting        | Value                           | Rationale                                  |
| -------------- | ------------------------------- | ------------------------------------------ |
| Temperature    | 0.2–0.3                         | Structured, deterministic planning         |
| Context Length | ≥ 32K                           | Handle complex requirements + repo context |
| Role           | Architect, strategist, reviewer | Multi-step reasoning & critique            |

**Core Responsibilities:**

* Clarify requirements and assumptions
* Design architecture and module boundaries
* Specify file structure, APIs, and data models
* Define tests and validation strategies
* Provide UX / design guidance where relevant
* Diagnose validation errors, test failures, and design issues
* Act as a **Principal Engineer reviewer** in the final phase

**Injected Instructions (Planning / Design Mode):**

```text
CRITICAL INSTRUCTIONS FOR REASONING MODEL (PLANNING/DESIGN):

- You will output a PLAN ONLY, no production code.
- Break the task into clear, numbered steps.
- Describe each file needed and its responsibility.
- Define directory structure, APIs, and data models.
- Specify quality requirements: tests, error handling, logging, accessibility (when applicable).
- Identify edge cases, performance concerns, and security considerations.
- Propose UX and interaction flows where relevant (screens, states, empty states, loading states).
- Output ONLY valid JSON matching the OrchestratorPlan schema. No text outside JSON.
- If information is missing or ambiguous, note explicit assumptions in the plan.
```

**Injected Instructions (Review Mode):**

```text
CRITICAL INSTRUCTIONS FOR REASONING MODEL (REVIEW):

- You are a Principal Engineer performing a rigorous review.
- Do NOT write new features; focus on quality, correctness, and maintainability.
- Review architecture, code organization, tests, error handling, security, performance, and UX.
- Output a structured review with:
  1. High-level summary
  2. Strengths
  3. Issues (with file references when possible)
  4. Recommended changes (specific and actionable)
- Be honest and critical. Assume this code is going to production.
```

---

### Model B: Coding Brain (Builder)

**Recommended:** Qwen3 Coder 30B (or Qwen2.5 Coder 14B for lighter hardware)

| Setting        | Value              | Rationale                      |
| -------------- | ------------------ | ------------------------------ |
| Temperature    | 0.2–0.3            | Consistent multi-file code     |
| Context Length | ≥ 32K              | Large repos, docs, web context |
| Role           | Senior Implementer | Executes the plan & tests      |

> Note: We previously used 0.5. For **production-grade consistency**, 0.2–0.3 is preferred; if outputs feel too rigid or repetitive, you can nudge closer to 0.4.

**Core Responsibilities:**

* Translate the plan into clean, idiomatic, production-ready code
* Implement full multi-file projects, not snippets
* Add tests according to the plan’s quality profile
* Apply fixes based on Planner’s diagnostics
* Respect architecture and constraints without “creative” restructuring

**Injected Instructions:**

````text
CRITICAL INSTRUCTIONS FOR CODING MODEL:

- Implement EXACTLY what the plan specifies. Do NOT change the architecture or requirements.
- Generate only valid, executable code. DO NOT include explanations or commentary.
- When writing multiple files, respond in tagged blocks using this format:

  [FILE: path/to/file.ext]
  ```language
  // code here
````

* Ensure all imports/exports are consistent across files.
* The code must be production-ready:

  * Clear separation of concerns
  * Meaningful naming
  * Basic error handling and logging
  * No hard-coded secrets
* When tests are requested in the plan, include them in a /tests or **tests** directory.
* Prefer simplicity and maintainability over cleverness.

````

---

## Model Detection and Routing

The orchestrator automatically detects model type from the model name and applies appropriate configurations:

```typescript
function detectModelRole(modelName: string): "reasoning" | "coding" | "hybrid" {
  const name = modelName.toLowerCase();

  // Reasoning models
  if (name.includes("ministral") || name.includes("reasoning") ||
      name.includes("deepseek-r") || name.includes("r1")) {
    return "reasoning";
  }

  // Coding models
  if (name.includes("coder") || name.includes("qwen") ||
      name.includes("codellama") || name.includes("starcoder")) {
    return "coding";
  }

  return "hybrid";
}
````

---

## Temperature Optimization

Temperatures are automatically optimized via `getOptimalTemperature()` based on detected model role:

| Model Role | Planner Temperature | Builder Temperature |
| ---------- | ------------------- | ------------------- |
| Reasoning  | 0.2–0.3             | 0.2–0.3             |
| Coding     | 0.3                 | 0.3–0.4             |
| Hybrid     | 0.3                 | 0.3–0.5             |

User-configured temperatures take precedence when explicitly set in settings.

---

## Planning Phase Details

### Input

* User’s natural language request
* Optional existing code context (for refactor/extension)
* Optional quality profile (e.g. `"prototype"`, `"production"`)
* Optional stack preferences (e.g. `"react-electron"`, `"next-fastapi"`)

### Processing

1. **Model-specific instruction injection** based on detected role.
2. **Dream Team persona activation** (e.g., Marty Cagan + Martin Fowler).
3. **Plan generation** as JSON (`OrchestratorPlan`).
4. **JSON parse retry with exponential backoff** (maxRetries=2, total attempts=3):

   * If parse fails:

     * Stricter prompt: “Your previous response was not valid JSON. Output ONLY valid JSON matching the schema.”
     * Exponential backoff delay: 500ms, 1000ms.
   * `safeParseJSON()` attempts to extract JSON from markdown if needed.
   * On final failure, falls back to `createSimplePlan()` with basic “Generate App” + “Validate” tasks.

### Output Schema

```typescript
interface OrchestratorPlan {
  summary: string;               // Brief description of the application
  architecture: string;          // Technical architecture overview
  qualityProfile: "prototype" | "production" | "demo"; // Influences tests & rigor
  stackProfile?: string;         // Named stack preset (e.g., "react-electron")
  searchQueries?: string[];      // Optional: web searches needed
  designNotes?: string;          // UX/flows/accessibility notes
  tasks: OrchestratorTask[];     // Implementation & validation tasks
}

interface OrchestratorTask {
  id: string;
  title: string;
  description: string;
  type: "plan" | "search" | "build" | "validate" | "fix" | "review";
  status: "pending" | "in_progress" | "completed" | "failed";
}
```

---

## Design & UX Guidance Phase (Optional)

If the project includes a UI or flows (web/desktop/mobile), the Planner can be re-invoked in a **design-focused mode** using the initial plan as context.

**Goals:**

* Describe screens, states, and navigation flows.
* Define empty states, loading states, and error states.
* Call out accessibility considerations (contrast, keyboard navigation, ARIA for web).
* Specify design tokens / basic styling principles where appropriate.

**Output:**

* `designNotes` field in `OrchestratorPlan` enriched with concrete guidance.
* Optional design-specific tasks (e.g., `type: "build"` tasks for layout components).

---

## Web Search Phase

Triggered when **all** conditions are met:

* `plan.searchQueries` is non-empty
* `settings.webSearchEnabled === true`
* `settings.serperApiKey` is configured

Uses Serper.dev API:

* Executes each query in `plan.searchQueries`
* Aggregates top results into a concise context block
* Injects that context into the Builder’s system prompt and/or the Planner’s diagnostics in later phases

---

## Building Phase Details

### Input

* Validated `OrchestratorPlan`
* Design notes (if any)
* Web search context (if any)
* Existing code (for refinement or extension)

### Processing

1. Plan + design injected into Builder system prompt.
2. Builder generates multi-file code in `[FILE: ...]` blocks.
3. Orchestrator streams `code_chunk` events as they arrive.

### Output

* Complete, multi-file application adhering to:

  * The planned architecture
  * The specified stack profile
  * Quality profile (e.g., includes tests for production)

---

## Validation Phase

### Syntax & Type Validation

* Parse JavaScript/TypeScript (and JSX/TSX where applicable).
* Run basic type-checking (when TS/typing is configured).
* Validate imports/exports consistency.

### Test & Lint Integration (Optional / When Configured)

If the project template / stack supports it:

* Run test command (e.g., `npm test`, `pnpm test`, `pytest`) where relevant.
* Run lint / format checks (e.g., `npm run lint`).
* Collect errors into a normalized structure for Planner diagnostics.

---

## Auto-Fix Phase

Triggered when:

* Syntax/type validation fails, or
* Tests/lint fail and auto-fix is enabled

### Pipeline

1. **diagnoseErrors() — Planner**

   * Planner receives:

     * The plan
     * The relevant files
     * Validation errors, test failures, or lint output
   * Produces a structured description of issues and suggested fixes.

2. **fixCode() — Builder**

   * Builder receives:

     * The plan
     * Diagnostics from Planner
     * The original code for relevant files
   * Generates corrected code in `[FILE: ...]` blocks.

3. **Re-validate**

   * Re-run syntax/tests/lint for affected files.
   * Up to `maxFixAttempts` (default: 3).

4. **Failure Case**

   * If unable to fully fix:

     * Emit `error` event with a clear description of what remains broken.
     * Include Planner’s best explanation for next manual steps.

---

## Review & Hardening Phase

After validation (and auto-fix) passes or reaches the configured limit, the Planner enters **review mode**.

### Input

* Final (or near-final) codebase
* Original plan
* Validation/test status

### Responsibilities

* Assess:

  * Architectural soundness
  * Code organization & naming
  * Error handling and logging
  * Security concerns (e.g., injection, secrets, unsafe eval)
  * Performance hotspots or obvious inefficiencies
  * UX pitfalls, if UI is present

* Output a structured review, for example:

  * `summary`
  * `strengths`
  * `issues` (each with severity + file path)
  * `recommendations`

### Optional: Final Polish Pass

* The orchestrator can optionally:

  * Send the review back to the Builder with instructions:

    > “Apply the ‘high’ severity recommendations and any safe, low-risk improvements.”

* Then re-run validation and complete.

---

## Quality Standards & Profiles

The `qualityProfile` field in `OrchestratorPlan` controls how strict the system should be:

* `"prototype"`:

  * Faster iteration
  * Fewer tests (maybe smoke / basic)
  * Less strict validation
* `"demo"`:

  * Stable enough for demos
  * Core flows tested
  * Reasonable error handling
* `"production"`:

  * Tests required for core modules
  * No obvious security flaws
  * Clear error handling and logging
  * No TODOs in critical paths

The Planner is expected to interpret `qualityProfile` and reflect it in:

* Tasks
* Test strategy
* Edge-case coverage

---

## Event System

The orchestrator emits events throughout the generation process via Server-Sent Events (SSE):

| Event Type      | Payload                                   | Description                                               |
| --------------- | ----------------------------------------- | --------------------------------------------------------- |
| `phase_change`  | `{ phase, message }`                      | Phase transitions (planning, building, validating, etc.)  |
| `thinking`      | `{ model, content }`                      | LLM reasoning stream (`planner`, `builder`, `web_search`) |
| `task_start`    | `{ task }`                                | Task begins execution                                     |
| `task_complete` | `{ task }`                                | Task finished successfully                                |
| `tasks_updated` | `{ tasks, completedCount, totalCount }`   | Task list changes                                         |
| `code_chunk`    | `{ content }`                             | Streaming code generation delta                           |
| `search`        | `{ query }`                               | Web search initiated                                      |
| `search_result` | `{ query, resultCount }`                  | Web search completed                                      |
| `validation`    | `{ valid, errors }`                       | Code validation result                                    |
| `fix_attempt`   | `{ attempt, maxAttempts }`                | Auto-fix attempt started                                  |
| `review`        | `{ summary, issueCount, severityCounts }` | Review & hardening summary                                |
| `complete`      | `{ code, summary, reviewSummary }`        | Generation finished successfully                          |
| `status`        | `{ message }`                             | General status updates                                    |
| `error`         | `{ message }`                             | Error occurred                                            |

---

## Dream Team Integration

When dual-model mode is active, the Dream Team personas participate logically in relevant phases:

| Persona       | Role               | Phase(s)                     |
| ------------- | ------------------ | ---------------------------- |
| Marty Cagan   | Product Vision     | Planning                     |
| Martin Fowler | Architecture       | Planning, Building, Review   |
| Julie Zhuo    | Design / UX        | Design & Review              |
| Kent Beck     | Quality / TDD      | Building, Validation, Review |
| Ben Thompson  | Strategy / Context | Research, Planning           |

These are “virtual advisors” whose perspectives the Planner is prompted to incorporate (not additional calls).

---

## LM Studio Configuration (M4 Pro, 48GB RAM)

Recommended baseline settings:

| Setting        | Value        |
| -------------- | ------------ |
| GPU Layers     | -1 (all GPU) |
| Context Length | 32768        |
| Batch Size     | 512          |
| Threads        | 10           |

These can be tuned per model if needed.

---

## Graceful Degradation

### Model Availability Fallback

If the configured Planner is unavailable:

1. `checkModelAvailability()` detects missing model.
2. System reconfigures to use Builder as a **hybrid** model for both planning and building.
3. User is notified via `status` event:

   * “Reasoning model unavailable, using builder model for all tasks.”
4. Dream Team service falls back to single-model mode while preserving as much structure as possible.

### Single-Model Mode

When only one model is configured:

1. Same model handles planning, building, and review.
2. Planner temperature defaults (0.3) are used.
3. Model-specific instructions adapt to hybrid role:

   * “First, output a JSON plan; then, when instructed, output code.”
4. Auto-fix and review phases remain functional, but quality may be lower.

---

## Performance Considerations

* **Connection caching**: LLM client is reused across requests.
* **Extended timeouts**: 2+ minutes allowed for large generations.
* **Streaming**: Real-time code and reasoning streaming to reduce perceived latency.
* **Queue management**: Backpressure and max concurrent operations (e.g., max 20).
* **Incremental builds (future)**:

  * Only regenerate impacted files when possible.
  * Planner identifies minimal change set.

---

## File Structure

```text
server/services/
├── orchestrator.ts           # Main orchestration logic
├── productionOrchestrator.ts # Multi-file production generator
├── dreamTeam.ts              # Dream Team personas & prompts
└── webSearch.ts              # Serper.dev integration

shared/
└── schema.ts                 # Model presets, types, validation
```

---

## Error Handling

1. **JSON parse failures**

   * Retry with exponential backoff and stricter prompts.
   * Final fallback to a simple plan with minimal tasks.

2. **Validation failures**

   * Trigger auto-fix pipeline (Planner diagnose, Builder fix).
   * Up to `maxFixAttempts` (default 3).

3. **Test / lint failures**

   * Normalized error summaries passed to Planner.
   * Clear messaging to user when issues cannot be fully resolved.

4. **Model limitations / timeouts**

   * Emit `error` event with contextual hints.
   * Suggest user actions (e.g., simplify request, adjust qualityProfile).

5. **LLM API / network errors**

   * Caught and surfaced as `error` events with human-readable descriptions.
   * Retries where appropriate, with exponential backoff.

---

This orchestrator design is intended to allow LocalForge to build **fully self-planned, self-designed, self-validated applications** that adhere to high standards by default, while still degrading gracefully when resources or models are limited.