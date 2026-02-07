import { db } from "./db";
import { analyticsEvents, feedbacks, insights } from "@shared/schema";
import type { 
  AnalyticsEvent, 
  AnalyticsEventType, 
  Feedback, 
  Insight, 
  AnalyticsOverview 
} from "@shared/schema";
import { eq, desc, gte, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

function getDb() {
  if (!db) {
    throw new Error("Database not initialized - DATABASE_URL may not be set");
  }
  return db;
}

export interface IAnalyticsStorage {
  trackEvent(type: AnalyticsEventType, projectId?: string, data?: Record<string, unknown>): Promise<AnalyticsEvent>;
  getEvents(limit?: number, type?: AnalyticsEventType): Promise<AnalyticsEvent[]>;
  getEventsSince(timestamp: number): Promise<AnalyticsEvent[]>;
  
  submitFeedback(feedback: Omit<Feedback, "id" | "timestamp">): Promise<Feedback>;
  getFeedbacks(limit?: number): Promise<Feedback[]>;
  getPositiveFeedbacks(): Promise<Feedback[]>;
  
  saveInsight(insight: Omit<Insight, "id">): Promise<Insight>;
  getInsights(limit?: number): Promise<Insight[]>;
  getActiveInsights(): Promise<Insight[]>;
  clearExpiredInsights(): Promise<number>;
  
  getOverview(): Promise<AnalyticsOverview>;
}

function dbToEvent(row: typeof analyticsEvents.$inferSelect): AnalyticsEvent {
  return {
    id: row.id,
    type: row.type as AnalyticsEventType,
    projectId: row.projectId ?? undefined,
    data: (row.data as Record<string, unknown>) ?? {},
    timestamp: row.timestamp,
  };
}

function dbToFeedback(row: typeof feedbacks.$inferSelect): Feedback {
  return {
    id: row.id,
    projectId: row.projectId,
    rating: row.rating as "positive" | "negative",
    comment: row.comment ?? undefined,
    prompt: row.prompt,
    generatedCode: row.generatedCode ?? undefined,
    templateUsed: row.templateUsed ?? undefined,
    timestamp: row.timestamp,
  };
}

function dbToInsight(row: typeof insights.$inferSelect): Insight {
  return {
    id: row.id,
    type: row.type as Insight["type"],
    title: row.title,
    description: row.description,
    actionable: row.actionable === "true",
    priority: row.priority as Insight["priority"],
    data: (row.data as Record<string, unknown>) ?? undefined,
    generatedAt: row.generatedAt,
    expiresAt: row.expiresAt ?? undefined,
  };
}

export class AnalyticsStorage implements IAnalyticsStorage {
  async trackEvent(
    type: AnalyticsEventType, 
    projectId?: string, 
    data: Record<string, unknown> = {}
  ): Promise<AnalyticsEvent> {
    const id = randomUUID();
    const timestamp = Date.now();
    
    const [row] = await getDb().insert(analyticsEvents).values({
      id,
      type,
      projectId: projectId ?? null,
      data,
      timestamp,
    }).returning();
    
    return dbToEvent(row);
  }

  async getEvents(limit = 100, type?: AnalyticsEventType): Promise<AnalyticsEvent[]> {
    let query = getDb().select().from(analyticsEvents).orderBy(desc(analyticsEvents.timestamp)).limit(limit);
    
    if (type) {
      const rows = await getDb().select()
        .from(analyticsEvents)
        .where(eq(analyticsEvents.type, type))
        .orderBy(desc(analyticsEvents.timestamp))
        .limit(limit);
      return rows.map(dbToEvent);
    }
    
    const rows = await query;
    return rows.map(dbToEvent);
  }

  async getEventsSince(timestamp: number): Promise<AnalyticsEvent[]> {
    const rows = await getDb().select()
      .from(analyticsEvents)
      .where(gte(analyticsEvents.timestamp, timestamp))
      .orderBy(desc(analyticsEvents.timestamp));
    return rows.map(dbToEvent);
  }

  async submitFeedback(feedback: Omit<Feedback, "id" | "timestamp">): Promise<Feedback> {
    const id = randomUUID();
    const timestamp = Date.now();
    
    const [row] = await getDb().insert(feedbacks).values({
      id,
      projectId: feedback.projectId,
      rating: feedback.rating,
      comment: feedback.comment ?? null,
      prompt: feedback.prompt,
      generatedCode: feedback.generatedCode ?? null,
      templateUsed: feedback.templateUsed ?? null,
      timestamp,
    }).returning();
    
    return dbToFeedback(row);
  }

  async getFeedbacks(limit = 100): Promise<Feedback[]> {
    const rows = await getDb().select()
      .from(feedbacks)
      .orderBy(desc(feedbacks.timestamp))
      .limit(limit);
    return rows.map(dbToFeedback);
  }

  async getPositiveFeedbacks(): Promise<Feedback[]> {
    const rows = await getDb().select()
      .from(feedbacks)
      .where(eq(feedbacks.rating, "positive"))
      .orderBy(desc(feedbacks.timestamp));
    return rows.map(dbToFeedback);
  }

  async saveInsight(insight: Omit<Insight, "id">): Promise<Insight> {
    const id = randomUUID();
    
    const [row] = await getDb().insert(insights).values({
      id,
      type: insight.type,
      title: insight.title,
      description: insight.description,
      actionable: insight.actionable ? "true" : "false",
      priority: insight.priority,
      data: insight.data ?? null,
      generatedAt: insight.generatedAt,
      expiresAt: insight.expiresAt ?? null,
    }).returning();
    
    return dbToInsight(row);
  }

  async getInsights(limit = 50): Promise<Insight[]> {
    const rows = await getDb().select()
      .from(insights)
      .orderBy(desc(insights.generatedAt))
      .limit(limit);
    return rows.map(dbToInsight);
  }

  async getActiveInsights(): Promise<Insight[]> {
    const now = Date.now();
    const rows = await getDb().select()
      .from(insights)
      .orderBy(desc(insights.priority), desc(insights.generatedAt));
    
    return rows
      .filter(row => !row.expiresAt || row.expiresAt > now)
      .map(dbToInsight);
  }

  async clearExpiredInsights(): Promise<number> {
    const now = Date.now();
    const result = await getDb().delete(insights)
      .where(sql`${insights.expiresAt} IS NOT NULL AND ${insights.expiresAt} < ${now}`)
      .returning();
    return result.length;
  }

  async getOverview(): Promise<AnalyticsOverview> {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    const allEvents = await this.getEventsSince(thirtyDaysAgo);
    const allFeedbacks = await this.getFeedbacks(1000);
    
    const generationStarted = allEvents.filter(e => e.type === "generation_started");
    const generationCompleted = allEvents.filter(e => e.type === "generation_completed");
    const generationFailed = allEvents.filter(e => e.type === "generation_failed");
    
    // Only count as successful if code was actually generated (codeLength > 0)
    const actuallySuccessful = generationCompleted.filter(e => {
      const codeLength = e.data?.codeLength;
      return typeof codeLength === "number" && codeLength > 0;
    });
    
    const totalGenerations = generationStarted.length;
    const successfulGenerations = actuallySuccessful.length;
    // Failed = explicit failures + completions with no code
    const failedGenerations = generationFailed.length + (generationCompleted.length - actuallySuccessful.length);
    const successRate = totalGenerations > 0 
      ? (successfulGenerations / totalGenerations) * 100 
      : 0;

    const durations = generationCompleted
      .map(e => e.data?.durationMs)
      .filter((d): d is number => typeof d === "number");
    const averageGenerationTime = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    const templateEvents = allEvents.filter(e => e.type === "template_selected");
    const templateUsage: Record<string, number> = {};
    for (const event of templateEvents) {
      const template = event.data?.template || "unknown";
      templateUsage[template] = (templateUsage[template] || 0) + 1;
    }

    const positiveFeedbacks = allFeedbacks.filter(f => f.rating === "positive").length;
    const negativeFeedbacks = allFeedbacks.filter(f => f.rating === "negative").length;

    const recentTrends: AnalyticsOverview["recentTrends"] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      
      const dayGenerations = generationStarted.filter(e => 
        e.timestamp >= dayStart.getTime() && e.timestamp < dayEnd.getTime()
      ).length;
      
      const daySuccesses = generationCompleted.filter(e =>
        e.timestamp >= dayStart.getTime() && e.timestamp < dayEnd.getTime()
      ).length;
      
      recentTrends.push({
        date: dayStart.toISOString().split('T')[0],
        generations: dayGenerations,
        successes: daySuccesses,
      });
    }

    return {
      totalGenerations,
      successfulGenerations,
      failedGenerations,
      successRate,
      averageGenerationTime,
      templateUsage,
      feedbackStats: {
        positive: positiveFeedbacks,
        negative: negativeFeedbacks,
      },
      recentTrends,
    };
  }
}

export const analyticsStorage = new AnalyticsStorage();
