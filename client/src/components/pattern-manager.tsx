import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Lightbulb, 
  Trash2, 
  Download, 
  Upload, 
  Search,
  Plus,
  X,
  CheckCircle,
  TrendingUp,
  Loader2
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger 
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface LearnedPattern {
  id: string;
  category: string;
  pattern: string;
  replacement?: string;
  frequency: number;
  confidence: number;
  examples: string[];
  lastApplied: string;
}

interface PatternManagerProps {
  projectId?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  code_style: "bg-blue-500",
  architecture: "bg-purple-500",
  naming: "bg-green-500",
  logic: "bg-orange-500",
  ux: "bg-pink-500",
  performance: "bg-yellow-500",
  other: "bg-gray-500"
};

export function PatternManager({ projectId }: PatternManagerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importData, setImportData] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: patternsData, isLoading } = useQuery<{ patterns: LearnedPattern[] }>({
    queryKey: projectId 
      ? ["/api/intelligence/patterns", projectId]
      : ["/api/intelligence/patterns"],
    queryFn: async () => {
      const url = projectId 
        ? `/api/intelligence/patterns?projectId=${projectId}`
        : "/api/intelligence/patterns";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch patterns");
      return response.json();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (patternId: string) => {
      const response = await apiRequest("DELETE", `/api/intelligence/patterns/${patternId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: projectId 
          ? ["/api/intelligence/patterns", projectId]
          : ["/api/intelligence/patterns"]
      });
      toast({
        title: "Pattern Deleted",
        description: "The pattern has been removed successfully"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete pattern",
        variant: "destructive"
      });
    }
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/intelligence/patterns/export", { projectId });
      return response.json();
    },
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `localforge-patterns-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: "Patterns Exported",
        description: `Exported ${data.patterns.length} patterns`
      });
    }
  });

  const importMutation = useMutation({
    mutationFn: async (patterns: LearnedPattern[]) => {
      const response = await apiRequest("POST", "/api/intelligence/patterns/import", { patterns });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: projectId 
          ? ["/api/intelligence/patterns", projectId]
          : ["/api/intelligence/patterns"]
      });
      setImportDialogOpen(false);
      setImportData("");
      toast({
        title: "Patterns Imported",
        description: `Imported ${data.imported} of ${data.total} patterns`
      });
    },
    onError: () => {
      toast({
        title: "Import Failed",
        description: "Failed to import patterns. Check the JSON format.",
        variant: "destructive"
      });
    }
  });

  const handleImport = () => {
    try {
      const parsed = JSON.parse(importData);
      const patterns = Array.isArray(parsed) ? parsed : parsed.patterns;
      if (!Array.isArray(patterns)) {
        throw new Error("Invalid format");
      }
      importMutation.mutate(patterns);
    } catch {
      toast({
        title: "Invalid JSON",
        description: "Please paste valid JSON pattern data",
        variant: "destructive"
      });
    }
  };

  const patterns = patternsData?.patterns || [];
  const filteredPatterns = patterns.filter(p => 
    p.pattern.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-500" />
            <CardTitle className="text-lg">Pattern Manager</CardTitle>
            <Badge variant="secondary">{patterns.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => exportMutation.mutate()}
              disabled={patterns.length === 0 || exportMutation.isPending}
              data-testid="button-export-patterns"
              aria-label="Export patterns"
            >
              {exportMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-1" />
              )}
              Export
            </Button>
            <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" data-testid="button-import-patterns">
                  <Upload className="h-4 w-4 mr-1" />
                  Import
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import Patterns</DialogTitle>
                  <DialogDescription>
                    Paste JSON pattern data exported from another LocalForge instance
                  </DialogDescription>
                </DialogHeader>
                <textarea
                  className="w-full h-48 p-3 text-sm font-mono border rounded-md bg-muted"
                  placeholder='{"patterns": [...]}'
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  data-testid="input-import-data"
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleImport} 
                    disabled={!importData.trim() || importMutation.isPending}
                    data-testid="button-confirm-import"
                    aria-label="Confirm pattern import"
                  >
                    {importMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Import Patterns
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <CardDescription>
          Learned coding patterns from your feedback and corrections
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search patterns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-patterns"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : filteredPatterns.length > 0 ? (
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {filteredPatterns.map((pattern) => (
                <PatternCard 
                  key={pattern.id} 
                  pattern={pattern}
                  onDelete={() => deleteMutation.mutate(pattern.id)}
                  isDeleting={deleteMutation.isPending}
                />
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <TrendingUp className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              {searchQuery ? "No patterns match your search" : "No patterns learned yet"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Patterns are learned from your corrections and feedback
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PatternCard({ 
  pattern, 
  onDelete, 
  isDeleting 
}: { 
  pattern: LearnedPattern; 
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [showExamples, setShowExamples] = useState(false);
  const confidencePercent = Math.round(pattern.confidence * 100);

  return (
    <div className="p-4 rounded-lg border bg-card hover-elevate">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge 
              className={`${CATEGORY_COLORS[pattern.category] || CATEGORY_COLORS.other} text-white text-xs`}
            >
              {pattern.category.replace('_', ' ')}
            </Badge>
            <span className="text-sm font-medium truncate">{pattern.pattern}</span>
          </div>

          {pattern.replacement && (
            <div className="mt-2 text-xs text-muted-foreground">
              <span className="font-medium">Replacement:</span> {pattern.replacement}
            </div>
          )}

          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              <span>{pattern.frequency}x applied</span>
            </div>
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              <span>{confidencePercent}% confidence</span>
            </div>
          </div>

          {pattern.examples.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="p-0 h-auto mt-2 text-xs"
              onClick={() => setShowExamples(!showExamples)}
              data-testid={`button-toggle-examples-${pattern.id}`}
            >
              {showExamples ? "Hide" : "Show"} {pattern.examples.length} example{pattern.examples.length > 1 ? "s" : ""}
            </Button>
          )}

          {showExamples && pattern.examples.length > 0 && (
            <div className="mt-2 p-2 rounded bg-muted text-xs font-mono">
              {pattern.examples.map((ex, i) => (
                <div key={i} className="truncate">
                  {ex.slice(0, 100)}...
                </div>
              ))}
            </div>
          )}
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              size="icon" 
              variant="ghost" 
              className="shrink-0 text-muted-foreground hover:text-destructive"
              disabled={isDeleting}
              data-testid={`button-delete-pattern-${pattern.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Pattern</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this learned pattern? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete} data-testid="button-confirm-delete">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="mt-3">
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div 
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${confidencePercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
