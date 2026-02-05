import { closedLoopAutoFixService } from "../services/closed-loop-autofix.service";
import { errorLearningService } from "../services/error-learning.service";
import { liveSyntaxValidatorService } from "../services/live-syntax-validator.service";
import { codeStyleEnforcerService } from "../services/code-style-enforcer.service";

let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    errors.push(message);
    console.log(`  FAIL: ${message}`);
  }
}

function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

section("1. ClosedLoopAutoFixService - Pre-Generation Enhancement");

const enhancement1 = closedLoopAutoFixService.enhancePreGeneration(
  "Build a React todo app",
  "qwen2.5-coder-14b",
  "build",
  ["src/App.tsx", "src/api.ts"]
);
assert(enhancement1.enhancedPrompt.length > "Build a React todo app".length, "Enhanced prompt is longer than original");
assert(enhancement1.enhancedPrompt.includes("Build a React todo app"), "Enhanced prompt preserves original");
assert(enhancement1.preventionRules.length > 0, "Prevention rules injected");
assert(enhancement1.totalInjectedTokens > 0, "Token count tracked");
assert(enhancement1.enhancedPrompt.includes("JSX") || enhancement1.enhancedPrompt.includes("TypeScript"), "File type rules injected for .tsx files");
assert(enhancement1.enhancedPrompt.includes("Building new code") || enhancement1.enhancedPrompt.includes("build"), "Task type rules injected for build");

const enhancement2 = closedLoopAutoFixService.enhancePreGeneration(
  "Refactor the auth module",
  "deepseek-coder-v2",
  "refine",
  ["src/auth.ts"]
);
assert(enhancement2.enhancedPrompt.includes("Refactor the auth module"), "Refine prompt preserves original");
assert(enhancement2.enhancedPrompt.includes("Refining") || enhancement2.enhancedPrompt.includes("TypeScript"), "Refine-specific rules injected");

const enhancement3 = closedLoopAutoFixService.enhancePreGeneration(
  "Plan the architecture",
  undefined,
  "plan",
  []
);
assert(enhancement3.enhancedPrompt.includes("Plan the architecture"), "Plan prompt preserves original");

section("2. ClosedLoopAutoFixService - Validate and Fix (Clean Code)");

const cleanCode = `function greet(name: string): string {
  return "Hello, " + name;
}`;
const cleanResult = closedLoopAutoFixService.validateAndFix(cleanCode);
assert(cleanResult.errorsFound === 0, "Clean code has no errors");
assert(cleanResult.totalAttempts === 0, "Clean code needs no fix attempts");
assert(cleanResult.finalCode.length > 0, "Final code is non-empty");

section("3. ClosedLoopAutoFixService - Validate and Fix (Broken Code)");

const brokenCode = `function greet(name: string) {
  return "Hello, " + name
}}`;
const brokenResult = closedLoopAutoFixService.validateAndFix(brokenCode, "test.ts", "qwen-model");
assert(brokenResult.errorsFound > 0, "Broken code has errors detected");
assert(brokenResult.totalAttempts > 0, "Fix attempts were made");
assert(brokenResult.attempts.length > 0, "Attempts recorded");
assert(brokenResult.durationMs >= 0, "Duration tracked");
assert(brokenResult.modelUsed === "qwen-model", "Model name recorded");
assert(brokenResult.filePath === "test.ts", "File path recorded");

section("4. ClosedLoopAutoFixService - Fix Prompt Building");

const fixPrompt = closedLoopAutoFixService.buildFixPrompt(
  `const x = 1;\nconst y == 2;`,
  [{ line: 2, message: "Invalid equality operator (====)", severity: "error" }],
  "syntax-targeted",
  "qwen2.5-coder"
);
assert(fixPrompt.includes("Strategy: syntax-targeted"), "Fix prompt includes strategy");
assert(fixPrompt.includes("Line 2"), "Fix prompt includes error line");
assert(fixPrompt.includes("Invalid equality"), "Fix prompt includes error message");
assert(fixPrompt.includes("Fix ONLY the syntax errors"), "Syntax-targeted instructions included");

const importFixPrompt = closedLoopAutoFixService.buildFixPrompt(
  `const x = useState(0);`,
  [{ line: 1, message: "Cannot find name 'useState'", severity: "error" }],
  "import-resolution",
  "llama-3"
);
assert(importFixPrompt.includes("Strategy: import-resolution"), "Import strategy in prompt");
assert(importFixPrompt.includes("import/export"), "Import-specific instructions");

const rewriteFixPrompt = closedLoopAutoFixService.buildFixPrompt(
  `function broken() { }`,
  [{ line: 1, message: "Structural issues found", severity: "error" }],
  "full-rewrite-section"
);
assert(rewriteFixPrompt.includes("Strategy: full-rewrite-section"), "Rewrite strategy in prompt");
assert(rewriteFixPrompt.includes("Rewrite the problematic"), "Rewrite instructions");

section("5. ClosedLoopAutoFixService - Model-Specific Fix Guidance");

const qwenPrompt = closedLoopAutoFixService.buildFixPrompt(
  "const x = 1;",
  [{ line: 1, message: "error", severity: "error" }],
  "syntax-targeted",
  "qwen2.5-coder"
);
assert(qwenPrompt.includes("Qwen") || qwenPrompt.includes("qwen"), "Qwen guidance included");

const deepseekPrompt = closedLoopAutoFixService.buildFixPrompt(
  "const x = 1;",
  [{ line: 1, message: "error", severity: "error" }],
  "syntax-targeted",
  "deepseek-coder-v2"
);
assert(deepseekPrompt.includes("DeepSeek") || deepseekPrompt.includes("deepseek"), "DeepSeek guidance included");

section("6. ClosedLoopAutoFixService - Statistics");

const stats1 = closedLoopAutoFixService.getStatistics();
assert(stats1.totalSessions >= 0, "Statistics returned");
assert(typeof stats1.fixRate === "number", "Fix rate is numeric");
assert(typeof stats1.averageAttempts === "number", "Average attempts is numeric");
assert(stats1.strategyEffectiveness !== undefined, "Strategy effectiveness tracked");
assert("syntax-targeted" in stats1.strategyEffectiveness, "Syntax-targeted strategy tracked");
assert("error-pattern-match" in stats1.strategyEffectiveness, "Error-pattern-match strategy tracked");
assert("full-rewrite-section" in stats1.strategyEffectiveness, "Full-rewrite-section strategy tracked");
assert("style-enforcement" in stats1.strategyEffectiveness, "Style-enforcement strategy tracked");
assert("import-resolution" in stats1.strategyEffectiveness, "Import-resolution strategy tracked");
assert(typeof stats1.recentTrend.improving === "boolean", "Recent trend tracked");

section("7. ClosedLoopAutoFixService - Fix History");

const history = closedLoopAutoFixService.getFixHistory();
assert(Array.isArray(history), "Fix history is an array");
if (history.length > 0) {
  assert(typeof history[0].sessionId === "string", "History entries have session IDs");
  assert(typeof history[0].errorsFound === "number", "History entries have error counts");
  assert(Array.isArray(history[0].strategies), "History entries have strategies");
  assert(Array.isArray(history[0].errorCategories), "History entries have error categories");
}
assert(history.length >= 1, "At least the broken code fix is in history");

section("8. ClosedLoopAutoFixService - Configuration");

const defaultConfig = closedLoopAutoFixService.getConfig();
assert(defaultConfig.maxRetries === 3, "Default max retries is 3");
assert(defaultConfig.autoFormat === true, "Auto format enabled by default");
assert(defaultConfig.enableLearning === true, "Learning enabled by default");
assert(defaultConfig.fixStrategies.length === 5, "All 5 strategies configured");

closedLoopAutoFixService.configure({ maxRetries: 5 });
const updatedConfig = closedLoopAutoFixService.getConfig();
assert(updatedConfig.maxRetries === 5, "Config updated: maxRetries=5");
closedLoopAutoFixService.configure({ maxRetries: 3 });

section("9. ErrorLearningService - Enhanced Model Tracking");

errorLearningService.recordError({
  errorMessage: "Type 'string' is not assignable to type 'number'",
  code: "const x: number = 'hello';",
  wasFixed: true,
  fixApplied: "Changed type to string",
  modelUsed: "test-model-alpha",
});

errorLearningService.recordError({
  errorMessage: "Cannot find module './utils'",
  code: "import { foo } from './utils';",
  wasFixed: false,
  modelUsed: "test-model-alpha",
});

errorLearningService.recordError({
  errorMessage: "Type 'boolean' is not assignable to type 'string'",
  code: "const y: string = true;",
  wasFixed: true,
  fixApplied: "Changed type",
  modelUsed: "test-model-alpha",
});

const enhancedStats = errorLearningService.getStats();
assert(enhancedStats.modelFixRates !== undefined, "Model fix rates available");
assert(typeof enhancedStats.overallFixRate === "number", "Overall fix rate is numeric");
assert(Array.isArray(enhancedStats.patternFixRates), "Pattern fix rates available");

if (enhancedStats.modelFixRates["test-model-alpha"]) {
  const modelRate = enhancedStats.modelFixRates["test-model-alpha"];
  assert(modelRate.errors >= 3, "Model alpha has at least 3 errors tracked");
  assert(modelRate.fixed >= 2, "Model alpha has at least 2 fixes tracked");
  assert(modelRate.fixRate > 0, "Model alpha has a positive fix rate");
}

section("10. ErrorLearningService - Model Report");

const modelReport = errorLearningService.getModelReport("test-model-alpha");
assert(modelReport.model === "test-model-alpha", "Model report has correct name");
assert(modelReport.totalErrors >= 3, "Model report shows errors");
assert(modelReport.fixedErrors >= 2, "Model report shows fixed");
assert(modelReport.fixRate > 0, "Model report has fix rate");
assert(Array.isArray(modelReport.topPatterns), "Model report has top patterns");
assert(Array.isArray(modelReport.weaknesses), "Model report has weaknesses");
assert(Array.isArray(modelReport.recommendations), "Model report has recommendations");

const unknownReport = errorLearningService.getModelReport("nonexistent-model");
assert(unknownReport.totalErrors === 0, "Unknown model has no errors");
assert(unknownReport.recommendations.length > 0, "Unknown model has recommendations");

section("11. ErrorLearningService - Enhanced Prevention Prompt");

const preventionPrompt = errorLearningService.getPreventionPrompt("test-model-alpha");
assert(preventionPrompt.length > 0, "Prevention prompt generated");
assert(preventionPrompt.includes("Error Prevention") || preventionPrompt.includes("Code Quality"), "Has prevention header");

section("12. Closed-Loop Integration - Full Pipeline");

const pipelinePrompt = "Build a user registration form with validation";
const preEnhancement = closedLoopAutoFixService.enhancePreGeneration(
  pipelinePrompt,
  "qwen2.5-coder-14b",
  "build",
  ["src/Register.tsx"]
);
assert(preEnhancement.enhancedPrompt.includes(pipelinePrompt), "Pipeline: pre-gen preserves prompt");
assert(preEnhancement.totalInjectedTokens > 0, "Pipeline: tokens injected");

const generatedCode = `import { useState } from "react";

export default function Register() {
  const [email, setEmail] = useState("");
  return (
    <form>
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit">Register</button>
    </form>
  );
}`;
const postResult = closedLoopAutoFixService.validateAndFix(
  generatedCode,
  "src/Register.tsx",
  "qwen2.5-coder-14b"
);
assert(postResult.errorsFound === 0, "Pipeline: clean generated code passes validation");
assert(postResult.finalCode.length > 0, "Pipeline: final code produced");

const buggyGenerated = `import { useState } from "react"

export default function Register() {
  const [email, setEmail] = useState("")
  return (
    <form>
      <input value={email} onChange={e => setEmail(e.target.value)} />
      <button type="submit">Register</button>
    </form>
  )
}}`;
const buggyResult = closedLoopAutoFixService.validateAndFix(
  buggyGenerated,
  "src/Register.tsx",
  "qwen2.5-coder-14b"
);
assert(buggyResult.errorsFound > 0, "Pipeline: buggy code detected errors");
assert(buggyResult.totalAttempts > 0, "Pipeline: fix attempts made");

section("13. Local Fix Capabilities");

const unmatchedBrace = `function test() {
  if (true) {
    console.log("ok");
  }
}}`;
const braceResult = closedLoopAutoFixService.validateAndFix(unmatchedBrace);
assert(braceResult.errorsFound > 0, "Extra brace detected");

const invalidOperator = `const x = 1;
if (x ==== 2) { return; }`;
const operatorResult = closedLoopAutoFixService.validateAndFix(invalidOperator);
assert(operatorResult.errorsFound > 0, "Invalid operator detected");

section("14. Multi-File Validation");

const multiResult = [
  { path: "a.ts", content: `const x = 1;` },
  { path: "b.ts", content: `const y = 2;\nconst z == 3;` },
].map(f => ({
  path: f.path,
  result: closedLoopAutoFixService.validateAndFix(f.content, f.path),
}));

assert(multiResult.length === 2, "Multi-file: processed 2 files");
assert(multiResult[0].path === "a.ts", "Multi-file: first file path correct");
assert(multiResult[1].path === "b.ts", "Multi-file: second file path correct");

section("15. Statistics After Multiple Operations");

const finalStats = closedLoopAutoFixService.getStatistics();
assert(finalStats.totalSessions > 0, "Final stats: sessions recorded");
assert(typeof finalStats.recentTrend.recentFixRate === "number", "Final stats: recent fix rate");
assert(typeof finalStats.recentTrend.overallFixRate === "number", "Final stats: overall fix rate");

const finalHistory = closedLoopAutoFixService.getFixHistory(5);
assert(finalHistory.length <= 5, "History limit respected");

console.log(`\n========================================`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (errors.length > 0) {
  console.log(`\nFailed tests:`);
  errors.forEach(e => console.log(`  - ${e}`));
}
console.log(`========================================\n`);

process.exit(failed > 0 ? 1 : 0);
