import { enhancedAnalysisService } from "../enhanced-analysis.service";

export function validateCode(code: string): { valid: boolean; errors: string[]; analysisScore?: number } {
  const errors: string[] = [];

  const analysis = enhancedAnalysisService.analyzeCode(code, "generated.tsx");
  
  for (const issue of analysis.issues) {
    if (issue.severity === "critical" || issue.severity === "high") {
      errors.push(`[${issue.type}] ${issue.message}`);
    }
  }
  
  for (const finding of analysis.securityFindings) {
    if (finding.severity === "critical" || finding.severity === "high") {
      errors.push(`[SECURITY] ${finding.description}`);
    }
  }

  const openBraces = (code.match(/\{/g) || []).length;
  const closeBraces = (code.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    errors.push(`Mismatched braces: ${openBraces} open, ${closeBraces} close`);
  }

  const openParens = (code.match(/\(/g) || []).length;
  const closeParens = (code.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    errors.push(`Mismatched parentheses: ${openParens} open, ${closeParens} close`);
  }

  if (code.trim().endsWith(",") || code.trim().endsWith("(") || code.trim().endsWith("{")) {
    errors.push("Code appears truncated");
  }

  if (!code.includes("export default") && !code.includes("ReactDOM")) {
    errors.push("Missing export or render call");
  }

  return { 
    valid: errors.length === 0, 
    errors,
    analysisScore: analysis.score
  };
}
