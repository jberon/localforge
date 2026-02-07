import { BaseService, ManagedMap } from "../lib/base-service";

interface RefinementClassification {
  type: 'style' | 'add-feature' | 'modify-behavior' | 'fix-bug' | 'remove' | 'restructure' | 'full-regeneration';
  confidence: number;
  targetElements: string[];
  description: string;
  suggestedApproach: 'surgical' | 'section-rewrite' | 'full-rewrite';
}

interface ChangeDescription {
  type: 'modified' | 'added' | 'removed';
  location: string;
  description: string;
}

interface RefinementResult {
  code: string;
  changesApplied: ChangeDescription[];
  linesModified: number;
  linesAdded: number;
  linesRemoved: number;
}

interface RefinementHistory {
  projectId: string;
  refinements: Array<{
    id: string;
    timestamp: number;
    userMessage: string;
    classification: RefinementClassification;
    changesApplied: number;
    success: boolean;
  }>;
}

const CLASSIFICATION_RULES: Array<{
  type: RefinementClassification['type'];
  patterns: RegExp[];
  approach: RefinementClassification['suggestedApproach'];
}> = [
  {
    type: 'style',
    patterns: [
      /\b(color|font|size|padding|margin|border|background|alignment|spacing|width|height|opacity|shadow|rounded|gradient|animate)\b/i,
    ],
    approach: 'surgical',
  },
  {
    type: 'add-feature',
    patterns: [
      /\b(add|include|insert|create|new|put|show|display|implement)\b/i,
    ],
    approach: 'section-rewrite',
  },
  {
    type: 'modify-behavior',
    patterns: [
      /\b(change|modify|update|make|convert|transform|switch|toggle)\b/i,
    ],
    approach: 'surgical',
  },
  {
    type: 'fix-bug',
    patterns: [
      /\b(fix|broken|error|bug|wrong|incorrect)\b/i,
      /doesn't work/i,
      /not working/i,
    ],
    approach: 'surgical',
  },
  {
    type: 'remove',
    patterns: [
      /\b(remove|delete|hide|drop)\b/i,
      /get rid of/i,
      /take out/i,
    ],
    approach: 'surgical',
  },
  {
    type: 'restructure',
    patterns: [
      /\b(reorganize|restructure|move|rearrange|split|merge|combine)\b/i,
    ],
    approach: 'section-rewrite',
  },
];

const TARGET_ELEMENT_PATTERNS: RegExp[] = [
  /\b(button|header|footer|nav|sidebar|modal|dialog|form|input|table|card|menu|dropdown|list|panel|section|container|wrapper|banner|hero|badge|tab|tooltip|popover|accordion|carousel|slider|progress|alert|toast|avatar|checkbox|radio|select|textarea|label|link|image|icon|divider|separator|spinner|skeleton|breadcrumb|pagination|stepper|chip|tag)\b/gi,
  /\.([\w-]+)/g,
  /#([\w-]+)/g,
];

class IterativeRefinementService extends BaseService {
  private static instance: IterativeRefinementService;
  private refinementHistory: ManagedMap<string, RefinementHistory>;

  private constructor() {
    super("IterativeRefinementService");
    this.refinementHistory = this.createManagedMap<string, RefinementHistory>({
      maxSize: 200,
      strategy: "lru",
    });
  }

  static getInstance(): IterativeRefinementService {
    if (!IterativeRefinementService.instance) {
      IterativeRefinementService.instance = new IterativeRefinementService();
    }
    return IterativeRefinementService.instance;
  }

  destroy(): void {
    this.refinementHistory.clear();
    this.log("IterativeRefinementService destroyed");
  }

  classifyRefinement(userMessage: string, existingCode: string): RefinementClassification {
    const messageLower = userMessage.toLowerCase();
    let bestMatch: { type: RefinementClassification['type']; confidence: number; approach: RefinementClassification['suggestedApproach'] } | null = null;

    for (const rule of CLASSIFICATION_RULES) {
      let matchCount = 0;
      let totalPatterns = rule.patterns.length;

      for (const pattern of rule.patterns) {
        const regex = new RegExp(pattern.source, pattern.flags);
        if (regex.test(messageLower)) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        const confidence = Math.min(0.5 + (matchCount / totalPatterns) * 0.5, 1.0);

        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { type: rule.type, confidence, approach: rule.approach };
        }
      }
    }

    const targetElements = this.extractTargetElements(userMessage, existingCode);
    const description = this.buildDescription(userMessage, bestMatch?.type || 'full-regeneration');

    if (!bestMatch || bestMatch.confidence <= 0.5) {
      return {
        type: 'full-regeneration',
        confidence: 0.3,
        targetElements,
        description,
        suggestedApproach: 'full-rewrite',
      };
    }

    return {
      type: bestMatch.type,
      confidence: bestMatch.confidence,
      targetElements,
      description,
      suggestedApproach: bestMatch.approach,
    };
  }

  buildRefinementPrompt(classification: RefinementClassification, userMessage: string, existingCode: string): string {
    switch (classification.suggestedApproach) {
      case 'surgical':
        return this.buildSurgicalPrompt(classification, userMessage, existingCode);
      case 'section-rewrite':
        return this.buildSectionRewritePrompt(classification, userMessage, existingCode);
      case 'full-rewrite':
        return this.buildFullRewritePrompt(userMessage, existingCode);
    }
  }

  applyRefinement(originalCode: string, refinedCode: string): RefinementResult {
    const originalLines = originalCode.split('\n');
    const refinedLines = refinedCode.split('\n');
    const changes: ChangeDescription[] = [];
    let linesModified = 0;
    let linesAdded = 0;
    let linesRemoved = 0;

    const maxLen = Math.max(originalLines.length, refinedLines.length);

    for (let i = 0; i < maxLen; i++) {
      const origLine = i < originalLines.length ? originalLines[i] : undefined;
      const newLine = i < refinedLines.length ? refinedLines[i] : undefined;

      if (origLine === undefined && newLine !== undefined) {
        linesAdded++;
        changes.push({
          type: 'added',
          location: `line ${i + 1}`,
          description: `Added: ${newLine.trim().substring(0, 80)}`,
        });
      } else if (origLine !== undefined && newLine === undefined) {
        linesRemoved++;
        changes.push({
          type: 'removed',
          location: `line ${i + 1}`,
          description: `Removed: ${origLine.trim().substring(0, 80)}`,
        });
      } else if (origLine !== newLine) {
        linesModified++;
        changes.push({
          type: 'modified',
          location: `line ${i + 1}`,
          description: `Modified: ${(newLine || '').trim().substring(0, 80)}`,
        });
      }
    }

    return {
      code: refinedCode,
      changesApplied: changes,
      linesModified,
      linesAdded,
      linesRemoved,
    };
  }

  recordRefinement(
    projectId: string,
    userMessage: string,
    classification: RefinementClassification,
    changesApplied: number,
    success: boolean
  ): void {
    let history = this.refinementHistory.get(projectId);
    if (!history) {
      history = { projectId, refinements: [] };
    }

    history.refinements.push({
      id: `ref_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: Date.now(),
      userMessage,
      classification,
      changesApplied,
      success,
    });

    if (history.refinements.length > 100) {
      history.refinements = history.refinements.slice(-100);
    }

    this.refinementHistory.set(projectId, history);
    this.log("Refinement recorded", { projectId, type: classification.type, success });
  }

  getProjectHistory(projectId: string): RefinementHistory | undefined {
    return this.refinementHistory.get(projectId);
  }

  getStats(): {
    totalRefinements: number;
    successRate: number;
    averageChanges: number;
    typeDistribution: Record<string, number>;
  } {
    const allHistories = this.refinementHistory.values();
    const allRefinements = allHistories.flatMap(h => h.refinements);
    const total = allRefinements.length;

    if (total === 0) {
      return {
        totalRefinements: 0,
        successRate: 0,
        averageChanges: 0,
        typeDistribution: {},
      };
    }

    const successCount = allRefinements.filter(r => r.success).length;
    const totalChanges = allRefinements.reduce((sum, r) => sum + r.changesApplied, 0);
    const typeDistribution: Record<string, number> = {};

    for (const ref of allRefinements) {
      typeDistribution[ref.classification.type] = (typeDistribution[ref.classification.type] || 0) + 1;
    }

    return {
      totalRefinements: total,
      successRate: Math.round((successCount / total) * 100) / 100,
      averageChanges: Math.round((totalChanges / total) * 10) / 10,
      typeDistribution,
    };
  }

  private extractTargetElements(userMessage: string, existingCode: string): string[] {
    const elements = new Set<string>();

    const componentPattern = /\b(button|header|footer|nav|sidebar|modal|dialog|form|input|table|card|menu|dropdown|list|panel|section|container|wrapper|banner|hero|badge|tab|tooltip|popover|accordion|carousel|slider|progress|alert|toast|avatar|checkbox|radio|select|textarea|label|link|image|icon|divider|separator|spinner|skeleton|breadcrumb|pagination|stepper|chip|tag)\b/gi;
    let match;
    while ((match = componentPattern.exec(userMessage)) !== null) {
      elements.add(match[1].toLowerCase());
    }

    const cssClassPattern = /\.([\w-]+)/g;
    while ((match = cssClassPattern.exec(userMessage)) !== null) {
      elements.add(`.${match[1]}`);
    }

    const idPattern = /#([\w-]+)/g;
    while ((match = idPattern.exec(userMessage)) !== null) {
      elements.add(`#${match[1]}`);
    }

    const quotedPattern = /"([^"]+)"|'([^']+)'/g;
    while ((match = quotedPattern.exec(userMessage)) !== null) {
      const val = match[1] || match[2];
      if (val && val.length < 40) {
        const codePattern = new RegExp(val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        if (codePattern.test(existingCode)) {
          elements.add(val);
        }
      }
    }

    return Array.from(elements);
  }

  private buildDescription(userMessage: string, type: RefinementClassification['type']): string {
    const typeLabels: Record<string, string> = {
      'style': 'Style change',
      'add-feature': 'Feature addition',
      'modify-behavior': 'Behavior modification',
      'fix-bug': 'Bug fix',
      'remove': 'Element removal',
      'restructure': 'Code restructuring',
      'full-regeneration': 'Full regeneration',
    };

    const label = typeLabels[type] || 'Code change';
    const truncatedMessage = userMessage.length > 100 ? userMessage.substring(0, 100) + '...' : userMessage;
    return `${label}: ${truncatedMessage}`;
  }

  private buildSurgicalPrompt(classification: RefinementClassification, userMessage: string, existingCode: string): string {
    const targetInfo = classification.targetElements.length > 0
      ? `\nTarget elements to focus on: ${classification.targetElements.join(', ')}`
      : '';

    return `You are performing a surgical code modification. Make ONLY the minimum changes needed.

EXISTING CODE:
\`\`\`jsx
${existingCode}
\`\`\`

USER REQUEST: ${userMessage}
${targetInfo}

INSTRUCTIONS:
- The user wants to: ${classification.description}
- Only modify the specific parts needed to fulfill this request
- Do NOT change any unrelated code, styles, or functionality
- Preserve all existing imports, component structure, and logic
- Output the COMPLETE modified code (not just the changed parts)
- Keep the same code style and formatting as the original`;
  }

  private buildSectionRewritePrompt(classification: RefinementClassification, userMessage: string, existingCode: string): string {
    const targetInfo = classification.targetElements.length > 0
      ? `\nRelevant sections/elements: ${classification.targetElements.join(', ')}`
      : '';

    return `You are rewriting a section of the existing code to add or modify functionality.

EXISTING CODE:
\`\`\`jsx
${existingCode}
\`\`\`

USER REQUEST: ${userMessage}
${targetInfo}

INSTRUCTIONS:
- The user wants to: ${classification.description}
- Rewrite the relevant section(s) of the code to fulfill this request
- You may add new components, functions, or styles as needed
- Preserve all unrelated existing functionality
- Ensure new code integrates seamlessly with the existing codebase
- Output the COMPLETE modified code with the new section(s) integrated
- Match the existing code style and patterns`;
  }

  private buildFullRewritePrompt(userMessage: string, existingCode: string): string {
    return `You are regenerating code based on the user's request. Use the existing code as a reference for style and structure.

EXISTING CODE (for reference):
\`\`\`jsx
${existingCode}
\`\`\`

USER REQUEST: ${userMessage}

INSTRUCTIONS:
- Generate complete, working code that fulfills the user's request
- Use the existing code as inspiration for style, patterns, and structure where applicable
- Output the COMPLETE code
- Ensure the result is a fully functional, self-contained application`;
  }
}

export const iterativeRefinementService = IterativeRefinementService.getInstance();
