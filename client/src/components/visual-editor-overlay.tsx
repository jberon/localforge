import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  MousePointer2,
  Move,
  Type,
  Palette,
  Box,
  Eye,
  EyeOff,
  Undo2,
  Check,
  X,
  Pipette,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface SelectedElement {
  tag: string;
  id?: string;
  veId: string;
  classes: string[];
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  computedStyles: Record<string, string>;
  attributes: Record<string, string>;
}

interface PropertyChange {
  property: string;
  oldValue: string;
  newValue: string;
  elementId: string;
}

interface VisualEditorOverlayProps {
  enabled: boolean;
  onToggle: () => void;
  projectId?: string;
  code: string;
  onCodeUpdate?: (updatedCode: string) => void;
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
}

export function VisualEditorOverlay({
  enabled,
  onToggle,
  projectId,
  code,
  onCodeUpdate,
  iframeRef,
}: VisualEditorOverlayProps) {
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [pendingChanges, setPendingChanges] = useState<PropertyChange[]>([]);
  const [editingProperty, setEditingProperty] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "ve-element-selected") {
        setSelectedElement(event.data.element);
        setEditingProperty(null);
      }
      if (event.data?.type === "ve-element-hover") {
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !iframeRef?.current) return;

    const injectScript = async () => {
      try {
        const response = await fetch("/api/optimization/visual-editor/inspector-script");
        const data = await response.json();
        if (data.script && iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(
            { type: "ve-inject-inspector", script: data.script },
            "*"
          );
        }
      } catch {
      }
    };

    const timer = setTimeout(injectScript, 500);
    return () => clearTimeout(timer);
  }, [enabled, iframeRef]);

  const startEdit = useCallback((property: string, currentValue: string) => {
    setEditingProperty(property);
    setEditValue(currentValue);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingProperty(null);
    setEditValue("");
  }, []);

  const confirmEdit = useCallback(() => {
    if (!editingProperty || !selectedElement) return;

    const change: PropertyChange = {
      property: editingProperty,
      oldValue: getPropertyValue(selectedElement, editingProperty),
      newValue: editValue,
      elementId: selectedElement.veId,
    };

    setPendingChanges(prev => [...prev, change]);
    setEditingProperty(null);
    setEditValue("");
  }, [editingProperty, editValue, selectedElement]);

  const applyChanges = useCallback(async () => {
    if (pendingChanges.length === 0 || !projectId) return;
    setIsApplying(true);

    try {
      const patches = pendingChanges.map(change => ({
        elementId: change.elementId,
        property: change.property,
        oldValue: change.oldValue,
        newValue: change.newValue,
      }));

      const response = await apiRequest("POST", "/api/optimization/visual-editor/apply-patches", {
        projectId,
        patches,
        sourceCode: code,
      });

      const result = await response.json();
      if (result.results?.length > 0) {
        const lastSuccessful = result.results.filter((r: any) => r.success).pop();
        if (lastSuccessful && onCodeUpdate) {
          onCodeUpdate(lastSuccessful.updatedCode);
        }
      }
      setPendingChanges([]);
    } catch {
    } finally {
      setIsApplying(false);
    }
  }, [pendingChanges, projectId, code, onCodeUpdate]);

  const undoLastChange = useCallback(() => {
    setPendingChanges(prev => prev.slice(0, -1));
  }, []);

  if (!enabled) {
    return null;
  }

  return (
    <div className="flex flex-col h-full" data-testid="visual-editor-overlay">
      <div className="flex items-center justify-between p-2 border-b gap-2">
        <div className="flex items-center gap-1.5">
          <MousePointer2 className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium">Visual Editor</span>
          <Badge variant="secondary" className="text-[10px]">
            Beta
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {pendingChanges.length > 0 && (
            <>
              <Badge variant="outline" className="text-[10px]">
                {pendingChanges.length} change{pendingChanges.length !== 1 ? "s" : ""}
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                onClick={undoLastChange}
                title="Undo last change"
                data-testid="button-undo-change"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                onClick={applyChanges}
                disabled={isApplying}
                data-testid="button-apply-changes"
              >
                <Check className="w-3.5 h-3.5 mr-1" />
                Apply
              </Button>
            </>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={onToggle}
            data-testid="button-close-visual-editor"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {selectedElement ? (
          <div className="p-3 space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] font-mono">
                  {"<"}{selectedElement.tag}{">"}
                </Badge>
                {selectedElement.id && (
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    #{selectedElement.id}
                  </Badge>
                )}
              </div>
              {selectedElement.classes.length > 0 && (
                <div className="flex flex-wrap gap-0.5">
                  {selectedElement.classes.slice(0, 5).map((cls, i) => (
                    <span key={i} className="text-[10px] text-muted-foreground font-mono bg-muted px-1 rounded">
                      .{cls}
                    </span>
                  ))}
                  {selectedElement.classes.length > 5 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{selectedElement.classes.length - 5} more
                    </span>
                  )}
                </div>
              )}
            </div>

            <Separator />

            <PropertySection
              title="Content"
              icon={<Type className="w-3.5 h-3.5" />}
            >
              <PropertyRow
                label="Text"
                value={selectedElement.text?.slice(0, 100) || "(empty)"}
                property="textContent"
                editingProperty={editingProperty}
                editValue={editValue}
                onStartEdit={startEdit}
                onConfirm={confirmEdit}
                onCancel={cancelEdit}
                onEditValueChange={setEditValue}
              />
            </PropertySection>

            <Separator />

            <PropertySection
              title="Styles"
              icon={<Palette className="w-3.5 h-3.5" />}
            >
              <PropertyRow
                label="Color"
                value={selectedElement.computedStyles?.color || "inherit"}
                property="style.color"
                editingProperty={editingProperty}
                editValue={editValue}
                onStartEdit={startEdit}
                onConfirm={confirmEdit}
                onCancel={cancelEdit}
                onEditValueChange={setEditValue}
                isColor
              />
              <PropertyRow
                label="Background"
                value={selectedElement.computedStyles?.backgroundColor || "transparent"}
                property="style.backgroundColor"
                editingProperty={editingProperty}
                editValue={editValue}
                onStartEdit={startEdit}
                onConfirm={confirmEdit}
                onCancel={cancelEdit}
                onEditValueChange={setEditValue}
                isColor
              />
              <PropertyRow
                label="Font Size"
                value={selectedElement.computedStyles?.fontSize || "16px"}
                property="style.fontSize"
                editingProperty={editingProperty}
                editValue={editValue}
                onStartEdit={startEdit}
                onConfirm={confirmEdit}
                onCancel={cancelEdit}
                onEditValueChange={setEditValue}
              />
            </PropertySection>

            <Separator />

            <PropertySection
              title="Layout"
              icon={<Box className="w-3.5 h-3.5" />}
            >
              <PropertyRow
                label="Padding"
                value={selectedElement.computedStyles?.padding || "0px"}
                property="style.padding"
                editingProperty={editingProperty}
                editValue={editValue}
                onStartEdit={startEdit}
                onConfirm={confirmEdit}
                onCancel={cancelEdit}
                onEditValueChange={setEditValue}
              />
              <PropertyRow
                label="Margin"
                value={selectedElement.computedStyles?.margin || "0px"}
                property="style.margin"
                editingProperty={editingProperty}
                editValue={editValue}
                onStartEdit={startEdit}
                onConfirm={confirmEdit}
                onCancel={cancelEdit}
                onEditValueChange={setEditValue}
              />
              <PropertyRow
                label="Border Radius"
                value={selectedElement.computedStyles?.borderRadius || "0px"}
                property="style.borderRadius"
                editingProperty={editingProperty}
                editValue={editValue}
                onStartEdit={startEdit}
                onConfirm={confirmEdit}
                onCancel={cancelEdit}
                onEditValueChange={setEditValue}
              />
            </PropertySection>

            <Separator />

            <PropertySection
              title="Class"
              icon={<Move className="w-3.5 h-3.5" />}
            >
              <PropertyRow
                label="className"
                value={selectedElement.classes.join(" ") || "(none)"}
                property="className"
                editingProperty={editingProperty}
                editValue={editValue}
                onStartEdit={startEdit}
                onConfirm={confirmEdit}
                onCancel={cancelEdit}
                onEditValueChange={setEditValue}
              />
            </PropertySection>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground p-4 text-center">
            <MousePointer2 className="w-8 h-8 mb-3 opacity-50" />
            <p className="text-sm font-medium">Click any element in the preview</p>
            <p className="text-xs mt-1 opacity-75">
              Select an element to inspect and edit its properties
            </p>
          </div>
        )}
      </ScrollArea>

      {pendingChanges.length > 0 && (
        <div className="border-t p-2 space-y-1">
          <p className="text-[10px] text-muted-foreground font-medium">Pending Changes:</p>
          {pendingChanges.map((change, i) => (
            <div key={i} className="flex items-center gap-1 text-[10px]">
              <span className="font-mono text-primary">{change.property}</span>
              <span className="text-muted-foreground">:</span>
              <span className="text-red-500 line-through truncate max-w-[60px]">{change.oldValue}</span>
              <span className="text-muted-foreground">-&gt;</span>
              <span className="text-green-500 truncate max-w-[60px]">{change.newValue}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PropertySection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

interface PropertyRowProps {
  label: string;
  value: string;
  property: string;
  editingProperty: string | null;
  editValue: string;
  onStartEdit: (property: string, value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onEditValueChange: (value: string) => void;
  isColor?: boolean;
}

function PropertyRow({
  label,
  value,
  property,
  editingProperty,
  editValue,
  onStartEdit,
  onConfirm,
  onCancel,
  onEditValueChange,
  isColor,
}: PropertyRowProps) {
  const isEditing = editingProperty === property;

  return (
    <div className="flex items-center gap-2 min-h-[28px]">
      <span className="text-[11px] text-muted-foreground w-20 shrink-0">{label}</span>
      {isEditing ? (
        <div className="flex items-center gap-1 flex-1">
          <Input
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            className="h-6 text-[11px] font-mono"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirm();
              if (e.key === "Escape") onCancel();
            }}
            type={isColor ? "text" : "text"}
            data-testid={`input-edit-${property}`}
          />
          {isColor && (
            <input
              type="color"
              value={editValue.startsWith("#") ? editValue : "#000000"}
              onChange={(e) => onEditValueChange(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border-0 p-0"
            />
          )}
          <Button size="icon" variant="ghost" onClick={onConfirm} className="h-6 w-6">
            <Check className="w-3 h-3" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onCancel} className="h-6 w-6">
            <X className="w-3 h-3" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onStartEdit(property, value)}
          className="flex-1 text-left text-[11px] font-mono truncate px-1.5 py-0.5 rounded hover-elevate"
          data-testid={`button-edit-${property}`}
        >
          <span className="flex items-center gap-1.5">
            {isColor && (
              <span
                className="w-3 h-3 rounded-sm border border-border inline-block shrink-0"
                style={{ backgroundColor: value }}
              />
            )}
            <span className="truncate">{value}</span>
          </span>
        </button>
      )}
    </div>
  );
}

function getPropertyValue(element: SelectedElement, property: string): string {
  if (property === "textContent") return element.text || "";
  if (property === "className") return element.classes.join(" ");
  if (property.startsWith("style.")) {
    const styleProp = property.replace("style.", "");
    return element.computedStyles?.[styleProp] || "";
  }
  return element.attributes?.[property] || "";
}

export type { SelectedElement, PropertyChange };
