import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, History, ChevronRight, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ManuscriptContent {
  abstract: string;
  introduction: string;
  methodology: string;
  results: string;
}

const EMPTY: ManuscriptContent = { abstract: "", introduction: "", methodology: "", results: "" };

const sections: { key: keyof ManuscriptContent; label: string }[] = [
  { key: "abstract", label: "Abstract" },
  { key: "introduction", label: "Introduction" },
  { key: "methodology", label: "Methodology" },
  { key: "results", label: "Results" },
];

interface VersionEntry {
  timestamp: string;
  label: string;
  content: ManuscriptContent;
}

interface Props {
  projectId: number;
  canWrite?: boolean;
}

export default function ManuscriptEditor({ projectId, canWrite = true }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [content, setContent] = useState<ManuscriptContent>(EMPTY);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [activeSection, setActiveSection] = useState<keyof ManuscriptContent>("abstract");

  const { data: manuscript, isLoading } = useQuery({
    queryKey: ["/projects", projectId, "manuscript"],
    queryFn: () => api.getManuscript(projectId),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (manuscript?.content) {
      try {
        setContent(JSON.parse(manuscript.content));
      } catch {
        setContent(EMPTY);
      }
    }
  }, [manuscript]);

  const saveMutation = useMutation({
    mutationFn: () => api.saveManuscript(projectId, JSON.stringify(content)),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["/projects", projectId, "manuscript"] });
      const entry: VersionEntry = {
        timestamp: new Date(saved.created_at).toLocaleString("en-US", {
          month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
        }),
        label: "Manual save",
        content: { ...content },
      };
      setVersions(prev => [entry, ...prev]);
      toast({ title: "Saved", description: "Manuscript saved successfully." });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col">
        {/* Section tabs + actions */}
        <div className="flex items-center gap-1 border-b px-4 py-2 bg-card overflow-x-auto">
          {sections.map(s => (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                activeSection === s.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid={`tab-section-${s.key}`}
            >
              {s.label}
            </button>
          ))}
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)}>
            <History className="w-3.5 h-3.5 mr-1.5" /> History
          </Button>
          {canWrite ? (
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              data-testid="button-save-manuscript"
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {saveMutation.isPending ? "Saving…" : "Save Version"}
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-md">
              <Eye className="w-3.5 h-3.5" /> Read-only
            </div>
          )}
        </div>

        {/* Editor */}
        <div className="flex-1 p-6 overflow-auto">
          <h2 className="font-display text-xl font-semibold text-foreground mb-3 capitalize">
            {activeSection}
          </h2>
          <Textarea
            value={content[activeSection]}
            onChange={e => canWrite && setContent({ ...content, [activeSection]: e.target.value })}
            readOnly={!canWrite}
            className={`min-h-[300px] resize-none text-sm leading-relaxed border-none shadow-none focus-visible:ring-0 p-0 bg-transparent ${
              !canWrite ? "cursor-default select-text text-muted-foreground" : ""
            }`}
            placeholder={canWrite ? `Write your ${activeSection} here…` : `No ${activeSection} written yet.`}
            data-testid={`textarea-${activeSection}`}
          />
        </div>
      </div>

      {/* Version history panel */}
      {showHistory && (
        <div className="w-72 border-l bg-card p-4 overflow-auto">
          <h3 className="font-display font-semibold text-foreground mb-4">Version History</h3>
          {versions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No saved versions yet. Save to create one.</p>
          ) : (
            <div className="space-y-2">
              {versions.map((v, i) => (
                <button
                  key={i}
                  onClick={() => { if (canWrite) setContent({ ...v.content }); setShowHistory(false); }}
                  className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-primary">v{versions.length - i}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-sm font-medium text-foreground mt-1">{v.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{v.timestamp}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
