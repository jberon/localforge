import type { Issue } from "./types";

export function runReactJsxPass(
  code: string,
  isJsx: boolean
): { code: string; issues: Issue[] } {
  const issues: Issue[] = [];
  let result = code;

  const hasJsx = /<[A-Z][a-zA-Z0-9]*[\s/>]/.test(result) || /className=/.test(result);
  if (!hasJsx && !isJsx) {
    return { code: result, issues };
  }

  const exportResult = ensureComponentExport(result);
  issues.push(...exportResult.issues);
  result = exportResult.code;

  const hookImportResult = addMissingReactHookImports(result);
  issues.push(...hookImportResult.issues);
  result = hookImportResult.code;

  const jsxTagResult = fixUnclosedJsxTags(result);
  issues.push(...jsxTagResult.issues);
  result = jsxTagResult.code;

  const renderResult = ensureRenderCall(result);
  issues.push(...renderResult.issues);
  result = renderResult.code;

  const jsxMistakesResult = fixCommonJsxMistakes(result);
  issues.push(...jsxMistakesResult.issues);
  result = jsxMistakesResult.code;

  return { code: result, issues };
}

function ensureComponentExport(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];

  if (/export\s+(default\s+)?function\s+\w+/.test(code)) return { code, issues };
  if (/export\s+default\s+\w+/.test(code)) return { code, issues };
  if (/export\s+\{[^}]*\}/.test(code)) return { code, issues };
  if (/module\.exports/.test(code)) return { code, issues };

  const componentMatch = code.match(
    /(?:function|const)\s+([A-Z][a-zA-Z0-9]*)\s*(?:=\s*(?:\([^)]*\)|)\s*=>|[({])/
  );

  if (componentMatch) {
    const componentName = componentMatch[1];
    const hasReturn =
      new RegExp(`function\\s+${componentName}[\\s\\S]*?return\\s*\\(`).test(
        code
      ) ||
      new RegExp(
        `const\\s+${componentName}\\s*=.*=>\\s*(?:\\(|<)`
      ).test(code);

    if (hasReturn || /<[A-Z]/.test(code)) {
      issues.push({
        type: "missing-export",
        severity: "warning",
        message: `Component '${componentName}' is not exported`,
        fixed: true,
        fixDescription: `Added 'export default ${componentName}' at end of file`,
      });
      return {
        code: code.trimEnd() + `\n\nexport default ${componentName};\n`,
        issues,
      };
    }
  }

  return { code, issues };
}

function addMissingReactHookImports(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];
  let result = code;

  const hooks = [
    "useState",
    "useEffect",
    "useContext",
    "useReducer",
    "useCallback",
    "useMemo",
    "useRef",
    "useLayoutEffect",
    "useImperativeHandle",
    "useDebugValue",
    "useId",
    "useTransition",
    "useDeferredValue",
    "useSyncExternalStore",
    "useInsertionEffect",
  ];

  const usedHooks: string[] = [];
  for (const hook of hooks) {
    const hookUsagePattern = new RegExp(`\\b${hook}\\s*\\(`, "g");
    if (hookUsagePattern.test(result)) {
      const importPattern = new RegExp(
        `import\\s+.*\\b${hook}\\b.*from\\s+['"]react['"]`
      );
      const destructurePattern = new RegExp(
        `import\\s*\\{[^}]*\\b${hook}\\b[^}]*\\}\\s*from\\s+['"]react['"]`
      );
      if (!importPattern.test(result) && !destructurePattern.test(result)) {
        usedHooks.push(hook);
      }
    }
  }

  if (usedHooks.length > 0) {
    const existingImport = result.match(
      /import\s*\{([^}]*)\}\s*from\s+['"]react['"]/
    );

    if (existingImport) {
      const existing = existingImport[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const merged = Array.from(new Set([...existing, ...usedHooks]));
      const newImport = `import { ${merged.join(", ")} } from 'react'`;
      result = result.replace(
        /import\s*\{[^}]*\}\s*from\s+['"]react['"]\s*;?/,
        newImport + ";"
      );
    } else {
      const hasReactImport = /import\s+React\b/.test(result);
      if (!hasReactImport) {
        const importLine = `import { ${usedHooks.join(", ")} } from 'react';\n`;
        result = importLine + result;
      } else {
        const defaultImport = result.match(
          /import\s+(React)\s+from\s+['"]react['"]\s*;?/
        );
        if (defaultImport) {
          const newImport = `import React, { ${usedHooks.join(", ")} } from 'react';`;
          result = result.replace(
            /import\s+React\s+from\s+['"]react['"]\s*;?/,
            newImport
          );
        }
      }
    }

    issues.push({
      type: "missing-react-imports",
      severity: "error",
      message: `Missing React hook imports: ${usedHooks.join(", ")}`,
      fixed: true,
      fixDescription: `Added imports for: ${usedHooks.join(", ")}`,
    });
  }

  return { code: result, issues };
}

function fixUnclosedJsxTags(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];

  const voidElements = new Set([
    "img",
    "br",
    "hr",
    "input",
    "meta",
    "link",
    "area",
    "base",
    "col",
    "embed",
    "source",
    "track",
    "wbr",
  ]);

  const openTagPattern = /<([a-zA-Z][a-zA-Z0-9.]*)\b[^>]*(?<!\/)>/g;
  const closeTagPattern = /<\/([a-zA-Z][a-zA-Z0-9.]*)>/g;
  const selfClosePattern = /<([a-zA-Z][a-zA-Z0-9.]*)\b[^>]*\/>/g;

  const openTags: Map<string, number> = new Map();
  const closeTags: Map<string, number> = new Map();

  let match: RegExpExecArray | null;

  while ((match = openTagPattern.exec(code)) !== null) {
    const tag = match[1];
    if (voidElements.has(tag.toLowerCase())) continue;
    openTags.set(tag, (openTags.get(tag) || 0) + 1);
  }

  while ((match = selfClosePattern.exec(code)) !== null) {
    const tag = match[1];
    const count = openTags.get(tag) || 0;
    if (count > 0) {
      openTags.set(tag, count - 1);
    }
  }

  while ((match = closeTagPattern.exec(code)) !== null) {
    const tag = match[1];
    closeTags.set(tag, (closeTags.get(tag) || 0) + 1);
  }

  for (const [tag, openCount] of Array.from(openTags.entries())) {
    const closeCount = closeTags.get(tag) || 0;
    if (openCount > closeCount) {
      const diff = openCount - closeCount;
      issues.push({
        type: "unclosed-jsx-tag",
        severity: "warning",
        message: `Potentially ${diff} unclosed <${tag}> tag(s)`,
        fixed: false,
        fixDescription: `Check that all <${tag}> tags have matching closing tags`,
      });
    }
  }

  return { code, issues };
}

function ensureRenderCall(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];
  let result = code;

  const hasComponent =
    /(?:function|const)\s+([A-Z][a-zA-Z0-9]*)\s*(?:=|[({])/.test(result);
  const hasRenderCall =
    /ReactDOM\.render|createRoot|ReactDOM\.createRoot|hydrateRoot/.test(
      result
    );
  const isStandalone =
    !/(export\s+default|export\s+\{|module\.exports)/.test(result) &&
    hasComponent;

  if (hasComponent && !hasRenderCall && isStandalone) {
    const componentMatch = result.match(
      /(?:function|const)\s+([A-Z][a-zA-Z0-9]*)/
    );
    if (componentMatch) {
      const componentName = componentMatch[1];
      const hasReactDomImport =
        /import.*from\s+['"]react-dom/.test(result);

      let renderBlock = "";
      if (!hasReactDomImport) {
        renderBlock += `\nimport { createRoot } from 'react-dom/client';\n`;
      }
      renderBlock += `\nconst root = createRoot(document.getElementById('root'));\nroot.render(<${componentName} />);\n`;

      result = result.trimEnd() + "\n" + renderBlock;

      issues.push({
        type: "missing-render-call",
        severity: "warning",
        message: "Standalone React component has no render call",
        fixed: true,
        fixDescription: `Added createRoot render call for <${componentName} />`,
      });
    }
  }

  return { code: result, issues };
}

function fixCommonJsxMistakes(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];
  let result = code;

  const replacements: Array<{
    pattern: RegExp;
    replacement: string;
    type: string;
    message: string;
  }> = [
    {
      pattern: /\bclass=/g,
      replacement: "className=",
      type: "jsx-class-to-classname",
      message: 'HTML `class=` should be `className=` in JSX',
    },
    {
      pattern: /\bfor=(?!["']?\w+\s+(?:of|in)\b)/g,
      replacement: "htmlFor=",
      type: "jsx-for-to-htmlfor",
      message: 'HTML `for=` should be `htmlFor=` in JSX',
    },
    {
      pattern: /\bonclick=/gi,
      replacement: "onClick=",
      type: "jsx-onclick",
      message: "`onclick` should be `onClick` in JSX",
    },
    {
      pattern: /\bonchange=/gi,
      replacement: "onChange=",
      type: "jsx-onchange",
      message: "`onchange` should be `onChange` in JSX",
    },
    {
      pattern: /\bonsubmit=/gi,
      replacement: "onSubmit=",
      type: "jsx-onsubmit",
      message: "`onsubmit` should be `onSubmit` in JSX",
    },
    {
      pattern: /\bonmouseover=/gi,
      replacement: "onMouseOver=",
      type: "jsx-onmouseover",
      message: "`onmouseover` should be `onMouseOver` in JSX",
    },
    {
      pattern: /\bonmouseout=/gi,
      replacement: "onMouseOut=",
      type: "jsx-onmouseout",
      message: "`onmouseout` should be `onMouseOut` in JSX",
    },
    {
      pattern: /\bonkeydown=/gi,
      replacement: "onKeyDown=",
      type: "jsx-onkeydown",
      message: "`onkeydown` should be `onKeyDown` in JSX",
    },
    {
      pattern: /\bonkeyup=/gi,
      replacement: "onKeyUp=",
      type: "jsx-onkeyup",
      message: "`onkeyup` should be `onKeyUp` in JSX",
    },
    {
      pattern: /\bonfocus=/gi,
      replacement: "onFocus=",
      type: "jsx-onfocus",
      message: "`onfocus` should be `onFocus` in JSX",
    },
    {
      pattern: /\bonblur=/gi,
      replacement: "onBlur=",
      type: "jsx-onblur",
      message: "`onblur` should be `onBlur` in JSX",
    },
    {
      pattern: /\btabindex=/gi,
      replacement: "tabIndex=",
      type: "jsx-tabindex",
      message: "`tabindex` should be `tabIndex` in JSX",
    },
    {
      pattern: /\breadonly(?=\s|=|>)/gi,
      replacement: "readOnly",
      type: "jsx-readonly",
      message: "`readonly` should be `readOnly` in JSX",
    },
    {
      pattern: /\bautocomplete=/gi,
      replacement: "autoComplete=",
      type: "jsx-autocomplete",
      message: "`autocomplete` should be `autoComplete` in JSX",
    },
  ];

  for (const { pattern, replacement, type, message } of replacements) {
    const matches = result.match(pattern);
    if (matches && matches.length > 0) {
      result = result.replace(pattern, replacement);
      issues.push({
        type,
        severity: "error",
        message,
        fixed: true,
        fixDescription: `Replaced ${matches.length} occurrence(s)`,
      });
    }
  }

  return { code: result, issues };
}
