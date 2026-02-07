import type { Issue } from "./types";

export function runCommonLLMMistakes(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];
  let result = code;

  const markdownResult = removeMarkdownArtifacts(result);
  issues.push(...markdownResult.issues);
  result = markdownResult.code;

  const preambleResult = removeLLMPreamble(result);
  issues.push(...preambleResult.issues);
  result = preambleResult.code;

  const dupFuncResult = fixDuplicateFunctions(result);
  issues.push(...dupFuncResult.issues);
  result = dupFuncResult.code;

  const constRedeclResult = fixConstRedeclaration(result);
  issues.push(...constRedeclResult.issues);
  result = constRedeclResult.code;

  const ternaryResult = fixIncompleteTernary(result);
  issues.push(...ternaryResult.issues);
  result = ternaryResult.code;

  const orphanElseResult = removeOrphanedElse(result);
  issues.push(...orphanElseResult.issues);
  result = orphanElseResult.code;

  return { code: result, issues };
}

function removeMarkdownArtifacts(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];
  let result = code;

  const codeBlockPattern = /^```(?:jsx?|tsx?|javascript|typescript|html|css|json)?\s*$/gm;
  const closingBlockPattern = /^```\s*$/gm;

  const openMatches = result.match(codeBlockPattern);
  const closeMatches = result.match(closingBlockPattern);
  const totalMatches = (openMatches?.length || 0) + (closeMatches?.length || 0);

  if (totalMatches > 0) {
    result = result.replace(
      /^```(?:jsx?|tsx?|javascript|typescript|html|css|json)?\s*$/gm,
      ""
    );
    result = result.replace(/^```\s*$/gm, "");
    result = result.replace(/\n{3,}/g, "\n\n");
    result = result.trim();

    issues.push({
      type: "markdown-artifacts",
      severity: "error",
      message: `Found ${totalMatches} markdown code block marker(s)`,
      fixed: true,
      fixDescription: "Removed markdown code block markers",
    });
  }

  return { code: result, issues };
}

function removeLLMPreamble(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];
  let result = code;

  const preamblePatterns = [
    /^(?:Here(?:'s| is) (?:the|your|a|an) (?:updated |modified |complete |full )?(?:code|implementation|solution|component|file|example)[^:\n]*:?\s*\n)/im,
    /^(?:Sure[!,.]?\s*(?:Here(?:'s| is)[^:\n]*:?)?\s*\n)/im,
    /^(?:(?:Below|Following) is (?:the|your|a|an) [^:\n]*:?\s*\n)/im,
    /^(?:I've (?:created|written|implemented|updated|modified) [^:\n]*:?\s*\n)/im,
    /^(?:(?:The|This) (?:code|implementation|solution) [^:\n]*:?\s*\n)/im,
    /^(?:Let me (?:create|write|implement|show|provide) [^:\n]*:?\s*\n)/im,
    /^(?:Certainly[!,.]?\s*(?:Here[^:\n]*:?)?\s*\n)/im,
    /^(?:Of course[!,.]?\s*(?:Here[^:\n]*:?)?\s*\n)/im,
  ];

  for (const pattern of preamblePatterns) {
    if (pattern.test(result)) {
      result = result.replace(pattern, "").trimStart();
      issues.push({
        type: "llm-preamble",
        severity: "info",
        message: "LLM preamble text detected and removed",
        fixed: true,
        fixDescription: "Removed introductory text before code",
      });
      break;
    }
  }

  const suffixPatterns = [
    /\n(?:This (?:code|implementation|component) (?:will|should|does) [^.]+\.\s*)+$/i,
    /\n(?:(?:Let me|I can) (?:know|explain|help) [^.]+\.\s*)+$/i,
    /\n(?:Feel free to (?:modify|adjust|customize) [^.]+\.\s*)+$/i,
    /\n(?:You can (?:then|now|also) [^.]+\.\s*)+$/i,
    /\n(?:Note:?\s+[^.]+\.\s*)+$/i,
  ];

  for (const pattern of suffixPatterns) {
    if (pattern.test(result)) {
      result = result.replace(pattern, "").trimEnd();
      issues.push({
        type: "llm-suffix",
        severity: "info",
        message: "LLM explanatory suffix text detected and removed",
        fixed: true,
        fixDescription: "Removed trailing explanation text after code",
      });
      break;
    }
  }

  return { code: result, issues };
}

function fixDuplicateFunctions(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];
  let result = code;

  const funcNames = new Map<string, number[]>();

  const funcDeclPattern =
    /^(\s*)(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm;
  let match: RegExpExecArray | null;

  while ((match = funcDeclPattern.exec(code)) !== null) {
    const name = match[2];
    if (!funcNames.has(name)) {
      funcNames.set(name, []);
    }
    funcNames.get(name)!.push(match.index);
  }

  const constFuncPattern =
    /^(\s*)(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(?[^)]*\)?\s*=>/gm;
  while ((match = constFuncPattern.exec(code)) !== null) {
    const name = match[2];
    if (!funcNames.has(name)) {
      funcNames.set(name, []);
    }
    funcNames.get(name)!.push(match.index);
  }

  for (const [name, positions] of Array.from(funcNames.entries())) {
    if (positions.length > 1) {
      issues.push({
        type: "duplicate-function",
        severity: "error",
        message: `Duplicate function declaration: '${name}' appears ${positions.length} times`,
        fixed: true,
        fixDescription: `Kept the last declaration of '${name}', removed earlier one(s)`,
      });

      for (let i = 0; i < positions.length - 1; i++) {
        const startPos = positions[i];
        const endPos =
          i + 1 < positions.length - 1
            ? positions[i + 1]
            : positions[positions.length - 1];

        const beforeDup = result.substring(0, startPos);
        const afterDup = result.substring(startPos);

        const funcBody = extractFunctionBody(afterDup);
        if (funcBody) {
          result =
            beforeDup +
            afterDup.substring(funcBody.length);
        }
      }
    }
  }

  return { code: result, issues };
}

function extractFunctionBody(code: string): string | null {
  let depth = 0;
  let started = false;
  let i = 0;

  for (; i < code.length; i++) {
    if (code[i] === "{") {
      depth++;
      started = true;
    } else if (code[i] === "}") {
      depth--;
      if (started && depth === 0) {
        return code.substring(0, i + 1);
      }
    }
  }

  if (started) {
    const lineEnd = code.indexOf("\n\n");
    if (lineEnd !== -1) return code.substring(0, lineEnd);
  }

  return null;
}

function fixConstRedeclaration(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];
  let result = code;
  const lines = result.split("\n");

  const constDeclarations = new Map<string, number[]>();

  for (let i = 0; i < lines.length; i++) {
    const constMatch = lines[i].match(
      /^\s*const\s+(\w+)\s*=/
    );
    if (constMatch) {
      const name = constMatch[1];
      if (!constDeclarations.has(name)) {
        constDeclarations.set(name, []);
      }
      constDeclarations.get(name)!.push(i);
    }
  }

  const linesToModify = new Set<number>();
  for (const [name, lineNums] of Array.from(constDeclarations.entries())) {
    if (lineNums.length > 1) {
      for (let j = 0; j < lineNums.length - 1; j++) {
        linesToModify.add(lineNums[j]);
      }
      issues.push({
        type: "const-redeclaration",
        severity: "error",
        message: `Variable '${name}' declared with const ${lineNums.length} times`,
        line: lineNums[0] + 1,
        fixed: true,
        fixDescription: `Changed earlier const declarations to let for '${name}'`,
      });
    }
  }

  if (linesToModify.size > 0) {
    const fixedLines = lines.map((line, idx) => {
      if (linesToModify.has(idx)) {
        return line.replace(/^(\s*)const\s+/, "$1let ");
      }
      return line;
    });
    result = fixedLines.join("\n");
  }

  return { code: result, issues };
}

function fixIncompleteTernary(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];
  let result = code;

  const lines = result.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;
    if (trimmed.startsWith("?.")) continue;

    const ternaryCheck = trimmed.match(/\w+\s*\?\s*[^:?]+$/);
    if (ternaryCheck && !trimmed.includes(":") && !trimmed.includes("?.")) {
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : "";
      if (!nextLine.startsWith(":")) {
        issues.push({
          type: "incomplete-ternary",
          severity: "warning",
          message: `Possible incomplete ternary expression at line ${i + 1}`,
          line: i + 1,
          fixed: false,
          fixDescription:
            "Ternary expression may be missing the : (else) branch",
        });
      }
    }
  }

  return { code: result, issues };
}

function removeOrphanedElse(code: string): {
  code: string;
  issues: Issue[];
} {
  const issues: Issue[] = [];
  let result = code;
  const lines = result.split("\n");
  const fixedLines: string[] = [];
  let prevNonEmptyTrimmed = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "else {" || trimmed === "} else {" || trimmed.startsWith("else if")) {
      const hasPreceedingIf = hasMatchingIf(lines, i);
      if (!hasPreceedingIf) {
        issues.push({
          type: "orphaned-else",
          severity: "error",
          message: `Orphaned else block at line ${i + 1} without matching if`,
          line: i + 1,
          fixed: true,
          fixDescription: "Removed orphaned else block",
        });

        if (trimmed.includes("{")) {
          let depth = 1;
          let j = i + 1;
          while (j < lines.length && depth > 0) {
            for (const ch of lines[j]) {
              if (ch === "{") depth++;
              if (ch === "}") depth--;
            }
            j++;
          }
          i = j - 1;
        }
        continue;
      }
    }

    fixedLines.push(line);
    if (trimmed.length > 0) {
      prevNonEmptyTrimmed = trimmed;
    }
  }

  result = fixedLines.join("\n");
  return { code: result, issues };
}

function hasMatchingIf(lines: string[], elseLineIdx: number): boolean {
  for (let i = elseLineIdx - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.length === 0) continue;
    if (trimmed === "}" || trimmed.endsWith("}")) {
      return true;
    }
    if (/\bif\s*\(/.test(trimmed)) {
      return true;
    }
    break;
  }
  return false;
}
