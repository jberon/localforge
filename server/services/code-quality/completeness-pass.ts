import type { Issue } from "./types";

export function runCodeCompleteness(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];

  const placeholderResult = detectPlaceholderCode(code);
  issues.push(...placeholderResult.issues);

  const nullReturnResult = detectNullReturns(code);
  issues.push(...nullReturnResult.issues);

  const handlerResult = checkEventHandlersDefined(code);
  issues.push(...handlerResult.issues);

  const stateResult = checkStateVariablesDeclared(code);
  issues.push(...stateResult.issues);

  return { code, issues };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectPlaceholderCode(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];
  const lines = code.split("\n");

  const placeholderPatterns: Array<{
    pattern: RegExp;
    message: string;
  }> = [
    { pattern: /\/\/\s*TODO/i, message: "TODO comment found" },
    { pattern: /\/\/\s*FIXME/i, message: "FIXME comment found" },
    { pattern: /\/\/\s*HACK/i, message: "HACK comment found" },
    {
      pattern: /\/\*\s*implement\s*\*\//i,
      message: "Placeholder implement comment found",
    },
    {
      pattern: /\/\/\s*implement\s*(here|this|later|me)/i,
      message: "Placeholder implement comment found",
    },
    {
      pattern: /\/\/\s*\.{3}\s*$/,
      message: "Ellipsis placeholder comment found",
    },
    {
      pattern: /^\s*\.{3}\s*$/,
      message: "Spread/ellipsis placeholder found (likely incomplete code)",
    },
    {
      pattern: /\/\/\s*add\s+(your|the|more)\s+/i,
      message: "Placeholder instruction comment found",
    },
    {
      pattern: /\/\/\s*rest\s+of\s+(the\s+)?(code|implementation|logic)/i,
      message: 'Placeholder "rest of code" comment found',
    },
    {
      pattern: /\bpass\b\s*;?\s*$/,
      message: "Python-style `pass` placeholder detected",
    },
    {
      pattern: /throw\s+new\s+Error\s*\(\s*['"]not\s+implemented/i,
      message: '"Not implemented" error throw found',
    },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { pattern, message } of placeholderPatterns) {
      if (pattern.test(line)) {
        issues.push({
          type: "placeholder-code",
          severity: "warning",
          message: `${message} at line ${i + 1}`,
          line: i + 1,
          fixed: false,
        });
        break;
      }
    }
  }

  return { code, issues };
}

function detectNullReturns(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];

  const funcPattern =
    /(?:function\s+([A-Z]\w*)|const\s+([A-Z]\w*)\s*=\s*(?:\([^)]*\)|)\s*=>)\s*\{([\s\S]*?\n(?=\s*(?:function|const|class|export|$)))/g;

  let match: RegExpExecArray | null;
  while ((match = funcPattern.exec(code)) !== null) {
    const name = match[1] || match[2];
    const body = match[3] || "";

    const hasJsxReturn = /return\s*\(?\s*</.test(body);
    const hasNullReturn = /return\s+null\s*;/.test(body);
    const hasUndefinedReturn = /return\s+undefined\s*;/.test(body);
    const hasEmptyReturn = /return\s*;/.test(body);

    if (
      name &&
      !hasJsxReturn &&
      (hasNullReturn || hasUndefinedReturn || hasEmptyReturn)
    ) {
      const looksLikeComponent =
        /useState|useEffect|useRef|className|onClick/.test(body);
      if (looksLikeComponent) {
        issues.push({
          type: "null-return-component",
          severity: "warning",
          message: `Component '${name}' may return null/undefined instead of JSX`,
          fixed: false,
        });
      }
    }
  }

  return { code, issues };
}

function checkEventHandlersDefined(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];

  const handlerUsagePattern =
    /(?:onClick|onChange|onSubmit|onKeyDown|onKeyUp|onFocus|onBlur|onMouseOver|onMouseOut|onInput)=\{(\w+)\}/g;

  let match: RegExpExecArray | null;
  while ((match = handlerUsagePattern.exec(code)) !== null) {
    const handlerName = match[1];

    if (
      handlerName === "undefined" ||
      handlerName === "null" ||
      handlerName === "true" ||
      handlerName === "false"
    ) {
      continue;
    }

    const definedPattern = new RegExp(
      `(?:function\\s+${escapeRegex(handlerName)}\\b|(?:const|let|var)\\s+${escapeRegex(handlerName)}\\s*=)`
    );

    if (!definedPattern.test(code)) {
      issues.push({
        type: "undefined-handler",
        severity: "error",
        message: `Event handler '${handlerName}' is used in JSX but not defined`,
        fixed: false,
      });
    }
  }

  return { code, issues };
}

function checkStateVariablesDeclared(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];

  const statePattern = /\{(\w+)\}/g;
  const jsxRegions = extractJsxRegions(code);

  const declaredVars = new Set<string>();

  const varDeclarations =
    /(?:const|let|var)\s+(?:\[?\s*(\w+)(?:\s*,\s*(\w+))?\s*\]?)\s*=/g;
  let varMatch: RegExpExecArray | null;
  while ((varMatch = varDeclarations.exec(code)) !== null) {
    if (varMatch[1]) declaredVars.add(varMatch[1]);
    if (varMatch[2]) declaredVars.add(varMatch[2]);
  }

  const funcDecl = /function\s+(\w+)/g;
  while ((varMatch = funcDecl.exec(code)) !== null) {
    declaredVars.add(varMatch[1]);
  }

  const paramPattern =
    /(?:function\s+\w+|\w+\s*=\s*)\s*\(([^)]*)\)/g;
  while ((varMatch = paramPattern.exec(code)) !== null) {
    const params = varMatch[1].split(",").map((p) => p.trim().split(/[=:]/)[0].trim());
    params.forEach((p) => {
      if (p) declaredVars.add(p);
    });
  }

  const importNames = /import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from/g;
  while ((varMatch = importNames.exec(code)) !== null) {
    if (varMatch[1]) declaredVars.add(varMatch[1]);
    if (varMatch[2]) {
      varMatch[2].split(",").forEach((n) => {
        const parts = n.trim().split(/\s+as\s+/);
        const name = parts[parts.length - 1].trim();
        if (name) declaredVars.add(name);
      });
    }
  }

  const globals = new Set([
    "undefined", "null", "true", "false", "NaN", "Infinity",
    "console", "window", "document", "Math", "JSON", "Date",
    "Array", "Object", "String", "Number", "Boolean", "Map",
    "Set", "Promise", "Error", "RegExp", "parseInt", "parseFloat",
    "setTimeout", "setInterval", "clearTimeout", "clearInterval",
    "fetch", "alert", "confirm", "prompt", "event", "e",
    "props", "children", "key", "ref", "className", "style",
    "index", "item", "i", "j", "k",
  ]);

  for (const jsxRegion of jsxRegions) {
    let stateMatch: RegExpExecArray | null;
    const varUsage = /\{(\w+)(?:\.\w+|\[\w+\])?\}/g;
    while ((stateMatch = varUsage.exec(jsxRegion)) !== null) {
      const varName = stateMatch[1];
      if (
        !declaredVars.has(varName) &&
        !globals.has(varName) &&
        varName.length > 1
      ) {
        issues.push({
          type: "undeclared-state-variable",
          severity: "warning",
          message: `Variable '${varName}' used in JSX may not be declared`,
          fixed: false,
        });
      }
    }
  }

  return { code, issues };
}

function extractJsxRegions(code: string): string[] {
  const regions: string[] = [];
  const returnJsx = /return\s*\(\s*([\s\S]*?)\s*\)\s*;/g;

  let match: RegExpExecArray | null;
  while ((match = returnJsx.exec(code)) !== null) {
    regions.push(match[1]);
  }

  const arrowJsx = /=>\s*\(\s*([\s\S]*?)\s*\)\s*(?:;|$)/g;
  while ((match = arrowJsx.exec(code)) !== null) {
    regions.push(match[1]);
  }

  return regions;
}
