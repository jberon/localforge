import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ProjectVersion } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { History, Save, RotateCcw, Trash2, Clock, FileCode } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface VersionHistoryProps {
  projectId: string;
  onRestore?: () => void;
}

export function VersionHistory({ projectId, onRestore }: VersionHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [versionName, setVersionName] = useState("");
  const [versionDescription, setVersionDescription] = useState("");
  const [restoreConfirm, setRestoreConfirm] = useState<ProjectVersion | null>(null);
  const { toast } = useToast();

  const { data: versions = [], isLoading } = useQuery<ProjectVersion[]>({
    queryKey: ["/api/projects", projectId, "versions"],
    enabled: isOpen,
  });

  const createVersionMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/projects/${projectId}/versions`, {
        name: versionName,
        description: versionDescription || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "versions"] });
      setShowCreateDialog(false);
      setVersionName("");
      setVersionDescription("");
      toast({
        title: "Version saved",
        description: "Your checkpoint has been created successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to save version",
        description: "There was an error creating the checkpoint.",
        variant: "destructive",
      });
    },
  });

  const restoreVersionMutation = useMutation({
    mutationFn: async (versionId: string) => {
      return apiRequest("POST", `/api/projects/${projectId}/versions/${versionId}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setRestoreConfirm(null);
      onRestore?.();
      toast({
        title: "Version restored",
        description: "Your project has been restored to the selected version.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to restore",
        description: "There was an error restoring the version.",
        variant: "destructive",
      });
    },
  });

  const deleteVersionMutation = useMutation({
    mutationFn: async (versionId: string) => {
      return apiRequest("DELETE", `/api/projects/${projectId}/versions/${versionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "versions"] });
      toast({
        title: "Version deleted",
        description: "The checkpoint has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to delete",
        description: "There was an error deleting the version.",
        variant: "destructive",
      });
    },
  });

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="toggle-elevate"
            data-testid="button-version-history"
          >
            <History className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Version History
            </SheetTitle>
            <SheetDescription>
              Save checkpoints of your project and restore previous versions.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="w-full"
              data-testid="button-create-version"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Checkpoint
            </Button>

            <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading versions...
                </div>
              ) : versions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No checkpoints yet</p>
                  <p className="text-sm">Save your first checkpoint to start tracking versions.</p>
                </div>
              ) : (
                versions.map((version) => (
                  <div
                    key={version.id}
                    className="flex items-start justify-between p-4 rounded-lg border bg-card"
                    data-testid={`version-item-${version.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{version.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          v{version.version}
                        </Badge>
                        {version.isAutoSave && (
                          <Badge variant="outline" className="text-xs">
                            Auto
                          </Badge>
                        )}
                      </div>
                      {version.description && (
                        <p className="text-sm text-muted-foreground mt-1 truncate">
                          {version.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(version.createdAt, { addSuffix: true })}
                        </span>
                        {version.snapshot.generatedCode && (
                          <span className="flex items-center gap-1">
                            <FileCode className="h-3 w-3" />
                            Has code
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setRestoreConfirm(version)}
                        data-testid={`button-restore-${version.id}`}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteVersionMutation.mutate(version.id)}
                        disabled={deleteVersionMutation.isPending}
                        data-testid={`button-delete-version-${version.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Checkpoint</DialogTitle>
            <DialogDescription>
              Create a snapshot of your current project state that you can restore later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
                placeholder="e.g., Before major refactor"
                data-testid="input-version-name"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description (optional)</label>
              <Textarea
                value={versionDescription}
                onChange={(e) => setVersionDescription(e.target.value)}
                placeholder="Describe what changes you made..."
                className="resize-none"
                rows={3}
                data-testid="input-version-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createVersionMutation.mutate()}
              disabled={!versionName.trim() || createVersionMutation.isPending}
              data-testid="button-save-checkpoint"
            >
              {createVersionMutation.isPending ? "Saving..." : "Save Checkpoint"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!restoreConfirm} onOpenChange={() => setRestoreConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Version?</DialogTitle>
            <DialogDescription>
              This will restore your project to version {restoreConfirm?.version} ({restoreConfirm?.name}).
              Your current changes will be lost unless you save a checkpoint first.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => restoreConfirm && restoreVersionMutation.mutate(restoreConfirm.id)}
              disabled={restoreVersionMutation.isPending}
              data-testid="button-confirm-restore"
            >
              {restoreVersionMutation.isPending ? "Restoring..." : "Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
