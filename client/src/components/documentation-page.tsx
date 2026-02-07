import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Zap,
  Layers,
  Cpu,
  Shield,
  Wand2,
  CheckCircle2,
  ArrowLeft,
  BookOpen,
  Brain,
  Target,
  GitBranch,
  Gauge,
  Network,
  Boxes,
  Microscope,
  Workflow,
  Eye,
  TestTube,
  Paintbrush,
  Upload,
  Globe,
  Database,
  Lock,
  ChevronRight,
  Code,
  FileCode,
  Cog,
  TrendingUp,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

interface DocumentationPageProps {
  onBack: () => void;
}

function FeatureItem({ icon: Icon, title, description }: { icon: typeof Sparkles; title: string; description: string }) {
  return (
    <div className="p-3 rounded-md bg-muted/30">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-foreground shrink-0" />
        <p className="text-sm font-medium text-foreground">{title}</p>
      </div>
      <p className="text-xs text-muted-foreground ml-6">{description}</p>
    </div>
  );
}

function ArchSection({ icon: Icon, title, description, children, testId }: {
  icon: typeof Sparkles;
  title: string;
  description: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <Card className="overflow-visible" data-testid={testId}>
      <div className="p-5 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Icon className="h-5 w-5 text-foreground" />
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {children}
      </div>
    </Card>
  );
}

function SubSystem({ title, items }: { title: string; items: Array<{ name: string; detail: string }> }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <ChevronRight className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <span className="font-medium text-foreground">{item.name}</span>
              <span className="text-muted-foreground"> - {item.detail}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GuideTab() {
  return (
    <div className="space-y-6">
      <Card className="overflow-visible">
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground" data-testid="text-docs-welcome">Welcome to LocalForge</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Build production-quality web applications with AI running entirely on your Mac. No cloud required, no API costs, no data leaving your machine.
          </p>
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span className="text-sm text-muted-foreground">Uses your local LLM via LM Studio - complete privacy</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span className="text-sm text-muted-foreground">Generates complete multi-file React + TypeScript applications</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span className="text-sm text-muted-foreground">Live preview, in-browser bundling, and one-click deployment</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span className="text-sm text-muted-foreground">Cloud LLM fallback (OpenAI, Groq, Together AI) when you need extra power</span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-visible">
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-foreground" />
            <h2 className="text-lg font-semibold text-foreground" data-testid="text-docs-getting-started">Getting Started</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Get up and running in under 5 minutes. LocalForge generates full-stack web applications from natural language descriptions.
          </p>
          <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li>Download and install <a href="https://lmstudio.ai" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" data-testid="link-lmstudio">LM Studio</a> (free for Mac, Windows, Linux)</li>
            <li>Load a coding model (recommended: Qwen 2.5 Coder 14B or Qwen3 Coder 30B)</li>
            <li>Start the local server in LM Studio's Developer tab</li>
            <li>Open Settings in LocalForge and enter your server URL (usually http://localhost:1234/v1)</li>
            <li>Describe your app idea and click Start</li>
          </ol>
          <div className="p-3 rounded-md bg-primary/5 border border-primary/10">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Quick start:</span> Don't have LM Studio? Enable Test Mode in Settings to try LocalForge instantly with the built-in Replit AI integration.
            </p>
          </div>
        </div>
      </Card>

      <Card className="overflow-visible">
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-foreground" />
            <h2 className="text-lg font-semibold text-foreground" data-testid="text-docs-plan-build">Plan & Build Modes</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Two approaches for every project. Choose the workflow that fits your needs:
          </p>
          <div className="space-y-2">
            <div className="p-3 rounded-md bg-muted/30">
              <p className="text-sm font-medium text-foreground">Plan Mode</p>
              <p className="text-xs text-muted-foreground mt-1">
                The AI creates a structured task list with architecture decisions before writing any code. Review, modify, or approve the plan. Best for complex applications where you want control over the direction.
              </p>
            </div>
            <div className="p-3 rounded-md bg-muted/30">
              <p className="text-sm font-medium text-foreground">Build Mode - Fast</p>
              <p className="text-xs text-muted-foreground mt-1">
                Jump straight into code generation. Optimized for quick edits, bug fixes, and small features (10-60 seconds). Uses targeted prompts for surgical changes.
              </p>
            </div>
            <div className="p-3 rounded-md bg-muted/30">
              <p className="text-sm font-medium text-foreground">Build Mode - Full</p>
              <p className="text-xs text-muted-foreground mt-1">
                Comprehensive generation with multi-file output, TypeScript, testing, and quality analysis (5-15 minutes). Best for new projects or major feature additions.
              </p>
            </div>
            <div className="p-3 rounded-md bg-muted/30">
              <p className="text-sm font-medium text-foreground">Discussion Mode</p>
              <p className="text-xs text-muted-foreground mt-1">
                Brainstorm ideas, explore architectures, and discuss approaches without generating any code. Perfect for the planning phase.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-visible">
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-foreground" />
            <h2 className="text-lg font-semibold text-foreground" data-testid="text-docs-dual-model">AI Dream Team (Dual Model)</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure two specialized LLMs that work together - a reasoning model for planning and a coding model for implementation. This division of labor produces significantly better results than a single model.
          </p>
          <div className="space-y-2">
            <div className="p-3 rounded-md bg-violet-500/5 border border-violet-500/20">
              <p className="text-sm font-medium text-foreground">Planner (Reasoning)</p>
              <p className="text-xs text-muted-foreground mt-1">
                Recommended: Ministral 3 14B Reasoning. Handles task decomposition, architecture decisions, dependency analysis, and project planning.
              </p>
            </div>
            <div className="p-3 rounded-md bg-blue-500/5 border border-blue-500/20">
              <p className="text-sm font-medium text-foreground">Builder (Coding)</p>
              <p className="text-xs text-muted-foreground mt-1">
                Recommended: Qwen3 Coder 30B or Qwen2.5 Coder 14B. Generates production-ready code with TypeScript, React, automated tests, and quality analysis.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-visible">
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-foreground" />
            <h2 className="text-lg font-semibold text-foreground" data-testid="text-docs-cloud-providers">Cloud LLM Providers</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            When local models aren't enough, seamlessly fall back to cloud providers. The Smart Model Router automatically selects the best option based on task complexity and model performance history.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="p-3 rounded-md bg-muted/30 text-center">
              <p className="text-sm font-medium text-foreground">OpenAI</p>
              <p className="text-xs text-muted-foreground mt-1">GPT-4o, GPT-4 Turbo</p>
            </div>
            <div className="p-3 rounded-md bg-muted/30 text-center">
              <p className="text-sm font-medium text-foreground">Groq</p>
              <p className="text-xs text-muted-foreground mt-1">Llama 3, Mixtral</p>
            </div>
            <div className="p-3 rounded-md bg-muted/30 text-center">
              <p className="text-sm font-medium text-foreground">Together AI</p>
              <p className="text-xs text-muted-foreground mt-1">CodeLlama, Qwen</p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-visible">
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-foreground" />
            <h2 className="text-lg font-semibold text-foreground" data-testid="text-docs-auto-fix">Closed-Loop Auto-Fix</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            A three-stage system that ensures generated code works correctly, even with smaller local models:
          </p>
          <div className="space-y-2">
            <div className="p-3 rounded-md bg-muted/30">
              <p className="text-sm font-medium text-foreground">Stage 1: Prevention</p>
              <p className="text-xs text-muted-foreground mt-1">
                Scans prompts against 15+ risk patterns (auth flows, state management, API calls) and injects preventive scaffolding before generation.
              </p>
            </div>
            <div className="p-3 rounded-md bg-muted/30">
              <p className="text-sm font-medium text-foreground">Stage 2: Multi-Pass Quality Pipeline</p>
              <p className="text-xs text-muted-foreground mt-1">
                5 deterministic analysis passes (structural, React/JSX, imports, completeness, cleanup) that fix common errors without LLM calls.
              </p>
            </div>
            <div className="p-3 rounded-md bg-muted/30">
              <p className="text-sm font-medium text-foreground">Stage 3: Self-Healing</p>
              <p className="text-xs text-muted-foreground mt-1">
                Captures runtime errors from the preview iframe and triggers LLM-powered auto-fix with targeted prompts, learning from each attempt.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-visible">
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-foreground" />
            <h2 className="text-lg font-semibold text-foreground" data-testid="text-docs-features">Key Features</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FeatureItem icon={Paintbrush} title="Design Mode" description="Generate wireframes and mockups with 5 design styles and 10 style keywords before writing code" />
            <FeatureItem icon={Eye} title="Visual Editor" description="Click-to-edit UI manipulation within the live preview - modify elements visually" />
            <FeatureItem icon={TestTube} title="Self-Testing Loop" description="Generates and runs test suites in the preview iframe with real-time progress and fix suggestions" />
            <FeatureItem icon={GitBranch} title="Version Control" description="Auto-save checkpoints with full history, diff view, and one-click rollback" />
            <FeatureItem icon={Code} title="Live Preview" description="In-browser bundling with esbuild-wasm, hot refresh, and real-time error capture" />
            <FeatureItem icon={Upload} title="Image Import" description="Upload screenshots or designs - AI analyzes them and generates matching code" />
            <FeatureItem icon={Globe} title="Export & Deploy" description="Download ZIP or generate deployment configs for Vercel, Netlify, Railway, Docker" />
            <FeatureItem icon={Lock} title="Auth & Database Templates" description="5 authentication + 5 database templates with production-quality code" />
            <FeatureItem icon={Gauge} title="Autonomy Levels" description="Four-tier control (Low to Max) over AI intervention depth" />
            <FeatureItem icon={Brain} title="Extended Thinking" description="Deep reasoning mode for complex architecture decisions" />
            <FeatureItem icon={FileCode} title="Code Scaffolds" description="25+ production-ready patterns (hooks, API routes, forms) auto-injected into prompts" />
            <FeatureItem icon={Boxes} title="Smart Templates" description="12+ app templates with search, filter, and optimized prompt builders" />
          </div>
        </div>
      </Card>
    </div>
  );
}

function ArchitectureTab() {
  return (
    <div className="space-y-6">
      <Card className="overflow-visible">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Network className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground" data-testid="text-arch-overview">Platform Overview</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            LocalForge is a systems-architecture-first AI code generator. Rather than relying on frontier-class models, it compensates for smaller local LLMs through intelligent closed-loop systems: error prevention, automated quality analysis, dependency-aware context management, and outcome-driven learning. The result is production-quality code from 7B-30B parameter models running on consumer hardware.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center p-3 rounded-md bg-muted/30">
              <div className="text-xl font-bold text-foreground" data-testid="stat-backend-services">110+</div>
              <div className="text-xs text-muted-foreground">Backend Services</div>
            </div>
            <div className="text-center p-3 rounded-md bg-muted/30">
              <div className="text-xl font-bold text-foreground" data-testid="stat-api-endpoints">200+</div>
              <div className="text-xs text-muted-foreground">API Endpoints</div>
            </div>
            <div className="text-center p-3 rounded-md bg-muted/30">
              <div className="text-xl font-bold text-foreground" data-testid="stat-intelligence-services">6</div>
              <div className="text-xs text-muted-foreground">Intelligence Services</div>
            </div>
            <div className="text-center p-3 rounded-md bg-muted/30">
              <div className="text-xl font-bold text-foreground" data-testid="stat-quality-passes">5</div>
              <div className="text-xs text-muted-foreground">Quality Passes</div>
            </div>
          </div>
        </div>
      </Card>

      <ArchSection
        icon={Brain}
        title="Intelligence Engine v2"
        description="Six interconnected services that learn from every generation to continuously improve code quality. Each service uses weighted exponential decay scoring for temporal relevance."
        testId="section-arch-intelligence"
      >
        <SubSystem title="Learning & Optimization" items={[
          { name: "OutcomeLearningService", detail: "Tracks generation outcomes (quality scores, test results, user acceptance) per model/taskType with weighted decay. Continuously recalculates model performance for optimal routing." },
          { name: "AdaptiveDecompositionService", detail: "Learns which prompt decomposition strategies (step count, granularity, merge/split thresholds) work best per model. Model-size aware: 3B/7B models get finer-grained chunking." },
          { name: "CrossProjectKnowledgeService", detail: "Extracts reusable patterns (hooks, API routes, components, auth flows) from successful generations (quality > 60). Searchable library auto-injects relevant patterns into future prompts." },
        ]} />
        <SubSystem title="Risk Prevention & Context" items={[
          { name: "PredictiveErrorPreventionService", detail: "Scans prompts before generation against 15+ risk patterns (complex-state, async-fetch, auth-flow, websocket, file-upload). Injects preventive scaffolding for high-risk prompts. Learns new patterns from outcomes." },
          { name: "SemanticContextService", detail: "Builds embedding indices over project files. Tries LM Studio embeddings first, falls back to TF-IDF (256-dim word-hash vectors). Retrieves most relevant code chunks by cosine similarity for generation context." },
          { name: "SpeculativeGenerationService", detail: "Generates 2-5 candidate solutions in parallel with diversity modes (temperature/model/prompt variation). Evaluates each with syntax, type, import, and completeness checks. Auto-selects best." },
        ]} />
      </ArchSection>

      <ArchSection
        icon={Shield}
        title="Code Quality Pipeline"
        description="A deterministic multi-pass analysis system that fixes common errors without LLM calls, producing a quality score. Extracted into 5 focused analysis modules for maintainability."
        testId="section-arch-quality"
      >
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="p-3 rounded-md bg-muted/30">
              <p className="text-xs font-medium text-foreground">Pass 1: Structural Analysis</p>
              <p className="text-xs text-muted-foreground mt-1">Validates code structure, bracket matching, function signatures, and module boundaries</p>
            </div>
            <div className="p-3 rounded-md bg-muted/30">
              <p className="text-xs font-medium text-foreground">Pass 2: React/JSX Validation</p>
              <p className="text-xs text-muted-foreground mt-1">Checks component structure, hook rules, JSX syntax, prop types, and rendering patterns</p>
            </div>
            <div className="p-3 rounded-md bg-muted/30">
              <p className="text-xs font-medium text-foreground">Pass 3: Import Resolution</p>
              <p className="text-xs text-muted-foreground mt-1">Validates import/export relationships, detects circular dependencies, resolves module paths</p>
            </div>
            <div className="p-3 rounded-md bg-muted/30">
              <p className="text-xs font-medium text-foreground">Pass 4: Completeness Check</p>
              <p className="text-xs text-muted-foreground mt-1">Identifies incomplete implementations, missing error handling, unfinished TODO markers</p>
            </div>
            <div className="p-3 rounded-md bg-muted/30 sm:col-span-2">
              <p className="text-xs font-medium text-foreground">Pass 5: LLM Cleanup</p>
              <p className="text-xs text-muted-foreground mt-1">Removes LLM artifacts (markdown fences, commentary, duplicate declarations) that local models sometimes inject</p>
            </div>
          </div>
        </div>
        <SubSystem title="Supporting Systems" items={[
          { name: "LiveSyntaxValidator", detail: "Real-time validation during streaming generation - catches errors as code is being produced" },
          { name: "CodeStyleEnforcer", detail: "Consistent formatting, naming conventions, and style compliance across generated files" },
          { name: "CodeDeduplication", detail: "Detects and removes duplicate code blocks that local models tend to generate" },
          { name: "ImportOptimizer", detail: "Resolves, deduplicates, and optimizes import statements across multi-file output" },
        ]} />
      </ArchSection>

      <ArchSection
        icon={Workflow}
        title="Closed-Loop Autonomous Systems"
        description="Multiple observation-action loops that detect, diagnose, and fix issues without human intervention. This is how LocalForge compensates for smaller model limitations."
        testId="section-arch-closed-loop"
      >
        <SubSystem title="Error Recovery" items={[
          { name: "ClosedLoopAutoFixService", detail: "Captures preview iframe errors, analyzes root cause, generates targeted fix prompts. Pre-refinement and post-refinement health checks auto-trigger healing before bugs compound." },
          { name: "AutoFixLoopService", detail: "Iterative fix cycles with escalating strategies. Tracks fix attempts to avoid infinite loops. Falls back to broader rewrite after 3 targeted attempts fail." },
          { name: "ErrorLearningService", detail: "Records error patterns and successful fixes. Builds a database of known issues and proven solutions for faster future resolution." },
          { name: "ErrorPreventionService", detail: "Proactively injects error-prevention instructions into generation prompts based on learned patterns from past failures." },
        ]} />
        <SubSystem title="Feedback & Validation" items={[
          { name: "RuntimeFeedbackService", detail: "Collects runtime signals (console errors, network failures, render crashes) from the preview iframe and feeds them back into the generation loop." },
          { name: "SelfTestingService", detail: "Generates comprehensive test suites, executes them via postMessage injection into the preview iframe, and provides real-time pass/fail progress." },
          { name: "SelfValidationService", detail: "Post-generation validation that checks code against the original requirements, flagging missing features or incorrect implementations." },
          { name: "FeedbackLoopService", detail: "Orchestrates the full observation-action cycle: generate, validate, capture errors, fix, re-validate until the code meets quality thresholds." },
        ]} />
      </ArchSection>

      <ArchSection
        icon={Boxes}
        title="Multi-Agent Architecture"
        description="Specialized agents that decompose complex tasks and coordinate across planning, coding, reviewing, and fixing phases."
        testId="section-arch-agents"
      >
        <SubSystem title="Orchestration" items={[
          { name: "Orchestrator", detail: "Central coordinator that routes requests through the generation pipeline. Manages mode selection (plan/build/discussion/design), prompt enhancement, and output parsing." },
          { name: "V2Orchestrator", detail: "Enhanced orchestration with feature manifests, sequential build pipelines, quality gates, and autonomous pipeline execution." },
          { name: "ProductionOrchestrator", detail: "Production-grade orchestration with security headers, rate limiting, Zod validation, and error boundaries." },
          { name: "DreamTeamService", detail: "Coordinates dual-model workflows: planner generates architecture/tasks, builder implements code, with automated handoff and context passing." },
        ]} />
        <SubSystem title="Task Management" items={[
          { name: "TaskDecompositionService", detail: "Breaks complex prompts into sequential sub-tasks with dependency ordering. Each task includes success criteria and quality gates." },
          { name: "SequentialBuildService", detail: "Executes build pipeline steps in order with quality validation between each step. Supports autonomous end-to-end execution." },
          { name: "PromptDecomposerService", detail: "Analyzes prompt complexity and decomposes requests for smaller models. Context window optimization merges small steps, splits oversized ones." },
          { name: "MultiStepReasoningService", detail: "Chain-of-thought reasoning for complex architectural decisions. Breaks down problems into reasoning steps before generating solutions." },
        ]} />
      </ArchSection>

      <ArchSection
        icon={Cpu}
        title="Parallel Execution Engine"
        description="Discovers and manages multiple local LLM instances for concurrent generation, with intelligent work distribution and role-based model assignment."
        testId="section-arch-parallel"
      >
        <SubSystem title="Model Pool Management" items={[
          { name: "ModelPoolManager", detail: "Discovers loaded models from LM Studio, manages concurrent model slots with checkout/return semantics. Supports role assignments: planner, builder, reviewer, any." },
          { name: "ParallelPipelineOrchestrator", detail: "Runs pipeline steps concurrently across multiple model instances. Features lookahead planning, concurrent quality analysis, and parallel file generation." },
          { name: "ParallelGenerationService", detail: "Distributes generation tasks across available model instances with load balancing. Collects and merges results with conflict resolution." },
          { name: "SpeculativeDecodingService", detail: "Uses smaller models for initial draft generation with larger models for verification, reducing overall inference time." },
        ]} />
      </ArchSection>

      <ArchSection
        icon={Target}
        title="Context Management"
        description="Intelligent context selection and optimization to maximize the value of limited context windows in local models."
        testId="section-arch-context"
      >
        <SubSystem title="Context Pipeline" items={[
          { name: "DependencyGraphService", detail: "Analyzes import/export relationships across all project files. Selects the most relevant files for refinement context based on dependency chains." },
          { name: "TwoPassContextService", detail: "First pass: identifies relevant file sections. Second pass: generates focused summaries. Reduces token usage by up to 70% while preserving critical context." },
          { name: "SmartContextService", detail: "Dynamically adjusts context inclusion based on task type, model capacity, and file relevance scoring." },
          { name: "ContextBudgetService", detail: "Allocates token budgets across system prompt, context files, conversation history, and generation space. Ensures prompts fit within model limits." },
          { name: "ContextPruningService", detail: "Removes irrelevant context when approaching token limits. Prioritizes recently modified files, imported dependencies, and user-referenced code." },
          { name: "ConversationCompressor", detail: "Summarizes long conversation histories to preserve critical decisions while freeing tokens for code context." },
        ]} />
      </ArchSection>

      <ArchSection
        icon={TrendingUp}
        title="Smart Model Routing"
        description="A 3-tier routing system that selects the optimal model for each task based on complexity, performance history, and availability."
        testId="section-arch-routing"
      >
        <SubSystem title="Routing Stack" items={[
          { name: "ModelRouterService", detail: "3-tier routing: Tier 1 (simple edits) uses fastest available model, Tier 2 (standard features) uses primary coding model, Tier 3 (complex architecture) uses reasoning model. Upgrades tier when success rate drops below 50%." },
          { name: "ModelProviderService", detail: "Unified interface for local (LM Studio) and cloud (OpenAI, Groq, Together AI) model providers. Handles connection pooling, timeout management, and failover." },
          { name: "AdaptiveTemperatureService", detail: "Adjusts temperature based on task type: low for code generation (0.1-0.3), medium for planning (0.4-0.6), higher for creative tasks (0.7-0.9)." },
          { name: "SmartRetryService", detail: "Retries failed generations with adjusted parameters: increased temperature, different prompt structure, or fallback to cloud model." },
        ]} />
      </ArchSection>

      <ArchSection
        icon={Gauge}
        title="Local LLM Optimization"
        description="Hardware-aware optimizations that maximize inference performance on consumer Mac hardware (M1-M4, 16GB+)."
        testId="section-arch-optimization"
      >
        <SubSystem title="Performance Systems" items={[
          { name: "HardwareOptimizer", detail: "Auto-detects CPU cores, memory, and Apple Silicon generation. Configures batch sizes, thread counts, and context lengths for optimal throughput." },
          { name: "KVCacheService", detail: "Manages key-value cache for faster subsequent completions within the same context window." },
          { name: "QuantizationDetector", detail: "Identifies model quantization level and adjusts generation parameters (temperature, top-p, repetition penalty) accordingly." },
          { name: "StreamingBudgetService", detail: "Monitors token generation rate and adjusts streaming parameters to prevent timeout on slower hardware." },
          { name: "HeapMonitorService", detail: "Periodic memory sampling with trend detection, peak tracking, and automatic warnings when approaching system limits." },
          { name: "LLMCacheService", detail: "Bounded LRU cache (10 entries) for LLM client connections with automatic eviction and connection pool cleanup on shutdown." },
        ]} />
        <SubSystem title="Connection Resilience" items={[
          { name: "ResilienceService", detail: "Circuit breaker pattern for LLM connections. Opens after consecutive failures, periodically tests recovery, auto-closes when service resumes." },
          { name: "Request Abort Controller", detail: "Timeout-based auto-abort (configurable, default 300s) prevents stuck requests from consuming resources indefinitely." },
          { name: "Graceful Shutdown", detail: "Cleans up LLM connection pool, destroys active streams, and tracks unhandled rejections with auto-shutdown after 10 failures in 60 seconds." },
        ]} />
      </ArchSection>

      <ArchSection
        icon={Microscope}
        title="Iterative Refinement Engine"
        description="Surgical code refinement that modifies only what's needed, with full dependency awareness and multi-file support."
        testId="section-arch-refinement"
      >
        <SubSystem title="Refinement Pipeline" items={[
          { name: "IterativeRefinementService", detail: "Regex-based intent classification generates surgical prompts. Detects whether the user wants to add, modify, fix, or restructure code and tailors the generation approach." },
          { name: "Multi-file Refinement", detail: "Parses LLM output for per-file changes using '// FILE:' / '// END FILE' markers. Updates all affected files simultaneously during refinement." },
          { name: "HealthCheckBeforeRefinement", detail: "Validates code integrity before making changes to prevent compounding bugs on already-broken code." },
          { name: "ProactiveRefactoringService", detail: "Identifies code smells and suggests refactoring opportunities during refinement, improving code quality over time." },
          { name: "RefactoringAgentService", detail: "Autonomous refactoring agent that can restructure, split, or merge files based on complexity and dependency analysis." },
        ]} />
      </ArchSection>

      <ArchSection
        icon={Database}
        title="Project Intelligence"
        description="Cross-session memory and state tracking that makes every generation smarter based on project history."
        testId="section-arch-project-intel"
      >
        <SubSystem title="State & Memory" items={[
          { name: "ProjectStateService", detail: "Tracks features, changes, health status, generation/refinement history per project across sessions. Provides context for intelligent refinement." },
          { name: "ProjectMemoryService", detail: "Persistent memory of architectural decisions, file structure, tech choices, and user preferences. Automatically injected into generation context." },
          { name: "ConversationMemoryService", detail: "Maintains conversation context with important decision points highlighted. Compresses old messages while preserving critical context." },
          { name: "FeatureManifest", detail: "Structured JSON feature lists with acceptance criteria generated from user prompts. Tracks feature completion status across generations." },
          { name: "StyleMemoryService", detail: "Remembers design choices (colors, fonts, component preferences) to maintain visual consistency across refinements." },
          { name: "UserPreferenceLearningService", detail: "Learns coding style preferences from user edits and feedback. Adjusts generation to match preferred patterns." },
        ]} />
      </ArchSection>

      <ArchSection
        icon={Cog}
        title="Production Infrastructure"
        description="Enterprise-grade infrastructure for security, deployment, analytics, and lifecycle management."
        testId="section-arch-infrastructure"
      >
        <SubSystem title="Security & Quality" items={[
          { name: "SecurityScanningService", detail: "Scans generated code for vulnerabilities: XSS vectors, SQL injection, hardcoded secrets, insecure dependencies." },
          { name: "APIContractValidationService", detail: "Validates API routes against schemas. Ensures request/response contracts are consistent across frontend and backend." },
          { name: "EnvDetectionService", detail: "Scans generated code for API keys and secrets. Provides setup instructions and warns about hardcoded credentials." },
          { name: "AccessibilityCheckerService", detail: "Validates generated UI code for WCAG compliance: alt text, ARIA labels, color contrast, keyboard navigation." },
        ]} />
        <SubSystem title="Deployment & Lifecycle" items={[
          { name: "DeployPackageService", detail: "Generates platform-specific deployment configurations for Vercel, Netlify, Docker, Railway, and static HTML bundles." },
          { name: "HooksService", detail: "User-configurable lifecycle automation with events (pre-generate, post-generate, on-error) and actions (health-check, auto-fix, custom scripts)." },
          { name: "GenerationCheckpointService", detail: "Auto-saves checkpoints during generation. Enables rollback to any previous state with full code and metadata history." },
          { name: "AutoDocumentationService", detail: "Generates README.md, API documentation, and component documentation from generated code structure." },
        ]} />
      </ArchSection>

      <Card className="overflow-visible" data-testid="section-arch-tech-stack">
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Code className="h-5 w-5 text-foreground" />
            <h2 className="text-lg font-semibold text-foreground">Tech Stack</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">Frontend</h3>
              <div className="flex flex-wrap gap-1.5">
                {["React 18", "TypeScript", "Vite", "Tailwind CSS", "Shadcn UI", "Monaco Editor", "TanStack Query", "esbuild-wasm", "Wouter"].map(t => (
                  <Badge key={t} variant="secondary">{t}</Badge>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">Backend</h3>
              <div className="flex flex-wrap gap-1.5">
                {["Node.js", "Express.js", "PostgreSQL", "Drizzle ORM", "OpenAI SDK", "SSE Streaming", "Zod Validation"].map(t => (
                  <Badge key={t} variant="secondary">{t}</Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function DocumentationPage({ onBack }: DocumentationPageProps) {
  const [activeTab, setActiveTab] = useState("guide");

  return (
    <div className="p-6 max-w-[800px] mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            data-testid="button-docs-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-semibold text-foreground" data-testid="text-docs-title">
            Documentation
          </h1>
        </div>
        <ThemeToggle />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="guide" className="gap-2" data-testid="tab-docs-guide">
            <BookOpen className="h-4 w-4" />
            Guide
          </TabsTrigger>
          <TabsTrigger value="architecture" className="gap-2" data-testid="tab-docs-architecture">
            <Network className="h-4 w-4" />
            Architecture
          </TabsTrigger>
        </TabsList>

        <TabsContent value="guide">
          <GuideTab />
        </TabsContent>

        <TabsContent value="architecture">
          <ArchitectureTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
