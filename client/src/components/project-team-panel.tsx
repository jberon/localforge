import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Brain, Hammer, Palette, Search, Shield, Star, 
  Lightbulb, Zap, Target, Gem, Users, Activity,
  FileText, Briefcase, ChevronDown, ChevronUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DreamTeamMember, ActivityLogEntry, BusinessCase } from "@shared/schema";

interface ProjectTeamPanelProps {
  projectId: string | null;
  llmSettings: {
    endpoint: string;
    plannerModel?: string;
    builderModel?: string;
  };
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  brain: Brain,
  hammer: Hammer,
  palette: Palette,
  search: Search,
  shield: Shield,
  star: Star,
  lightbulb: Lightbulb,
  zap: Zap,
  target: Target,
  gem: Gem,
};

const colorMap: Record<string, string> = {
  purple: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  orange: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  pink: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  blue: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  green: "bg-green-500/20 text-green-400 border-green-500/30",
  amber: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  cyan: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  rose: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  lime: "bg-lime-500/20 text-lime-400 border-lime-500/30",
  violet: "bg-violet-500/20 text-violet-400 border-violet-500/30",
};

const actionIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  thinking: Brain,
  deciding: Target,
  building: Hammer,
  reviewing: Shield,
  researching: Search,
  designing: Palette,
  testing: Shield,
  fixing: Zap,
  suggesting: Lightbulb,
  collaborating: Users,
};

function TeamMemberCard({ member }: { member: DreamTeamMember }) {
  const IconComponent = iconMap[member.avatar] || Star;
  const colorClass = colorMap[member.color] || colorMap.purple;

  return (
    <div className={cn(
      "flex items-start gap-3 p-3 rounded-lg border transition-all",
      colorClass
    )} data-testid={`team-member-${member.id}`}>
      <div className="shrink-0 mt-0.5">
        <IconComponent className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{member.name}</span>
          {!member.isCore && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              Specialist
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{member.title}</p>
        {member.catchphrase && (
          <p className="text-xs italic mt-1 opacity-70">"{member.catchphrase}"</p>
        )}
      </div>
    </div>
  );
}

function ActivityLogItem({ entry, members }: { entry: ActivityLogEntry; members: DreamTeamMember[] }) {
  const member = members.find(m => m.id === entry.teamMemberId);
  const ActionIcon = actionIcons[entry.action] || Activity;
  const colorClass = member ? (colorMap[member.color] || "") : "";

  return (
    <div className="flex items-start gap-2 py-2 border-b border-border/50 last:border-0" data-testid={`activity-${entry.id}`}>
      <div className={cn("p-1.5 rounded shrink-0", colorClass)}>
        <ActionIcon className="h-3 w-3" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{entry.teamMemberName}</span>
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            {entry.action}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {entry.content}
        </p>
        <span className="text-[10px] text-muted-foreground opacity-60">
          {new Date(entry.timestamp).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}

function BusinessCaseSummary({ businessCase }: { businessCase: BusinessCase }) {
  return (
    <div className="space-y-3" data-testid="business-case-summary">
      <div>
        <h4 className="font-medium text-sm">{businessCase.appName}</h4>
        {businessCase.tagline && (
          <p className="text-xs text-muted-foreground italic">{businessCase.tagline}</p>
        )}
      </div>
      
      <div className="space-y-2">
        <div>
          <span className="text-xs font-medium text-muted-foreground">Problem:</span>
          <p className="text-xs">{businessCase.problemStatement}</p>
        </div>
        
        <div>
          <span className="text-xs font-medium text-muted-foreground">Target Audience:</span>
          <p className="text-xs">{businessCase.targetAudience}</p>
        </div>

        <div>
          <span className="text-xs font-medium text-muted-foreground">Value Proposition:</span>
          <p className="text-xs">{businessCase.valueProposition}</p>
        </div>
      </div>

      {businessCase.coreFeatures.length > 0 && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">Core Features:</span>
          <ul className="mt-1 space-y-1">
            {businessCase.coreFeatures.slice(0, 5).map((f, i) => (
              <li key={i} className="text-xs flex items-center gap-1.5">
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-[9px] px-1",
                    f.priority === "must-have" && "border-green-500 text-green-500",
                    f.priority === "should-have" && "border-yellow-500 text-yellow-500",
                    f.priority === "nice-to-have" && "border-gray-500 text-gray-500"
                  )}
                >
                  {f.priority}
                </Badge>
                {f.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {businessCase.industry && (
        <div className="flex items-center gap-2">
          <Briefcase className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs">{businessCase.industry}</span>
        </div>
      )}
    </div>
  );
}

export function ProjectTeamPanel({ 
  projectId, 
  llmSettings, 
  isExpanded = true,
  onToggleExpand 
}: ProjectTeamPanelProps) {
  const [activeTab, setActiveTab] = useState("team");

  const { data: teamData } = useQuery({
    queryKey: ["/api/dream-team/projects", projectId, "team"],
    queryFn: async () => {
      if (!projectId) return { core: [], specialists: [] };
      const params = new URLSearchParams({
        endpoint: llmSettings.endpoint,
        model: llmSettings.plannerModel || "",
      });
      const res = await fetch(`/api/dream-team/projects/${projectId}/team?${params}`);
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 30000,
  });

  const { data: activityData } = useQuery({
    queryKey: ["/api/dream-team/projects", projectId, "activity"],
    queryFn: async () => {
      if (!projectId) return { logs: [] };
      const params = new URLSearchParams({
        endpoint: llmSettings.endpoint,
        model: llmSettings.plannerModel || "",
        limit: "30",
      });
      const res = await fetch(`/api/dream-team/projects/${projectId}/activity?${params}`);
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 10000,
    refetchInterval: 5000,
  });

  const { data: businessCaseData } = useQuery({
    queryKey: ["/api/dream-team/projects", projectId, "business-case"],
    queryFn: async () => {
      if (!projectId) return { businessCase: null };
      const params = new URLSearchParams({
        endpoint: llmSettings.endpoint,
        model: llmSettings.plannerModel || "",
      });
      const res = await fetch(`/api/dream-team/projects/${projectId}/business-case?${params}`);
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 30000,
  });

  const allMembers = [
    ...(teamData?.core || []),
    ...(teamData?.specialists || []),
  ];

  if (!projectId) {
    return null;
  }

  return (
    <Card className="border-border/50 bg-card/80" data-testid="project-team-panel">
      <CardHeader className="py-2 px-3 flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm">Dream Team</CardTitle>
          {(teamData?.specialists?.length || 0) > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              +{teamData.specialists.length} specialists
            </Badge>
          )}
        </div>
        {onToggleExpand && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onToggleExpand}
            data-testid="button-toggle-team-panel"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full rounded-none border-b h-8">
              <TabsTrigger value="team" className="flex-1 text-xs h-7" data-testid="tab-team">
                <Users className="h-3 w-3 mr-1" />
                Team
              </TabsTrigger>
              <TabsTrigger value="activity" className="flex-1 text-xs h-7" data-testid="tab-activity">
                <Activity className="h-3 w-3 mr-1" />
                Log
              </TabsTrigger>
              <TabsTrigger value="business" className="flex-1 text-xs h-7" data-testid="tab-business">
                <FileText className="h-3 w-3 mr-1" />
                Brief
              </TabsTrigger>
            </TabsList>

            <TabsContent value="team" className="p-3 space-y-2 max-h-[300px] overflow-y-auto m-0">
              {allMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Team members will appear here during generation
                </p>
              ) : (
                <>
                  {(teamData?.core || []).map((member: DreamTeamMember) => (
                    <TeamMemberCard key={member.id} member={member} />
                  ))}
                  {(teamData?.specialists || []).length > 0 && (
                    <>
                      <div className="text-xs font-medium text-muted-foreground pt-2 flex items-center gap-2">
                        <Star className="h-3 w-3" />
                        Project Specialists
                      </div>
                      {(teamData?.specialists || []).map((member: DreamTeamMember) => (
                        <TeamMemberCard key={member.id} member={member} />
                      ))}
                    </>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="activity" className="p-3 max-h-[300px] overflow-y-auto m-0">
              {(activityData?.logs || []).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Team activity will be logged here
                </p>
              ) : (
                <div className="space-y-0">
                  {(activityData?.logs || []).slice(0, 20).map((entry: ActivityLogEntry) => (
                    <ActivityLogItem 
                      key={entry.id} 
                      entry={entry} 
                      members={allMembers}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="business" className="p-3 max-h-[300px] overflow-y-auto m-0">
              {businessCaseData?.businessCase ? (
                <BusinessCaseSummary businessCase={businessCaseData.businessCase} />
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Business case will be generated during planning
                </p>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}
