import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Undo2, Loader2, CheckCircle } from "lucide-react";
import type { ProjectVersion } from "@shared/schema";

interface QuickUndoProps {
  projectId: string;
  onUndo?: () => void;
}

export function QuickUndo({ projectId, onUndo }: QuickUndoProps) {
  const { toast } = useToast();
  const [isVisible, setIsVisible] = useState(true);

  const { data: versions = [] } = useQuery<ProjectVersion[]>({
    queryKey: ["/api/projects", projectId, "versions"],
    enabled: !!projectId,
  });

  // Sort versions by createdAt descending to ensure proper order
  const sortedVersions = useMemo(() => {
    return [...versions].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [versions]);

  const restoreMutation = useMutation({
    mutationFn: async (versionId: string) => {
      return apiRequest("POST", `/api/projects/${projectId}/versions/${versionId}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      toast({
        title: "Reverted",
        description: "Your project has been restored to the previous version.",
      });
      setIsVisible(false);
      onUndo?.();
    },
    onError: () => {
      toast({
        title: "Failed to revert",
        description: "There was an error restoring the previous version.",
        variant: "destructive",
      });
    },
  });

  if (!isVisible || sortedVersions.length < 2) {
    return null;
  }

  // Get the second most recent version (the one before the latest)
  const previousVersion = sortedVersions[1];

  const handleUndo = () => {
    restoreMutation.mutate(previousVersion.id);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleUndo}
      disabled={restoreMutation.isPending}
      className="gap-1.5 animate-in fade-in slide-in-from-right-2 duration-300"
      data-testid="button-quick-undo"
    >
      {restoreMutation.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : restoreMutation.isSuccess ? (
        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Undo2 className="h-3.5 w-3.5" />
      )}
      <span className="hidden sm:inline">Undo</span>
    </Button>
  );
}
