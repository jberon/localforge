import { logger } from "../lib/logger";

export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
}

export interface WebSearchResponse {
  success: boolean;
  results: WebSearchResult[];
  error?: string;
}

const SERPER_ENDPOINT = "https://google.serper.dev/search";

export async function searchWeb(query: string, apiKey: string): Promise<WebSearchResponse> {
  if (!apiKey || apiKey.trim() === "") {
    return {
      success: false,
      results: [],
      error: "Serper API key not configured",
    };
  }

  try {
    logger.info("Web search started", { query });
    
    const response = await fetch(SERPER_ENDPOINT, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num: 5,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Serper API error", { status: response.status, errorText });
      return {
        success: false,
        results: [],
        error: `Serper API error: ${response.status}`,
      };
    }

    const data = await response.json();
    
    const results: WebSearchResult[] = [];
    
    if (data.organic && Array.isArray(data.organic)) {
      for (const item of data.organic.slice(0, 5)) {
        results.push({
          title: item.title || "",
          snippet: item.snippet || "",
          url: item.link || "",
        });
      }
    }

    logger.info("Web search completed", { resultCount: results.length });
    
    return {
      success: true,
      results,
    };
  } catch (error: any) {
    logger.error("Web search network error", { error: error.message });
    return {
      success: false,
      results: [],
      error: `Network error: ${error.message}`,
    };
  }
}

export function formatSearchResultsForContext(results: WebSearchResult[]): string {
  if (results.length === 0) {
    return "";
  }

  let context = `The user asked a question that may require up-to-date web information.
Here are recent search results:

`;

  results.forEach((result, index) => {
    context += `${index + 1}. ${result.title}
   ${result.snippet}
   ${result.url}

`;
  });

  context += `Use this information to answer the user's question as accurately as possible. Cite key URLs in your reasoning text, but keep the answer concise.`;

  return context;
}
