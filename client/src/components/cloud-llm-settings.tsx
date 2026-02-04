import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { 
  Cloud, 
  Server, 
  Key, 
  Check, 
  X, 
  Loader2,
  Settings2,
  AlertCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Zap,
  FlaskConical
} from "lucide-react";
import { SiOpenai, SiAnthropic, SiGoogle } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";

// Test Mode status interface
interface TestModeStatus {
  available: boolean;
  active: boolean;
  connected: boolean;
  error?: string;
  model?: string;
}

export type CloudProvider = "openai" | "anthropic" | "google" | "groq" | "together" | "custom";

export interface CloudProviderConfig {
  provider: CloudProvider;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  enabled: boolean;
}

export interface CloudLLMSettings {
  useCloud: boolean;
  primaryProvider: CloudProvider;
  providers: Record<CloudProvider, CloudProviderConfig>;
}

interface CloudLLMSettingsProps {
  settings: CloudLLMSettings;
  onSettingsChange: (settings: CloudLLMSettings) => void;
}

const PROVIDER_INFO: Record<CloudProvider, {
  name: string;
  description: string;
  icon: typeof SiOpenai | typeof Cloud;
  defaultBaseUrl: string;
  models: string[];
  docsUrl: string;
}> = {
  openai: {
    name: "OpenAI",
    description: "GPT-4o, GPT-4 Turbo, and other OpenAI models",
    icon: SiOpenai,
    defaultBaseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo", "o1-preview", "o1-mini"],
    docsUrl: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    name: "Anthropic",
    description: "Claude 3.5 Sonnet, Claude 3 Opus, and other Claude models",
    icon: SiAnthropic,
    defaultBaseUrl: "https://api.anthropic.com/v1",
    models: ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307"],
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  google: {
    name: "Google AI",
    description: "Gemini Pro, Gemini Ultra, and other Google models",
    icon: SiGoogle,
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-pro", "gemini-pro-vision"],
    docsUrl: "https://aistudio.google.com/app/apikey",
  },
  groq: {
    name: "Groq",
    description: "Ultra-fast inference with Llama, Mixtral, and more",
    icon: Cloud,
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    models: ["llama-3.1-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
    docsUrl: "https://console.groq.com/keys",
  },
  together: {
    name: "Together AI",
    description: "Open source models with fast inference",
    icon: Cloud,
    defaultBaseUrl: "https://api.together.xyz/v1",
    models: ["meta-llama/Llama-3-70b-chat-hf", "mistralai/Mixtral-8x7B-Instruct-v0.1", "codellama/CodeLlama-70b-Instruct-hf"],
    docsUrl: "https://api.together.xyz/settings/api-keys",
  },
  custom: {
    name: "Custom Provider",
    description: "Any OpenAI-compatible API endpoint",
    icon: Cloud,
    defaultBaseUrl: "",
    models: [],
    docsUrl: "",
  },
};

const DEFAULT_SETTINGS: CloudLLMSettings = {
  useCloud: false,
  primaryProvider: "openai",
  providers: {
    openai: { provider: "openai", apiKey: "", enabled: false },
    anthropic: { provider: "anthropic", apiKey: "", enabled: false },
    google: { provider: "google", apiKey: "", enabled: false },
    groq: { provider: "groq", apiKey: "", enabled: false },
    together: { provider: "together", apiKey: "", enabled: false },
    custom: { provider: "custom", apiKey: "", baseUrl: "", enabled: false },
  },
};

export function CloudLLMSettings({ settings, onSettingsChange }: CloudLLMSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState<CloudLLMSettings>(settings || DEFAULT_SETTINGS);
  const [testingProvider, setTestingProvider] = useState<CloudProvider | null>(null);
  const [testResults, setTestResults] = useState<Record<CloudProvider, "success" | "error" | null>>({
    openai: null, anthropic: null, google: null, groq: null, together: null, custom: null
  });
  const [showApiKeys, setShowApiKeys] = useState<Record<CloudProvider, boolean>>({
    openai: false, anthropic: false, google: false, groq: false, together: false, custom: false
  });
  const [testModeStatus, setTestModeStatus] = useState<TestModeStatus>({ available: false, active: false, connected: false });
  const [testModeLoading, setTestModeLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  // Fetch test mode status when dialog opens
  const fetchTestModeStatus = async () => {
    try {
      const res = await fetch("/api/llm/test-mode/status");
      if (res.ok) {
        const data = await res.json();
        setTestModeStatus(data);
      }
    } catch {
      // Silently fail
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTestModeStatus();
      fetch("/api/llm/cloud-settings")
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && Object.keys(data).length > 0) {
            setLocalSettings(prev => ({ ...prev, ...data }));
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  const toggleTestMode = async (enable: boolean) => {
    setTestModeLoading(true);
    try {
      const endpoint = enable ? "/api/llm/test-mode/enable" : "/api/llm/test-mode/disable";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini" }),
      });
      
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      
      const data = await res.json();
      
      if (data.success) {
        // Show warning if enabled but not connected
        if (enable && !data.connected) {
          toast({
            title: "Test Mode Enabled (Not Connected)",
            description: data.error || "Test mode is enabled but cloud connection failed. Check API configuration.",
            variant: "destructive",
          });
        } else {
          toast({
            title: enable ? "Test Mode Enabled" : "Test Mode Disabled",
            description: data.message,
          });
        }
        await fetchTestModeStatus();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to toggle test mode",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to connect to server",
        variant: "destructive",
      });
    } finally {
      setTestModeLoading(false);
    }
  };

  const updateProvider = (provider: CloudProvider, updates: Partial<CloudProviderConfig>) => {
    setLocalSettings(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        [provider]: { ...prev.providers[provider], ...updates },
      },
    }));
  };

  const handleSave = async () => {
    try {
      const response = await fetch("/api/llm/cloud-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(localSettings),
      });
      
      if (response.ok) {
        onSettingsChange(localSettings);
        toast({
          title: "Settings Saved",
          description: "Cloud LLM settings have been updated successfully.",
        });
        setIsOpen(false);
      } else {
        throw new Error("Failed to save settings");
      }
    } catch {
      onSettingsChange(localSettings);
      toast({
        title: "Settings Saved Locally",
        description: "Settings saved. They will sync when the server is available.",
      });
      setIsOpen(false);
    }
  };

  const testConnection = async (provider: CloudProvider) => {
    const config = localSettings.providers[provider];
    if (!config.apiKey) {
      toast({
        title: "Missing API Key",
        description: `Please enter an API key for ${PROVIDER_INFO[provider].name}`,
        variant: "destructive",
      });
      return;
    }

    setTestingProvider(provider);
    setTestResults(prev => ({ ...prev, [provider]: null }));

    try {
      const response = await fetch("/api/llm/test-cloud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: config.apiKey,
          baseUrl: config.baseUrl || PROVIDER_INFO[provider].defaultBaseUrl,
          model: config.model,
        }),
      });

      if (response.ok) {
        setTestResults(prev => ({ ...prev, [provider]: "success" }));
        toast({
          title: "Connection Successful",
          description: `Successfully connected to ${PROVIDER_INFO[provider].name}`,
        });
      } else {
        throw new Error("Connection failed");
      }
    } catch {
      setTestResults(prev => ({ ...prev, [provider]: "error" }));
      toast({
        title: "Connection Failed",
        description: `Could not connect to ${PROVIDER_INFO[provider].name}. Please check your API key.`,
        variant: "destructive",
      });
    } finally {
      setTestingProvider(null);
    }
  };

  const toggleShowApiKey = (provider: CloudProvider) => {
    setShowApiKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
  };

  const renderProviderCard = (provider: CloudProvider) => {
    const info = PROVIDER_INFO[provider];
    const config = localSettings.providers[provider];
    const Icon = info.icon;
    const testResult = testResults[provider];

    return (
      <AccordionItem value={provider} key={provider}>
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-3 w-full">
            <Icon className="w-5 h-5" />
            <div className="flex-1 text-left">
              <span className="font-medium">{info.name}</span>
              {config.enabled && config.apiKey && (
                <Badge variant="outline" className="ml-2 text-xs">
                  {testResult === "success" ? (
                    <Check className="w-3 h-3 mr-1 text-green-500" />
                  ) : testResult === "error" ? (
                    <X className="w-3 h-3 mr-1 text-red-500" />
                  ) : null}
                  Configured
                </Badge>
              )}
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(checked) => updateProvider(provider, { enabled: checked })}
              onClick={(e) => e.stopPropagation()}
              data-testid={`switch-${provider}-enabled`}
            />
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">{info.description}</p>
            
            <div className="space-y-2">
              <Label htmlFor={`${provider}-api-key`}>API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id={`${provider}-api-key`}
                    type={showApiKeys[provider] ? "text" : "password"}
                    value={config.apiKey}
                    onChange={(e) => updateProvider(provider, { apiKey: e.target.value })}
                    placeholder={`Enter your ${info.name} API key`}
                    className="pr-10"
                    data-testid={`input-${provider}-api-key`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => toggleShowApiKey(provider)}
                    data-testid={`button-toggle-${provider}-key`}
                  >
                    {showApiKeys[provider] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  onClick={() => testConnection(provider)}
                  disabled={!config.apiKey || testingProvider === provider}
                  data-testid={`button-test-${provider}`}
                >
                  {testingProvider === provider ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Test"
                  )}
                </Button>
              </div>
              {info.docsUrl && (
                <a
                  href={info.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  Get API Key <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {provider === "custom" && (
              <div className="space-y-2">
                <Label htmlFor="custom-base-url">Base URL</Label>
                <Input
                  id="custom-base-url"
                  value={config.baseUrl || ""}
                  onChange={(e) => updateProvider(provider, { baseUrl: e.target.value })}
                  placeholder="https://your-api-endpoint.com/v1"
                  data-testid="input-custom-base-url"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor={`${provider}-model`}>Model</Label>
              {info.models.length > 0 ? (
                <Select
                  value={config.model || info.models[0]}
                  onValueChange={(value) => updateProvider(provider, { model: value })}
                >
                  <SelectTrigger data-testid={`select-${provider}-model`}>
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {info.models.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`${provider}-model`}
                  value={config.model || ""}
                  onChange={(e) => updateProvider(provider, { model: e.target.value })}
                  placeholder="Enter model name"
                  data-testid={`input-${provider}-model`}
                />
              )}
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  const enabledProviders = Object.entries(localSettings.providers)
    .filter(([, config]) => config.enabled && config.apiKey)
    .map(([provider]) => provider as CloudProvider);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-cloud-llm-settings">
          <Cloud className="w-4 h-4 mr-2" />
          Cloud LLM
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-primary" />
            Cloud LLM Providers
          </DialogTitle>
          <DialogDescription>
            Connect to cloud LLM providers for additional model options. Your API keys are stored securely.
          </DialogDescription>
        </DialogHeader>

        {testModeStatus.available && (
          <Card className="border-primary/50 bg-primary/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <FlaskConical className="w-5 h-5 text-primary" />
                  <CardTitle className="text-base">Test Mode</CardTitle>
                  {testModeStatus.active && (
                    <Badge variant="default" className="ml-1">
                      <Zap className="w-3 h-3 mr-1" />
                      Active
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {testModeLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Switch
                    checked={testModeStatus.active}
                    onCheckedChange={toggleTestMode}
                    disabled={testModeLoading}
                    data-testid="switch-test-mode"
                  />
                </div>
              </div>
              <CardDescription>
                Use Replit AI (OpenAI) for testing without local LM Studio. 
                {testModeStatus.active && testModeStatus.model && (
                  <span className="text-primary"> Using {testModeStatus.model}</span>
                )}
              </CardDescription>
              {testModeStatus.active && !testModeStatus.connected && testModeStatus.error && (
                <div className="flex items-center gap-2 mt-2 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4" />
                  {testModeStatus.error}
                </div>
              )}
              {testModeStatus.active && testModeStatus.connected && (
                <div className="flex items-center gap-2 mt-2 text-sm text-green-600">
                  <Check className="w-4 h-4" />
                  Connected and ready
                </div>
              )}
            </CardHeader>
          </Card>
        )}

        <Tabs defaultValue="providers" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="providers" data-testid="tab-providers">
              <Key className="w-4 h-4 mr-2" />
              Providers
            </TabsTrigger>
            <TabsTrigger value="preferences" data-testid="tab-preferences">
              <Settings2 className="w-4 h-4 mr-2" />
              Preferences
            </TabsTrigger>
          </TabsList>

          <TabsContent value="providers" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Use Cloud LLM</CardTitle>
                  <Switch
                    checked={localSettings.useCloud}
                    onCheckedChange={(checked) => setLocalSettings(prev => ({ ...prev, useCloud: checked }))}
                    data-testid="switch-use-cloud"
                  />
                </div>
                <CardDescription>
                  Enable cloud LLM providers instead of local LM Studio for code generation.
                </CardDescription>
              </CardHeader>
            </Card>

            {localSettings.useCloud && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Cloud providers may incur costs. Check each provider's pricing before use.
                  </p>
                </div>

                <Accordion type="single" collapsible className="w-full">
                  {(Object.keys(PROVIDER_INFO) as CloudProvider[]).map(renderProviderCard)}
                </Accordion>
              </div>
            )}
          </TabsContent>

          <TabsContent value="preferences" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Server className="w-4 h-4" />
                  Primary Provider
                </CardTitle>
                <CardDescription>
                  Choose which provider to use when cloud LLM is enabled.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {enabledProviders.length > 0 ? (
                  <Select
                    value={localSettings.primaryProvider}
                    onValueChange={(value: CloudProvider) => 
                      setLocalSettings(prev => ({ ...prev, primaryProvider: value }))
                    }
                  >
                    <SelectTrigger data-testid="select-primary-provider">
                      <SelectValue placeholder="Select primary provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {enabledProviders.map((provider) => (
                        <SelectItem key={provider} value={provider}>
                          {PROVIDER_INFO[provider].name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Enable at least one provider with an API key to select a primary provider.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Fallback Configuration</CardTitle>
                <CardDescription>
                  If the primary provider fails, LocalForge will automatically try other enabled providers.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {enabledProviders.length > 1 ? (
                  <div className="space-y-2">
                    <p className="text-sm">Fallback order:</p>
                    <ol className="list-decimal list-inside text-sm text-muted-foreground">
                      {enabledProviders
                        .filter(p => p !== localSettings.primaryProvider)
                        .map((provider, idx) => (
                          <li key={provider}>{idx + 1}. {PROVIDER_INFO[provider].name}</li>
                        ))}
                    </ol>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Enable multiple providers to configure fallback behavior.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Separator className="my-4" />

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setIsOpen(false)} data-testid="button-cancel-cloud-settings">
            Cancel
          </Button>
          <Button onClick={handleSave} data-testid="button-save-cloud-settings">
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { DEFAULT_SETTINGS as DEFAULT_CLOUD_LLM_SETTINGS };
