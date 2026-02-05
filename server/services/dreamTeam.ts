import { randomUUID } from "crypto";
import { db } from "../db";
import { 
  dreamTeamMembers, 
  activityLogs, 
  businessCases, 
  projectReadmes,
  CORE_DREAM_TEAM,
  type DreamTeamMember,
  type ActivityLogEntry,
  type BusinessCase,
  type ProjectReadme,
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { streamCompletion } from "../llm-client";
import { logger } from "../lib/logger";

export interface DreamTeamConfig {
  endpoint: string;
  reasoningModel: string;
  temperature?: number;
}

export interface TeamActivity {
  member: DreamTeamMember;
  action: ActivityLogEntry["action"];
  content: string;
  metadata?: Record<string, any>;
}

const SPECIALIST_CREATION_PROMPT = `You ARE Marty Cagan, and you're building the product team for this initiative. You have your core Dream Team—the best in the world at what they do—but you're evaluating whether this project needs additional specialists.

YOUR CORE TEAM (they're already committed):
- YOU (Marty Cagan): Product discovery, empowered teams, outcome-driven development. Author of "Inspired" and "Empowered".
- Martin Fowler: Chief Scientist at ThoughtWorks. Wrote "Refactoring" and "Patterns of Enterprise Application Architecture". The godfather of clean code.
- Julie Zhuo: Former VP Design at Facebook. Wrote "The Making of a Manager". Scaled design from startup to billions of users.
- Ben Thompson: Author of Stratechery. Created Aggregation Theory. The most influential independent tech analyst.
- Kent Beck: Created TDD and Extreme Programming. Wrote "Test-Driven Development: By Example". Quality without compromise.

THE PROJECT:
{businessCase}

As Marty Cagan, evaluate: Does this project have domain-specific challenges that require specialized expertise your core team doesn't have?

Consider:
- Industry expertise (healthcare regulations, financial compliance, legal requirements)
- Technical specialists (blockchain, AI/ML, security, data science)
- Domain insiders (someone who's lived this problem)
- Business specialists (monetization strategy, growth, partnerships)

Be SELECTIVE. Your core team is exceptional—only add specialists when there's genuine domain knowledge your team lacks. A fintech app needs a finance expert. A simple todo app doesn't need anyone extra.

For each specialist you add, create them as real people with:
- A name that sounds like a real thought leader (not generic like "Domain Expert")
- Specific credentials that make them THE person for this domain
- A personality that will contribute to productive team dynamics
- Their signature phrase that captures their expertise

RESPOND WITH JSON ONLY:
{
  "needsSpecialists": true/false,
  "specialists": [
    {
      "name": "Real-sounding name",
      "title": "Their actual title/role",
      "expertise": ["specific area 1", "specific area 2"],
      "personality": "Who they ARE, not what they do. Their background, credentials, and approach.",
      "catchphrase": "Their signature phrase that captures their expertise",
      "reasoning": "Why specifically this project needs their expertise"
    }
  ],
  "teamStrategy": "How this team—core plus specialists—will collaborate on this specific project"
}

If no specialists needed:
{
  "needsSpecialists": false,
  "specialists": [],
  "teamStrategy": "The core team has everything needed for this project. Here's how they'll collaborate: [brief strategy]"
}`;

const BUSINESS_CASE_PROMPT = `You ARE Marty Cagan. You founded Silicon Valley Product Group after decades leading product at eBay, Netscape, and HP. You wrote "Inspired" and "Empowered" because you were frustrated watching brilliant companies fail at product.

Your philosophy is clear:
- Fall in love with the PROBLEM, not the solution. Solutions are cheap; problems worth solving are rare.
- Empowered teams own OUTCOMES, not outputs. Features shipped means nothing. Customer problems solved means everything.
- Product discovery isn't a phase—it's continuous. Validate value, usability, feasibility, and viability BEFORE building.
- "Everyone" is not a target audience. If you can't name specific people with specific pain, you don't understand the problem.
- 10x better or don't bother. Incremental improvements don't change behavior.

A USER HAS BROUGHT YOU THIS REQUEST:
{request}

PROJECT CONTEXT:
{context}

As Marty Cagan, you need to create a business case that transforms this request into a product worth building. Apply your frameworks:

1. PROBLEM DISCOVERY: What's the actual problem here? Who has it? How painful is it?
2. SOLUTION VALIDATION: Is this solution 10x better than alternatives? Why will people switch?
3. CUSTOMER DEFINITION: Who specifically will use this? Not demographics—real people with real pain.
4. OUTCOME FOCUS: What measurable outcome will users achieve? How will we know we've succeeded?
5. MARKET REALITY: Who else is solving this? What's our unfair advantage?

Be direct. If the request is vague, make it specific. If it's solving the wrong problem, reframe it. Channel your experience building products that millions of people use.

RESPOND WITH JSON ONLY:
{
  "appName": "A name that captures the value, not the features",
  "tagline": "One line that makes the value proposition crystal clear",
  "problemStatement": "The real customer problem. Be specific about the pain. Why does this matter to them?",
  "targetAudience": "Exactly who has this problem. Names, roles, circumstances—not demographics.",
  "valueProposition": "The outcome users will achieve. Focus on their success, not your features.",
  "industry": "Primary industry/domain",
  "competitors": ["Real alternatives users consider today—including doing nothing"],
  "differentiators": ["What makes this 10x better", "Why users will switch from alternatives"],
  "coreFeatures": [
    {"name": "Feature tied to outcome", "description": "How it solves the problem", "priority": "must-have"},
    {"name": "Feature tied to outcome", "description": "How it solves the problem", "priority": "should-have"},
    {"name": "Feature tied to outcome", "description": "Adds value but not critical", "priority": "nice-to-have"}
  ],
  "futureFeatures": ["Only if they genuinely extend the value proposition"],
  "techStack": ["React", "TypeScript", "Tech choices that serve the product"],
  "monetization": "How this creates enough value that people will pay for it",
  "pricingModel": "Pricing that aligns with the value delivered"
}`;

const README_PROMPT = `You ARE Martin Fowler. You're Chief Scientist at ThoughtWorks. You wrote "Refactoring" and "Patterns of Enterprise Application Architecture". Developers worldwide quote you. You signed the Agile Manifesto. Your bliki is legendary.

Your documentation philosophy:
- Documentation should be as clean as the code. No walls of text—progressive disclosure.
- The README is the front door. A new developer should understand what this is and how to run it in under 5 minutes.
- Explain the WHY, not just the WHAT. Architecture decisions without rationale are useless.
- Code examples should be copy-pasteable. If I can't run it, it's not documentation.
- Structure matters. Consistent headers, clear sections, no hunting for information.

PROJECT INFO:
App Name: {appName}
Description: {description}
Features: {features}
Tech Stack: {techStack}

As Martin Fowler, write the README you'd want to find. The kind that makes you think "ah, these developers know what they're doing."

Structure it like this:
1. **Title and one-line description** — Don't bury the lede
2. **Overview** — What problem does this solve? Why does it exist? (The 'why' matters more than the 'what')
3. **Key Features** — Bulleted, scannable, tied to user value
4. **Architecture** — High-level design decisions and why they were made
5. **Tech Stack** — What we use and why we chose it
6. **Getting Started** — From clone to running in under 5 commands
7. **Usage Examples** — Real, working code that demonstrates key functionality
8. **API Reference** — If applicable, clean endpoint documentation
9. **Contributing** — How to set up dev environment and submit changes

Write clean, professional markdown. No JSON wrapper. Just the README.`;

export class DreamTeamService {
  private config: DreamTeamConfig;
  private coreTeam: DreamTeamMember[] = CORE_DREAM_TEAM;
  
  constructor(config: DreamTeamConfig) {
    this.config = config;
  }

  getCoreTeam(): DreamTeamMember[] {
    return this.coreTeam;
  }

  getMemberById(id: string): DreamTeamMember | undefined {
    return this.coreTeam.find(m => m.id === id);
  }

  getRequiredMemberById(id: string): DreamTeamMember {
    const member = this.getMemberById(id);
    if (!member) {
      throw new Error(`[DreamTeam] Required team member not found: "${id}". Valid IDs: ${this.coreTeam.map(m => m.id).join(", ")}`);
    }
    return member;
  }

  getMemberByRole(role: string): DreamTeamMember | undefined {
    return this.coreTeam.find(m => m.role === role);
  }

  async logActivity(
    projectId: string,
    activity: TeamActivity
  ): Promise<ActivityLogEntry> {
    const entry: ActivityLogEntry = {
      id: randomUUID(),
      projectId,
      teamMemberId: activity.member.id,
      teamMemberName: activity.member.name,
      action: activity.action,
      content: activity.content,
      metadata: activity.metadata,
      timestamp: Date.now(),
    };

    if (db) {
      await db.insert(activityLogs).values(entry);
    }
    return entry;
  }

  async getActivityLog(projectId: string, limit = 50): Promise<ActivityLogEntry[]> {
    if (!db) return [];
    
    const logs = await db
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.projectId, projectId))
      .orderBy(desc(activityLogs.timestamp))
      .limit(limit);
    
    return logs.map(log => ({
      ...log,
      action: log.action as ActivityLogEntry["action"],
      metadata: log.metadata as Record<string, any> | undefined,
    }));
  }

  async analyzeAndCreateSpecialists(
    projectId: string,
    businessCase: BusinessCase,
    onThinking?: (content: string) => void
  ): Promise<DreamTeamMember[]> {
    const marty = this.getRequiredMemberById("marty");
    
    await this.logActivity(projectId, {
      member: marty,
      action: "thinking",
      content: "Analyzing business case to determine if specialists are needed...",
    });

    const prompt = SPECIALIST_CREATION_PROMPT.replace(
      "{businessCase}",
      JSON.stringify({
        appName: businessCase.appName,
        industry: businessCase.industry,
        problemStatement: businessCase.problemStatement,
        targetAudience: businessCase.targetAudience,
        coreFeatures: businessCase.coreFeatures,
        techStack: businessCase.techStack,
      }, null, 2)
    );

    try {
      const response = await streamCompletion(
        {
          endpoint: this.config.endpoint,
          model: this.config.reasoningModel,
          temperature: this.config.temperature || 0.3,
        },
        {
          systemPrompt: "You are a team composition analyst.",
          messages: [{ role: "user", content: prompt }],
          maxTokens: 2000,
          onChunk: onThinking,
        }
      );

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return [];
      }

      const result = JSON.parse(jsonMatch[0]);
      
      if (!result.needsSpecialists || !result.specialists?.length) {
        await this.logActivity(projectId, {
          member: marty,
          action: "deciding",
          content: `Core team is sufficient. ${result.teamStrategy || ""}`,
        });
        return [];
      }

      const specialists: DreamTeamMember[] = [];
      const specialistColors = ["amber", "cyan", "rose", "lime", "violet"];
      const specialistAvatars = ["star", "lightbulb", "zap", "target", "gem"];

      for (let i = 0; i < result.specialists.length; i++) {
        const spec = result.specialists[i];
        const specialist: DreamTeamMember = {
          id: randomUUID(),
          name: spec.name,
          title: spec.title,
          role: "specialist",
          avatar: specialistAvatars[i % specialistAvatars.length],
          color: specialistColors[i % specialistColors.length],
          expertise: spec.expertise || [],
          personality: spec.personality,
          catchphrase: spec.catchphrase,
          isCore: false,
          createdForProject: projectId,
        };

        if (db) {
          await db.insert(dreamTeamMembers).values({
            ...specialist,
            expertise: specialist.expertise,
            isCore: "false",
          });
        }

        specialists.push(specialist);

        await this.logActivity(projectId, {
          member: marty,
          action: "deciding",
          content: `Recruited ${specialist.name} (${specialist.title}) - ${spec.reasoning}`,
          metadata: { specialist },
        });
      }

      await this.logActivity(projectId, {
        member: marty,
        action: "collaborating",
        content: result.teamStrategy,
      });

      return specialists;
    } catch (error) {
      logger.error("Failed to analyze specialists", {}, error as Error);
      return [];
    }
  }

  async generateBusinessCase(
    projectId: string,
    userRequest: string,
    context?: string,
    onThinking?: (content: string) => void
  ): Promise<BusinessCase | null> {
    const marty = this.getRequiredMemberById("marty");

    await this.logActivity(projectId, {
      member: marty,
      action: "thinking",
      content: `Analyzing request: "${userRequest.slice(0, 100)}..."`,
    });

    const prompt = BUSINESS_CASE_PROMPT
      .replace("{request}", userRequest)
      .replace("{context}", context || "Initial project creation");

    try {
      const response = await streamCompletion(
        {
          endpoint: this.config.endpoint,
          model: this.config.reasoningModel,
          temperature: this.config.temperature || 0.4,
        },
        {
          systemPrompt: "You are Marty Cagan, the Product Visionary. Channel your philosophy from 'Inspired' and 'Empowered'. Focus on outcomes, customer problems, and empowered teams.",
          messages: [{ role: "user", content: prompt }],
          maxTokens: 3000,
          onChunk: onThinking,
        }
      );

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const now = Date.now();

      const businessCase: BusinessCase = {
        id: randomUUID(),
        projectId,
        version: 1,
        appName: parsed.appName || "Untitled App",
        tagline: parsed.tagline || undefined,
        problemStatement: parsed.problemStatement || userRequest,
        targetAudience: parsed.targetAudience || "General users",
        valueProposition: parsed.valueProposition || "Solves user needs",
        industry: parsed.industry,
        competitors: parsed.competitors || [],
        differentiators: parsed.differentiators || [],
        coreFeatures: parsed.coreFeatures || [],
        futureFeatures: parsed.futureFeatures || [],
        techStack: parsed.techStack || ["React", "TypeScript"],
        integrations: [],
        monetization: parsed.monetization,
        pricingModel: parsed.pricingModel,
        status: "draft",
        createdAt: now,
        updatedAt: now,
      };

      if (db) {
        await db.insert(businessCases).values({
          ...businessCase,
          competitors: businessCase.competitors,
          differentiators: businessCase.differentiators,
          coreFeatures: businessCase.coreFeatures,
          futureFeatures: businessCase.futureFeatures,
          techStack: businessCase.techStack,
          integrations: businessCase.integrations,
        });
      }

      await this.logActivity(projectId, {
        member: marty,
        action: "deciding",
        content: `Created business case for "${businessCase.appName}" - ${businessCase.tagline || businessCase.valueProposition}`,
        metadata: { businessCaseId: businessCase.id },
      });

      return businessCase;
    } catch (error) {
      logger.error("Failed to generate business case", {}, error as Error);
      return null;
    }
  }

  async getBusinessCase(projectId: string): Promise<BusinessCase | null> {
    if (!db) return null;
    
    const cases = await db
      .select()
      .from(businessCases)
      .where(eq(businessCases.projectId, projectId))
      .orderBy(desc(businessCases.version))
      .limit(1);

    if (cases.length === 0) return null;

    const c = cases[0];
    return {
      ...c,
      version: Number(c.version),
      tagline: c.tagline || undefined,
      industry: c.industry || undefined,
      competitors: (c.competitors as string[]) || [],
      differentiators: (c.differentiators as string[]) || [],
      coreFeatures: (c.coreFeatures as BusinessCase["coreFeatures"]) || [],
      futureFeatures: (c.futureFeatures as string[]) || [],
      techStack: (c.techStack as string[]) || [],
      integrations: (c.integrations as string[]) || [],
      monetization: c.monetization || undefined,
      pricingModel: c.pricingModel || undefined,
      status: c.status as BusinessCase["status"],
      createdAt: Number(c.createdAt),
      updatedAt: Number(c.updatedAt),
    };
  }

  async generateReadme(
    projectId: string,
    businessCase: BusinessCase,
    onThinking?: (content: string) => void
  ): Promise<ProjectReadme | null> {
    const martin = this.getRequiredMemberById("martin");

    await this.logActivity(projectId, {
      member: martin,
      action: "building",
      content: "Generating project README...",
    });

    const featuresStr = businessCase.coreFeatures
      .map(f => `- ${f.name}: ${f.description}`)
      .join("\n");

    const prompt = README_PROMPT
      .replace("{appName}", businessCase.appName)
      .replace("{description}", businessCase.valueProposition)
      .replace("{features}", featuresStr)
      .replace("{techStack}", (businessCase.techStack || []).join(", "));

    try {
      const content = await streamCompletion(
        {
          endpoint: this.config.endpoint,
          model: this.config.reasoningModel,
          temperature: 0.5,
        },
        {
          systemPrompt: "You are Martin Fowler, Chief Architect. Champion clean code, refactoring, and maintainable architecture. Write code for humans first.",
          messages: [{ role: "user", content: prompt }],
          maxTokens: 2000,
          onChunk: onThinking,
        }
      );

      const now = Date.now();
      const readme: ProjectReadme = {
        id: randomUUID(),
        projectId,
        version: 1,
        content,
        sections: {
          overview: businessCase.valueProposition,
          features: featuresStr,
          installation: "npm install",
          usage: "npm run dev",
          techStack: (businessCase.techStack || []).join(", "),
        },
        generatedBy: martin.name,
        createdAt: now,
        updatedAt: now,
      };

      if (db) {
        await db.insert(projectReadmes).values({
          ...readme,
          sections: readme.sections,
        });
      }

      await this.logActivity(projectId, {
        member: martin,
        action: "building",
        content: "README.md generated successfully",
        metadata: { readmeId: readme.id },
      });

      return readme;
    } catch (error) {
      logger.error("Failed to generate README", {}, error as Error);
      return null;
    }
  }

  async getReadme(projectId: string): Promise<ProjectReadme | null> {
    if (!db) return null;
    
    const readmes = await db
      .select()
      .from(projectReadmes)
      .where(eq(projectReadmes.projectId, projectId))
      .orderBy(desc(projectReadmes.version))
      .limit(1);

    if (readmes.length === 0) return null;

    const r = readmes[0];
    return {
      ...r,
      version: Number(r.version),
      sections: r.sections as ProjectReadme["sections"],
      createdAt: Number(r.createdAt),
      updatedAt: Number(r.updatedAt),
    };
  }

  async getProjectSpecialists(projectId: string): Promise<DreamTeamMember[]> {
    if (!db) return [];
    
    const specialists = await db
      .select()
      .from(dreamTeamMembers)
      .where(eq(dreamTeamMembers.createdForProject, projectId));

    return specialists.map(s => ({
      ...s,
      role: s.role as DreamTeamMember["role"],
      expertise: (s.expertise as string[]) || [],
      isCore: s.isCore === "true",
      createdForProject: s.createdForProject || undefined,
      inspiration: s.inspiration || undefined,
      catchphrase: s.catchphrase || undefined,
    }));
  }

  async getFullTeam(projectId: string): Promise<{
    core: DreamTeamMember[];
    specialists: DreamTeamMember[];
  }> {
    const specialists = await this.getProjectSpecialists(projectId);
    return {
      core: this.coreTeam,
      specialists,
    };
  }
}

export function createDreamTeamService(config: DreamTeamConfig): DreamTeamService {
  return new DreamTeamService(config);
}
