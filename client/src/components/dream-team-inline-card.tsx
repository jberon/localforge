import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users, Code, Layers, Heart, Target, Lightbulb,
  CheckCircle2, ChevronRight, MessageSquare,
} from "lucide-react";
import type { DreamTeamDiscussion, DreamTeamSettings } from "@shared/schema";

interface DreamTeamInlineCardProps {
  discussion: DreamTeamDiscussion;
  settings: DreamTeamSettings;
  onViewDiscussion: () => void;
}

const iconMap: Record<string, React.ElementType> = {
  code: Code,
  layers: Layers,
  heart: Heart,
  target: Target,
};

const colorMap: Record<string, string> = {
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
  green: "bg-green-500",
  orange: "bg-orange-500",
  cyan: "bg-cyan-500",
  red: "bg-red-500",
  yellow: "bg-yellow-500",
};

export const DreamTeamInlineCard = memo(function DreamTeamInlineCard({
  discussion,
  settings,
  onViewDiscussion,
}: DreamTeamInlineCardProps) {
  const participantIds = Array.from(new Set(discussion.messages.map(m => m.personaId)));
  const participants = participantIds
    .map(id => settings.personas.find(p => p.id === id))
    .filter(Boolean);

  const statusLabel = discussion.status === "resolved" ? "Resolved" :
    discussion.status === "awaiting_input" ? "Awaiting Input" : "Discussing";

  const statusColor = discussion.status === "resolved" ? "text-emerald-500" :
    discussion.status === "awaiting_input" ? "text-amber-500" : "text-blue-500";

  return (
    <Card className="border-primary/20 bg-primary/5" data-testid="dream-team-inline-card">
      <CardContent className="p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
            <Users className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">Dream Team Review</span>
              <Badge variant="outline" className={`text-[10px] ${statusColor}`}>
                {statusLabel}
              </Badge>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-1 pl-9" data-testid="text-discussion-topic">
          {discussion.topic}
        </p>

        <div className="flex items-center gap-1.5 pl-9" data-testid="team-participants">
          {participants.slice(0, 4).map((persona) => {
            if (!persona) return null;
            const Icon = iconMap[persona.avatar || "code"] || Code;
            return (
              <div
                key={persona.id}
                className={`w-6 h-6 rounded-full ${colorMap[persona.color] || "bg-gray-500"} flex items-center justify-center`}
                title={persona.name}
              >
                <Icon className="w-3 h-3 text-white" />
              </div>
            );
          })}
          {participants.length > 4 && (
            <span className="text-[10px] text-muted-foreground ml-0.5">
              +{participants.length - 4}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground ml-1">
            {discussion.messages.length} messages
          </span>
        </div>

        {discussion.recommendation && (
          <div className="pl-9 flex items-start gap-2 p-2 rounded-md bg-background/60 border border-border/40" data-testid="text-recommendation">
            <Lightbulb className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed line-clamp-2">{discussion.recommendation}</p>
          </div>
        )}

        {discussion.status === "resolved" && (
          <div className="pl-9 flex items-center gap-1.5 text-emerald-500">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Team reached consensus</span>
          </div>
        )}

        <div className="pl-9">
          <Button
            variant="outline"
            size="sm"
            onClick={onViewDiscussion}
            className="gap-1.5 text-xs"
            data-testid="button-view-discussion"
          >
            <MessageSquare className="w-3 h-3" />
            View full discussion
            <ChevronRight className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});
