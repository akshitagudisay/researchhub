import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useManuscriptCollaboration } from "@/hooks/useManuscriptCollaboration";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Save, History, ChevronRight, Eye, Wifi, WifiOff,
  CheckCircle2, Clock, AlertTriangle, BookOpen, Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CitationManager from "./CitationManager";

interface ManuscriptContent {
  abstract: string;
  introduction: string;
  methodology: string;
  results: string;
  conclusion: string;
}

const EMPTY: ManuscriptContent = {
  abstract: "", introduction: "", methodology: "", results: "", conclusion: "",
};

const SECTION_COLORS: Record<string, string> = {
  abstract: "bg-violet-400",
  introduction: "bg-blue-400",
  methodology: "bg-teal-400",
  results: "bg-amber-400",
  conclusion: "bg-rose-400",
};

const SECTION_BADGE: Record<string, string> = {
  abstract: "bg-violet-100 text-violet-700 border-violet-200",
  introduction: "bg-blue-100 text-blue-700 border-blue-200",
  methodology: "bg-teal-100 text-teal-700 border-teal-200",
  results: "bg-amber-100 text-amber-700 border-amber-200",
  conclusion: "bg-rose-100 text-rose-700 border-rose-200",
};

const sections: { key: keyof ManuscriptContent; label: string }[] = [
  { key: "abstract", label: "Abstract" },
  { key: "introduction", label: "Introduction" },
  { key: "methodology", label: "Methodology" },
  { key: "results", label: "Results" },
  { key: "conclusion", label: "Conclusion" },
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

function getInitials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

function avatarColor(email: string) {
  const palette = ["bg-violet-500", "bg-blue-500", "bg-teal-500", "bg-amber-500", "bg-rose-500", "bg-indigo-500"];
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) & 0xffffffff;
  return palette[Math.abs(h) % palette.length];
}

const AUTOSAVE_DEBOUNCE_MS = 2000;

export default function ManuscriptEditor({ projectId, canWrite = true }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token } = useAuth();

  const [content, setContent] = useState<ManuscriptContent>(EMPTY);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showCitations, setShowCitations] = useState(false);
  const [activeSection, setActiveSection] = useState<keyof ManuscriptContent>("abstract");

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentContent = useRef<string>("");
  const initialized = useRef(false);

  const collab = useManuscriptCollaboration({
    projectId,
    token,
    enabled: true,
  });

  const { data: manuscript, isLoading } = useQuery({
    queryKey: ["/projects", projectId, "manuscript"],
    queryFn: () => api.getManuscript(projectId),
    enabled: !!projectId,
  });

  // Load initial manuscript content from REST
  useEffect(() => {
    if (manuscript?.content && !initialized.current) {
      try {
        const parsed = JSON.parse(manuscript.content);
        setContent({
          abstract: parsed.abstract ?? "",
          introduction: parsed.introduction ?? "",
          methodology: parsed.methodology ?? "",
          results: parsed.results ?? "",
          conclusion: parsed.conclusion ?? "",
        });
        initialized.current = true;
      } catch {
        setContent(EMPTY);
        initialized.current = true;
      }
    } else if (manuscript === null && !initialized.current) {
      initialized.current = true;
    }
  }, [manuscript]);

  // Apply incoming edits from WS (other users)
  useEffect(() => {
    if (!collab.incomingEdit) return;
    const { section, content: newContent } = collab.incomingEdit;
    if (section !== activeSection) {
      setContent(prev => ({ ...prev, [section]: newContent }));
    }
    collab.clearIncomingEdit();
  }, [collab.incomingEdit]);

  const saveMutation = useMutation({
    mutationFn: (c: ManuscriptContent) =>
      api.saveManuscript(projectId, JSON.stringify(c)),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["/projects", projectId, "manuscript"] });
      const entry: VersionEntry = {
        timestamp: new Date(saved.created_at).toLocaleString("en-US", {
          month: "short", day: "numeric", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        }),
        label: "Manual save",
        content: { ...content },
      };
      setVersions(prev => [entry, ...prev]);
      toast({ title: "Saved", description: "Version saved successfully." });
    },
  });

  // Send WS edit with debounce for autosave
  const handleContentChange = useCallback((section: keyof ManuscriptContent, value: string) => {
    if (!canWrite) return;
    const updated = { ...content, [section]: value };
    setContent(updated);

    clearTimeout(autosaveTimer.current!);
    autosaveTimer.current = setTimeout(() => {
      const serialized = JSON.stringify(updated[section]);
      if (serialized !== lastSentContent.current) {
        lastSentContent.current = serialized;
        collab.sendEdit(section, value);
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [content, canWrite, collab]);

  const handleSectionClick = (key: keyof ManuscriptContent) => {
    if (activeSection !== key) {
      collab.sendSectionBlur(activeSection);
    }
    setActiveSection(key);
    collab.sendSectionFocus(key);
  };

  const handleInsertCitation = useCallback((citation: string) => {
    if (!canWrite) return;
    setContent(prev => ({
      ...prev,
      [activeSection]: prev[activeSection] + "\n\n" + citation,
    }));
    collab.sendEdit(activeSection, content[activeSection] + "\n\n" + citation);
  }, [activeSection, content, canWrite, collab]);

  // Who is editing which section
  const sectionEditors: Record<string, { email: string }[]> = {};
  for (const collab_ of collab.activeCollaborators) {
    if (collab_.section) {
      if (!sectionEditors[collab_.section]) sectionEditors[collab_.section] = [];
      sectionEditors[collab_.section].push({ email: collab_.email });
    }
  }

  const otherCollabs = collab.activeCollaborators;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main editor column */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Active collaborators bar */}
        {otherCollabs.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary/5 to-transparent border-b text-xs">
            <Users className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
            <span className="text-muted-foreground mr-1">Editing now:</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {otherCollabs.map(u => (
                <div key={u.user_id} className="flex items-center gap-1 bg-white border rounded-full px-2 py-0.5 shadow-sm">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold ${avatarColor(u.email)}`}>
                    {getInitials(u.email)}
                  </div>
                  <span className="text-foreground font-medium">{u.email.split("@")[0]}</span>
                  {u.section && (
                    <span className={`text-[10px] px-1 rounded border ${SECTION_BADGE[u.section] ?? "bg-muted text-muted-foreground"}`}>
                      {u.section}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-1">
              {collab.isConnected
                ? <Wifi className="w-3 h-3 text-emerald-500" />
                : <WifiOff className="w-3 h-3 text-muted-foreground animate-pulse" />
              }
            </div>
          </div>
        )}

        {/* Section conflict warning */}
        {collab.sectionConflict && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              <strong>{collab.sectionConflict.editor_email.split("@")[0]}</strong> is already
              editing <strong>{collab.sectionConflict.section}</strong>. Both edits will be saved
              — last write wins.
            </span>
            <button
              onClick={collab.clearConflict}
              className="ml-auto text-amber-600 hover:text-amber-800 font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-1 border-b px-4 py-2 bg-card overflow-x-auto flex-shrink-0">
          {sections.map(s => {
            const editors = sectionEditors[s.key] ?? [];
            return (
              <button
                key={s.key}
                onClick={() => handleSectionClick(s.key)}
                className={`relative px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  activeSection === s.key
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {s.label}
                {editors.length > 0 && (
                  <span className="flex -space-x-1">
                    {editors.slice(0, 2).map((e, i) => (
                      <div
                        key={i}
                        title={`${e.email} is editing`}
                        className={`w-3.5 h-3.5 rounded-full border border-white ${avatarColor(e.email)} flex items-center justify-center text-white text-[7px] font-bold`}
                      >
                        {getInitials(e.email)}
                      </div>
                    ))}
                  </span>
                )}
                {activeSection === s.key && (
                  <span className={`absolute bottom-0 left-2 right-2 h-0.5 rounded-full ${SECTION_COLORS[s.key]}`} />
                )}
              </button>
            );
          })}

          <div className="flex-1" />

          {/* Autosave status */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground mr-2">
            {collab.autosaveStatus === "saving" && (
              <><Clock className="w-3 h-3 animate-spin" /> Saving…</>
            )}
            {collab.autosaveStatus === "saved" && (
              <><CheckCircle2 className="w-3 h-3 text-emerald-500" /> <span className="text-emerald-600">Autosaved</span></>
            )}
            {collab.autosaveStatus === "idle" && collab.lastSaved && (
              <span className="text-muted-foreground/60 text-[10px]">
                Saved {new Date(collab.lastSaved).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setShowCitations(!showCitations); setShowHistory(false); }}
            className={showCitations ? "bg-primary/10 text-primary" : ""}
          >
            <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Citations
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => { setShowHistory(!showHistory); setShowCitations(false); }}
          >
            <History className="w-3.5 h-3.5 mr-1.5" /> History
          </Button>

          {canWrite ? (
            <Button
              size="sm"
              onClick={() => saveMutation.mutate(content)}
              disabled={saveMutation.isPending}
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

        {/* Editor body */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 p-6 overflow-auto">
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-2 h-2 rounded-full ${SECTION_COLORS[activeSection]}`} />
              <h2 className="font-display text-xl font-semibold text-foreground capitalize">
                {activeSection}
              </h2>
              {(sectionEditors[activeSection] ?? []).length > 0 && (
                <div className="flex items-center gap-1 ml-2">
                  {(sectionEditors[activeSection] ?? []).map((e, i) => (
                    <div key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
                      <div className={`w-4 h-4 rounded-full ${avatarColor(e.email)} flex items-center justify-center text-white text-[8px] font-bold`}>
                        {getInitials(e.email)}
                      </div>
                      <span>{e.email.split("@")[0]} is editing</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Textarea
              value={content[activeSection]}
              onChange={e => handleContentChange(activeSection, e.target.value)}
              readOnly={!canWrite}
              className={`min-h-[400px] resize-none text-sm leading-relaxed border-none shadow-none focus-visible:ring-0 p-0 bg-transparent ${
                !canWrite ? "cursor-default select-text text-muted-foreground" : ""
              }`}
              placeholder={canWrite ? `Write your ${activeSection} here…` : `No ${activeSection} written yet.`}
            />
          </div>

          {/* Version history panel */}
          {showHistory && (
            <div className="w-64 border-l bg-card p-4 overflow-auto flex-shrink-0">
              <h3 className="font-display font-semibold text-foreground mb-4 text-sm">Version History</h3>
              {versions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No saved versions yet.</p>
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
                      <p className="text-xs font-medium text-foreground mt-1">{v.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{v.timestamp}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Auto-generated references section */}
        <div className="border-t px-6 py-3 bg-muted/20 flex-shrink-0">
          <AutoReferences projectId={projectId} onInsert={handleInsertCitation} canWrite={canWrite} />
        </div>
      </div>

      {/* Citation manager sidebar */}
      {showCitations && (
        <CitationManager
          projectId={projectId}
          canWrite={canWrite}
          onInsert={handleInsertCitation}
          onClose={() => setShowCitations(false)}
        />
      )}
    </div>
  );
}

function AutoReferences({ projectId, onInsert, canWrite }: { projectId: number; onInsert: (s: string) => void; canWrite: boolean }) {
  const { data: citations } = useQuery({
    queryKey: ["/projects", projectId, "citations"],
    queryFn: () => api.getCitations(projectId),
    enabled: !!projectId,
  });

  if (!citations || citations.length === 0) return null;

  return (
    <details className="text-xs">
      <summary className="text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors font-medium">
        References ({citations.length}) — auto-generated
      </summary>
      <ol className="mt-2 space-y-1 list-decimal list-inside text-muted-foreground leading-relaxed pl-2">
        {citations.map((c, i) => (
          <li key={c.id}>
            <span className="text-foreground">{c.formatted_apa ?? `${c.authors.join(", ")} (${c.year}). ${c.title}.`}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
