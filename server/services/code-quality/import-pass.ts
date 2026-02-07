import type { Issue } from "./types";

export function runImportDependencyResolution(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];
  let result = code;

  const unusedResult = removeUnusedImports(result);
  issues.push(...unusedResult.issues);
  result = unusedResult.code;

  const tailwindResult = addTailwindCdnIfNeeded(result);
  issues.push(...tailwindResult.issues);
  result = tailwindResult.code;

  const usedNotImported = detectUsedButNotImported(result);
  issues.push(...usedNotImported.issues);
  result = usedNotImported.code;

  return { code: result, issues };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeUnusedImports(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];
  let result = code;

  const importRegex =
    /^import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s+['"][^'"]+['"]\s*;?\s*$/gm;

  let match: RegExpExecArray | null;
  const importsToRemove: Array<{
    full: string;
    names: string[];
    unused: string[];
  }> = [];

  while ((match = importRegex.exec(code)) !== null) {
    const defaultImport = match[1];
    const namedImports = match[2];
    const allNames: string[] = [];

    if (defaultImport && defaultImport !== "React") {
      allNames.push(defaultImport);
    }
    if (namedImports) {
      const names = namedImports
        .split(",")
        .map((n) => {
          const parts = n.trim().split(/\s+as\s+/);
          return parts[parts.length - 1].trim();
        })
        .filter(Boolean);
      allNames.push(...names);
    }

    const unused: string[] = [];
    for (const name of allNames) {
      if (!name) continue;
      const codeWithoutImports = result.replace(
        /^import\s+.*$/gm,
        ""
      );
      const usagePattern = new RegExp(`\\b${escapeRegex(name)}\\b`);
      if (!usagePattern.test(codeWithoutImports)) {
        unused.push(name);
      }
    }

    if (unused.length > 0 && unused.length === allNames.length) {
      importsToRemove.push({ full: match[0], names: allNames, unused });
    }
  }

  for (const { full, unused } of importsToRemove) {
    result = result.replace(full, "").replace(/^\s*\n/gm, (m) => m);
    issues.push({
      type: "unused-import",
      severity: "info",
      message: `Unused import(s): ${unused.join(", ")}`,
      fixed: true,
      fixDescription: `Removed unused import statement`,
    });
  }

  result = result.replace(/\n{3,}/g, "\n\n");

  return { code: result, issues };
}

function detectUsedButNotImported(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];

  const knownModules: Array<{ name: string; from: string }> = [
    { name: "React", from: "react" },
    { name: "ReactDOM", from: "react-dom" },
    { name: "createRoot", from: "react-dom/client" },
  ];

  for (const mod of knownModules) {
    const usagePattern = new RegExp(`\\b${mod.name}\\b`);
    const importPattern = new RegExp(
      `import\\s+.*\\b${mod.name}\\b.*from\\s+['"]`
    );

    if (usagePattern.test(code) && !importPattern.test(code)) {
      const alreadyDestructured = new RegExp(
        `import\\s*\\{[^}]*\\b${mod.name}\\b[^}]*\\}\\s*from`
      ).test(code);

      if (!alreadyDestructured) {
        issues.push({
          type: "used-not-imported",
          severity: "warning",
          message: `'${mod.name}' is used but not imported from '${mod.from}'`,
          fixed: false,
          fixDescription: `Add import for '${mod.name}' from '${mod.from}'`,
        });
      }
    }
  }

  return { code, issues };
}

function addTailwindCdnIfNeeded(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];
  let result = code;

  const tailwindClasses =
    /\b(flex|grid|p-\d|m-\d|text-(?:sm|lg|xl|2xl|3xl)|bg-\w+|rounded|shadow|border|w-\d|h-\d|gap-\d|items-center|justify-center|space-[xy]-\d|min-h|max-w|overflow|relative|absolute|fixed|sticky)\b/;

  if (tailwindClasses.test(result)) {
    const hasTailwindImport =
      /tailwindcss|tailwind\.css|@tailwind|cdn\.tailwindcss/.test(result);

    if (!hasTailwindImport) {
      const hasHtmlHead = /<head[^>]*>/i.test(result);
      if (hasHtmlHead) {
        result = result.replace(
          /(<head[^>]*>)/i,
          '$1\n    <script src="https://cdn.tailwindcss.com"></script>'
        );
        issues.push({
          type: "missing-tailwind",
          severity: "info",
          message: "Tailwind CSS classes detected but no Tailwind import found",
          fixed: true,
          fixDescription: "Added Tailwind CSS CDN script to <head>",
        });
      } else {
        issues.push({
          type: "missing-tailwind",
          severity: "info",
          message:
            "Tailwind CSS classes detected but no Tailwind CSS import found. Add Tailwind CSS to your project.",
          fixed: false,
        });
      }
    }
  }

  return { code: result, issues };
}
