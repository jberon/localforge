import logger from "../lib/logger";

export interface DiscussionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  suggestions?: string[];
  canApply?: boolean;
}

export interface DiscussionSession {
  id: string;
  projectId: string;
  messages: DiscussionMessage[];
  createdAt: Date;
  lastActiveAt: Date;
  summary?: string;
}

export interface DiscussionAnalysis {
  hasActionableIdeas: boolean;
  suggestedPrompt?: string;
  keyDecisions: string[];
  technologies: string[];
  features: string[];
}

interface IntentClassification {
  intent: "discuss" | "build" | "plan" | "question";
  confidence: number;
  reason: string;
}

const BUILD_INTENT_PATTERNS = [
  /\b(build|create|make|implement|code|generate|write|add|develop)\b.*\b(this|it|that|now|the)\b/i,
  /\blet'?s\s+(build|start|go|do it|make it|code)\b/i,
  /\bgo ahead\b/i,
  /\bstart (building|coding|implementing)\b/i,
  /\bapply (this|these|the)\b/i,
  /\bconvert.*to code\b/i,
];

const DISCUSS_INTENT_PATTERNS = [
  /\b(what if|how about|could we|should we|maybe|perhaps|consider|think about|explore|brainstorm)\b/i,
  /\b(pros and cons|trade-?offs?|advantages|disadvantages|compare|versus|vs)\b/i,
  /\b(approach|strategy|architecture|design|plan|idea|concept|opinion)\b/i,
  /\bwhat do you (think|suggest|recommend)\b/i,
  /\b(is it better|which is better|best way)\b/i,
  /\bhow would you\b/i,
];

const DISCUSSION_SYSTEM_PROMPT = `You are a senior software architect and brainstorming partner. You are in DISCUSSION MODE - this means you are helping the user think through ideas, explore approaches, and make decisions WITHOUT writing any code or modifying any files.

Your role:
- Brainstorm ideas and explore possibilities
- Analyze trade-offs between different approaches  
- Suggest architectures, technologies, and patterns
- Ask clarifying questions to refine the user's vision
- Help prioritize features and plan implementation order
- Provide honest assessments of feasibility and complexity

Rules:
- Do NOT write code snippets or implementation details
- Do NOT suggest specific file changes
- Focus on high-level concepts, strategies, and decisions
- Be conversational and collaborative
- When the user seems ready to build, suggest switching to Build mode
- End your responses with 1-3 actionable next steps or questions

Format your responses with clear structure:
- Use **bold** for key points
- Use bullet points for lists
- Keep responses focused and concise`;

class DiscussionModeService {
  private static instance: DiscussionModeService;
  private sessions: Map<string, DiscussionSession> = new Map();
  private maxSessions = 200;
  private maxMessagesPerSession = 100;
  private sessionTTLMs = 24 * 60 * 60 * 1000;

  private constructor() {
    logger.info("DiscussionModeService initialized");
    this.startCleanupInterval();
  }

  static getInstance(): DiscussionModeService {
    if (!DiscussionModeService.instance) {
      DiscussionModeService.instance = new DiscussionModeService();
    }
    return DiscussionModeService.instance;
  }

  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

  private startCleanupInterval(): void {
    this.cleanupIntervalId = setInterval(() => this.evictStaleSessions(), 10 * 60 * 1000);
  }

  private evictStaleSessions(): void {
    const now = Date.now();
    let evicted = 0;
    for (const [id, session] of Array.from(this.sessions.entries())) {
      if (now - session.lastActiveAt.getTime() > this.sessionTTLMs) {
        this.sessions.delete(id);
        evicted++;
      }
    }
    if (evicted > 0) {
      logger.info("Evicted stale discussion sessions", { evicted, remaining: this.sessions.size });
    }

    if (this.sessions.size > this.maxSessions) {
      const sorted = Array.from(this.sessions.entries()).sort(
        (a, b) => a[1].lastActiveAt.getTime() - b[1].lastActiveAt.getTime()
      );
      const toRemove = sorted.slice(0, this.sessions.size - this.maxSessions);
      for (const [id] of toRemove) {
        this.sessions.delete(id);
      }
    }
  }

  getOrCreateSession(projectId: string): DiscussionSession {
    const existingKey = Array.from(this.sessions.entries()).find(
      ([, s]) => s.projectId === projectId
    );
    if (existingKey) {
      return existingKey[1];
    }

    const session: DiscussionSession = {
      id: `disc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      projectId,
      messages: [],
      createdAt: new Date(),
      lastActiveAt: new Date(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  getSession(sessionId: string): DiscussionSession | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionByProject(projectId: string): DiscussionSession | undefined {
    return Array.from(this.sessions.values()).find(s => s.projectId === projectId);
  }

  addMessage(sessionId: string, role: "user" | "assistant", content: string, options?: { suggestions?: string[]; canApply?: boolean }): DiscussionMessage {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Discussion session ${sessionId} not found`);
    }

    const message: DiscussionMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      role,
      content,
      timestamp: new Date(),
      suggestions: options?.suggestions,
      canApply: options?.canApply,
    };

    session.messages.push(message);
    session.lastActiveAt = new Date();

    if (session.messages.length > this.maxMessagesPerSession) {
      session.messages = session.messages.slice(-this.maxMessagesPerSession);
    }

    return message;
  }

  classifyIntent(message: string): IntentClassification {
    let buildScore = 0;
    let discussScore = 0;

    for (const pattern of BUILD_INTENT_PATTERNS) {
      if (pattern.test(message)) buildScore += 2;
    }

    for (const pattern of DISCUSS_INTENT_PATTERNS) {
      if (pattern.test(message)) discussScore += 2;
    }

    if (message.endsWith("?")) discussScore += 1;
    if (message.length < 30 && /^(yes|no|ok|sure|do it|go|build)$/i.test(message.trim())) {
      buildScore += 3;
    }

    const total = buildScore + discussScore || 1;

    if (buildScore > discussScore && buildScore >= 3) {
      return {
        intent: "build",
        confidence: buildScore / total,
        reason: "Message indicates readiness to build or implement",
      };
    }

    return {
      intent: "discuss",
      confidence: Math.max(0.5, discussScore / total),
      reason: discussScore > 0 ? "Message is exploratory or seeking input" : "Default discussion context",
    };
  }

  analyzeConversation(sessionId: string): DiscussionAnalysis {
    const session = this.sessions.get(sessionId);
    if (!session || session.messages.length === 0) {
      return {
        hasActionableIdeas: false,
        keyDecisions: [],
        technologies: [],
        features: [],
      };
    }

    const allText = session.messages.map(m => m.content).join(" ");

    const techPatterns = /\b(React|Vue|Angular|Next\.?js|Express|Node|PostgreSQL|MongoDB|Redis|GraphQL|REST|TypeScript|Tailwind|Prisma|Drizzle|Supabase|Firebase|Docker|AWS|Vercel|Stripe|OAuth|JWT|WebSocket)\b/gi;
    const technologies = Array.from(new Set((allText.match(techPatterns) || []).map(t => t.toLowerCase())));

    const featurePatterns = /\b(authentication|dashboard|chat|notifications?|search|payments?|file upload|analytics|admin panel|user profile|settings|api|database|real-?time|messaging|blog|landing page|onboarding)\b/gi;
    const features = Array.from(new Set((allText.match(featurePatterns) || []).map(f => f.toLowerCase())));

    const decisionPatterns = /\b(decided|let's go with|we'll use|agreed|the plan is|we should)\b[^.!?]*/gi;
    const keyDecisions = (allText.match(decisionPatterns) || []).slice(0, 5);

    const hasActionableIdeas = features.length >= 2 || technologies.length >= 2 || keyDecisions.length >= 1;

    let suggestedPrompt: string | undefined;
    if (hasActionableIdeas) {
      const featureList = features.slice(0, 5).join(", ");
      const techList = technologies.slice(0, 3).join(", ");
      suggestedPrompt = `Build an application with ${featureList}${techList ? ` using ${techList}` : ""}`;
    }

    return {
      hasActionableIdeas,
      suggestedPrompt,
      keyDecisions,
      technologies,
      features,
    };
  }

  getSystemPrompt(): string {
    return DISCUSSION_SYSTEM_PROMPT;
  }

  buildContextMessages(sessionId: string): Array<{ role: string; content: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return session.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
  }

  clearSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  clearProjectSession(projectId: string): boolean {
    const session = this.getSessionByProject(projectId);
    if (session) {
      return this.sessions.delete(session.id);
    }
    return false;
  }

  getStats(): { activeSessions: number; totalMessages: number } {
    let totalMessages = 0;
    for (const session of Array.from(this.sessions.values())) {
      totalMessages += session.messages.length;
    }
    return { activeSessions: this.sessions.size, totalMessages };
  }

  destroy(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    this.sessions.clear();
    logger.info("DiscussionModeService destroyed");
  }
}

export const discussionModeService = DiscussionModeService.getInstance();
