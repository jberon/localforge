import { useState, useCallback, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Upload,
  Image,
  FileImage,
  Wand2,
  Loader2,
  CheckCircle,
  X,
  Eye,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface AnalysisResult {
  importId: string;
  elements: DetectedElement[];
  layout?: string;
  colors?: string[];
  fonts?: string[];
}

interface DetectedElement {
  type: string;
  name: string;
  confidence: number;
  properties?: Record<string, string>;
}

interface ImageImportDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCodeGenerated?: (prompt: string) => void;
}

type SourceType = "screenshot" | "design-export" | "figma-export";

const SOURCE_LABELS: Record<SourceType, string> = {
  screenshot: "Screenshot",
  "design-export": "Design Export",
  "figma-export": "Figma Export",
};

export function ImageImportDialog({
  projectId,
  open,
  onOpenChange,
  onCodeGenerated,
}: ImageImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<SourceType>("screenshot");
  const [importId, setImportId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createImportMutation = useMutation({
    mutationFn: async ({ fileName, imageData }: { fileName: string; imageData: string }) => {
      const res = await apiRequest("POST", "/api/optimization/image-import/create", {
        projectId,
        sourceType,
        fileName,
        imageData,
      });
      return res.json() as Promise<{ importId: string }>;
    },
    onSuccess: (data) => {
      setImportId(data.importId);
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/optimization/image-import/${id}/analyze`, {});
      return res.json() as Promise<AnalysisResult>;
    },
    onSuccess: (data) => {
      setAnalysis(data);
    },
  });

  const generatePromptMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/optimization/image-import/${id}/generate-prompt`, {});
      return res.json() as Promise<{ prompt: string }>;
    },
    onSuccess: (data) => {
      onCodeGenerated?.(data.prompt);
      handleReset();
      onOpenChange(false);
    },
  });

  const handleFileSelect = useCallback(
    (selectedFile: File) => {
      setFile(selectedFile);
      setAnalysis(null);
      setImportId(null);

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setPreview(dataUrl);
      };
      reader.readAsDataURL(selectedFile);
    },
    []
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) handleFileSelect(selected);
    },
    [handleFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const dropped = e.dataTransfer.files?.[0];
      if (dropped && dropped.type.startsWith("image/")) {
        handleFileSelect(dropped);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!file || !preview) return;

    let currentImportId = importId;
    if (!currentImportId) {
      const result = await createImportMutation.mutateAsync({
        fileName: file.name,
        imageData: preview,
      });
      currentImportId = result.importId;
    }

    if (currentImportId) {
      analyzeMutation.mutate(currentImportId);
    }
  }, [file, preview, importId, createImportMutation, analyzeMutation]);

  const handleGenerateCode = useCallback(() => {
    if (importId) {
      generatePromptMutation.mutate(importId);
    }
  }, [importId, generatePromptMutation]);

  const handleReset = useCallback(() => {
    setFile(null);
    setPreview(null);
    setImportId(null);
    setAnalysis(null);
    setIsDragOver(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const isAnalyzing = createImportMutation.isPending || analyzeMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="image-import-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileImage className="w-5 h-5 text-primary" />
            Import Design Image
          </DialogTitle>
          <DialogDescription>
            Upload a design image to analyze and convert to code
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!preview ? (
            <div
              className={`
                flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-md cursor-pointer transition-colors
                ${isDragOver ? "border-primary bg-primary/5" : "border-border"}
              `}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              data-testid="dropzone-upload"
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">Drop an image here or click to upload</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports PNG, JPG, SVG
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={handleInputChange}
                data-testid="input-file-upload"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-md border overflow-hidden">
                <img
                  src={preview}
                  alt="Uploaded design preview"
                  className="w-full max-h-48 object-contain bg-muted/30"
                  data-testid="img-preview"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm"
                  onClick={handleReset}
                  data-testid="button-remove-image"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px]">
                  <Image className="w-3 h-3 mr-1" />
                  {file?.name}
                </Badge>
                {file && (
                  <Badge variant="outline" className="text-[10px]">
                    {(file.size / 1024).toFixed(1)} KB
                  </Badge>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium">Source Type</label>
            <Select
              value={sourceType}
              onValueChange={(val) => setSourceType(val as SourceType)}
            >
              <SelectTrigger data-testid="select-source-type">
                <SelectValue placeholder="Select source type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="screenshot" data-testid="select-item-screenshot">
                  Screenshot
                </SelectItem>
                <SelectItem value="design-export" data-testid="select-item-design-export">
                  Design Export
                </SelectItem>
                <SelectItem value="figma-export" data-testid="select-item-figma-export">
                  Figma Export
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!analysis && (
            <Button
              className="w-full"
              onClick={handleAnalyze}
              disabled={!file || isAnalyzing}
              data-testid="button-analyze-design"
            >
              {isAnalyzing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4 mr-2" />
              )}
              Analyze Design
            </Button>
          )}

          {analysis && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium">Analysis Complete</span>
              </div>

              <Card>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Detected Elements</span>
                    <Badge variant="secondary" className="text-[10px] ml-auto">
                      {analysis.elements.length} found
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {analysis.elements.map((el, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 p-1.5 rounded bg-muted/50 text-xs"
                        data-testid={`detected-element-${idx}`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {el.type}
                          </Badge>
                          <span className="truncate">{el.name}</span>
                        </div>
                        <span className="text-muted-foreground shrink-0">
                          {Math.round(el.confidence * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>

                  {analysis.layout && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Layout: <span className="font-medium">{analysis.layout}</span>
                    </div>
                  )}

                  {analysis.colors && analysis.colors.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-xs text-muted-foreground">Colors:</span>
                      <div className="flex gap-1">
                        {analysis.colors.map((color, idx) => (
                          <div
                            key={idx}
                            className="w-4 h-4 rounded-sm border border-border"
                            style={{ backgroundColor: color }}
                            title={color}
                            data-testid={`color-swatch-${idx}`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Button
                className="w-full"
                onClick={handleGenerateCode}
                disabled={generatePromptMutation.isPending}
                data-testid="button-generate-code"
              >
                {generatePromptMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4 mr-2" />
                )}
                Generate Code
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
