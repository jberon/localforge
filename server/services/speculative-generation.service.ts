import { BaseService, ManagedMap } from "../lib/base-service";
import { modelPoolManager } from "./model-pool-manager.service";

interface SpeculativeConfig {
  enabled: boolean;
  candidateCount: number;
  qualityThreshold: number;
  diversityMode: "temperature" | "model" | "prompt";
  temperatureRange: [number, number];
  timeoutMs: number;
  autoSelectBest: boolean;
}

interface CandidateMetrics {
  syntaxErrors: number;
  typeErrors: number;
  importIssues: number;
  completeness: number;
  codeLines: number;
  tokensUsed: number;
  durationMs: number;
}

interface GenerationCandidate {
  id: string;
  model: string;
  temperature: number;
  promptVariant: string;
  generatedCode: string;
  qualityScore: number;
  metrics: CandidateMetrics;
  rank: number;
  selected: boolean;
}

interface SpeculativeResult {
  id: string;
  candidates: GenerationCandidate[];
  selectedCandidate: GenerationCandidate | null;
  totalDurationMs: number;
  speedup: number;
  diversityScore: number;
  qualityImprovement: number;
}

interface SpeculativeSession {
  id: string;
  config: SpeculativeConfig;
  prompt: string;
  result: SpeculativeResult | null;
  startedAt: number;
  completedAt: number | null;
  status: "pending" | "generating" | "evaluating" | "completed" | "failed";
}

interface GenerateCodeResult {
  code: string;
  tokensUsed: number;
  durationMs: number;
}

const DEFAULT_CONFIG: SpeculativeConfig = {
  enabled: false,
  candidateCount: 3,
  qualityThreshold: 50,
  diversityMode: "temperature",
  temperatureRange: [0.3, 0.9] as [number, number],
  timeoutMs: 120000,
  autoSelectBest: true,
};

const PROMPT_EMPHASES = [
  "Focus on code quality and best practices.",
  "Focus on completeness and handling all edge cases.",
  "Focus on simplicity and readability.",
  "Focus on performance and efficiency.",
  "Focus on type safety and error handling.",
];

const MODEL_TIERS: Record<string, string[]> = {
  fast: ["qwen2.5-coder-1.5b", "deepseek-coder-1.3b", "codellama-7b"],
  balanced: ["qwen2.5-coder-7b", "deepseek-coder-6.7b", "codellama-13b"],
  powerful: ["qwen2.5-coder-32b", "deepseek-coder-33b", "codellama-34b"],
};

class SpeculativeGenerationService extends BaseService {
  private static instance: SpeculativeGenerationService;
  private config: SpeculativeConfig = { ...DEFAULT_CONFIG };
  private sessions: ManagedMap<string, SpeculativeSession>;

  private constructor() {
    super("SpeculativeGenerationService");
    this.sessions = this.createManagedMap<string, SpeculativeSession>({
      maxSize: 100,
      strategy: "lru",
    });
  }

  static getInstance(): SpeculativeGenerationService {
    if (!SpeculativeGenerationService.instance) {
      SpeculativeGenerationService.instance =
        new SpeculativeGenerationService();
    }
    return SpeculativeGenerationService.instance;
  }

  configure(config: Partial<SpeculativeConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.config.candidateCount < 2) this.config.candidateCount = 2;
    if (this.config.candidateCount > 5) this.config.candidateCount = 5;
    if (this.config.qualityThreshold < 0) this.config.qualityThreshold = 0;
    if (this.config.qualityThreshold > 100) this.config.qualityThreshold = 100;
    this.log("Configuration updated", {
      config: this.config,
    });
  }

  getConfig(): SpeculativeConfig {
    return { ...this.config };
  }

  async generate(
    prompt: string,
    context?: string
  ): Promise<SpeculativeResult> {
    const sessionId = `spec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const startTime = Date.now();

    const session: SpeculativeSession = {
      id: sessionId,
      config: { ...this.config },
      prompt,
      result: null,
      startedAt: startTime,
      completedAt: null,
      status: "pending",
    };
    this.sessions.set(sessionId, session);

    this.log("Starting speculative generation", {
      sessionId,
      candidateCount: this.config.candidateCount,
      diversityMode: this.config.diversityMode,
    });

    try {
      session.status = "generating";

      const candidateRequests = this.buildCandidateRequests(prompt, context);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Generation timeout")),
          this.config.timeoutMs
        );
      });

      const settledResults = await Promise.race([
        Promise.allSettled(
          candidateRequests.map((req) =>
            this.generateCode(req.fullPrompt, req.model, req.temperature)
          )
        ),
        timeoutPromise.then(() => [] as PromiseSettledResult<GenerateCodeResult>[]),
      ]);

      session.status = "evaluating";

      const candidates: GenerationCandidate[] = [];
      for (let i = 0; i < candidateRequests.length; i++) {
        const req = candidateRequests[i];
        const settled = settledResults[i];

        let code = "";
        let tokensUsed = 0;
        let durationMs = 0;

        if (settled && settled.status === "fulfilled") {
          code = settled.value.code;
          tokensUsed = settled.value.tokensUsed;
          durationMs = settled.value.durationMs;
        } else if (settled && settled.status === "rejected") {
          this.logWarn("Candidate generation failed", {
            index: i,
            error:
              settled.reason instanceof Error
                ? settled.reason.message
                : String(settled.reason),
          });
        }

        const metrics = this.evaluateCandidate(code);
        metrics.tokensUsed = tokensUsed;
        metrics.durationMs = durationMs;

        const qualityScore = this.computeQualityScore(metrics);

        candidates.push({
          id: `cand_${sessionId}_${i}`,
          model: req.model,
          temperature: req.temperature,
          promptVariant: req.variant,
          generatedCode: code,
          qualityScore,
          metrics,
          rank: 0,
          selected: false,
        });
      }

      candidates.sort((a, b) => b.qualityScore - a.qualityScore);
      for (let i = 0; i < candidates.length; i++) {
        candidates[i].rank = i + 1;
      }

      let selectedCandidate: GenerationCandidate | null = null;
      if (this.config.autoSelectBest && candidates.length > 0) {
        const best = candidates[0];
        if (best.qualityScore >= this.config.qualityThreshold) {
          best.selected = true;
          selectedCandidate = best;
        } else {
          this.logWarn("Best candidate below quality threshold", {
            bestScore: best.qualityScore,
            threshold: this.config.qualityThreshold,
          });
        }
      }

      const diversityScore = this.calculateDiversityScore(candidates);

      const scores = candidates.map((c) => c.qualityScore);
      const bestScore = Math.max(...scores);
      const worstScore = Math.min(...scores);
      const qualityImprovement =
        worstScore > 0
          ? Math.round(((bestScore - worstScore) / worstScore) * 100)
          : bestScore > 0
            ? 100
            : 0;

      const totalDurationMs = Date.now() - startTime;
      const totalSequentialMs = candidates.reduce(
        (sum, c) => sum + c.metrics.durationMs,
        0
      );
      const speedup =
        totalDurationMs > 0
          ? Math.round((totalSequentialMs / totalDurationMs) * 100) / 100
          : 1;

      const result: SpeculativeResult = {
        id: sessionId,
        candidates,
        selectedCandidate,
        totalDurationMs,
        speedup,
        diversityScore,
        qualityImprovement,
      };

      session.result = result;
      session.status = "completed";
      session.completedAt = Date.now();

      this.log("Speculative generation completed", {
        sessionId,
        candidateCount: candidates.length,
        bestScore: candidates[0]?.qualityScore ?? 0,
        diversityScore,
        qualityImprovement,
        speedup,
        totalDurationMs,
      });

      return result;
    } catch (error) {
      session.status = "failed";
      session.completedAt = Date.now();
      this.logError("Speculative generation failed", {
        sessionId,
        error:
          error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private buildCandidateRequests(
    prompt: string,
    context?: string
  ): Array<{
    fullPrompt: string;
    model: string;
    temperature: number;
    variant: string;
  }> {
    const count = this.config.candidateCount;
    const requests: Array<{
      fullPrompt: string;
      model: string;
      temperature: number;
      variant: string;
    }> = [];

    const basePrompt = context ? `${context}\n\n${prompt}` : prompt;
    const defaultModel = "default";

    switch (this.config.diversityMode) {
      case "temperature": {
        const [minTemp, maxTemp] = this.config.temperatureRange;
        for (let i = 0; i < count; i++) {
          const temperature =
            count === 1
              ? minTemp
              : minTemp + (maxTemp - minTemp) * (i / (count - 1));
          requests.push({
            fullPrompt: basePrompt,
            model: defaultModel,
            temperature: Math.round(temperature * 100) / 100,
            variant: `temperature_${Math.round(temperature * 100) / 100}`,
          });
        }
        break;
      }

      case "model": {
        const tierNames = Object.keys(MODEL_TIERS);
        for (let i = 0; i < count; i++) {
          const tierIndex = i % tierNames.length;
          const tier = tierNames[tierIndex];
          const models = MODEL_TIERS[tier];
          const model = models[0];
          requests.push({
            fullPrompt: basePrompt,
            model,
            temperature: 0.6,
            variant: `model_${tier}_${model}`,
          });
        }
        break;
      }

      case "prompt": {
        for (let i = 0; i < count; i++) {
          const emphasis = PROMPT_EMPHASES[i % PROMPT_EMPHASES.length];
          requests.push({
            fullPrompt: `${emphasis}\n\n${basePrompt}`,
            model: defaultModel,
            temperature: 0.6,
            variant: `prompt_emphasis_${i}`,
          });
        }
        break;
      }
    }

    return requests;
  }

  private async generateCode(
    prompt: string,
    model: string,
    temperature: number
  ): Promise<GenerateCodeResult> {
    const startTime = Date.now();

    try {
      const checkout = modelPoolManager.checkoutImmediate("builder", model !== "default" ? model : undefined);

      if (checkout) {
        try {
          const response = await checkout.client.chat.completions.create({
            model: checkout.model,
            messages: [
              {
                role: "system",
                content:
                  "You are a code generation assistant. Generate clean, well-structured code based on the prompt.",
              },
              { role: "user", content: prompt },
            ],
            temperature,
            max_tokens: 4096,
          });

          const code = response.choices?.[0]?.message?.content ?? "";
          const tokensUsed = response.usage?.total_tokens ?? 0;

          checkout.release();

          return {
            code,
            tokensUsed,
            durationMs: Date.now() - startTime,
          };
        } catch (err) {
          checkout.release();
          this.logWarn("Pool slot generation failed, trying direct fetch", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.config.timeoutMs
      );

      try {
        const response = await fetch(
          "http://localhost:1234/v1/chat/completions",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: model !== "default" ? model : "default",
              messages: [
                {
                  role: "system",
                  content:
                    "You are a code generation assistant. Generate clean, well-structured code based on the prompt.",
                },
                { role: "user", content: prompt },
              ],
              temperature,
              max_tokens: 4096,
            }),
            signal: controller.signal,
          }
        );

        clearTimeout(timeout);

        if (!response.ok) {
          this.logWarn("Direct LLM fetch failed", {
            status: response.status,
          });
          return { code: "", tokensUsed: 0, durationMs: Date.now() - startTime };
        }

        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { total_tokens?: number };
        };
        const code = data.choices?.[0]?.message?.content ?? "";
        const tokensUsed = data.usage?.total_tokens ?? 0;

        return {
          code,
          tokensUsed,
          durationMs: Date.now() - startTime,
        };
      } catch (fetchErr) {
        clearTimeout(timeout);
        this.logWarn("Direct LLM fetch error", {
          error:
            fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
        });
        return { code: "", tokensUsed: 0, durationMs: Date.now() - startTime };
      }
    } catch (outerErr) {
      this.logError("generateCode unexpected error", {
        error:
          outerErr instanceof Error ? outerErr.message : String(outerErr),
      });
      return { code: "", tokensUsed: 0, durationMs: Date.now() - startTime };
    }
  }

  private evaluateCandidate(code: string): CandidateMetrics {
    if (!code || code.trim().length === 0) {
      return {
        syntaxErrors: 0,
        typeErrors: 0,
        importIssues: 0,
        completeness: 0,
        codeLines: 0,
        tokensUsed: 0,
        durationMs: 0,
      };
    }

    const syntaxErrors = this.countSyntaxErrors(code);
    const typeErrors = this.countTypeErrors(code);
    const importIssues = this.countImportIssues(code);
    const completeness = this.measureCompleteness(code);
    const codeLines = code.split("\n").filter((l) => l.trim().length > 0).length;

    return {
      syntaxErrors,
      typeErrors,
      importIssues,
      completeness,
      codeLines,
      tokensUsed: 0,
      durationMs: 0,
    };
  }

  private countSyntaxErrors(code: string): number {
    let errors = 0;

    const openParens = (code.match(/\(/g) || []).length;
    const closeParens = (code.match(/\)/g) || []).length;
    if (openParens !== closeParens) errors++;

    const openBrackets = (code.match(/\[/g) || []).length;
    const closeBrackets = (code.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) errors++;

    const openBraces = (code.match(/\{/g) || []).length;
    const closeBraces = (code.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) errors++;

    const lines = code.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.length > 0 &&
        !trimmed.endsWith("{") &&
        !trimmed.endsWith("}") &&
        !trimmed.endsWith(",") &&
        !trimmed.endsWith("(") &&
        !trimmed.endsWith(")") &&
        !trimmed.endsWith(";") &&
        !trimmed.endsWith(":") &&
        !trimmed.endsWith("*/") &&
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("*") &&
        !trimmed.startsWith("/*") &&
        !trimmed.startsWith("import ") &&
        !trimmed.startsWith("export ") &&
        /^(const|let|var|return|if|else|for|while|switch|case|break|continue|throw|try|catch|finally)\b/.test(
          trimmed
        ) &&
        !trimmed.endsWith("{") &&
        !trimmed.endsWith(";")
      ) {
        errors++;
      }
    }

    return errors;
  }

  private countTypeErrors(code: string): number {
    let errors = 0;

    const asAnyMatches = code.match(/\bas\s+any\b/g);
    if (asAnyMatches) errors += asAnyMatches.length;

    const anyTypeMatches = code.match(/:\s*any\b/g);
    if (anyTypeMatches) errors += anyTypeMatches.length;

    return errors;
  }

  private countImportIssues(code: string): number {
    let issues = 0;
    const lines = code.split("\n");
    const importedNames = new Set<string>();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("import ")) continue;

      if (trimmed.includes("import ") && !trimmed.includes("from")) {
        if (!trimmed.includes("import type") && !trimmed.endsWith(";")) {
          issues++;
        }
      }

      const namedMatch = trimmed.match(
        /import\s*\{([^}]+)\}\s*from/
      );
      if (namedMatch) {
        const names = namedMatch[1].split(",").map((n) => n.trim());
        for (const name of names) {
          const cleanName = name.replace(/\s+as\s+\w+/, "").trim();
          if (cleanName && importedNames.has(cleanName)) {
            issues++;
          }
          if (cleanName) importedNames.add(cleanName);
        }
      }
    }

    return issues;
  }

  private measureCompleteness(code: string): number {
    let score = 100;

    const todoCount = (code.match(/\bTODO\b/gi) || []).length;
    const fixmeCount = (code.match(/\bFIXME\b/gi) || []).length;
    score -= (todoCount + fixmeCount) * 5;

    const emptyBodyMatches = code.match(/\{[\s\n]*\}/g);
    if (emptyBodyMatches) {
      score -= emptyBodyMatches.length * 10;
    }

    const notImplementedCount = (
      code.match(/throw new Error\(['"]not implemented['"]\)/gi) || []
    ).length;
    score -= notImplementedCount * 15;

    const ellipsisCount = (code.match(/\.\.\./g) || []).length;
    const spreadUsage = (code.match(/\.\.\.[\w]/g) || []).length;
    const standaloneEllipsis = ellipsisCount - spreadUsage;
    if (standaloneEllipsis > 0) {
      score -= standaloneEllipsis * 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  private computeQualityScore(metrics: CandidateMetrics): number {
    if (metrics.codeLines === 0) return 0;

    let score = metrics.completeness;

    score -= metrics.syntaxErrors * 10;
    score -= metrics.typeErrors * 5;
    score -= metrics.importIssues * 3;

    if (metrics.codeLines > 5) score += 5;
    if (metrics.codeLines > 20) score += 5;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private calculateDiversityScore(candidates: GenerationCandidate[]): number {
    if (candidates.length < 2) return 0;

    const codes = candidates.map((c) => c.generatedCode);
    let totalSimilarity = 0;
    let pairCount = 0;

    for (let i = 0; i < codes.length; i++) {
      for (let j = i + 1; j < codes.length; j++) {
        totalSimilarity += this.jaccardTrigramSimilarity(codes[i], codes[j]);
        pairCount++;
      }
    }

    if (pairCount === 0) return 0;

    const avgSimilarity = totalSimilarity / pairCount;
    return Math.round((1 - avgSimilarity) * 1000) / 1000;
  }

  private jaccardTrigramSimilarity(a: string, b: string): number {
    if (!a && !b) return 1;
    if (!a || !b) return 0;

    const trigramsA = this.getTrigrams(a);
    const trigramsB = this.getTrigrams(b);

    if (trigramsA.size === 0 && trigramsB.size === 0) return 1;
    if (trigramsA.size === 0 || trigramsB.size === 0) return 0;

    let intersection = 0;
    const arrA = Array.from(trigramsA);
    for (let i = 0; i < arrA.length; i++) {
      if (trigramsB.has(arrA[i])) intersection++;
    }

    const union = trigramsA.size + trigramsB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  private getTrigrams(text: string): Set<string> {
    const normalized = text.replace(/\s+/g, " ").trim();
    const trigrams = new Set<string>();
    for (let i = 0; i <= normalized.length - 3; i++) {
      trigrams.add(normalized.substring(i, i + 3));
    }
    return trigrams;
  }

  selectCandidate(
    sessionId: string,
    candidateId: string
  ): GenerationCandidate | null {
    const session = this.sessions.get(sessionId);
    if (!session || !session.result) {
      this.logWarn("Session not found or no result", { sessionId });
      return null;
    }

    for (const candidate of session.result.candidates) {
      candidate.selected = false;
    }

    const target = session.result.candidates.find(
      (c) => c.id === candidateId
    );
    if (!target) {
      this.logWarn("Candidate not found", { sessionId, candidateId });
      return null;
    }

    target.selected = true;
    session.result.selectedCandidate = target;

    this.log("Candidate manually selected", {
      sessionId,
      candidateId,
      rank: target.rank,
      qualityScore: target.qualityScore,
    });

    return target;
  }

  getSession(sessionId: string): SpeculativeSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  getRecentSessions(limit: number = 10): SpeculativeSession[] {
    const allSessions = this.sessions.values();
    return allSessions
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  }

  getStats(): {
    totalSessions: number;
    avgCandidateCount: number;
    avgQualityImprovement: number;
    avgDiversityScore: number;
    selectionDistribution: Record<number, number>;
  } {
    const completedSessions = this.sessions
      .values()
      .filter((s) => s.status === "completed" && s.result);

    const totalSessions = completedSessions.length;

    if (totalSessions === 0) {
      return {
        totalSessions: 0,
        avgCandidateCount: 0,
        avgQualityImprovement: 0,
        avgDiversityScore: 0,
        selectionDistribution: {},
      };
    }

    let totalCandidates = 0;
    let totalQualityImprovement = 0;
    let totalDiversity = 0;
    const selectionDistribution: Record<number, number> = {};

    for (const session of completedSessions) {
      const result = session.result;
      if (!result) continue;

      totalCandidates += result.candidates.length;
      totalQualityImprovement += result.qualityImprovement;
      totalDiversity += result.diversityScore;

      if (result.selectedCandidate) {
        const rank = result.selectedCandidate.rank;
        selectionDistribution[rank] =
          (selectionDistribution[rank] || 0) + 1;
      }
    }

    return {
      totalSessions,
      avgCandidateCount:
        Math.round((totalCandidates / totalSessions) * 10) / 10,
      avgQualityImprovement:
        Math.round((totalQualityImprovement / totalSessions) * 10) / 10,
      avgDiversityScore:
        Math.round((totalDiversity / totalSessions) * 1000) / 1000,
      selectionDistribution,
    };
  }

  destroy(): void {
    this.sessions.clear();
    this.log("SpeculativeGenerationService destroyed");
  }
}

export const speculativeGenerationService =
  SpeculativeGenerationService.getInstance();
