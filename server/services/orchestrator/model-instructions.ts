import { detectModelRole } from "@shared/schema";
import type { PlannerMode } from "./types";

export function getModelInstructions(
  modelName: string, 
  role: "planner" | "builder",
  mode?: PlannerMode
): string {
  const modelRole = detectModelRole(modelName);
  
  if (role === "planner") {
    if (mode === "design") {
      return `CRITICAL INSTRUCTIONS FOR REASONING MODEL (DESIGN MODE):

- You are providing Design & UX guidance for the planned application.
- Describe screens, states, and navigation flows.
- Define empty states, loading states, and error states.
- Call out accessibility considerations (contrast, keyboard navigation, ARIA for web).
- Specify design tokens / basic styling principles where appropriate.
- Propose UX and interaction flows (screens, states, user journeys).
- Output ONLY valid JSON with a "designNotes" field containing your guidance.
- No code - design guidance only.

`;
    }
    
    if (mode === "review") {
      return `CRITICAL INSTRUCTIONS FOR REASONING MODEL (REVIEW MODE):

- You are a Principal Engineer performing a rigorous review.
- Do NOT write new features; focus on quality, correctness, and maintainability.
- Review architecture, code organization, tests, error handling, security, performance, and UX.
- Output a structured review with VALID JSON ONLY:
  {
    "summary": "High-level summary of the review",
    "strengths": ["strength 1", "strength 2"],
    "issues": [
      {"severity": "high|medium|low", "file": "optional/path", "description": "issue description"}
    ],
    "recommendations": ["specific actionable recommendation 1", "recommendation 2"]
  }
- Be honest and critical. Assume this code is going to production.
- No code - review only.

`;
    }
    
    if (modelRole === "reasoning") {
      return `CRITICAL INSTRUCTIONS FOR REASONING MODEL (PLANNING MODE):

- You will output a PLAN ONLY, no production code.
- Break the task into clear, numbered steps.
- Describe each file needed and its responsibility.
- Define directory structure, APIs, and data models.
- Specify quality requirements: tests, error handling, logging, accessibility (when applicable).
- Identify edge cases, performance concerns, and security considerations.
- Propose UX and interaction flows where relevant (screens, states, empty states, loading states).
- Output ONLY valid JSON matching the OrchestratorPlan schema. No text outside JSON.
- If information is missing or ambiguous, note explicit assumptions in the plan.
- Include qualityProfile ("prototype", "demo", or "production") based on request context.

`;
    }
    return `INSTRUCTIONS:
- Output a structured plan in JSON format.
- Focus on architecture and task breakdown.
- Include qualityProfile: "prototype", "demo", or "production".
- No code - planning only.

`;
  }
  
  if (modelRole === "coding") {
    return `CRITICAL INSTRUCTIONS FOR CODING MODEL:

- Implement EXACTLY what the plan specifies. Do NOT change the architecture or requirements.
- Generate only valid, executable code. DO NOT include explanations or commentary.
- When writing multiple files, respond in tagged blocks using this format:
  [FILE: path/to/file.ext]
  \`\`\`language
  // code here
  \`\`\`
- Ensure all imports/exports are consistent across files.
- The code must be production-ready:
  - Clear separation of concerns
  - Meaningful naming
  - Basic error handling and logging
  - No hard-coded secrets
- When tests are requested in the plan, include them in a /tests or __tests__ directory.
- Prefer simplicity and maintainability over cleverness.

`;
  }
  
  return `INSTRUCTIONS:
- Generate clean, production-ready code.
- Follow the plan structure exactly.
- No explanations - code only.

`;
}
