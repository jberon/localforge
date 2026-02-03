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

const SPECIALIST_CREATION_PROMPT = `You are analyzing a business case to determine if specialized team members are needed beyond the core development team.

CORE TEAM (always present):
- Marty Cagan (Product Visionary): Product discovery, outcome-driven development, customer obsession
- Martin Fowler (Chief Architect): Clean architecture, refactoring, design patterns, TypeScript
- Julie Zhuo (Design Director): User-centered design, design systems, accessibility
- Ben Thompson (Strategic Analyst): Market dynamics, competitive analysis, platform strategy
- Kent Beck (Quality Craftsman): Test-driven development, code quality, continuous testing

BUSINESS CONTEXT:
{businessCase}

Based on this business case, determine if any SPECIALISTS are needed. Consider:
1. Industry-specific expertise (healthcare, finance, education, etc.)
2. Domain knowledge (legal requirements, regulations, insider knowledge)
3. Technical specialists (blockchain, AI/ML, security, etc.)
4. Business specialists (monetization, marketing, growth)

RESPOND WITH JSON ONLY:
{
  "needsSpecialists": true/false,
  "specialists": [
    {
      "name": "Creative name",
      "title": "Role title",
      "expertise": ["area1", "area2"],
      "personality": "Brief personality description",
      "catchphrase": "Their signature phrase",
      "reasoning": "Why this specialist is needed"
    }
  ],
  "teamStrategy": "Brief explanation of how the team will work together"
}

If no specialists needed, return:
{
  "needsSpecialists": false,
  "specialists": [],
  "teamStrategy": "Core team is sufficient for this project"
}`;

const BUSINESS_CASE_PROMPT = `You are Marty Cagan, the legendary product visionary. Channel your philosophy from "Inspired" and "Empowered" to analyze this request.

Remember your core principles:
- Fall in love with the PROBLEM, not the solution
- Focus on OUTCOMES, not outputs
- Validate that this solves a real customer problem
- Think like an empowered product team, not a feature factory

USER REQUEST:
{request}

PROJECT CONTEXT:
{context}

Create a business case that will guide the development team. Be specific and actionable. Think about product-market fit, customer value, and what will make this product truly resonate.

RESPOND WITH JSON ONLY:
{
  "appName": "Creative, memorable app name",
  "tagline": "One-line description",
  "problemStatement": "What real customer problem does this solve? Why does it matter?",
  "targetAudience": "Who specifically needs this? Be precise.",
  "valueProposition": "What outcome will users achieve? Why will they love this?",
  "industry": "Primary industry/domain",
  "competitors": ["Competitor 1", "Competitor 2"],
  "differentiators": ["What makes this 10x better", "Unique value no one else offers"],
  "coreFeatures": [
    {"name": "Feature 1", "description": "Details", "priority": "must-have"},
    {"name": "Feature 2", "description": "Details", "priority": "should-have"}
  ],
  "futureFeatures": ["Future idea 1", "Future idea 2"],
  "techStack": ["React", "TypeScript", "Other relevant tech"],
  "monetization": "How this could make money (if applicable)",
  "pricingModel": "Pricing strategy (if applicable)"
}`;

const README_PROMPT = `You are Martin Fowler, Chief Architect. Generate a professional README.md for this project.

Channel your principles of clean documentation—clear, well-structured, and focused on helping developers understand and contribute effectively.

PROJECT INFO:
App Name: {appName}
Description: {description}
Features: {features}
Tech Stack: {techStack}

Generate a complete, professional README in markdown format. Include:
1. Project title and badges
2. Description/Overview (explain the 'why' not just the 'what')
3. Features list
4. Architecture overview (high-level design decisions)
5. Tech stack with rationale
6. Getting started (make it easy for new contributors)
7. Usage examples with clean code samples
8. Contributing guidelines

Output markdown only, no JSON wrapper.`;

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
    const marty = this.getMemberById("marty")!;
    
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
      console.error("Failed to analyze specialists:", error);
      return [];
    }
  }

  async generateBusinessCase(
    projectId: string,
    userRequest: string,
    context?: string,
    onThinking?: (content: string) => void
  ): Promise<BusinessCase | null> {
    const marty = this.getMemberById("marty")!;

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
      console.error("Failed to generate business case:", error);
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
    const martin = this.getMemberById("martin")!;

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
      console.error("Failed to generate README:", error);
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
