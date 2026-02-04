import { useState } from "react";
import { Rocket, ChevronDown, Check, Loader2, ExternalLink, Triangle, Globe, TrainFront, Cloud, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

type DeploymentPlatform = "vercel" | "netlify" | "railway" | "render" | "replit";
type DeploymentStatus = "pending" | "building" | "deploying" | "success" | "failed";

interface PlatformConfig {
  id: DeploymentPlatform;
  name: string;
  description: string;
  icon: string;
}

interface Deployment {
  id: string;
  projectId: number;
  platform: DeploymentPlatform;
  status: DeploymentStatus;
  url?: string;
  buildLogs: string[];
  startedAt: string;
  completedAt?: string;
  error?: string;
}

interface DeployButtonProps {
  projectId: number;
  projectName: string;
  hasBackend?: boolean;
  hasDatabase?: boolean;
  disabled?: boolean;
}

const PLATFORM_ICONS: Record<DeploymentPlatform, typeof Triangle> = {
  vercel: Triangle,
  netlify: Globe,
  railway: TrainFront,
  render: Cloud,
  replit: Code
};

export function DeployButton({
  projectId,
  projectName,
  hasBackend = false,
  hasDatabase = false,
  disabled = false
}: DeployButtonProps) {
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const getProjectInfo = () => ({
    name: projectName,
    framework: "vite" as const,
    hasBackend,
    hasDatabase,
    entryPoint: "src/main.tsx",
    buildCommand: "npm run build",
    outputDir: "dist",
    envVars: hasDatabase ? ["DATABASE_URL"] : []
  });

  // Fetch platforms using TanStack Query
  const { data: platforms = [], isLoading: platformsLoading } = useQuery<PlatformConfig[]>({
    queryKey: ["/api/optimization/deployment/platforms"],
    staleTime: 5 * 60 * 1000
  });

  // Fetch recommended platform
  const { data: recommendation, isLoading: recommendationLoading } = useQuery<{ recommended: DeploymentPlatform }>({
    queryKey: ["/api/optimization/deployment/recommend", projectId],
    queryFn: async () => {
      const response = await apiRequest("POST", "/api/optimization/deployment/recommend", getProjectInfo());
      return response.json();
    },
    staleTime: 60 * 1000,
    enabled: platforms.length > 0
  });

  // Generate package mutation
  const generatePackageMutation = useMutation({
    mutationFn: async ({ platform }: { platform: DeploymentPlatform }) => {
      const response = await apiRequest("POST", "/api/optimization/deployment/package", {
        projectId,
        platform,
        projectInfo: getProjectInfo()
      });
      return response.json();
    }
  });

  // Deploy mutation
  const deployMutation = useMutation({
    mutationFn: async ({ platform, packageId }: { platform: DeploymentPlatform; packageId: string }) => {
      const response = await apiRequest("POST", "/api/optimization/deployment/deploy", {
        projectId,
        platform,
        packageId
      });
      return response.json();
    },
    onSuccess: (data) => {
      setDeployment(data);
      pollDeploymentStatus(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/optimization/deployment/projects", projectId] });
    },
    onError: (error: any) => {
      toast({
        title: "Deployment Failed",
        description: error?.message || "Could not start deployment. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleDeploy = async (platform: DeploymentPlatform) => {
    setShowDialog(true);

    try {
      // First generate deployment package
      const pkg = await generatePackageMutation.mutateAsync({ platform });

      // Then start deployment with package
      await deployMutation.mutateAsync({ platform, packageId: pkg.id });
    } catch (error) {
      console.error("Deployment failed:", error);
    }
  };

  const pollDeploymentStatus = async (deploymentId: string) => {
    const poll = async () => {
      try {
        const response = await fetch(`/api/optimization/deployment/deployments/${deploymentId}`);
        const dep: Deployment = await response.json();
        setDeployment(dep);

        if (dep.status === "success") {
          toast({
            title: "Deployment Successful!",
            description: `Your app is live at ${dep.url}`,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/optimization/deployment/projects", projectId] });
        } else if (dep.status === "failed") {
          toast({
            title: "Deployment Failed",
            description: dep.error || "An error occurred during deployment.",
            variant: "destructive"
          });
        } else {
          setTimeout(poll, 1000);
        }
      } catch (error) {
        console.error("Failed to poll deployment status:", error);
      }
    };

    poll();
  };

  const getStatusColor = (status: DeploymentStatus) => {
    switch (status) {
      case "success": return "bg-green-500";
      case "failed": return "bg-red-500";
      case "building":
      case "deploying": return "bg-yellow-500";
      default: return "bg-muted";
    }
  };

  const isDeploying = generatePackageMutation.isPending || deployMutation.isPending;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            disabled={disabled || isDeploying}
            className="gap-2"
            data-testid="button-deploy"
          >
            {isDeploying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            Deploy
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Deploy to...</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {platformsLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : (
            platforms.map((platform) => {
              const PlatformIcon = PLATFORM_ICONS[platform.id];
              const isRecommended = platform.id === recommendation?.recommended;
              return (
                <DropdownMenuItem
                  key={platform.id}
                  onClick={() => handleDeploy(platform.id)}
                  className="gap-2 cursor-pointer"
                  data-testid={`button-deploy-${platform.id}`}
                >
                  <PlatformIcon className="h-4 w-4" />
                  <div className="flex flex-col flex-1">
                    <span className="font-medium flex items-center gap-2">
                      {platform.name}
                      {isRecommended && !recommendationLoading && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          Recommended
                        </Badge>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                      {platform.description}
                    </span>
                  </div>
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5" />
              Deploying {projectName}
            </DialogTitle>
            <DialogDescription>
              {deployment?.platform && (() => {
                const Icon = PLATFORM_ICONS[deployment.platform];
                return (
                  <span className="flex items-center gap-2">
                    To <Icon className="h-4 w-4" /> {deployment.platform}
                  </span>
                );
              })()}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {deployment && (
              <>
                <div className="flex items-center gap-2">
                  <Badge className={`${getStatusColor(deployment.status)} text-white capitalize`}>
                    {deployment.status}
                  </Badge>
                  {(isDeploying || deployment.status === "building" || deployment.status === "deploying") && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {deployment.status === "success" && <Check className="h-4 w-4 text-green-500" />}
                </div>

                <div className="bg-muted rounded-md p-3 max-h-48 overflow-y-auto">
                  <div className="font-mono text-xs space-y-1">
                    {deployment.buildLogs.map((log, i) => (
                      <div key={i} className="text-muted-foreground">
                        {log}
                      </div>
                    ))}
                  </div>
                </div>

                {deployment.url && (
                  <div className="flex items-center justify-between p-3 bg-green-500/10 rounded-md border border-green-500/20">
                    <span className="text-sm font-medium text-green-600 dark:text-green-400">
                      Your app is live!
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => window.open(deployment.url, "_blank")}
                      data-testid="button-open-deployed-app"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
