import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/analytics";
import type { Project } from "@shared/schema";

interface UseProjectMutationsOptions {
  onProjectCreated?: (project: Project) => void;
  onProjectDeleted?: (deletedId: string) => void;
  activeProjectId?: string | null;
}

export function useProjectMutations({
  onProjectCreated,
  onProjectDeleted,
  activeProjectId,
}: UseProjectMutationsOptions = {}) {
  const { toast } = useToast();

  const createProjectMutation = useMutation({
    mutationFn: async (name: string = "New Project") => {
      const response = await apiRequest("POST", "/api/projects", {
        name,
        messages: [],
      });
      return response.json();
    },
    onSuccess: (newProject: Project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      onProjectCreated?.(newProject);
      trackEvent("project_created", newProject.id);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create project",
        variant: "destructive",
      });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/projects/${id}`);
      return id;
    },
    onSuccess: (deletedId: string) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      onProjectDeleted?.(deletedId);
      trackEvent("project_deleted", deletedId);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete project",
        variant: "destructive",
      });
    },
  });

  const renameProjectMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const response = await apiRequest("PATCH", `/api/projects/${id}/name`, { name });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to rename project",
        variant: "destructive",
      });
    },
  });

  const updateProjectNameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await apiRequest("PATCH", `/api/projects/${id}/name`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
  });

  return {
    createProject: (name?: string) => createProjectMutation.mutate(name),
    deleteProject: (id: string) => deleteProjectMutation.mutate(id),
    renameProject: (id: string, name: string) => renameProjectMutation.mutate({ id, name }),
    updateProjectName: (id: string, name: string) => updateProjectNameMutation.mutateAsync({ id, name }),
    isCreating: createProjectMutation.isPending,
    isDeleting: deleteProjectMutation.isPending,
    isRenaming: renameProjectMutation.isPending,
  };
}
