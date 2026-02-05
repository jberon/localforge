import { parallelGenerationService } from "../services/parallel-generation.service";
import { liveSyntaxValidatorService } from "../services/live-syntax-validator.service";
import { codeStyleEnforcerService } from "../services/code-style-enforcer.service";
import { errorLearningService } from "../services/error-learning.service";
import { contextBudgetService } from "../services/context-budget.service";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

section("1. ParallelGenerationService");

const files = [
  { path: "src/utils/helpers.ts", description: "Utility functions" },
  { path: "src/components/Header.tsx", description: "Header component" },
  { path: "src/components/Footer.tsx", description: "Footer component" },
  { path: "server/routes.ts", description: "API routes" },
  { path: "src/config/settings.ts", description: "Config" },
  { path: "src/App.tsx", description: "Main app" },
  { path: "src/tests/Header.test.tsx", description: "Header tests" },
];

const fileTasks = parallelGenerationService.prepareFileTasks(files);
assert(fileTasks.length === 7, `prepareFileTasks returns 7 tasks (got ${fileTasks.length})`);

const configTask = fileTasks.find(f => f.filePath === "src/config/settings.ts");
assert(configTask?.type === "config", `Detects config file type (got ${configTask?.type})`);

const utilTask = fileTasks.find(f => f.filePath === "src/utils/helpers.ts");
assert(utilTask?.type === "util", `Detects util file type (got ${utilTask?.type})`);

const componentTask = fileTasks.find(f => f.filePath === "src/components/Header.tsx");
assert(componentTask?.type === "component", `Detects component file type (got ${componentTask?.type})`);

const apiTask = fileTasks.find(f => f.filePath === "server/routes.ts");
assert(apiTask?.type === "api", `Detects api file type (got ${apiTask?.type})`);

const testTask = fileTasks.find(f => f.filePath === "src/tests/Header.test.tsx");
assert(testTask?.type === "test", `Detects test file type (got ${testTask?.type})`);

const batches = parallelGenerationService.createBatches(fileTasks);
assert(batches.length > 0, `Creates batches (got ${batches.length})`);
assert(batches.length < fileTasks.length, `Batches fewer than total files (${batches.length} < ${fileTasks.length})`);

const speedup = parallelGenerationService.estimateSpeedup(batches);
assert(speedup >= 1, `Speedup >= 1x (got ${speedup}x)`);

const graph = parallelGenerationService.analyzeFileDependencies(fileTasks);
const sorted = parallelGenerationService.topologicalSort(graph);
assert(sorted.length === fileTasks.length, `Topological sort returns all files (got ${sorted.length})`);

const configIdx = sorted.indexOf("src/config/settings.ts");
const componentIdx = sorted.indexOf("src/components/Header.tsx");
assert(configIdx < componentIdx, `Config sorted before component (${configIdx} < ${componentIdx})`);

(async () => {
  let progressCalls = 0;
  const results = await parallelGenerationService.executeInParallel(
    [
      () => Promise.resolve("a"),
      () => Promise.resolve("b"),
      () => Promise.resolve("c"),
    ],
    (completed, total) => { progressCalls++; }
  );
  assert(results.length === 3, `executeInParallel returns 3 results (got ${results.length})`);
  assert(progressCalls === 3, `Progress callback called 3 times (got ${progressCalls})`);

  section("2. LiveSyntaxValidatorService");

  const validCode = `
import { useState } from "react";

function App() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <h1>Hello</h1>
      <button onClick={() => setCount(count + 1)}>Count: {count}</button>
    </div>
  );
}

export default App;
`;
  const validResult = liveSyntaxValidatorService.validateStreaming(validCode);
  assert(validResult.isValid, `Valid React code passes validation (errors: ${validResult.errors.map(e => e.message).join(", ")})`);

  const unmatchedBrace = `function foo() { if (true) { return 1; }`;
  const braceResult = liveSyntaxValidatorService.validateStreaming(unmatchedBrace);
  const hints = liveSyntaxValidatorService.getCompletionHints(unmatchedBrace);
  assert(hints.length > 0, `Detects unclosed brace with hints (got ${hints.join(", ")})`);

  const extraClose = `function foo() { } }`;
  const extraResult = liveSyntaxValidatorService.validateStreaming(extraClose);
  assert(!extraResult.isValid, `Detects extra closing brace`);

  const templateCode = "const greeting = `Hello ${name}, your age is ${age + 1}`;";
  const templateResult = liveSyntaxValidatorService.validateStreaming(templateCode);
  assert(templateResult.isValid, `Template literal with expressions passes (errors: ${templateResult.errors.map(e => e.message).join(", ")})`);

  const nestedTemplateCode = "const html = `<div class=\"${isActive ? 'active' : 'inactive'}\">`;";
  const nestedResult = liveSyntaxValidatorService.validateStreaming(nestedTemplateCode);
  assert(nestedResult.isValid, `Nested template expression passes (errors: ${nestedResult.errors.map(e => e.message).join(", ")})`);

  const complexTemplate = "const query = `SELECT * FROM users WHERE id = ${user.id} AND name = '${user.name}'`;";
  const complexResult = liveSyntaxValidatorService.validateStreaming(complexTemplate);
  assert(complexResult.isValid, `Complex template literal passes (errors: ${complexResult.errors.map(e => e.message).join(", ")})`);

  const objectInTemplate = "const msg = `Result: ${JSON.stringify({ a: 1, b: 2 })}`;";
  const objectResult = liveSyntaxValidatorService.validateStreaming(objectInTemplate);
  assert(objectResult.isValid, `Object in template expression passes (errors: ${objectResult.errors.map(e => e.message).join(", ")})`);

  const unterminatedString = `const x = "hello;`;
  const strResult = liveSyntaxValidatorService.validateStreaming(unterminatedString);
  assert(!strResult.isValid, `Detects unterminated string`);

  const chunkResult = liveSyntaxValidatorService.validateChunk("}", "function foo() {");
  assert(chunkResult.isValid, `Valid chunk passes`);

  const badChunk = liveSyntaxValidatorService.validateChunk("}}", "function foo() {");
  assert(!badChunk.isValid, `Invalid chunk detected (extra closing)`);

  const commentCode = `
// This is a comment with { unmatched brackets
/* Multi-line comment
   with { braces } and ( parens
*/
function test() {
  return 1;
}
`;
  const commentResult = liveSyntaxValidatorService.validateStreaming(commentCode);
  assert(commentResult.isValid, `Comments with brackets don't cause false errors (errors: ${commentResult.errors.map(e => e.message).join(", ")})`);

  const stringBrackets = `const x = "{ some bracket } in string";`;
  const stringBracketResult = liveSyntaxValidatorService.validateStreaming(stringBrackets);
  assert(stringBracketResult.isValid, `Brackets in strings don't cause errors (errors: ${stringBracketResult.errors.map(e => e.message).join(", ")})`);

  section("3. CodeStyleEnforcerService");

  const messyCode = `import {useState} from "react"
import {useEffect} from "react"

const  foo = ( x )=>{
  return x+1
}
`;
  const formatResult = codeStyleEnforcerService.formatCode(messyCode);
  assert(formatResult.formatted.length > 0, `Formats code successfully`);
  assert(formatResult.changed, `Detected changes needed`);

  const urlCode = `const url = "http://localhost:3000/api";`;
  const urlResult = codeStyleEnforcerService.formatCode(urlCode);
  assert(!urlResult.formatted.includes("http: //"), `URL in string not mangled (got: ${urlResult.formatted.trim()})`);

  const cssCode = `const style = "color: red; font-size: 14px;";`;
  const cssResult = codeStyleEnforcerService.formatCode(cssCode);
  const hasCSSIntact = cssResult.formatted.includes("color: red") || cssResult.formatted.includes("color:red");
  assert(hasCSSIntact, `CSS in string preserved (got: ${cssResult.formatted.trim()})`);

  const operatorCode = `if (a === b && c !== d) { return a !== b; }`;
  const opResult = codeStyleEnforcerService.formatCode(operatorCode);
  assert(opResult.formatted.includes("==="), `=== operator preserved (got: ${opResult.formatted.trim()})`);
  assert(opResult.formatted.includes("!=="), `!== operator preserved (got: ${opResult.formatted.trim()})`);

  const importOrder = `import { z } from "zod";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { helper } from "./utils";
`;
  const importResult = codeStyleEnforcerService.formatCode(importOrder);
  const lines = importResult.formatted.split("\n").filter(l => l.startsWith("import"));
  if (lines.length >= 2) {
    const reactIdx = lines.findIndex(l => l.includes("react"));
    const zodIdx = lines.findIndex(l => l.includes("zod"));
    assert(reactIdx >= 0 && zodIdx >= 0, `Both imports present after sorting`);
  }

  const multiFile = codeStyleEnforcerService.formatMultipleFiles([
    { path: "app.tsx", content: "const x = 1" },
    { path: "styles.css", content: "body { color: red; }" },
    { path: "data.json", content: '{"key": "value"}' },
  ]);
  assert(multiFile.length === 3, `Formats multiple files (got ${multiFile.length})`);

  const eslintConfig = codeStyleEnforcerService.generateEslintConfig();
  assert(typeof eslintConfig === "object", `Generates ESLint config`);

  const prettierConfig = codeStyleEnforcerService.generatePrettierConfig();
  assert(typeof prettierConfig === "object", `Generates Prettier config`);

  const arrowCode = `const fn = x => x + 1;`;
  const arrowResult = codeStyleEnforcerService.formatCode(arrowCode);
  assert(arrowResult.formatted.includes("(x) =>") || arrowResult.formatted.includes("x =>"), 
    `Arrow function parens handled (got: ${arrowResult.formatted.trim()})`);

  section("4. ErrorLearningService");

  const stats1 = errorLearningService.getStats();
  assert(stats1.totalPatterns === 15, `Has 15 built-in patterns (got ${stats1.totalPatterns})`);
  assert(stats1.learnedPatterns === 0, `No learned patterns initially (got ${stats1.learnedPatterns})`);

  errorLearningService.recordError({
    errorMessage: "Cannot find module './missing-component'",
    code: "import { MissingComponent } from './missing-component';",
    wasFixed: true,
    fixApplied: "Created the missing file",
    modelUsed: "qwen",
  });

  const autoFix = errorLearningService.getAutoFix("Cannot find module './something'");
  assert(autoFix !== null, `Gets auto-fix for missing module (got: ${autoFix})`);

  errorLearningService.recordError({
    errorMessage: "Type 'string' is not assignable to type 'number'",
    code: "const x: number = 'hello';",
    wasFixed: false,
    modelUsed: "qwen",
  });

  const stats2 = errorLearningService.getStats();
  assert(stats2.totalErrors === 2, `Recorded 2 errors (got ${stats2.totalErrors})`);

  const preventionPrompt = errorLearningService.getPreventionPrompt("qwen");
  assert(preventionPrompt.length > 0, `Gets prevention prompt (length: ${preventionPrompt.length})`);
  assert(preventionPrompt.includes("Missing import") || preventionPrompt.includes("Type mismatch") || preventionPrompt.includes("Code Quality"), 
    `Prevention prompt has relevant content`);

  const defaultPrompt = errorLearningService.getPreventionPrompt();
  assert(defaultPrompt.length > 0, `Default prevention prompt works (length: ${defaultPrompt.length})`);

  for (let i = 0; i < 5; i++) {
    errorLearningService.recordError({
      errorMessage: "Custom weird error XYZ-123 something broke",
      code: "broken code",
      wasFixed: false,
      modelUsed: "qwen",
    });
  }

  const insights = errorLearningService.getInsights();
  assert(Array.isArray(insights), `Gets insights array`);

  errorLearningService.clearHistory();
  const stats3 = errorLearningService.getStats();
  assert(stats3.totalErrors === 0, `History cleared (got ${stats3.totalErrors})`);

  section("5. ContextBudgetService (M4 Optimized Presets)");

  const qwenPreset = contextBudgetService.getM4OptimizedPreset("qwen2.5-coder-14b");
  assert(qwenPreset !== null, `Gets Qwen2.5-Coder preset`);
  assert(qwenPreset!.contextWindow === 32768, `Qwen context window 32768 (got ${qwenPreset?.contextWindow})`);
  assert(qwenPreset!.gpuLayers === 99, `Qwen GPU layers 99 (got ${qwenPreset?.gpuLayers})`);

  const deepseekPreset = contextBudgetService.getM4OptimizedPreset("deepseek-coder-v2");
  assert(deepseekPreset !== null, `Gets DeepSeek preset`);
  assert(deepseekPreset!.contextWindow === 16384, `DeepSeek context window 16384 (got ${deepseekPreset?.contextWindow})`);

  const llamaPreset = contextBudgetService.getM4OptimizedPreset("llama-3.2-8b");
  assert(llamaPreset !== null, `Gets Llama-3 preset`);
  assert(llamaPreset!.contextWindow === 8192, `Llama-3 context window 8192 (got ${llamaPreset?.contextWindow})`);

  const unknownPreset = contextBudgetService.getM4OptimizedPreset("some-random-model");
  assert(unknownPreset === null, `Unknown model returns null`);

  const qwenAllocation = contextBudgetService.calculateM4OptimizedAllocation("qwen2.5-coder-14b", "coding");
  assert(qwenAllocation.total === 32768, `Qwen allocation total 32768 (got ${qwenAllocation.total})`);
  assert(qwenAllocation.available > 0, `Qwen has available tokens (got ${qwenAllocation.available})`);
  assert(qwenAllocation.codeContext > qwenAllocation.chatHistory, 
    `Coding task: codeContext > chatHistory (${qwenAllocation.codeContext} > ${qwenAllocation.chatHistory})`);

  const planAllocation = contextBudgetService.calculateM4OptimizedAllocation("ministral-3-14b", "planning");
  assert(planAllocation.total === 32768, `Ministral allocation total (got ${planAllocation.total})`);
  assert(planAllocation.userMessage > 0, `Planning has userMessage tokens (got ${planAllocation.userMessage})`);

  const qwenCodingTemp = contextBudgetService.getOptimalTemperature("qwen2.5-coder-14b", "coding");
  assert(qwenCodingTemp === 0.0, `Qwen coding temp 0.0 (got ${qwenCodingTemp})`);

  const ministralPlanTemp = contextBudgetService.getOptimalTemperature("ministral-3-14b", "planning");
  assert(ministralPlanTemp === 0.3, `Ministral planning temp 0.3 (got ${ministralPlanTemp})`);

  const deepseekDebugTemp = contextBudgetService.getOptimalTemperature("deepseek-coder-v2", "debugging");
  assert(deepseekDebugTemp === 0.0, `DeepSeek debugging temp 0.0 (got ${deepseekDebugTemp})`);

  const unknownTemp = contextBudgetService.getOptimalTemperature("unknown-model", "coding");
  assert(unknownTemp === 0.1, `Unknown model coding temp 0.1 (got ${unknownTemp})`);

  const inputFieldsSum = qwenAllocation.systemPrompt + qwenAllocation.userMessage + 
                   qwenAllocation.codeContext + qwenAllocation.chatHistory + 
                   qwenAllocation.projectMemory + qwenAllocation.fewShotExamples;
  assert(Math.abs(inputFieldsSum - qwenAllocation.available) < 10, 
    `Input fields sum to available (${inputFieldsSum} ~= ${qwenAllocation.available})`);
  const fullSum = inputFieldsSum + qwenAllocation.outputReserve;
  assert(Math.abs(fullSum - qwenAllocation.total) < 100, 
    `Full allocation sums to total (${fullSum} ~= ${qwenAllocation.total})`);

  section("SUMMARY");
  console.log(`\nTotal: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  if (failed > 0) {
    console.error("\nSOME TESTS FAILED!");
    process.exit(1);
  } else {
    console.log("\nALL TESTS PASSED!");
    process.exit(0);
  }
})();
