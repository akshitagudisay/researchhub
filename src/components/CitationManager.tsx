import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ApiCitation, type ApiSuggestion } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  X, Search, Upload, BookOpen, Trash2, Copy, ChevronDown,
  ChevronUp, Sparkles, Plus, Loader2, RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  projectId: number;
  canWrite: boolean;
  onInsert: (citation: string) => void;
  onClose: () => void;
  currentManuscriptText?: string;
}

// ── Citation Card ─────────────────────────────────────────────────────────────

function CitationCard({
  citation,
  canWrite,
  onInsert,
  onDelete,
}: {
  citation: ApiCitation;
  canWrite: boolean;
  onInsert: (s: string) => void;
  onDelete: () => void;
}) {
  const [format, setFormat] = useState<"apa" | "ieee">("apa");
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();

  const text = format === "apa" ? citation.formatted_apa : citation.formatted_ieee;
  const authorStr =
    citation.authors.slice(0, 3).join(", ") +
    (citation.authors.length > 3 ? " et al." : "");

  const copy = () => {
    if (text) {
      navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Citation copied to clipboard." });
    }
  };

  return (
    <div className="rounded-xl border bg-card p-3 space-y-2 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground leading-snug line-clamp-2">{citation.title}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{authorStr}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {citation.year && (
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium">{citation.year}</span>
            )}
            {citation.journal && (
              <span className="text-[10px] text-muted-foreground italic truncate">{citation.journal}</span>
            )}
          </div>
        </div>
        {canWrite && (
          <button
            onClick={onDelete}
            className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors p-0.5"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Preview citation
      </button>

      {expanded && (
        <div className="space-y-1.5">
          <div className="flex gap-1">
            {(["apa", "ieee"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors uppercase ${
                  format === f
                    ? "bg-primary text-primary-foreground border-primary"
                    : "text-muted-foreground border-transparent hover:border-border"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg p-2 leading-relaxed">{text}</p>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={copy}>
              <Copy className="w-3 h-3 mr-1" /> Copy
            </Button>
            {canWrite && (
              <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => text && onInsert(text)}>
                <Plus className="w-3 h-3 mr-1" /> Insert
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Suggestion Card ───────────────────────────────────────────────────────────

function confidenceColor(c?: number) {
  if (!c) return "bg-muted text-muted-foreground";
  if (c >= 0.80) return "bg-emerald-100 text-emerald-700";
  if (c >= 0.60) return "bg-amber-100 text-amber-700";
  return "bg-muted text-muted-foreground";
}

function SuggestionCard({
  s,
  onAdd,
  canWrite,
  isAdding,
}: {
  s: ApiSuggestion;
  onAdd: (doi: string) => void;
  canWrite: boolean;
  isAdding: boolean;
}) {
  const authorStr = s.authors.slice(0, 2).join(", ") + (s.authors.length > 2 ? " et al." : "");
  return (
    <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold text-foreground leading-snug flex-1">{s.title}</p>
        {s.confidence !== undefined && (
          <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${confidenceColor(s.confidence)}`}>
            {Math.round(s.confidence * 100)}%
          </span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        {authorStr} · {s.journal} · {s.year}
      </p>
      {s.domain && (
        <span className="inline-block text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
          {s.domain}
        </span>
      )}
      {s.reason && (
        <p className="text-[10px] text-muted-foreground italic leading-snug">{s.reason}</p>
      )}
      {canWrite && (
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] px-2 border-primary/30 text-primary hover:bg-primary/10"
          onClick={() => onAdd(s.doi)}
          disabled={isAdding}
        >
          {isAdding ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <><Plus className="w-3 h-3 mr-1" /> Add</>
          )}
        </Button>
      )}
    </div>
  );
}

// ── Main CitationManager ──────────────────────────────────────────────────────

export default function CitationManager({
  projectId,
  canWrite,
  onInsert,
  onClose,
  currentManuscriptText = "",
}: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [doiInput, setDoiInput] = useState("");
  const [bibtexInput, setBibtexInput] = useState("");
  const [showBibtex, setShowBibtex] = useState(false);
  const [tab, setTab] = useState<"library" | "suggestions">("library");
  const [addingDoi, setAddingDoi] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Citations library ────────────────────────────────────────────────────
  const { data: citations, isLoading } = useQuery({
    queryKey: ["/projects", projectId, "citations"],
    queryFn: () => api.getCitations(projectId),
    enabled: !!projectId,
  });

  // ── Suggestions: POST with current manuscript text when available ─────────
  const manuscriptHasContent = currentManuscriptText.trim().length > 20;

  const {
    data: suggestionsData,
    isLoading: suggestionsLoading,
    refetch: refetchSuggestions,
    isFetching: suggestionsFetching,
  } = useQuery({
    queryKey: ["/projects", projectId, "citations", "suggestions"],
    queryFn: () =>
      manuscriptHasContent
        ? api.getCitationSuggestionsByText(projectId, currentManuscriptText)
        : api.getCitationSuggestions(projectId),
    enabled: tab === "suggestions",
    staleTime: 0,
  });

  // Refetch suggestions whenever switching to the tab or manuscript changes significantly
  useEffect(() => {
    if (tab === "suggestions") {
      refetchSuggestions();
    }
  }, [tab]);

  // ── Mutations ────────────────────────────────────────────────────────────
  const doiMutation = useMutation({
    mutationFn: (doi: string) => api.addCitationByDoi(projectId, doi),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/projects", projectId, "citations"] });
      queryClient.invalidateQueries({ queryKey: ["/projects", projectId, "citations", "suggestions"] });
      setDoiInput("");
      setAddingDoi(null);
      toast({ title: "Citation added", description: "DOI lookup successful." });
    },
    onError: (e: Error) => {
      setAddingDoi(null);
      toast({ title: "DOI lookup failed", description: e.message, variant: "destructive" });
    },
  });

  const bibtexMutation = useMutation({
    mutationFn: (bibtex: string) => api.importBibtex(projectId, bibtex),
    onSuccess: (imported) => {
      queryClient.invalidateQueries({ queryKey: ["/projects", projectId, "citations"] });
      queryClient.invalidateQueries({ queryKey: ["/projects", projectId, "citations", "suggestions"] });
      setBibtexInput("");
      setShowBibtex(false);
      toast({ title: `Imported ${imported.length} citation${imported.length !== 1 ? "s" : ""}` });
    },
    onError: (e: Error) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteCitation(projectId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/projects", projectId, "citations"] });
      queryClient.invalidateQueries({ queryKey: ["/projects", projectId, "citations", "suggestions"] });
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => bibtexMutation.mutate(ev.target?.result as string);
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleDoiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const doi = doiInput.trim();
    if (!doi) return;
    doiMutation.mutate(doi);
  };

  const handleSuggestionAdd = (doi: string) => {
    setAddingDoi(doi);
    doiMutation.mutate(doi);
  };

  const suggestions = suggestionsData?.suggestions ?? [];

  return (
    <div className="w-80 flex-shrink-0 border-l bg-card flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">Citations</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* DOI + BibTeX inputs */}
      {canWrite && (
        <div className="px-3 py-3 border-b flex-shrink-0 space-y-2">
          <form onSubmit={handleDoiSubmit} className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <input
                value={doiInput}
                onChange={e => setDoiInput(e.target.value)}
                placeholder="Paste DOI (10.xxxx/…)"
                className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <Button
              type="submit"
              size="sm"
              className="h-8 px-3"
              disabled={doiMutation.isPending || !doiInput.trim()}
            >
              {doiMutation.isPending && !addingDoi
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : "Add"}
            </Button>
          </form>

          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-7 text-[11px]"
              onClick={() => setShowBibtex(!showBibtex)}
            >
              <Upload className="w-3 h-3 mr-1" /> BibTeX
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-7 text-[11px]"
              onClick={() => fileRef.current?.click()}
              disabled={bibtexMutation.isPending}
            >
              {bibtexMutation.isPending
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <><Upload className="w-3 h-3 mr-1" /> .bib file</>
              }
            </Button>
            <input ref={fileRef} type="file" accept=".bib,.txt" className="hidden" onChange={handleFileUpload} />
          </div>

          {showBibtex && (
            <div className="space-y-1.5">
              <textarea
                value={bibtexInput}
                onChange={e => setBibtexInput(e.target.value)}
                placeholder={"@article{key,\n  title={...},\n  author={...},\n  year={2024}\n}"}
                className="w-full h-24 text-[11px] font-mono rounded-lg border bg-muted/30 p-2 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
              <Button
                size="sm"
                className="w-full h-7 text-xs"
                onClick={() => bibtexMutation.mutate(bibtexInput)}
                disabled={bibtexMutation.isPending || !bibtexInput.trim()}
              >
                {bibtexMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                Import BibTeX
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b flex-shrink-0">
        {(["library", "suggestions"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
              tab === t ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "suggestions" && <Sparkles className="w-3 h-3 inline mr-1 text-amber-500" />}
            {t}
            {t === "library" && citations && citations.length > 0 && (
              <span className="ml-1 text-[10px] bg-muted px-1.5 rounded-full">{citations.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {tab === "library" && (
          <>
            {isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
              </div>
            ) : !citations || citations.length === 0 ? (
              <div className="text-center py-8">
                <BookOpen className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No citations yet.</p>
                {canWrite && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Paste a DOI above to add one.
                  </p>
                )}
              </div>
            ) : (
              citations.map(c => (
                <CitationCard
                  key={c.id}
                  citation={c}
                  canWrite={canWrite}
                  onInsert={onInsert}
                  onDelete={() => deleteMutation.mutate(c.id)}
                />
              ))
            )}
          </>
        )}

        {tab === "suggestions" && (
          <>
            <div className="flex items-center justify-between px-1 mb-1">
              <p className="text-[10px] text-muted-foreground">
                {manuscriptHasContent
                  ? "Based on your current manuscript:"
                  : "Popular papers — write more to get personalized suggestions"}
              </p>
              <button
                onClick={() => refetchSuggestions()}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Refresh suggestions"
              >
                <RefreshCw className={`w-3 h-3 ${suggestionsFetching ? "animate-spin" : ""}`} />
              </button>
            </div>

            {suggestionsLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
              </div>
            ) : suggestions.length === 0 ? (
              <div className="text-center py-8">
                <Sparkles className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No suggestions available.</p>
                <p className="text-[11px] text-muted-foreground mt-1">All papers already added.</p>
              </div>
            ) : (
              suggestions.map((s, i) => (
                <SuggestionCard
                  key={i}
                  s={s}
                  canWrite={canWrite}
                  onAdd={handleSuggestionAdd}
                  isAdding={addingDoi === s.doi && doiMutation.isPending}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
