import type { Issue } from "./types";

export function runStructuralIntegrity(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];
  let result = code;

  const bracketResult = checkBracketMatching(result);
  issues.push(...bracketResult.issues);
  result = bracketResult.code;

  const stringResult = fixUnclosedStrings(result);
  issues.push(...stringResult.issues);
  result = stringResult.code;

  const truncationResult = detectTruncatedCode(result);
  issues.push(...truncationResult.issues);
  result = truncationResult.code;

  const semicolonResult = fixMissingSemicolons(result);
  issues.push(...semicolonResult.issues);
  result = semicolonResult.code;

  return { code: result, issues };
}

function checkBracketMatching(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];
  let result = code;

  const pairs: Array<[string, string, string]> = [
    ["{", "}", "brace"],
    ["(", ")", "parenthesis"],
    ["[", "]", "bracket"],
  ];

  for (const [open, close, name] of pairs) {
    const stack: Array<{ char: string; line: number; col: number }> = [];
    const lines = result.split("\n");
    let inString = false;
    let stringChar = "";
    let inComment = false;
    let inMultiComment = false;
    let inTemplate = false;
    let lineNum = 0;

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      lineNum = li + 1;
      for (let ci = 0; ci < line.length; ci++) {
        const ch = line[ci];
        const prev = ci > 0 ? line[ci - 1] : "";
        const next = ci < line.length - 1 ? line[ci + 1] : "";

        if (inMultiComment) {
          if (ch === "*" && next === "/") {
            inMultiComment = false;
            ci++;
          }
          continue;
        }
        if (inComment) continue;
        if (ch === "/" && next === "/") {
          inComment = true;
          continue;
        }
        if (ch === "/" && next === "*") {
          inMultiComment = true;
          ci++;
          continue;
        }

        if (inTemplate) {
          if (ch === "`" && prev !== "\\") {
            inTemplate = false;
          }
          continue;
        }

        if (!inString && ch === "`") {
          inTemplate = true;
          continue;
        }

        if (inString) {
          if (ch === stringChar && prev !== "\\") {
            inString = false;
          }
          continue;
        }

        if (ch === '"' || ch === "'") {
          inString = true;
          stringChar = ch;
          continue;
        }

        if (ch === open) {
          stack.push({ char: ch, line: lineNum, col: ci });
        } else if (ch === close) {
          if (stack.length === 0) {
            issues.push({
              type: `unmatched-closing-${name}`,
              severity: "error",
              message: `Unmatched closing ${name} '${close}' at line ${lineNum}`,
              line: lineNum,
              fixed: false,
            });
          } else {
            stack.pop();
          }
        }
      }
      inComment = false;
    }

    if (stack.length > 0) {
      const missing = stack.length;
      issues.push({
        type: `unclosed-${name}`,
        severity: "error",
        message: `${missing} unclosed ${name}(s) - first opened at line ${stack[0].line}`,
        line: stack[0].line,
        fixed: true,
        fixDescription: `Added ${missing} closing '${close}' at end of code`,
      });
      result = result.trimEnd() + "\n" + close.repeat(missing) + "\n";
    }
  }

  return { code: result, issues };
}

function fixUnclosedStrings(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];
  const lines = code.split("\n");
  const fixedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
      fixedLines.push(line);
      continue;
    }

    let inString = false;
    let stringChar = "";
    let escaped = false;

    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "`") {
        fixedLines.push(line);
        inString = false;
        break;
      }
      if (!inString && (ch === '"' || ch === "'")) {
        inString = true;
        stringChar = ch;
      } else if (inString && ch === stringChar) {
        inString = false;
      }
    }

    if (inString) {
      issues.push({
        type: "unclosed-string",
        severity: "error",
        message: `Unclosed string literal at line ${i + 1}`,
        line: i + 1,
        fixed: true,
        fixDescription: `Added closing ${stringChar} at end of line`,
      });
      line = line + stringChar;
    }
    fixedLines.push(line);
  }

  return { code: fixedLines.join("\n"), issues };
}

function detectTruncatedCode(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];
  const trimmed = code.trimEnd();
  const lastLine = trimmed.split("\n").pop() || "";
  const lastTrimmed = lastLine.trim();

  const truncationPatterns = [
    { pattern: /,\s*$/, desc: "ends with a trailing comma" },
    { pattern: /\(\s*$/, desc: "ends with an open parenthesis" },
    { pattern: /\{\s*$/, desc: "ends with an open brace" },
    { pattern: /=>\s*$/, desc: "ends with an arrow (incomplete arrow function)" },
    { pattern: /=\s*$/, desc: "ends with an assignment operator" },
    { pattern: /\+\s*$/, desc: "ends with a plus operator" },
    { pattern: /&&\s*$/, desc: "ends with logical AND" },
    { pattern: /\|\|\s*$/, desc: "ends with logical OR" },
    { pattern: /\?\s*$/, desc: "ends with a ternary operator" },
    { pattern: /:\s*$/, desc: "ends with a colon (incomplete ternary or object)" },
    { pattern: /return\s*$/, desc: "ends with an empty return statement" },
  ];

  for (const { pattern, desc } of truncationPatterns) {
    if (pattern.test(lastTrimmed)) {
      issues.push({
        type: "truncated-code",
        severity: "error",
        message: `Code appears truncated: ${desc}`,
        line: trimmed.split("\n").length,
        fixed: false,
      });
      break;
    }
  }

  const funcPattern = /(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:\(|async\s*\())[^{]*\{/g;
  let match;
  let lastFuncStart = -1;
  while ((match = funcPattern.exec(code)) !== null) {
    lastFuncStart = match.index;
  }

  if (lastFuncStart !== -1) {
    const afterFunc = code.substring(lastFuncStart);
    const openCount = (afterFunc.match(/\{/g) || []).length;
    const closeCount = (afterFunc.match(/\}/g) || []).length;
    if (openCount > closeCount + 1) {
      issues.push({
        type: "incomplete-function",
        severity: "warning",
        message: "Last function body may be incomplete (unbalanced braces)",
        fixed: false,
      });
    }
  }

  return { code, issues };
}

function fixMissingSemicolons(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];
  const lines = code.split("\n");
  const fixedLines: string[] = [];

  const needsSemicolon =
    /^\s*(const|let|var|return|throw|import|export\s+(?:default\s+)?(?:const|let|var))\b/;
  const endsWithoutSemicolon = /[^;{},\s/\\*]\s*$/;
  const noSemicolonNeeded =
    /(?:^\s*(?:if|else|for|while|do|switch|try|catch|finally|class|function|\/\/|\/\*|\*|.*\{$|.*\}$|.*=>))/;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();

    if (
      trimmed.length > 0 &&
      needsSemicolon.test(line) &&
      endsWithoutSemicolon.test(trimmed) &&
      !noSemicolonNeeded.test(trimmed) &&
      !trimmed.endsWith("{") &&
      !trimmed.endsWith("}") &&
      !trimmed.endsWith("(") &&
      !trimmed.endsWith(",") &&
      !trimmed.endsWith("=>")
    ) {
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : "";
      if (
        nextLine &&
        !nextLine.startsWith(".") &&
        !nextLine.startsWith("?") &&
        !nextLine.startsWith("+") &&
        !nextLine.startsWith("-") &&
        !nextLine.startsWith("||") &&
        !nextLine.startsWith("&&")
      ) {
        if (
          /^\s*(const|let|var)\s+\w+\s*=\s*[^{(]/.test(line) &&
          !trimmed.endsWith(",") &&
          !trimmed.endsWith("(")
        ) {
          const singleLineAssign = /=\s*.+[^,{(]\s*$/.test(trimmed);
          if (singleLineAssign) {
            issues.push({
              type: "missing-semicolon",
              severity: "warning",
              message: `Missing semicolon at line ${i + 1}`,
              line: i + 1,
              fixed: true,
              fixDescription: "Added semicolon at end of statement",
            });
            line = line.replace(/\s*$/, ";");
          }
        }
      }
    }

    fixedLines.push(line);
  }

  return { code: fixedLines.join("\n"), issues };
}
