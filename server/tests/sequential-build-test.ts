import { sequentialBuildService } from "../services/sequential-build.service";

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
  console.log("\n=== SequentialBuildService Tests ===\n");

  console.log("--- Pipeline Creation ---");
  let pipelineId: string;
  {
    const steps = [
      { description: "Create component structure", prompt: "Build a React component", category: "structure" },
      { description: "Add styling", prompt: "Add Tailwind styles", category: "styling" },
      { description: "Add interactivity", prompt: "Add event handlers", category: "logic" },
    ];

    const pipeline = sequentialBuildService.createPipeline("project-test-1", "Build a todo app", steps);
    pipelineId = pipeline.id;

    assert(typeof pipeline.id === "string" && pipeline.id.length > 0, "Pipeline has an id");
    assertEqual(pipeline.projectId, "project-test-1", "Pipeline has correct projectId");
    assertEqual(pipeline.originalPrompt, "Build a todo app", "Pipeline stores original prompt");
    assertEqual(pipeline.steps.length, 3, "Pipeline has 3 steps");
    assertEqual(pipeline.status, "idle", "Pipeline starts as idle");
    assertEqual(pipeline.currentStep, 0, "Pipeline starts at step 0");
    assertEqual(pipeline.accumulatedCode, "", "Pipeline starts with empty accumulated code");
    assertEqual(pipeline.stepsCompleted, 0, "Pipeline starts with 0 completed steps");
    assertEqual(pipeline.stepsFailed, 0, "Pipeline starts with 0 failed steps");
    assert(pipeline.startedAt > 0, "Pipeline has start timestamp");
  }

  console.log("\n--- Pipeline Retrieval ---");
  {
    const retrieved = sequentialBuildService.getPipeline(pipelineId);
    assert(retrieved !== undefined, "getPipeline finds existing pipeline");
    assertEqual(retrieved?.id, pipelineId, "getPipeline returns correct pipeline");

    const missing = sequentialBuildService.getPipeline("nonexistent-id");
    assertEqual(missing, undefined, "getPipeline returns undefined for missing pipeline");
  }

  console.log("\n--- Get Pipeline For Project ---");
  {
    const projectPipeline = sequentialBuildService.getPipelineForProject("project-test-1");
    assert(projectPipeline !== undefined, "getPipelineForProject finds pipeline by project");
    assertEqual(projectPipeline?.id, pipelineId, "getPipelineForProject returns correct pipeline");

    const missing = sequentialBuildService.getPipelineForProject("nonexistent-project");
    assertEqual(missing, undefined, "getPipelineForProject returns undefined for missing project");
  }

  console.log("\n--- Step Execution Flow ---");
  {
    const step1 = sequentialBuildService.getNextStep(pipelineId);
    assert(step1 !== null, "getNextStep returns first step");
    assertEqual(step1?.step.stepNumber, 1, "First step is step number 1");
    assertEqual(step1?.step.status, "building", "Step status changes to building");
    assertEqual(step1?.step.description, "Create component structure", "Step has correct description");
    assert(typeof step1?.prompt === "string" && step1.prompt.length > 0, "Step prompt is non-empty");
    assertEqual(step1?.contextCode, "", "First step has empty context code");

    const pipeline = sequentialBuildService.getPipeline(pipelineId);
    assertEqual(pipeline?.status, "running", "Pipeline status changes to running after getNextStep");
    assertEqual(pipeline?.currentStep, 1, "Pipeline currentStep is 1");
  }

  console.log("\n--- Step Completion ---");
  {
    const currentPipeline = sequentialBuildService.getPipeline(pipelineId)!;
    const result = sequentialBuildService.completeStep(pipelineId,
      currentPipeline.steps[0].id,
      { code: "const App = () => <div>Hello</div>;", qualityScore: 85, healthPassed: true }
    );
    assert(result !== null, "completeStep returns pipeline on success");

    const pipeline = sequentialBuildService.getPipeline(pipelineId);
    assertEqual(pipeline?.steps[0].status, "completed", "Completed step has status completed");
    assertEqual(pipeline?.steps[0].qualityScore, 85, "Step stores quality score");
    assertEqual(pipeline?.steps[0].healthPassed, true, "Step stores health check result");
    assertEqual(pipeline?.stepsCompleted, 1, "Pipeline tracks completed step count");
    assert(pipeline?.accumulatedCode?.includes("const App") ?? false, "Accumulated code includes step output");
  }

  console.log("\n--- Second Step With Context ---");
  {
    const step2 = sequentialBuildService.getNextStep(pipelineId);
    assert(step2 !== null, "getNextStep returns second step");
    assertEqual(step2?.step.stepNumber, 2, "Second step is step number 2");
    assert(step2?.contextCode?.includes("const App") ?? false, "Second step receives accumulated code as context");

    const currentPipeline = sequentialBuildService.getPipeline(pipelineId)!;
    sequentialBuildService.completeStep(pipelineId,
      currentPipeline.steps[1].id,
      { code: "const StyledApp = () => <div className='p-4'>Hello</div>;", qualityScore: 90, healthPassed: true }
    );
  }

  console.log("\n--- Step Failure ---");
  {
    const step3 = sequentialBuildService.getNextStep(pipelineId);
    assert(step3 !== null, "getNextStep returns third step");

    const currentPipeline = sequentialBuildService.getPipeline(pipelineId)!;
    const failResult = sequentialBuildService.failStep(pipelineId,
      currentPipeline.steps[2].id,
      "Code quality below threshold"
    );
    assert(failResult !== null, "failStep returns pipeline");

    const pipeline = sequentialBuildService.getPipeline(pipelineId);
    assertEqual(pipeline?.steps[2].status, "failed", "Failed step has status failed");
    assertEqual(pipeline?.steps[2].error, "Code quality below threshold", "Failed step stores error message");
    assertEqual(pipeline?.stepsFailed, 1, "Pipeline tracks failed step count");
  }

  console.log("\n--- Pipeline Completion State ---");
  {
    const noNext = sequentialBuildService.getNextStep(pipelineId);
    assertEqual(noNext, null, "getNextStep returns null when no pending steps remain");

    const pipeline = sequentialBuildService.getPipeline(pipelineId);
    assertEqual(pipeline?.stepsCompleted, 2, "Pipeline completed count is 2");
    assertEqual(pipeline?.stepsFailed, 1, "Pipeline failed count is 1");
  }

  console.log("\n--- Nonexistent Pipeline Operations ---");
  {
    const step = sequentialBuildService.getNextStep("nonexistent");
    assertEqual(step, null, "getNextStep returns null for nonexistent pipeline");

    const complete = sequentialBuildService.completeStep("nonexistent", "step-1", {
      code: "x", qualityScore: 50, healthPassed: true
    });
    assertEqual(complete, null, "completeStep returns null for nonexistent pipeline");

    const fail = sequentialBuildService.failStep("nonexistent", "step-1", "error");
    assertEqual(fail, null, "failStep returns null for nonexistent pipeline");
  }

  console.log("\n--- Empty Pipeline ---");
  {
    const emptyPipeline = sequentialBuildService.createPipeline("project-empty", "Build nothing", []);
    assertEqual(emptyPipeline.steps.length, 0, "Empty pipeline has no steps");

    const noStep = sequentialBuildService.getNextStep(emptyPipeline.id);
    assertEqual(noStep, null, "getNextStep returns null for empty pipeline");
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
