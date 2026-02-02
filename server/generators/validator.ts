export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateGeneratedCode(files: Array<{ path: string; content: string }>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const file of files) {
    const fileErrors = validateFile(file.path, file.content);
    errors.push(...fileErrors.errors);
    warnings.push(...fileErrors.warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateFile(path: string, content: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!content || content.trim().length === 0) {
    errors.push(`${path}: File is empty`);
    return { errors, warnings };
  }

  if (path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.js') || path.endsWith('.jsx')) {
    const jsErrors = validateJavaScript(path, content);
    errors.push(...jsErrors.errors);
    warnings.push(...jsErrors.warnings);
  } else if (path.endsWith('.json')) {
    const jsonErrors = validateJSON(path, content);
    errors.push(...jsonErrors.errors);
  }

  return { errors, warnings };
}

function validateJavaScript(path: string, content: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    errors.push(`${path}: Mismatched braces (${openBraces} open, ${closeBraces} close)`);
  }

  const openParens = (content.match(/\(/g) || []).length;
  const closeParens = (content.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    errors.push(`${path}: Mismatched parentheses (${openParens} open, ${closeParens} close)`);
  }

  const openBrackets = (content.match(/\[/g) || []).length;
  const closeBrackets = (content.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    errors.push(`${path}: Mismatched brackets (${openBrackets} open, ${closeBrackets} close)`);
  }

  const importPattern = /import\s+.*?\s+from\s+['"][^'"]*['"];?/g;
  const hasImports = importPattern.test(content);
  const exportPattern = /export\s+(default\s+)?(function|class|const|let|var|interface|type)/;
  const hasExport = exportPattern.test(content);

  if (path.includes('/components/') && hasImports && !hasExport) {
    warnings.push(`${path}: Component file has imports but no exports`);
  }

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('undefined') && line.includes('function')) {
      warnings.push(`${path}:${i + 1}: Possible undefined reference in function`);
    }
  }

  return { errors, warnings };
}

function validateJSON(path: string, content: string): { errors: string[] } {
  const errors: string[] = [];

  try {
    JSON.parse(content);
  } catch (e: any) {
    errors.push(`${path}: Invalid JSON - ${e.message}`);
  }

  return { errors };
}
