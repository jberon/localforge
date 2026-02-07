import { codeQualityPipelineService } from "../services/code-quality-pipeline.service";
import { runStructuralIntegrity } from "../services/code-quality/structural-pass";
import { runReactJsxPass } from "../services/code-quality/react-jsx-pass";
import { runImportDependencyResolution } from "../services/code-quality/import-pass";
import { runCodeCompleteness } from "../services/code-quality/completeness-pass";
import { runCommonLLMMistakes } from "../services/code-quality/llm-cleanup-pass";

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

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    errors.push(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    console.log(`  FAIL: ${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function runTests() {
  console.log("\n=== Code Quality Pipeline Tests ===\n");

  console.log("--- Structural Pass: Bracket Matching ---");
  {
    const clean = runStructuralIntegrity("function foo() { return true; }");
    assertEqual(clean.issues.length, 0, "Clean code has no structural issues");
    assertEqual(clean.code, "function foo() { return true; }", "Clean code is unchanged");

    const mismatched = runStructuralIntegrity("function foo() { return true;");
    assert(mismatched.issues.length > 0, "Mismatched braces detected");
    assert(mismatched.code.includes("}"), "Missing closing brace is added");

    const extra = runStructuralIntegrity("function foo() { return true; }}");
    assert(extra.issues.length > 0, "Extra closing brace detected");
  }

  console.log("\n--- Structural Pass: Truncated Code ---");
  {
    const truncated = runStructuralIntegrity("function foo(");
    assert(truncated.issues.length > 0, "Truncated code detected");

    const trailingComma = runStructuralIntegrity("const x = { a: 1,");
    assert(trailingComma.issues.length > 0, "Trailing comma truncation detected");
  }

  console.log("\n--- React/JSX Pass ---");
  {
    const jsxCode = `
import React from "react";
const App: React.FC = () => {
  return <div className="p-4"><h1>Hello</h1></div>;
};
export default App;
`;
    const result = runReactJsxPass(jsxCode, true);
    assertEqual(result.code, jsxCode, "Valid JSX passes without changes");

    const noExport = `
const App = () => <div>Hello</div>;
`;
    const noExportResult = runReactJsxPass(noExport, true);
    assert(noExportResult.issues.some(i => i.type === "missing-export"), "Missing export is flagged");
  }

  console.log("\n--- Import Pass ---");
  {
    const codeWithDuplicates = `
import React from "react";
import React from "react";
const App = () => <div>Hello</div>;
`;
    const result = runImportDependencyResolution(codeWithDuplicates);
    assert(typeof result.code === "string", "Import pass returns code string");
    assert(Array.isArray(result.issues), "Import pass returns issues array");
    assert(result.code.includes("import React"), "Import pass preserves at least one React import");
  }

  console.log("\n--- Completeness Pass ---");
  {
    const incompleteCode = `
const App = () => {
  return (
    <div>
`;
    const result = runCodeCompleteness(incompleteCode);
    assert(typeof result.code === "string", "Completeness pass returns code string");
    assert(Array.isArray(result.issues), "Completeness pass returns issues array");

    const validCode = `
const App = () => {
  return <div>Hello</div>;
};
export default App;
`;
    const validResult = runCodeCompleteness(validCode);
    assert(typeof validResult.code === "string", "Completeness pass handles valid code");
  }

  console.log("\n--- LLM Cleanup Pass ---");
  {
    const codeWithLLMArtifacts = `
Here is the code you requested:
\`\`\`jsx
const App = () => <div>Hello</div>;
export default App;
\`\`\`
Let me explain what this does...
`;
    const result = runCommonLLMMistakes(codeWithLLMArtifacts);
    assert(!result.code.includes("Here is the code"), "LLM preamble text is removed");
    assert(result.issues.length > 0, "LLM artifacts generate issues");
    assert(result.code.includes("const App"), "Actual code is preserved");
  }

  console.log("\n--- Full Pipeline: analyzeAndFix ---");
  {
    const goodCode = `
import React from "react";

const App: React.FC = () => {
  const [count, setCount] = React.useState(0);

  return (
    <div className="p-4">
      <h1>Counter: {count}</h1>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>
    </div>
  );
};

export default App;
`;
    const report = await codeQualityPipelineService.analyzeAndFix(goodCode);
    assert(report.overallScore >= 80, `Good code scores well (${report.overallScore}/100)`);
    assert(report.passResults.length === 5, "Pipeline runs all 5 passes");
    assert(typeof report.summary === "string", "Report includes summary");
    assert(typeof report.fixedCode === "string", "Report includes fixed code");
    assert(report.fixedCode.includes("const App"), "Fixed code preserves component");

    for (const pass of report.passResults) {
      assert(typeof pass.passName === "string", `Pass has name: ${pass.passName}`);
      assert(typeof pass.durationMs === "number", `Pass has duration: ${pass.passName}`);
      assert(Array.isArray(pass.issuesFound), `Pass has issues array: ${pass.passName}`);
    }
  }

  console.log("\n--- Full Pipeline: Code With Issues ---");
  {
    const badCode = `
import React from "react";
import React from "react";

const App = () => {
  return (
    <div className="p-4">
      <h1>Hello</h1>
    </div>
  )
`;
    const report = await codeQualityPipelineService.analyzeAndFix(badCode);
    assert(report.totalIssuesFound > 0, "Bad code has issues detected");
    assert(report.overallScore < 100, `Bad code scores below 100 (${report.overallScore})`);
    assert(report.summary.includes("issue"), "Summary mentions issues");
  }

  console.log("\n--- Pipeline Stats ---");
  {
    const stats = codeQualityPipelineService.getStats();
    assert(stats.totalAnalyzed >= 2, "Stats track analysis count");
    assert(typeof stats.averageScore === "number", "Stats include average score");
    assert(Array.isArray(stats.commonIssues), "Stats include common issues list");
  }

  console.log("\n--- Language Detection ---");
  {
    const tsxCode = `const App: React.FC = () => <div className="p-4">Hello</div>;`;
    const jsxCode = `const App = () => <div className="p-4">Hello</div>;`;
    const tsCode = `const x: string = "hello";`;
    const jsCode = `const x = "hello";`;

    const service = codeQualityPipelineService as unknown as { detectLanguage: (code: string) => string };
    assertEqual(service.detectLanguage(tsxCode), "tsx", "Detects TSX");
    assertEqual(service.detectLanguage(jsxCode), "jsx", "Detects JSX");
    assertEqual(service.detectLanguage(tsCode), "typescript", "Detects TypeScript");
    assertEqual(service.detectLanguage(jsCode), "javascript", "Detects JavaScript");
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (errors.length > 0) {
    console.log("\nFailed tests:");
    errors.forEach(e => console.log(`  - ${e}`));
  }
  return failed === 0;
}

runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error("Test runner error:", err);
  process.exit(1);
});
