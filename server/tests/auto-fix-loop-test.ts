import { autoFixLoopService } from "../services/auto-fix-loop.service";

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
  console.log("\n=== AutoFixLoopService Tests ===\n");

  console.log("--- Session Management ---");
  {
    const session = await autoFixLoopService.startAutoFixSession("test-project-1", {
      maxIterations: 3,
    });

    assert(session !== null, "startAutoFixSession returns a session");
    assert(typeof session.id === "string" && session.id.length > 0, "Session has an id");
    assertEqual(session.projectId, "test-project-1", "Session has correct projectId");
    assertEqual(session.status, "analyzing", "Session starts as analyzing");
    assertEqual(session.fixAttempts.length, 0, "Session starts with no fix attempts");
    assertEqual(session.maxIterations, 3, "Session respects maxIterations option");
    assert(session.startedAt > 0, "Session has a start timestamp");
    assertEqual(session.currentIteration, 0, "Session starts at iteration 0");
  }

  console.log("\n--- Default Max Iterations ---");
  {
    const session = await autoFixLoopService.startAutoFixSession("test-project-2");
    assertEqual(session.maxIterations, 5, "Default maxIterations is 5");
  }

  console.log("\n--- Error Parsing (collectRuntimeErrors) ---");
  {
    const errorCtx = await autoFixLoopService.collectRuntimeErrors("test-project-parse");
    assert(Array.isArray(errorCtx.errors), "collectRuntimeErrors returns errors array");
    assert(Array.isArray(errorCtx.recentLogs), "collectRuntimeErrors returns recentLogs array");
    assert(Array.isArray(errorCtx.affectedFiles), "collectRuntimeErrors returns affectedFiles array");
  }

  console.log("\n--- Strategy Detection ---");
  {
    const service = autoFixLoopService as unknown as { fixStrategies: Array<{
      type: string;
      pattern: RegExp;
    }> };
    const strategies = service.fixStrategies;
    assert(Array.isArray(strategies) && strategies.length > 0, "Fix strategies are initialized");

    const hasImportStrategy = strategies.some(s => s.type === "import" || s.pattern.test("Cannot find module 'react'"));
    assert(hasImportStrategy, "Has strategy for import errors");

    const hasTypeStrategy = strategies.some(s => s.type === "type" || s.pattern.test("Object is possibly 'null'"));
    assert(hasTypeStrategy, "Has strategy for type errors");
  }

  console.log("\n--- Code Patch Generation (no file path) ---");
  {
    const patch = await autoFixLoopService.generateCodePatch(
      "test-project",
      { type: "import", message: "Cannot find module './foo'" },
      { projectId: "test-project" }
    );
    assertEqual(patch, null, "Returns null when error has no file path");
  }

  console.log("\n--- Code Patch Generation (nonexistent project) ---");
  {
    const patch = await autoFixLoopService.generateCodePatch(
      "nonexistent-project",
      { type: "import", message: "Cannot find module './foo'", file: "App.tsx" },
      { projectId: "nonexistent-project" }
    );
    assertEqual(patch, null, "Returns null when file cannot be read");
  }

  console.log("\n--- LLM Function Registration ---");
  {
    autoFixLoopService.setLLMFixFunction(async (_prompt: string) => {
      return "fixed code";
    });
    assert(true, "setLLMFixFunction does not throw");

    autoFixLoopService.setLLMCodePatchFunction(async () => {
      return null;
    });
    assert(true, "setLLMCodePatchFunction does not throw");
  }

  console.log("\n--- Projects Base Dir ---");
  {
    const service = autoFixLoopService as unknown as { projectsBaseDir: string };
    const originalDir = service.projectsBaseDir;
    autoFixLoopService.setProjectsBaseDir("/tmp/test-projects");
    assertEqual(service.projectsBaseDir, "/tmp/test-projects", "setProjectsBaseDir updates internal path");
    autoFixLoopService.setProjectsBaseDir(originalDir);
  }

  console.log("\n--- Read File Content (nonexistent) ---");
  {
    const content = await autoFixLoopService.readFileContent("nonexistent-project", "nonexistent.tsx");
    assertEqual(content, null, "readFileContent returns null for nonexistent files");
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
