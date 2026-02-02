export type RequestIntent = "plan" | "build" | "refine" | "question";

interface ClassificationResult {
  intent: RequestIntent;
  confidence: number;
  reasoning: string;
}

const PLANNING_PATTERNS = [
  /\b(plan|design|architect|structure|organize|outline|strategy|approach)\b/i,
  /\b(how should|what's the best way|how would you|how do i|what approach)\b/i,
  /\b(think through|figure out|decide|consider|evaluate)\b/i,
  /\b(before (we|i) (build|start|begin)|first.*then)\b/i,
  /\b(help me (plan|think|design|understand))\b/i,
];

const BUILDING_PATTERNS = [
  /\b(build|create|make|generate|develop|implement|code)\b/i,
  /\b(i (want|need) a|give me|show me)\b/i,
  /\b(set up|setup|initialize|bootstrap)\b/i,
  /\b(add|integrate|include)\b.*\b(feature|component|page)\b/i,
];

const REFINEMENT_PATTERNS = [
  /\b(change|modify|update|fix|improve|enhance|tweak|adjust)\b/i,
  /\b(make it|can you|could you)\b.*\b(bigger|smaller|different|better)\b/i,
  /\b(add|remove|replace)\b.*\b(to|from|in|the)\b/i,
  /\b(dark mode|light mode|responsive|mobile)\b/i,
];

const QUESTION_PATTERNS = [
  /^(what|why|how|when|where|who|which|can|could|would|should|is|are|do|does)\b/i,
  /\?$/,
  /\b(explain|tell me|describe|what is)\b/i,
];

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.filter(p => p.test(text)).length;
}

export function classifyRequest(prompt: string): ClassificationResult {
  const normalizedPrompt = prompt.trim().toLowerCase();
  
  const planScore = countMatches(normalizedPrompt, PLANNING_PATTERNS);
  const buildScore = countMatches(normalizedPrompt, BUILDING_PATTERNS);
  const refineScore = countMatches(normalizedPrompt, REFINEMENT_PATTERNS);
  const questionScore = countMatches(normalizedPrompt, QUESTION_PATTERNS);
  
  const totalScore = planScore + buildScore + refineScore + questionScore;
  
  if (totalScore === 0) {
    return {
      intent: "build",
      confidence: 0.5,
      reasoning: "No strong indicators found, defaulting to build",
    };
  }
  
  const scores = [
    { intent: "plan" as RequestIntent, score: planScore },
    { intent: "build" as RequestIntent, score: buildScore },
    { intent: "refine" as RequestIntent, score: refineScore },
    { intent: "question" as RequestIntent, score: questionScore },
  ];
  
  scores.sort((a, b) => b.score - a.score);
  const winner = scores[0];
  const runnerUp = scores[1];
  
  if (winner.score === runnerUp.score && winner.intent !== "build") {
    return {
      intent: "build",
      confidence: 0.6,
      reasoning: "Tie between intents, defaulting to build",
    };
  }
  
  const confidence = winner.score / Math.max(totalScore, 1);
  
  return {
    intent: winner.intent,
    confidence: Math.min(confidence + 0.3, 1.0),
    reasoning: `Detected ${winner.score} ${winner.intent} indicators`,
  };
}

export function shouldUsePlanner(prompt: string, hasExistingCode: boolean): boolean {
  const result = classifyRequest(prompt);
  
  if (result.intent === "plan") {
    return true;
  }
  
  if (result.intent === "refine" && hasExistingCode) {
    return false;
  }
  
  if (result.intent === "build" && prompt.length > 200) {
    return true;
  }
  
  if (result.intent === "question") {
    return true;
  }
  
  return false;
}

export function getIntentDescription(intent: RequestIntent): string {
  switch (intent) {
    case "plan":
      return "Planning with reasoning model";
    case "build":
      return "Building with code model";
    case "refine":
      return "Refining existing code";
    case "question":
      return "Analyzing with reasoning model";
  }
}
