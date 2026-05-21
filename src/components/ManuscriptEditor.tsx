import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiManuscriptVersion } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useManuscriptCollaboration } from "@/hooks/useManuscriptCollaboration";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Save, History, Eye, Wifi, WifiOff,
  CheckCircle2, Clock, AlertTriangle, BookOpen, Users,
  RotateCcw, Loader2, X, AlertCircle, UserCheck, Wand2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CitationManager from "./CitationManager";
import ReviewPanel from "./ReviewPanel";
import AIWritingAssistant from "./AIWritingAssistant";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ManuscriptContent {
  abstract: string;
  introduction: string;
  methodology: string;
  results: string;
  conclusion: string;
}

const EMPTY_CONTENT: ManuscriptContent = {
  abstract: "", introduction: "", methodology: "", results: "", conclusion: "",
};

const SECTIONS: { key: keyof ManuscriptContent; label: string }[] = [
  { key: "abstract", label: "Abstract" },
  { key: "introduction", label: "Introduction" },
  { key: "methodology", label: "Methodology" },
  { key: "results", label: "Results" },
  { key: "conclusion", label: "Conclusion" },
];

const SECTION_BAR_COLOR: Record<string, string> = {
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

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface Props {
  projectId: number;
  canWrite?: boolean;
  userRole?: string;
  currentUserId?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

function avatarColor(email: string) {
  const palette = ["bg-violet-500", "bg-blue-500", "bg-teal-500", "bg-amber-500", "bg-rose-500", "bg-indigo-500"];
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) & 0xffffffff;
  return palette[Math.abs(h) % palette.length];
}

function parseContent(raw: string): ManuscriptContent {
  try {
    const p = JSON.parse(raw);
    return {
      abstract: p.abstract ?? "",
      introduction: p.introduction ?? "",
      methodology: p.methodology ?? "",
      results: p.results ?? "",
      conclusion: p.conclusion ?? "",
    };
  } catch {
    return { ...EMPTY_CONTENT };
  }
}

function hasAnyContent(c: ManuscriptContent): boolean {
  return Object.values(c).some(v => v.trim().length > 0);
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Version History Panel ─────────────────────────────────────────────────────

function VersionHistoryPanel({
  projectId,
  canWrite,
  onRestore,
  onClose,
}: {
  projectId: number;
  canWrite: boolean;
  onRestore: (content: string) => void;
  onClose: () => void;
}) {
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const { data: versions, isLoading, refetch, isError } = useQuery<ApiManuscriptVersion[]>({
    queryKey: ["/projects", projectId, "manuscript", "history"],
    queryFn: () => api.getVersionHistory(projectId),
    staleTime: 0,
  });

  return (
    <div className="w-64 border-l bg-card flex flex-col flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <h3 className="font-semibold text-sm text-foreground">Version History</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
        ) : isError ? (
          <div className="text-center py-6">
            <AlertCircle className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Failed to load history.</p>
            <button onClick={() => refetch()} className="text-xs text-primary mt-1 hover:underline">
              Retry
            </button>
          </div>
        ) : !versions || versions.length === 0 ? (
          <div className="text-center py-6">
            <History className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No saved versions yet.</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Click "Save Version" to create a snapshot.
            </p>
          </div>
        ) : (
          versions.map((v, i) => (
            <div key={v.id} className="rounded-lg border p-3 hover:bg-muted/30 transition-colors">
              <div className="flex items-start justify-between gap-1 mb-1">
                <span className="text-xs font-semibold text-primary">v{versions.length - i}</span>
                {v.saved_by_email && (
                  <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                    {v.saved_by_email.split("@")[0]}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mb-1.5">
                {formatTimestamp(v.created_at)}
              </p>
              {v.preview && (
                <p className="text-[11px] text-foreground line-clamp-2 leading-snug mb-2">
                  {v.preview}…
                </p>
              )}
              {canWrite && (
                confirmId === v.id ? (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      className="h-6 text-[10px] px-2 flex-1"
                      onClick={() => { onRestore(v.content); setConfirmId(null); }}
                    >
                      Confirm
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => setConfirmId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmId(v.id)}
                    className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                  >
                    <RotateCcw className="w-3 h-3" /> Restore this version
                  </button>
                )
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── AutoReferences Bar ────────────────────────────────────────────────────────

function AutoReferences({ projectId }: { projectId: number }) {
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
        {citations.map(c => (
          <li key={c.id}>
            <span className="text-foreground">
              {c.formatted_apa ?? `${c.authors.join(", ")} (${c.year}). ${c.title}.`}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

// ── Main Editor ───────────────────────────────────────────────────────────────

export default function ManuscriptEditor({ projectId, canWrite = true, userRole = "owner", currentUserId = 0 }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token } = useAuth();

  // Editor state
  const [content, setContent] = useState<ManuscriptContent>(EMPTY_CONTENT);
  const contentRef = useRef<ManuscriptContent>(EMPTY_CONTENT); // mirrors state; used in callbacks
  const [activeSection, setActiveSection] = useState<keyof ManuscriptContent>("abstract");

  // UI state — only one panel open at a time
  const [showHistory, setShowHistory] = useState(false);
  const [showCitations, setShowCitations] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showAI, setShowAI] = useState(false);

  // AI: track selected text for AI writing assistant
  const [selectedText, setSelectedText] = useState("");

  // Autosave
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const lastSavedJsonRef = useRef<string>("");
  const restSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsEditTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Version saving
  const [isSavingVersion, setIsSavingVersion] = useState(false);

  // Init guard — prevents double-init on re-renders
  const initialized = useRef(false);

  // ── Real-time collaboration ──────────────────────────────────────────────
  const collab = useManuscriptCollaboration({ projectId, token, enabled: true });

  // ── Load initial manuscript ──────────────────────────────────────────────
  const { data: manuscript, isLoading } = useQuery({
    queryKey: ["/projects", projectId, "manuscript"],
    queryFn: () => api.getManuscript(projectId),
    enabled: !!projectId,
    staleTime: 0,
    refetchOnMount: true,
  });

  // Initialize editor once after the initial fetch completes
  useEffect(() => {
    if (initialized.current || isLoading) return;
    initialized.current = true;

    if (manuscript?.content) {
      const loaded = parseContent(manuscript.content);
      setContent(loaded);
      contentRef.current = loaded;
      lastSavedJsonRef.current = manuscript.content; // mark as already persisted
    }
    // If null/undefined, editor stays empty — that's correct
  }, [isLoading, manuscript]);

  // Cleanup timers on unmount
  useEffect(() => () => {
    clearTimeout(restSaveTimerRef.current!);
    clearTimeout(wsEditTimerRef.current!);
  }, []);

  // ── Apply incoming WS edits from other collaborators ─────────────────────
  useEffect(() => {
    if (!collab.incomingEdit) return;
    const { section, content: newText } = collab.incomingEdit;
    // Only apply if user is NOT currently focused on that section (avoid clobbering their typing)
    if (section !== activeSection) {
      const updated = { ...contentRef.current, [section]: newText };
      setContent(updated);
      contentRef.current = updated;
    }
    collab.clearIncomingEdit();
  }, [collab.incomingEdit, activeSection]);

  // ── REST autosave (persistence backbone) ─────────────────────────────────
  const scheduleRestAutosave = useCallback((newContent: ManuscriptContent) => {
    if (!canWrite || !initialized.current) return;

    const json = JSON.stringify(newContent);

    // Guard: never overwrite persisted content with all-empty content
    if (!hasAnyContent(newContent)) return;

    // Guard: no-op if nothing changed
    if (json === lastSavedJsonRef.current) return;

    clearTimeout(restSaveTimerRef.current!);
    restSaveTimerRef.current = setTimeout(async () => {
      // Re-check — user might have kept typing
      const currentJson = JSON.stringify(contentRef.current);
      if (currentJson === lastSavedJsonRef.current) return;

      setSaveStatus("saving");
      try {
        await api.saveManuscript(projectId, currentJson);
        lastSavedJsonRef.current = currentJson;
        setSaveStatus("saved");
        // Refresh suggestions with updated manuscript content
        queryClient.invalidateQueries({
          queryKey: ["/projects", projectId, "citations", "suggestions"],
        });
        setTimeout(() => setSaveStatus(s => s === "saved" ? "idle" : s), 3000);
      } catch {
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 6000);
      }
    }, 4000); // 4-second debounce
  }, [canWrite, projectId]);

  // ── Content change handler ────────────────────────────────────────────────
  const handleContentChange = useCallback((section: keyof ManuscriptContent, value: string) => {
    if (!canWrite) return;
    const updated = { ...contentRef.current, [section]: value };
    setContent(updated);
    contentRef.current = updated;

    // WS edit — 1.5s debounce, for real-time collab visibility
    clearTimeout(wsEditTimerRef.current!);
    wsEditTimerRef.current = setTimeout(() => {
      collab.sendEdit(section, value);
    }, 1500);

    // REST autosave — 4s debounce, for persistence
    scheduleRestAutosave(updated);
  }, [canWrite, collab, scheduleRestAutosave]);

  // ── Section focus/blur ────────────────────────────────────────────────────
  const handleSectionClick = useCallback((key: keyof ManuscriptContent) => {
    if (key !== activeSection) {
      collab.sendSectionBlur(activeSection);
    }
    setActiveSection(key);
    collab.sendSectionFocus(key);
  }, [activeSection, collab]);

  // ── Panel toggle helpers — only one panel open at a time ──────────────────
  const openPanel = useCallback((panel: "history" | "citations" | "review" | "ai") => {
    setShowHistory(panel === "history");
    setShowCitations(panel === "citations");
    setShowReview(panel === "review");
    setShowAI(panel === "ai");
  }, []);

  const closeAllPanels = useCallback(() => {
    setShowHistory(false);
    setShowCitations(false);
    setShowReview(false);
    setShowAI(false);
  }, []);

  // ── Apply AI suggestion to active section ─────────────────────────────────
  const handleApplyAISuggestion = useCallback((newText: string) => {
    if (!canWrite) return;
    const current = contentRef.current;
    const section = activeSection;
    // Replace selected text within the section if a selection exists
    const sectionText = current[section];
    let updated: ManuscriptContent;
    if (selectedText && sectionText.includes(selectedText)) {
      updated = { ...current, [section]: sectionText.replace(selectedText, newText) };
    } else {
      updated = { ...current, [section]: newText };
    }
    setContent(updated);
    contentRef.current = updated;
    setSelectedText(newText);
    collab.sendEdit(section, updated[section]);
    scheduleRestAutosave(updated);
  }, [canWrite, activeSection, selectedText, collab, scheduleRestAutosave]);

  // ── Insert citation into active section ───────────────────────────────────
  const handleInsertCitation = useCallback((citation: string) => {
    if (!canWrite) return;
    const current = contentRef.current;
    const separator = current[activeSection].length > 0 ? "\n\n" : "";
    const newText = current[activeSection] + separator + citation;
    const updated = { ...current, [activeSection]: newText };
    setContent(updated);
    contentRef.current = updated;
    collab.sendEdit(activeSection, newText);
    scheduleRestAutosave(updated);
  }, [activeSection, canWrite, collab, scheduleRestAutosave]);

  // ── Save Version ──────────────────────────────────────────────────────────
  const handleSaveVersion = useCallback(async () => {
    if (!canWrite || isSavingVersion) return;

    const current = contentRef.current;
    if (!hasAnyContent(current)) {
      toast({
        title: "Nothing to save",
        description: "Write some content before creating a version snapshot.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingVersion(true);
    setSaveStatus("saving");

    try {
      // Step 1: ensure latest content is persisted to DB
      const json = JSON.stringify(current);
      await api.saveManuscript(projectId, json);
      lastSavedJsonRef.current = json;

      // Step 2: create version snapshot from DB manuscript
      await api.saveVersion(projectId);

      // Step 3: invalidate history cache so it refetches
      queryClient.invalidateQueries({
        queryKey: ["/projects", projectId, "manuscript", "history"],
      });

      setSaveStatus("saved");
      toast({ title: "Version saved", description: "Snapshot created successfully." });

      // Open history panel so user sees their new version immediately
      setShowHistory(true);
      setShowCitations(false);
    } catch (e: unknown) {
      setSaveStatus("error");
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast({ title: "Save failed", description: msg, variant: "destructive" });
    } finally {
      setIsSavingVersion(false);
      setTimeout(() => setSaveStatus(s => s !== "idle" ? "idle" : s), 3000);
    }
  }, [canWrite, isSavingVersion, projectId, queryClient, toast]);

  // ── Restore version ───────────────────────────────────────────────────────
  const handleRestoreVersion = useCallback((versionContent: string) => {
    const restored = parseContent(versionContent);
    setContent(restored);
    contentRef.current = restored;
    scheduleRestAutosave(restored);
    setShowHistory(false);
    toast({ title: "Version restored", description: "Content restored. Autosaving in a few seconds…" });
  }, [scheduleRestAutosave, toast]);

  // ── Collaborator → section mapping ────────────────────────────────────────
  const sectionEditors: Record<string, string[]> = {};
  for (const c of collab.activeCollaborators) {
    if (c.section) {
      sectionEditors[c.section] = [...(sectionEditors[c.section] ?? []), c.email];
    }
  }

  // ── Current manuscript text for suggestions ───────────────────────────────
  const currentManuscriptText = Object.values(contentRef.current).join(" ");

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex-1 p-8 space-y-4">
        <div className="flex gap-2">
          {SECTIONS.map(s => <Skeleton key={s.key} className="h-8 w-24 rounded-md" />)}
        </div>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Main editor column ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Active collaborators bar */}
        {collab.activeCollaborators.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary/5 to-transparent border-b text-xs flex-shrink-0">
            <Users className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
            <span className="text-muted-foreground mr-1">Editing now:</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {collab.activeCollaborators.map(u => (
                <div
                  key={u.user_id}
                  className="flex items-center gap-1 bg-white border rounded-full px-2 py-0.5 shadow-sm"
                >
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
            <div className="ml-auto">
              {collab.isConnected
                ? <Wifi className="w-3 h-3 text-emerald-500" />
                : <WifiOff className="w-3 h-3 text-muted-foreground animate-pulse" />
              }
            </div>
          </div>
        )}

        {/* Section conflict warning */}
        {collab.sectionConflict && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-700 flex-shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              <strong>{collab.sectionConflict.editor_email.split("@")[0]}</strong> is editing{" "}
              <strong>{collab.sectionConflict.section}</strong>. Both edits save — last write wins.
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
          {SECTIONS.map(s => {
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
                    {editors.slice(0, 2).map((email, i) => (
                      <div
                        key={i}
                        title={`${email} is editing`}
                        className={`w-3.5 h-3.5 rounded-full border border-white ${avatarColor(email)} flex items-center justify-center text-white text-[7px] font-bold`}
                      >
                        {getInitials(email)}
                      </div>
                    ))}
                  </span>
                )}
                {activeSection === s.key && (
                  <span className={`absolute bottom-0 left-2 right-2 h-0.5 rounded-full ${SECTION_BAR_COLOR[s.key]}`} />
                )}
              </button>
            );
          })}

          <div className="flex-1" />

          {/* Save status indicator */}
          <div className="flex items-center gap-1 text-xs mr-2">
            {saveStatus === "saving" && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-3 h-3 animate-spin" /> Saving…
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="w-3 h-3" /> Saved
              </span>
            )}
            {saveStatus === "error" && (
              <span className="flex items-center gap-1 text-red-500">
                <AlertCircle className="w-3 h-3" /> Error saving
              </span>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => showCitations ? closeAllPanels() : openPanel("citations")}
            className={showCitations ? "bg-primary/10 text-primary" : ""}
          >
            <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Citations
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => showReview ? closeAllPanels() : openPanel("review")}
            className={showReview ? "bg-primary/10 text-primary" : ""}
          >
            <UserCheck className="w-3.5 h-3.5 mr-1.5" /> Review
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => showAI ? closeAllPanels() : openPanel("ai")}
            className={`gap-1.5 ${showAI ? "bg-primary/10 text-primary" : ""}`}
          >
            <Wand2 className="w-3.5 h-3.5" /> AI
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => showHistory ? closeAllPanels() : openPanel("history")}
            className={showHistory ? "bg-primary/10 text-primary border-primary/30" : ""}
          >
            <History className="w-3.5 h-3.5 mr-1.5" /> History
          </Button>

          {canWrite ? (
            <Button
              size="sm"
              onClick={handleSaveVersion}
              disabled={isSavingVersion}
            >
              {isSavingVersion
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving…</>
                : <><Save className="w-3.5 h-3.5 mr-1.5" /> Save Version</>
              }
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
            {/* Section heading */}
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-2 h-2 rounded-full ${SECTION_BAR_COLOR[activeSection]}`} />
              <h2 className="font-display text-xl font-semibold text-foreground capitalize">
                {activeSection}
              </h2>
              {(sectionEditors[activeSection] ?? []).map((email, i) => (
                <div key={i} className="flex items-center gap-1 ml-1 text-xs text-muted-foreground">
                  <div className={`w-4 h-4 rounded-full ${avatarColor(email)} flex items-center justify-center text-white text-[8px] font-bold`}>
                    {getInitials(email)}
                  </div>
                  <span>{email.split("@")[0]} is editing</span>
                </div>
              ))}
            </div>

            <Textarea
              value={content[activeSection]}
              onChange={e => handleContentChange(activeSection, e.target.value)}
              onMouseUp={e => {
                const sel = (e.target as HTMLTextAreaElement).value.substring(
                  (e.target as HTMLTextAreaElement).selectionStart,
                  (e.target as HTMLTextAreaElement).selectionEnd,
                );
                if (sel.trim()) setSelectedText(sel);
              }}
              onKeyUp={e => {
                const sel = (e.target as HTMLTextAreaElement).value.substring(
                  (e.target as HTMLTextAreaElement).selectionStart,
                  (e.target as HTMLTextAreaElement).selectionEnd,
                );
                if (sel.trim()) setSelectedText(sel);
              }}
              readOnly={!canWrite}
              className={`min-h-[400px] resize-none text-sm leading-relaxed border-none shadow-none focus-visible:ring-0 p-0 bg-transparent ${
                !canWrite ? "cursor-default select-text text-muted-foreground" : ""
              }`}
              placeholder={
                canWrite
                  ? `Write your ${activeSection} here…`
                  : `No ${activeSection} written yet.`
              }
            />
          </div>

          {/* Version History panel */}
          {showHistory && (
            <VersionHistoryPanel
              projectId={projectId}
              canWrite={canWrite}
              onRestore={handleRestoreVersion}
              onClose={closeAllPanels}
            />
          )}
        </div>

        {/* Auto-generated references footer */}
        <div className="border-t px-6 py-3 bg-muted/20 flex-shrink-0">
          <AutoReferences projectId={projectId} />
        </div>
      </div>

      {/* Citation manager sidebar */}
      {showCitations && (
        <CitationManager
          projectId={projectId}
          canWrite={canWrite}
          onInsert={handleInsertCitation}
          onClose={closeAllPanels}
          currentManuscriptText={currentManuscriptText}
        />
      )}

      {/* Peer Review panel */}
      {showReview && (
        <ReviewPanel
          projectId={projectId}
          manuscriptId={manuscript?.id ?? null}
          userRole={userRole}
          currentUserId={currentUserId}
          onClose={closeAllPanels}
        />
      )}

      {/* AI Writing Assistant panel */}
      {showAI && (
        <AIWritingAssistant
          projectId={projectId}
          selectedText={selectedText}
          activeSection={activeSection}
          onApply={handleApplyAISuggestion}
          onClose={closeAllPanels}
        />
      )}
    </div>
  );
}
