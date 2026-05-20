import { useQuery } from "@tanstack/react-query";
import { api, type ApiContributionSummary } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Trophy, Download, Activity, Star, BarChart3,
  FileText, Database, FlaskConical, BookOpen, MessageSquare,
} from "lucide-react";

const COLORS = [
  "#8b5cf6", "#3b82f6", "#14b8a6", "#f59e0b",
  "#ef4444", "#6366f1", "#ec4899", "#10b981",
];

const ACTION_ICONS: Record<string, React.ReactNode> = {
  manuscript_edit: <FileText className="w-3 h-3" />,
  dataset_upload: <Database className="w-3 h-3" />,
  experiment_add: <FlaskConical className="w-3 h-3" />,
  citation_add: <BookOpen className="w-3 h-3" />,
  peer_review: <MessageSquare className="w-3 h-3" />,
};

const ACTION_LABEL: Record<string, string> = {
  manuscript_edit: "Manuscript edits",
  dataset_upload: "Dataset uploads",
  experiment_add: "Experiments",
  citation_add: "Citations added",
  peer_review: "Peer reviews",
};

function getInitials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

function avatarColor(idx: number) {
  return COLORS[idx % COLORS.length];
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function generateReport(summary: ApiContributionSummary, projectTitle: string): string {
  const lines: string[] = [];
  lines.push(`AUTHORSHIP REPORT — ${projectTitle}`);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push("=".repeat(60));
  lines.push("");
  lines.push("CONTRIBUTOR RANKINGS");
  lines.push("-".repeat(40));

  summary.contributors.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.email}`);
    lines.push(`   Score: ${c.total_score} pts (${c.percentage}%)`);
    const acts = Object.entries(c.actions)
      .map(([k, v]) => `${ACTION_LABEL[k] ?? k}: ${v}`)
      .join(", ");
    if (acts) lines.push(`   Activities: ${acts}`);
    lines.push("");
  });

  lines.push("SCORING SYSTEM");
  lines.push("-".repeat(40));
  Object.entries(summary.action_scores).forEach(([k, v]) => {
    lines.push(`  ${ACTION_LABEL[k] ?? k}: +${v} pts`);
  });
  lines.push("");
  lines.push(`Total project score: ${summary.total_score} pts`);

  return lines.join("\n");
}

interface Props {
  projectId: number;
  projectTitle?: string;
}

export default function ContributionsDashboard({ projectId, projectTitle = "Project" }: Props) {
  const { data: summary, isLoading } = useQuery<ApiContributionSummary>({
    queryKey: ["/projects", projectId, "contributions", "summary"],
    queryFn: () => api.getContributionSummary(projectId),
    enabled: !!projectId,
    refetchInterval: 30000,
  });

  const handleDownload = () => {
    if (!summary) return;
    const text = generateReport(summary, projectTitle);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `authorship-report-${projectId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!summary || summary.contributors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 px-6 text-center">
        <BarChart3 className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">No contributions yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Start editing the manuscript, uploading datasets, or adding experiments to see authorship analytics.
        </p>
      </div>
    );
  }

  const pieData = summary.contributors.map((c, i) => ({
    name: c.email.split("@")[0],
    value: c.total_score,
    fullEmail: c.email,
    color: COLORS[i % COLORS.length],
  }));

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Authorship Analytics
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {summary.contributors.length} contributor{summary.contributors.length !== 1 ? "s" : ""} · {summary.total_score} total contribution points
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5">
          <Download className="w-4 h-4" />
          Authorship Report
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Pie chart */}
        <div className="lg:col-span-1 bg-card border rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Contribution Share
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [`${value} pts`, name]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-3 space-y-1.5">
            {summary.contributors.map((c, i) => (
              <div key={c.user_id} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="text-muted-foreground truncate flex-1">{c.email.split("@")[0]}</span>
                <span className="font-semibold text-foreground tabular-nums">{c.percentage}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="lg:col-span-2 bg-card border rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            Contributor Leaderboard
          </h3>
          <div className="space-y-3">
            {summary.contributors.map((c, i) => (
              <div
                key={c.user_id}
                className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex-shrink-0 relative">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
                    style={{ background: avatarColor(i) }}
                  >
                    {getInitials(c.email)}
                  </div>
                  {i === 0 && (
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400 absolute -top-0.5 -right-0.5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground truncate">{c.email.split("@")[0]}</span>
                    <span className="text-sm font-bold text-foreground tabular-nums ml-2">{c.total_score} pts</span>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${c.percentage}%`, background: avatarColor(i) }}
                    />
                  </div>
                  {/* Action breakdown */}
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {Object.entries(c.actions).map(([action, count]) => (
                      <span
                        key={action}
                        className="inline-flex items-center gap-0.5 text-[10px] bg-background border rounded-full px-1.5 py-0.5 text-muted-foreground"
                      >
                        {ACTION_ICONS[action]}
                        {count}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-xs font-semibold" style={{ color: avatarColor(i) }}>
                    {c.percentage}%
                  </div>
                  <div className="text-[10px] text-muted-foreground">share</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Activity feed */}
        <div className="lg:col-span-3 bg-card border rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Recent Activity
          </h3>
          {summary.recent_activity.length === 0 ? (
            <p className="text-xs text-muted-foreground">No recent activity.</p>
          ) : (
            <div className="space-y-2">
              {summary.recent_activity.slice(0, 20).map((a, i) => {
                const contribIdx = summary.contributors.findIndex(c => c.email === a.email);
                const color = contribIdx >= 0 ? COLORS[contribIdx % COLORS.length] : COLORS[0];
                return (
                  <div key={i} className="flex items-center gap-3 py-1.5 border-b border-border/50 last:border-0">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                      style={{ background: color }}
                    >
                      {getInitials(a.email)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-foreground font-medium">{a.email.split("@")[0]}</span>
                      <span className="text-xs text-muted-foreground ml-1">{a.label.toLowerCase()}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] font-semibold text-emerald-600">+{a.score}</span>
                      <span className="text-[10px] text-muted-foreground">{formatTime(a.timestamp)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
