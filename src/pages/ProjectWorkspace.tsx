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
import { FileText, Database, FlaskConical, Users, ArrowLeft } from "lucide-react";

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
        <header className="h-12 border-b bg-card flex items-center px-5 flex-shrink-0">
          <h3 className="font-medium text-foreground text-sm">
            {project?.title ?? "Loading…"}
          </h3>
        </header>

        <main className="flex-1 overflow-auto">
          {activeTab === "manuscript" && <ManuscriptEditor projectId={projectId} />}
          {activeTab === "datasets" && <DatasetManager projectId={projectId} />}
          {activeTab === "experiments" && <ExperimentLogs projectId={projectId} />}
          {activeTab === "collaborators" && <CollaboratorsPanel projectId={projectId} />}
        </main>
      </div>
    </div>
  );
}
