import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  projectId: number;
  activeTab: string;
}

function initials(email: string) {
  const parts = email.split("@")[0].split(/[._\-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

function tabLabel(tab: string | null) {
  if (!tab) return "the project";
  const map: Record<string, string> = {
    manuscript: "Manuscript",
    datasets: "Datasets",
    experiments: "Experiments",
    collaborators: "Collaborators",
    analytics: "Analytics",
    reproducibility: "Reproducibility",
  };
  return map[tab] ?? tab;
}

const COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
];

function colorFor(userId: number) {
  return COLORS[userId % COLORS.length];
}

export default function PresenceAvatars({ projectId, activeTab }: Props) {
  const queryClient = useQueryClient();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const sendHeartbeat = () => {
      api.heartbeat(projectId, activeTab).catch(() => {});
    };

    sendHeartbeat();
    intervalRef.current = setInterval(sendHeartbeat, 25_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [projectId, activeTab]);

  const { data: presence } = useQuery({
    queryKey: ["/presence", projectId],
    queryFn: () => api.getPresence(projectId),
    refetchInterval: 20_000,
    staleTime: 15_000,
  });

  if (!presence || presence.length === 0) return null;

  const others = presence.filter(p => !p.is_me);
  const me = presence.find(p => p.is_me);
  const MAX_SHOWN = 5;
  const shown = others.slice(0, MAX_SHOWN);
  const overflow = others.length - MAX_SHOWN;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Other active users */}
        <div className="flex items-center -space-x-2">
          {shown.map(p => (
            <Tooltip key={p.user_id}>
              <TooltipTrigger asChild>
                <div className="relative cursor-default">
                  <div
                    className={`w-7 h-7 rounded-full border-2 border-card flex items-center justify-center text-[10px] font-semibold text-white select-none ${colorFor(p.user_id)}`}
                  >
                    {initials(p.email)}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-card" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <p className="font-medium">{p.email}</p>
                <p className="text-muted-foreground">Editing {tabLabel(p.current_tab)}</p>
              </TooltipContent>
            </Tooltip>
          ))}

          {overflow > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-7 h-7 rounded-full border-2 border-card bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground cursor-default select-none">
                  +{overflow}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <p>{overflow} more online</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Self avatar */}
        {me && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative cursor-default ml-1">
                <div
                  className={`w-7 h-7 rounded-full border-2 border-primary/40 flex items-center justify-center text-[10px] font-semibold text-white select-none opacity-70 ${colorFor(me.user_id)}`}
                >
                  {initials(me.email)}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-card" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <p className="font-medium">{me.email} (you)</p>
              <p className="text-muted-foreground">Editing {tabLabel(me.current_tab)}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Separator */}
        {others.length > 0 && (
          <span className="text-[10px] text-muted-foreground ml-1 hidden sm:inline">
            {others.length === 1 ? "1 online" : `${others.length} online`}
          </span>
        )}
      </div>
    </TooltipProvider>
  );
}
