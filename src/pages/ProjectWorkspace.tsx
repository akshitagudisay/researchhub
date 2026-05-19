import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type ApiProject } from "@/lib/api";
import ManuscriptEditor from "@/components/ManuscriptEditor";
import DatasetManager from "@/components/DatasetManager";
import ExperimentLogs from "@/components/ExperimentLogs";
import CollaboratorsPanel from "@/components/CollaboratorsPanel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Database, FlaskConical, Users, ArrowLeft, Eye } from "lucide-react";

type Tab = "manuscript" | "datasets" | "experiments" | "collaborators";

const tabs: { key: Tab; label: string; icon: typeof FileText }[] = [
  { key: "manuscript", label: "Manuscript", icon: FileText },
  { key: "datasets", label: "Datasets", icon: Database },
  { key: "experiments", label: "Experiments", icon: FlaskConical },
  { key: "collaborators", label: "Collaborators", icon: Users },
];

export default function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = Number(id);
  const [activeTab, setActiveTab] = useState<Tab>("manuscript");

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

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
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
        <nav className="flex-1 p-3 space-y-1">
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
            </button>
          ))}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b bg-card flex items-center px-5 flex-shrink-0 gap-3">
          <h3 className="font-medium text-foreground text-sm flex-1">
            {project?.title ?? "Loading…"}
          </h3>
          {role === "viewer" && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 bg-muted px-2.5 py-1 rounded-full">
              <Eye className="w-3 h-3" /> Viewer — read-only
            </span>
          )}
          {role === "editor" && (
            <span className="text-xs text-blue-700 flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-full">
              <Users className="w-3 h-3" /> Editor
            </span>
          )}
        </header>

        <main className="flex-1 overflow-auto">
          {activeTab === "manuscript" && (
            <ManuscriptEditor projectId={projectId} canWrite={canWrite} />
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
        </main>
      </div>
    </div>
  );
}
