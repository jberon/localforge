import { apiRequest } from "./queryClient";
import type { AnalyticsEventType, AnalyticsOverview, Insight, Feedback } from "@shared/schema";

export async function trackEvent(
  type: AnalyticsEventType,
  projectId?: string,
  data?: Record<string, any>
) {
  try {
    await apiRequest("POST", "/api/analytics/events", {
      type,
      projectId,
      data,
    });
  } catch (error) {
    console.error("Failed to track event:", error);
  }
}

export async function submitFeedback(feedback: {
  projectId: string;
  rating: "positive" | "negative";
  comment?: string;
  prompt: string;
  generatedCode?: string;
  templateUsed?: string;
}): Promise<Feedback | null> {
  try {
    const response = await apiRequest("POST", "/api/analytics/feedback", feedback);
    return response.json();
  } catch (error) {
    console.error("Failed to submit feedback:", error);
    return null;
  }
}

export async function getAnalyticsOverview(): Promise<AnalyticsOverview | null> {
  try {
    const response = await fetch("/api/analytics/overview");
    return response.json();
  } catch (error) {
    console.error("Failed to get analytics overview:", error);
    return null;
  }
}

export async function getInsights(): Promise<Insight[]> {
  try {
    const response = await fetch("/api/analytics/insights");
    return response.json();
  } catch (error) {
    console.error("Failed to get insights:", error);
    return [];
  }
}

export async function generateInsights(settings: {
  endpoint: string;
  model: string;
  temperature: number;
}): Promise<{ generated: number; insights: Insight[] }> {
  try {
    const response = await apiRequest("POST", "/api/analytics/generate-insights", {
      settings,
    });
    return response.json();
  } catch (error) {
    console.error("Failed to generate insights:", error);
    return { generated: 0, insights: [] };
  }
}

export async function getSuccessfulPrompts(limit = 10): Promise<{
  prompt: string;
  template?: string;
  timestamp: number;
}[]> {
  try {
    const response = await fetch(`/api/analytics/successful-prompts?limit=${limit}`);
    return response.json();
  } catch (error) {
    console.error("Failed to get successful prompts:", error);
    return [];
  }
}
