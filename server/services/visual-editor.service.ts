import { BaseService, ManagedMap } from "../lib/base-service";

interface ElementMapping {
  id: string;
  selector: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  componentName: string;
  elementType: string;
  props: Record<string, any>;
  styles: Record<string, string>;
  textContent?: string;
}

interface PropertyPatch {
  elementId: string;
  property: string;
  oldValue: string;
  newValue: string;
}

interface PatchResult {
  success: boolean;
  updatedCode: string;
  patch: PropertyPatch;
  affectedLines: { start: number; end: number };
  error?: string;
}

class VisualEditorService extends BaseService {
  private static instance: VisualEditorService;
  private elementMappings: ManagedMap<string, ElementMapping[]>;
  private readonly MAX_MAPPINGS = 200;

  private constructor() {
    super("VisualEditorService");
    this.elementMappings = this.createManagedMap({ maxSize: 200, strategy: "lru" });
  }

  static getInstance(): VisualEditorService {
    if (!VisualEditorService.instance) {
      VisualEditorService.instance = new VisualEditorService();
    }
    return VisualEditorService.instance;
  }

  parseSourceCode(projectId: string, files: Array<{ path: string; content: string }>): ElementMapping[] {
    const allMappings: ElementMapping[] = [];

    for (const file of files) {
      const componentName = this.extractComponentName(file.content, file.path);
      const fileMappings = this.parseJSXElements(file.path, file.content, componentName);
      allMappings.push(...fileMappings);
    }

    if (allMappings.length > this.MAX_MAPPINGS) {
      allMappings.length = this.MAX_MAPPINGS;
    }

    this.elementMappings.set(projectId, allMappings);
    this.evictMappingsIfNeeded();

    this.log("Parsed source code for visual editor", {
      projectId,
      fileCount: files.length,
      elementCount: allMappings.length,
    });

    return allMappings;
  }

  getMappings(projectId: string): ElementMapping[] {
    return this.elementMappings.get(projectId) || [];
  }

  applyPatch(projectId: string, patch: PropertyPatch, sourceCode: string): PatchResult {
    const mappings = this.elementMappings.get(projectId) || [];
    const element = mappings.find((m) => m.id === patch.elementId);

    if (!element) {
      this.logWarn("Element not found for patch", { elementId: patch.elementId, projectId });
      return {
        success: false,
        updatedCode: sourceCode,
        patch,
        affectedLines: { start: 0, end: 0 },
        error: `Element with id "${patch.elementId}" not found`,
      };
    }

    try {
      let updatedCode: string;
      let affectedLines: { start: number; end: number };

      if (patch.property === "textContent") {
        const result = this.applyTextContentPatch(sourceCode, element, patch);
        updatedCode = result.code;
        affectedLines = result.lines;
      } else if (patch.property === "className") {
        const result = this.applyClassNamePatch(sourceCode, element, patch);
        updatedCode = result.code;
        affectedLines = result.lines;
      } else if (patch.property.startsWith("style.")) {
        const result = this.applyStylePatch(sourceCode, element, patch);
        updatedCode = result.code;
        affectedLines = result.lines;
      } else if (patch.property === "hidden" || patch.property === "visibility") {
        const result = this.applyVisibilityPatch(sourceCode, element, patch);
        updatedCode = result.code;
        affectedLines = result.lines;
      } else {
        const result = this.applyGenericPropPatch(sourceCode, element, patch);
        updatedCode = result.code;
        affectedLines = result.lines;
      }

      this.updateMappingAfterPatch(projectId, patch, element);

      this.log("Applied visual editor patch", {
        projectId,
        elementId: patch.elementId,
        property: patch.property,
      });

      return {
        success: true,
        updatedCode,
        patch,
        affectedLines,
      };
    } catch (err: any) {
      this.logError("Failed to apply visual editor patch", {
        projectId,
        elementId: patch.elementId,
        error: err.message,
      });
      return {
        success: false,
        updatedCode: sourceCode,
        patch,
        affectedLines: { start: element.lineStart, end: element.lineEnd },
        error: err.message,
      };
    }
  }

  applyPatches(projectId: string, patches: PropertyPatch[], sourceCode: string): PatchResult[] {
    const results: PatchResult[] = [];
    let currentCode = sourceCode;

    for (const patch of patches) {
      const result = this.applyPatch(projectId, patch, currentCode);
      results.push(result);
      if (result.success) {
        currentCode = result.updatedCode;
      }
    }

    this.log("Applied multiple visual editor patches", {
      projectId,
      total: patches.length,
      successful: results.filter((r) => r.success).length,
    });

    return results;
  }

  getInspectorScript(): string {
    return `
(function() {
  if (window.__veInspectorActive) return;
  window.__veInspectorActive = true;

  var overlay = document.createElement('div');
  overlay.id = '__ve-overlay';
  overlay.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #3b82f6;background:rgba(59,130,246,0.08);z-index:999999;display:none;transition:all 0.1s ease;';
  document.body.appendChild(overlay);

  var label = document.createElement('div');
  label.id = '__ve-label';
  label.style.cssText = 'position:fixed;pointer-events:none;background:#3b82f6;color:#fff;font-size:11px;font-family:monospace;padding:2px 6px;border-radius:2px;z-index:1000000;display:none;white-space:nowrap;';
  document.body.appendChild(label);

  var veIdCounter = 0;

  function assignVeIds() {
    var els = document.querySelectorAll('body *:not(script):not(style):not(#__ve-overlay):not(#__ve-label)');
    for (var i = 0; i < els.length; i++) {
      if (!els[i].getAttribute('data-ve-id')) {
        els[i].setAttribute('data-ve-id', 've-' + (++veIdCounter));
      }
    }
  }

  function getSelector(el) {
    var parts = [];
    while (el && el !== document.body) {
      var tag = el.tagName.toLowerCase();
      var id = el.id ? '#' + el.id : '';
      var cls = el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\\s+/).join('.')
        : '';
      parts.unshift(tag + id + cls);
      el = el.parentElement;
    }
    return parts.join(' > ');
  }

  function getElementInfo(el) {
    var rect = el.getBoundingClientRect();
    var computed = window.getComputedStyle(el);
    return {
      veId: el.getAttribute('data-ve-id'),
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      className: el.className || '',
      textContent: (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3)
        ? el.childNodes[0].textContent
        : null,
      selector: getSelector(el),
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      styles: {
        color: computed.color,
        backgroundColor: computed.backgroundColor,
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight,
        padding: computed.padding,
        margin: computed.margin,
        display: computed.display,
        visibility: computed.visibility,
        borderRadius: computed.borderRadius
      }
    };
  }

  assignVeIds();

  var mutObs = new MutationObserver(function() { assignVeIds(); });
  mutObs.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('mouseover', function(e) {
    var el = e.target;
    if (!el || el.id === '__ve-overlay' || el.id === '__ve-label') return;
    var rect = el.getBoundingClientRect();
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.style.display = 'block';
    label.textContent = '<' + el.tagName.toLowerCase() + '>' +
      (el.className && typeof el.className === 'string' ? ' .' + el.className.trim().split(/\\s+/)[0] : '');
    label.style.top = Math.max(0, rect.top - 22) + 'px';
    label.style.left = rect.left + 'px';
    label.style.display = 'block';
  }, true);

  document.addEventListener('mouseout', function(e) {
    if (e.target && (e.target.id === '__ve-overlay' || e.target.id === '__ve-label')) return;
    overlay.style.display = 'none';
    label.style.display = 'none';
  }, true);

  document.addEventListener('click', function(e) {
    var el = e.target;
    if (!el || el.id === '__ve-overlay' || el.id === '__ve-label') return;
    e.preventDefault();
    e.stopPropagation();
    var info = getElementInfo(el);
    window.parent.postMessage({ type: 'visual-editor-select', payload: info }, '*');
  }, true);
})();
`;
  }

  destroy(): void {
    this.elementMappings.clear();
    this.log("VisualEditorService destroyed");
  }

  private extractComponentName(content: string, filePath: string): string {
    const exportDefaultMatch = content.match(
      /export\s+default\s+function\s+(\w+)/
    );
    if (exportDefaultMatch) return exportDefaultMatch[1];

    const namedExportMatch = content.match(
      /export\s+(?:const|function)\s+(\w+)/
    );
    if (namedExportMatch) return namedExportMatch[1];

    const constComponentMatch = content.match(
      /const\s+(\w+)\s*[:=]\s*(?:\([^)]*\)|)\s*(?:=>|{)/
    );
    if (constComponentMatch) return constComponentMatch[1];

    const fileName = filePath.split("/").pop() || "Unknown";
    return fileName.replace(/\.(tsx?|jsx?)$/, "");
  }

  private parseJSXElements(
    filePath: string,
    content: string,
    componentName: string
  ): ElementMapping[] {
    const mappings: ElementMapping[] = [];
    const lines = content.split("\n");

    const jsxTagRegex = /<(\w+)(\s[^>]*)?\/?>/g;
    let match: RegExpExecArray | null;
    let elementIndex = 0;

    while ((match = jsxTagRegex.exec(content)) !== null) {
      const tagName = match[1];

      if (/^[A-Z]/.test(tagName) && !["Fragment"].includes(tagName)) {
        continue;
      }

      if (["Fragment", "React"].includes(tagName)) continue;

      const charIndex = match.index;
      const lineStart = this.getLineNumber(content, charIndex);
      const lineEnd = this.findClosingTagLine(content, lines, tagName, charIndex);

      const propsString = match[2] || "";
      const props = this.parseProps(propsString);
      const styles = this.parseStyleProp(propsString);
      const className = this.extractClassName(propsString);
      const textContent = this.extractTextContent(content, tagName, charIndex);

      const id = `ve_${filePath.replace(/[^a-zA-Z0-9]/g, "_")}_${lineStart}_${elementIndex++}`;

      const selectorParts: string[] = [tagName];
      if (className) {
        selectorParts.push(
          "." + className.split(/\s+/).filter(Boolean).join(".")
        );
      }

      mappings.push({
        id,
        selector: selectorParts.join(""),
        filePath,
        lineStart,
        lineEnd,
        componentName,
        elementType: tagName,
        props,
        styles,
        textContent: textContent || undefined,
      });
    }

    return mappings;
  }

  private getLineNumber(content: string, charIndex: number): number {
    let line = 1;
    for (let i = 0; i < charIndex && i < content.length; i++) {
      if (content[i] === "\n") line++;
    }
    return line;
  }

  private findClosingTagLine(
    content: string,
    lines: string[],
    tagName: string,
    openCharIndex: number
  ): number {
    const selfCloseCheck = content.substring(
      openCharIndex,
      content.indexOf(">", openCharIndex) + 1
    );
    if (selfCloseCheck.endsWith("/>")) {
      return this.getLineNumber(content, openCharIndex);
    }

    const closingTag = `</${tagName}>`;
    let depth = 1;
    let searchStart = content.indexOf(">", openCharIndex) + 1;

    const openTagRegex = new RegExp(`<${tagName}[\\s>/]`, "g");
    const closeTagRegex = new RegExp(`</${tagName}>`, "g");

    while (depth > 0 && searchStart < content.length) {
      openTagRegex.lastIndex = searchStart;
      closeTagRegex.lastIndex = searchStart;

      const nextOpen = openTagRegex.exec(content);
      const nextClose = closeTagRegex.exec(content);

      if (!nextClose) break;

      if (nextOpen && nextOpen.index < nextClose.index) {
        depth++;
        searchStart = nextOpen.index + nextOpen[0].length;
      } else {
        depth--;
        if (depth === 0) {
          return this.getLineNumber(content, nextClose.index);
        }
        searchStart = nextClose.index + nextClose[0].length;
      }
    }

    return this.getLineNumber(content, openCharIndex);
  }

  private parseProps(propsString: string): Record<string, any> {
    const props: Record<string, any> = {};

    const stringPropRegex = /(\w+)="([^"]*)"/g;
    let propMatch: RegExpExecArray | null;
    while ((propMatch = stringPropRegex.exec(propsString)) !== null) {
      props[propMatch[1]] = propMatch[2];
    }

    const boolPropRegex = /\s(\w+)(?=\s|\/|>|$)(?!=)/g;
    while ((propMatch = boolPropRegex.exec(propsString)) !== null) {
      const name = propMatch[1];
      if (!props[name] && name !== "className" && name !== "style") {
        props[name] = true;
      }
    }

    const exprPropRegex = /(\w+)=\{([^}]*)}/g;
    while ((propMatch = exprPropRegex.exec(propsString)) !== null) {
      if (propMatch[1] !== "style") {
        props[propMatch[1]] = propMatch[2];
      }
    }

    return props;
  }

  private parseStyleProp(propsString: string): Record<string, string> {
    const styles: Record<string, string> = {};

    const styleMatch = propsString.match(/style=\{\{([^}]*)\}\}/);
    if (!styleMatch) return styles;

    const styleContent = styleMatch[1];
    const stylePairRegex = /(\w+)\s*:\s*['"]?([^,'"}]+)['"]?/g;
    let pairMatch: RegExpExecArray | null;
    while ((pairMatch = stylePairRegex.exec(styleContent)) !== null) {
      styles[pairMatch[1]] = pairMatch[2].trim();
    }

    return styles;
  }

  private extractClassName(propsString: string): string | null {
    const classNameMatch = propsString.match(/className="([^"]*)"/);
    if (classNameMatch) return classNameMatch[1];

    const exprMatch = propsString.match(/className=\{[`']([^`']*)[`']\}/);
    if (exprMatch) return exprMatch[1];

    return null;
  }

  private extractTextContent(
    content: string,
    tagName: string,
    openCharIndex: number
  ): string | null {
    const closingBracket = content.indexOf(">", openCharIndex);
    if (closingBracket === -1) return null;

    const selfClose = content.substring(openCharIndex, closingBracket + 1);
    if (selfClose.endsWith("/>")) return null;

    const closingTag = `</${tagName}>`;
    const closingTagIndex = content.indexOf(closingTag, closingBracket);
    if (closingTagIndex === -1) return null;

    const inner = content.substring(closingBracket + 1, closingTagIndex).trim();

    if (inner.includes("<") || inner.includes("{")) return null;

    return inner || null;
  }

  private applyTextContentPatch(
    code: string,
    element: ElementMapping,
    patch: PropertyPatch
  ): { code: string; lines: { start: number; end: number } } {
    const tag = element.elementType;
    const escapedOld = this.escapeRegex(patch.oldValue);
    const pattern = new RegExp(
      `(<${tag}[^>]*>)\\s*${escapedOld}\\s*(</${tag}>)`
    );

    const updated = code.replace(pattern, `$1${patch.newValue}$2`);

    if (updated === code) {
      throw new Error(
        `Could not find text content "${patch.oldValue}" in <${tag}> element`
      );
    }

    return {
      code: updated,
      lines: { start: element.lineStart, end: element.lineEnd },
    };
  }

  private applyClassNamePatch(
    code: string,
    element: ElementMapping,
    patch: PropertyPatch
  ): { code: string; lines: { start: number; end: number } } {
    const lines = code.split("\n");
    const targetLineIdx = element.lineStart - 1;

    if (targetLineIdx < 0 || targetLineIdx >= lines.length) {
      throw new Error(`Line ${element.lineStart} out of range`);
    }

    const searchRegion = lines
      .slice(targetLineIdx, Math.min(targetLineIdx + 5, lines.length))
      .join("\n");

    if (patch.oldValue && searchRegion.includes(`className="${patch.oldValue}"`)) {
      const updatedRegion = searchRegion.replace(
        `className="${patch.oldValue}"`,
        `className="${patch.newValue}"`
      );
      const newLines = updatedRegion.split("\n");
      lines.splice(targetLineIdx, newLines.length, ...newLines);
    } else if (searchRegion.includes("className=")) {
      const updatedRegion = searchRegion.replace(
        /className="([^"]*)"/,
        `className="${patch.newValue}"`
      );
      const newLines = updatedRegion.split("\n");
      lines.splice(targetLineIdx, newLines.length, ...newLines);
    } else {
      const tagPattern = new RegExp(`(<${element.elementType})(\\s)`);
      if (tagPattern.test(lines[targetLineIdx])) {
        lines[targetLineIdx] = lines[targetLineIdx].replace(
          tagPattern,
          `$1 className="${patch.newValue}"$2`
        );
      } else {
        throw new Error(
          `Could not find className prop on <${element.elementType}> at line ${element.lineStart}`
        );
      }
    }

    return {
      code: lines.join("\n"),
      lines: { start: element.lineStart, end: element.lineEnd },
    };
  }

  private applyStylePatch(
    code: string,
    element: ElementMapping,
    patch: PropertyPatch
  ): { code: string; lines: { start: number; end: number } } {
    const styleProp = patch.property.replace("style.", "");
    const lines = code.split("\n");
    const targetLineIdx = element.lineStart - 1;

    const searchRegion = lines
      .slice(targetLineIdx, Math.min(targetLineIdx + 10, lines.length))
      .join("\n");

    const existingStyleRegex = /style=\{\{([^}]*)\}\}/;
    const existingMatch = searchRegion.match(existingStyleRegex);

    if (existingMatch) {
      const styleContent = existingMatch[1];
      const propRegex = new RegExp(
        `(${styleProp})\\s*:\\s*['"]?[^,'"}]+['"]?`
      );

      let newStyleContent: string;
      if (propRegex.test(styleContent)) {
        newStyleContent = styleContent.replace(
          propRegex,
          `${styleProp}: '${patch.newValue}'`
        );
      } else {
        newStyleContent = styleContent.trimEnd() + `, ${styleProp}: '${patch.newValue}'`;
      }

      const updatedRegion = searchRegion.replace(
        existingStyleRegex,
        `style={{${newStyleContent}}}`
      );
      const newLines = updatedRegion.split("\n");
      const sliceLen = Math.min(targetLineIdx + 10, lines.length) - targetLineIdx;
      lines.splice(targetLineIdx, sliceLen, ...newLines);
    } else {
      const tagPattern = new RegExp(`(<${element.elementType})([\\s>])`);
      if (tagPattern.test(lines[targetLineIdx])) {
        lines[targetLineIdx] = lines[targetLineIdx].replace(
          tagPattern,
          `$1 style={{${styleProp}: '${patch.newValue}'}}$2`
        );
      } else {
        throw new Error(
          `Could not add style prop to <${element.elementType}> at line ${element.lineStart}`
        );
      }
    }

    return {
      code: lines.join("\n"),
      lines: { start: element.lineStart, end: element.lineEnd },
    };
  }

  private applyVisibilityPatch(
    code: string,
    element: ElementMapping,
    patch: PropertyPatch
  ): { code: string; lines: { start: number; end: number } } {
    const isHidden = patch.newValue === "hidden" || patch.newValue === "false" || patch.newValue === "none";

    if (isHidden) {
      return this.applyStylePatch(code, element, {
        ...patch,
        property: "style.display",
        newValue: "none",
      });
    } else {
      return this.applyStylePatch(code, element, {
        ...patch,
        property: "style.display",
        newValue: patch.newValue || "block",
      });
    }
  }

  private applyGenericPropPatch(
    code: string,
    element: ElementMapping,
    patch: PropertyPatch
  ): { code: string; lines: { start: number; end: number } } {
    const lines = code.split("\n");
    const targetLineIdx = element.lineStart - 1;

    const searchRegion = lines
      .slice(targetLineIdx, Math.min(targetLineIdx + 5, lines.length))
      .join("\n");

    const propRegex = new RegExp(`${patch.property}="([^"]*)"`);
    if (propRegex.test(searchRegion)) {
      const updatedRegion = searchRegion.replace(
        propRegex,
        `${patch.property}="${patch.newValue}"`
      );
      const newLines = updatedRegion.split("\n");
      const sliceLen = Math.min(targetLineIdx + 5, lines.length) - targetLineIdx;
      lines.splice(targetLineIdx, sliceLen, ...newLines);
    } else {
      const tagPattern = new RegExp(`(<${element.elementType})(\\s)`);
      if (tagPattern.test(lines[targetLineIdx])) {
        lines[targetLineIdx] = lines[targetLineIdx].replace(
          tagPattern,
          `$1 ${patch.property}="${patch.newValue}"$2`
        );
      } else {
        throw new Error(
          `Could not apply prop "${patch.property}" to <${element.elementType}> at line ${element.lineStart}`
        );
      }
    }

    return {
      code: lines.join("\n"),
      lines: { start: element.lineStart, end: element.lineEnd },
    };
  }

  private updateMappingAfterPatch(
    projectId: string,
    patch: PropertyPatch,
    element: ElementMapping
  ): void {
    const mappings = this.elementMappings.get(projectId);
    if (!mappings) return;

    const idx = mappings.findIndex((m) => m.id === element.id);
    if (idx === -1) return;

    if (patch.property === "textContent") {
      mappings[idx].textContent = patch.newValue;
    } else if (patch.property === "className") {
      mappings[idx].props["className"] = patch.newValue;
    } else if (patch.property.startsWith("style.")) {
      const styleProp = patch.property.replace("style.", "");
      mappings[idx].styles[styleProp] = patch.newValue;
    }
  }

  private evictMappingsIfNeeded(): void {
    if (this.elementMappings.size <= this.MAX_MAPPINGS) return;

    const keys = Array.from(this.elementMappings.keys());
    const toRemove = keys.slice(0, keys.length - this.MAX_MAPPINGS);
    for (const key of toRemove) {
      this.elementMappings.delete(key);
    }

    this.log("Evicted old element mappings", {
      removed: toRemove.length,
      remaining: this.elementMappings.size,
    });
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

export const visualEditorService = VisualEditorService.getInstance();
