import { useState, useCallback } from "react";
import { api, type ApiAIWritingResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  X, Wand2, RefreshCw, Lightbulb, CheckSquare,
  Copy, Check, ChevronDown, ChevronUp, Loader2, RotateCcw, Sparkles,
} from "lucide-react";

interface Props {
  projectId: number;
  selectedText: string;
  activeSection: string;
  onApply: (text: string) => void;
  onClose: () => void;
}

type AIAction = "improve-writing" | "rewrite" | "clarity" | "grammar";

const ACTIONS: { id: AIAction; label: string; icon: React.ReactNode; description: string; color: string }[] = [
  {
    id: "improve-writing",
    label: "Improve Tone",
    icon: <Wand2 className="w-3.5 h-3.5" />,
    description: "Elevate to formal academic style",
    color: "bg-violet-50 border-violet-200 hover:bg-violet-100 text-violet-700",
  },
  {
    id: "rewrite",
    label: "Rewrite",
    icon: <RefreshCw className="w-3.5 h-3.5" />,
    description: "Full academic rewrite of selection",
    color: "bg-blue-50 border-blue-200 hover:bg-blue-100 text-blue-700",
  },
  {
    id: "clarity",
    label: "Clarity",
    icon: <Lightbulb className="w-3.5 h-3.5" />,
    description: "Remove filler, improve conciseness",
    color: "bg-amber-50 border-amber-200 hover:bg-amber-100 text-amber-700",
  },
  {
    id: "grammar",
    label: "Grammar",
    icon: <CheckSquare className="w-3.5 h-3.5" />,
    description: "Fix grammar and punctuation",
    color: "bg-emerald-50 border-emerald-200 hover:bg-emerald-100 text-emerald-700",
  },
];

// ── Word-level diff ──────────────────────────────────────────────────────────

type DiffToken = { text: string; type: "same" | "added" | "removed" };

function wordDiff(original: string, suggestion: string): { origTokens: DiffToken[]; suggTokens: DiffToken[] } {
  const origWords = original.split(/(\s+)/);
  const suggWords = suggestion.split(/(\s+)/);

  // Build LCS table
  const m = origWords.length;
  const n = suggWords.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origWords[i - 1].toLowerCase() === suggWords[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Trace back
  const origTokens: DiffToken[] = [];
  const suggTokens: DiffToken[] = [];
  let i = m, j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origWords[i - 1].toLowerCase() === suggWords[j - 1].toLowerCase()) {
      origTokens.unshift({ text: origWords[i - 1], type: "same" });
      suggTokens.unshift({ text: suggWords[j - 1], type: "same" });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      suggTokens.unshift({ text: suggWords[j - 1], type: "added" });
      j--;
    } else {
      origTokens.unshift({ text: origWords[i - 1], type: "removed" });
      i--;
    }
  }

  return { origTokens, suggTokens };
}

function DiffView({ original, suggestion }: { original: string; suggestion: string }) {
  const { origTokens, suggTokens } = wordDiff(original, suggestion);

  const renderTokens = (tokens: DiffToken[], mode: "orig" | "sugg") =>
    tokens.map((tok, idx) => {
      if (/^\s+$/.test(tok.text)) return <span key={idx}>{tok.text}</span>;
      if (tok.type === "same") return <span key={idx}>{tok.text}</span>;
      if (mode === "orig" && tok.type === "removed") {
        return (
          <span key={idx} className="bg-red-100 text-red-700 rounded px-0.5 line-through">
            {tok.text}
          </span>
        );
      }
      if (mode === "sugg" && tok.type === "added") {
        return (
          <span key={idx} className="bg-emerald-100 text-emerald-700 rounded px-0.5 font-medium">
            {tok.text}
          </span>
        );
      }
      return <span key={idx}>{tok.text}</span>;
    });

  const hasChanges = origTokens.some(t => t.type === "removed") || suggTokens.some(t => t.type === "added");

  if (!hasChanges) {
    return (
      <div className="text-xs leading-relaxed text-foreground">
        {suggestion}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="bg-red-50 border border-red-100 rounded-lg p-2.5">
        <p className="text-[10px] font-semibold text-red-600 mb-1 uppercase tracking-wide flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" /> Original
        </p>
        <p className="text-xs leading-relaxed text-foreground">{renderTokens(origTokens, "orig")}</p>
      </div>
      <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
        <p className="text-[10px] font-semibold text-emerald-700 mb-1 uppercase tracking-wide flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> Improved
        </p>
        <p className="text-xs leading-relaxed text-foreground">{renderTokens(suggTokens, "sugg")}</p>
      </div>
    </div>
  );
}

// ── Supporting components ────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : pct >= 60 ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-red-700 bg-red-50 border-red-200";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold ${color}`}>
      {pct}% confidence
    </span>
  );
}

function ImprovementBadges({ improvements }: { improvements: string[] }) {
  if (!improvements?.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {improvements.map((imp, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/8 border border-primary/20 text-[9px] font-medium text-primary leading-tight"
        >
          <Sparkles className="w-2 h-2 flex-shrink-0" />
          {imp}
        </span>
      ))}
    </div>
  );
}

function SuggestionCard({
  result,
  onApply,
  onDismiss,
}: {
  result: ApiAIWritingResponse;
  onApply: (text: string) => void;
  onDismiss: () => void;
}) {
  const [showDiff, setShowDiff] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.suggestion);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-primary/5 to-transparent border-b">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-xs text-foreground">{result.title}</span>
          <ConfidenceBadge confidence={result.confidence} />
        </div>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground flex-shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-3 py-2.5 space-y-2.5">
        {/* Improvement badges */}
        {result.improvements?.length > 0 && (
          <ImprovementBadges improvements={result.improvements} />
        )}

        {/* Diff / comparison view toggle */}
        <div>
          <button
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mb-1.5"
            onClick={() => setShowDiff(v => !v)}
          >
            {showDiff ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showDiff ? "Hide comparison" : "Show comparison"}
          </button>

          {showDiff ? (
            <DiffView original={result.original} suggestion={result.suggestion} />
          ) : (
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
              <p className="text-[10px] font-semibold text-emerald-700 mb-1 uppercase tracking-wide">Suggestion</p>
              <p className="text-xs leading-relaxed text-foreground">{result.suggestion}</p>
            </div>
          )}
        </div>

        {/* Changes count */}
        {result.changes_made > 0 && (
          <p className="text-[10px] text-muted-foreground">
            {result.changes_made} word{result.changes_made !== 1 ? "s" : ""} changed
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-1.5 pt-0.5">
          <Button
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={() => onApply(result.suggestion)}
          >
            <Check className="w-3 h-3 mr-1" /> Apply
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AIWritingAssistant({ projectId, selectedText, activeSection, onApply, onClose }: Props) {
  const { toast } = useToast();
  const [results, setResults] = useState<ApiAIWritingResponse[]>([]);
  const [loadingAction, setLoadingAction] = useState<AIAction | null>(null);

  const hasSelection = selectedText.trim().length > 0;

  const runAction = useCallback(async (action: AIAction) => {
    const textToUse = selectedText.trim();
    if (!textToUse) {
      toast({
        title: "No text selected",
        description: "Select some text in the manuscript editor first.",
        variant: "destructive",
      });
      return;
    }

    setLoadingAction(action);
    try {
      const result = await api.aiWriting(action, textToUse, projectId);
      setResults(prev => [result, ...prev.slice(0, 4)]);
    } catch (e: unknown) {
      toast({
        title: "AI assistant error",
        description: e instanceof Error ? e.message : "Request failed. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingAction(null);
    }
  }, [selectedText, projectId, toast]);

  const handleApply = useCallback((text: string) => {
    onApply(text);
    toast({ title: "Applied to manuscript", description: `Updated the ${activeSection} section.` });
  }, [onApply, activeSection, toast]);

  return (
    <div className="w-72 border-l bg-card flex flex-col flex-shrink-0 overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm text-foreground">AI Writing Assistant</h3>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Selected text preview */}
      <div className="px-4 py-3 border-b flex-shrink-0">
        {hasSelection ? (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-2.5">
            <p className="text-[10px] font-semibold text-primary mb-1 uppercase tracking-wide">
              Selected text ({selectedText.length} chars)
            </p>
            <p className="text-xs text-foreground line-clamp-3 leading-relaxed">
              {selectedText}
            </p>
          </div>
        ) : (
          <div className="bg-muted/40 border border-dashed rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">
              Select text in the editor, then click an action below
            </p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-4 py-3 border-b flex-shrink-0 space-y-1.5">
        {ACTIONS.map(action => (
          <button
            key={action.id}
            onClick={() => runAction(action.id)}
            disabled={loadingAction !== null || !hasSelection}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${action.color}`}
          >
            <span className="flex-shrink-0">
              {loadingAction === action.id
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : action.icon
              }
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-tight">{action.label}</p>
              <p className="text-[10px] opacity-70 leading-tight">{action.description}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loadingAction && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="relative">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <Wand2 className="w-4 h-4 text-primary absolute inset-0 m-auto" />
            </div>
            <p className="text-sm font-medium text-foreground">Analyzing manuscript…</p>
            <p className="text-xs text-muted-foreground">Applying academic enhancements</p>
          </div>
        )}

        {!loadingAction && results.length === 0 && (
          <div className="text-center py-8">
            <Wand2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No suggestions yet</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Select text from your manuscript,<br />then choose an improvement action.
            </p>
          </div>
        )}

        {!loadingAction && results.map((result, i) => (
          <SuggestionCard
            key={i}
            result={result}
            onApply={handleApply}
            onDismiss={() => setResults(prev => prev.filter((_, idx) => idx !== i))}
          />
        ))}
      </div>

      {results.length > 0 && (
        <div className="border-t px-4 py-2 flex-shrink-0">
          <button
            onClick={() => setResults([])}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Clear all suggestions
          </button>
        </div>
      )}
    </div>
  );
}
