import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type ApiProject, type ApiUser } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import ManuscriptEditor from "@/components/ManuscriptEditor";
import DatasetManager from "@/components/DatasetManager";
import ExperimentLogs from "@/components/ExperimentLogs";
import CollaboratorsPanel from "@/components/CollaboratorsPanel";
import ChatSidebar from "@/components/ChatSidebar";
import ContributionsDashboard from "@/components/ContributionsDashboard";
import ReproducibilityGraph from "@/components/ReproducibilityGraph";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText, Database, FlaskConical, Users, ArrowLeft,
  Eye, MessageSquare, BarChart3, GitBranch,
} from "lucide-react";

type Tab = "manuscript" | "datasets" | "experiments" | "collaborators" | "analytics" | "reproducibility";

const tabs: { key: Tab; label: string; icon: typeof FileText; badge?: string }[] = [
  { key: "manuscript", label: "Manuscript", icon: FileText },
  { key: "datasets", label: "Datasets", icon: Database },
  { key: "experiments", label: "Experiments", icon: FlaskConical },
  { key: "collaborators", label: "Collaborators", icon: Users },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "reproducibility", label: "Reproducibility", icon: GitBranch, badge: "NEW" },
];

export default function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = Number(id);
  const [activeTab, setActiveTab] = useState<Tab>("manuscript");
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const { token } = useAuth();

  const { data: currentUser } = useQuery<ApiUser>({
    queryKey: ["/users/me"],
    queryFn: () => api.getMe(),
    enabled: !!token,
    staleTime: 60000,
  });

  const { data: project, isLoading } = useQuery<ApiProject>({
    queryKey: ["/projects", projectId],
    queryFn: () =>
      api.getProjects().then((ps) => {
        const p = ps.find((p) => p.id === projectId);
        if (!p) throw new Error("Project not found");
        return p;
      }),
    enabled: !!projectId,
  });

  const { data: roleData } = useQuery<{ role: string }>({
    queryKey: ["/projects", projectId, "my-role"],
    queryFn: () => api.getMyRole(projectId),
    enabled: !!projectId,
  });

  const role = roleData?.role ?? "owner";
  const canWrite = role === "owner" || role === "editor";

  const handleUnreadChange = useCallback((count: number) => {
    if (!chatOpen) setUnread(count);
  }, [chatOpen]);

  const openChat = () => { setUnread(0); setChatOpen(true); };
  const closeChat = () => setChatOpen(false);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Sidebar */}
      <aside className="w-56 border-r bg-card flex flex-col flex-shrink-0">
        <div className="p-4 border-b">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/dashboard")}
            className="mb-3 -ml-2 text-muted-foreground"
            data-testid="button-back"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back
          </Button>
          {isLoading ? (
            <Skeleton className="h-4 w-full" />
          ) : (
            <h2 className="font-display font-semibold text-foreground text-sm line-clamp-2">
              {project?.title}
            </h2>
          )}
          {role === "viewer" && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted px-2 py-1 rounded-md">
              <Eye className="w-3 h-3" /> Read-only access
            </div>
          )}
          {role === "editor" && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
              <Users className="w-3 h-3" /> Editor access
            </div>
          )}
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              data-testid={`tab-${t.key}`}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === t.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              {t.badge && (
                <span className="ml-auto text-[9px] bg-gradient-to-r from-violet-500 to-blue-500 text-white px-1.5 py-0.5 rounded-full font-semibold">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-12 border-b bg-card flex items-center px-5 flex-shrink-0 gap-3">
          <h3 className="font-medium text-foreground text-sm flex-1 truncate">
            {project?.title ?? "Loading…"}
          </h3>
          {role === "viewer" && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 bg-muted px-2.5 py-1 rounded-full flex-shrink-0">
              <Eye className="w-3 h-3" /> Viewer — read-only
            </span>
          )}
          {role === "editor" && (
            <span className="text-xs text-blue-700 flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-full flex-shrink-0">
              <Users className="w-3 h-3" /> Editor
            </span>
          )}

          {/* Chat toggle */}
          <Button
            variant={chatOpen ? "default" : "outline"}
            size="sm"
            onClick={chatOpen ? closeChat : openChat}
            className="relative gap-1.5 h-8 flex-shrink-0"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="text-xs">Chat</span>
            {!chatOpen && unread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Button>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col">
          {activeTab === "manuscript" && (
            <ManuscriptEditor
              projectId={projectId}
              canWrite={canWrite}
              userRole={role}
              currentUserId={currentUser?.id ?? 0}
            />
          )}
          {activeTab === "datasets" && (
            <DatasetManager projectId={projectId} canWrite={canWrite} />
          )}
          {activeTab === "experiments" && (
            <ExperimentLogs projectId={projectId} canWrite={canWrite} />
          )}
          {activeTab === "collaborators" && (
            <CollaboratorsPanel projectId={projectId} userRole={role} />
          )}
          {activeTab === "analytics" && (
            <ContributionsDashboard projectId={projectId} projectTitle={project?.title} />
          )}
          {activeTab === "reproducibility" && (
            <ReproducibilityGraph projectId={projectId} canWrite={canWrite} />
          )}
        </main>
      </div>

      {/* Right Chat Sidebar */}
      {chatOpen && (
        <ChatSidebar
          projectId={projectId}
          onClose={closeChat}
          onUnreadChange={handleUnreadChange}
        />
      )}
    </div>
  );
}
