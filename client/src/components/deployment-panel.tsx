import { useState, useEffect } from "react";
import { Rocket, Package, Clock, ExternalLink, CheckCircle, XCircle, Loader2, Download, Triangle, Globe, TrainFront, Cloud, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type DeploymentPlatform = "vercel" | "netlify" | "railway" | "render" | "replit";
type DeploymentStatus = "pending" | "building" | "deploying" | "success" | "failed";

interface PlatformConfig {
  id: DeploymentPlatform;
  name: string;
  description: string;
  supportsDocker: boolean;
  supportsStatic: boolean;
  supportsNode: boolean;
}

interface DeploymentPackage {
  id: string;
  projectId: number;
  platform: DeploymentPlatform;
  configFiles: Record<string, string>;
  envTemplate: string;
  dockerfile?: string;
  readme: string;
  createdAt: string;
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

interface DeploymentPanelProps {
  projectId: number;
  projectName: string;
  hasBackend?: boolean;
  hasDatabase?: boolean;
}

const PLATFORM_ICONS: Record<DeploymentPlatform, typeof Triangle> = {
  vercel: Triangle,
  netlify: Globe,
  railway: TrainFront,
  render: Cloud,
  replit: Code
};

export function DeploymentPanel({
  projectId,
  projectName,
  hasBackend = false,
  hasDatabase = false
}: DeploymentPanelProps) {
  const [platforms, setPlatforms] = useState<PlatformConfig[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<DeploymentPlatform>("vercel");
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [packages, setPackages] = useState<DeploymentPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingPackage, setGeneratingPackage] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchPlatforms();
    fetchDeployments();
    fetchPackages();
  }, [projectId]);

  const fetchPlatforms = async () => {
    try {
      const response = await fetch("/api/optimization/deployment/platforms");
      const data = await response.json();
      setPlatforms(data);
    } catch (error) {
      console.error("Failed to fetch platforms:", error);
    }
  };

  const fetchDeployments = async () => {
    try {
      const response = await fetch(`/api/optimization/deployment/projects/${projectId}/deployments`);
      const data = await response.json();
      setDeployments(data);
    } catch (error) {
      console.error("Failed to fetch deployments:", error);
    }
  };

  const fetchPackages = async () => {
    try {
      const response = await fetch(`/api/optimization/deployment/projects/${projectId}/packages`);
      const data = await response.json();
      setPackages(data);
    } catch (error) {
      console.error("Failed to fetch packages:", error);
    }
  };

  const generatePackage = async () => {
    setGeneratingPackage(true);
    try {
      const projectInfo = {
        name: projectName,
        framework: "vite" as const,
        hasBackend,
        hasDatabase,
        entryPoint: "src/main.tsx",
        buildCommand: "npm run build",
        outputDir: "dist",
        envVars: hasDatabase ? ["DATABASE_URL"] : []
      };

      const response = await apiRequest("POST", "/api/optimization/deployment/package", {
        projectId,
        platform: selectedPlatform,
        projectInfo
      });

      const pkg = await response.json();
      setPackages(prev => [pkg, ...prev]);
      
      toast({
        title: "Package Generated",
        description: `Deployment package for ${selectedPlatform} is ready.`
      });
    } catch (error) {
      console.error("Failed to generate package:", error);
      toast({
        title: "Generation Failed",
        description: "Could not generate deployment package.",
        variant: "destructive"
      });
    } finally {
      setGeneratingPackage(false);
    }
  };

  const startDeployment = async () => {
    setLoading(true);
    try {
      const response = await apiRequest("POST", "/api/optimization/deployment/deploy", {
        projectId,
        platform: selectedPlatform
      });

      const dep = await response.json();
      setDeployments(prev => [dep, ...prev]);
      
      toast({
        title: "Deployment Started",
        description: `Deploying to ${selectedPlatform}...`
      });

      pollDeploymentStatus(dep.id);
    } catch (error) {
      console.error("Failed to start deployment:", error);
      toast({
        title: "Deployment Failed",
        description: "Could not start deployment.",
        variant: "destructive"
      });
      setLoading(false);
    }
  };

  const pollDeploymentStatus = async (deploymentId: string) => {
    const poll = async () => {
      try {
        const response = await fetch(`/api/optimization/deployment/deployments/${deploymentId}`);
        const dep: Deployment = await response.json();
        
        setDeployments(prev => prev.map(d => d.id === dep.id ? dep : d));

        if (dep.status === "success" || dep.status === "failed") {
          setLoading(false);
          fetchDeployments();
        } else {
          setTimeout(poll, 1000);
        }
      } catch (error) {
        console.error("Failed to poll deployment status:", error);
        setLoading(false);
      }
    };

    poll();
  };

  const downloadPackage = (pkg: DeploymentPackage) => {
    const content = Object.entries(pkg.configFiles)
      .map(([filename, content]) => `// ${filename}\n${content}`)
      .join("\n\n");
    
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName}-${pkg.platform}-config.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (status: DeploymentStatus) => {
    switch (status) {
      case "success": return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed": return <XCircle className="h-4 w-4 text-red-500" />;
      case "building":
      case "deploying": return <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <Card data-testid="deployment-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Rocket className="h-4 w-4" />
          One-Click Deployment
        </CardTitle>
        <CardDescription className="text-xs">
          Deploy your app to popular platforms instantly
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="deploy" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="deploy" data-testid="tab-deploy">Deploy</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
            <TabsTrigger value="packages" data-testid="tab-packages">Packages</TabsTrigger>
          </TabsList>

          <TabsContent value="deploy" className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Platform</label>
                <Select
                  value={selectedPlatform}
                  onValueChange={(v) => setSelectedPlatform(v as DeploymentPlatform)}
                >
                  <SelectTrigger data-testid="select-platform">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {platforms.map((p) => {
                      const PIcon = PLATFORM_ICONS[p.id];
                      return (
                        <SelectItem key={p.id} value={p.id} data-testid={`select-platform-${p.id}`}>
                          <span className="flex items-center gap-2">
                            <PIcon className="h-4 w-4" />
                            <span>{p.name}</span>
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={startDeployment}
                  disabled={loading}
                  className="flex-1 gap-2"
                  data-testid="button-start-deploy"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4" />
                  )}
                  Deploy Now
                </Button>
                <Button
                  variant="outline"
                  onClick={generatePackage}
                  disabled={generatingPackage}
                  data-testid="button-generate-package"
                >
                  {generatingPackage ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Package className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {platforms.find(p => p.id === selectedPlatform) && (
              <div className="p-3 bg-muted rounded-md text-xs text-muted-foreground">
                {platforms.find(p => p.id === selectedPlatform)?.description}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-2">
            {deployments.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No deployments yet
              </div>
            ) : (
              deployments.slice(0, 5).map((dep) => {
                const DepIcon = PLATFORM_ICONS[dep.platform];
                return (
                  <div
                    key={dep.id}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                    data-testid={`deployment-${dep.id}`}
                  >
                    <div className="flex items-center gap-2">
                      {getStatusIcon(dep.status)}
                      <DepIcon className="h-4 w-4" />
                      <div className="flex flex-col">
                        <span className="text-xs font-medium capitalize">{dep.platform}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDate(dep.startedAt)}
                        </span>
                      </div>
                    </div>
                    {dep.url && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => window.open(dep.url, "_blank")}
                        data-testid={`button-open-${dep.id}`}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="packages" className="space-y-2">
            {packages.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No packages generated yet
              </div>
            ) : (
              packages.slice(0, 5).map((pkg) => (
                <div
                  key={pkg.id}
                  className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                  data-testid={`package-${pkg.id}`}
                >
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="text-xs font-medium capitalize">{pkg.platform}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {Object.keys(pkg.configFiles).length} config files
                      </span>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => downloadPackage(pkg)}
                    data-testid={`button-download-${pkg.id}`}
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
