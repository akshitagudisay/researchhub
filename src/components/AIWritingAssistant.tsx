import { useState, useCallback } from "react";
import { api, type ApiAIWritingResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  X, Wand2, RefreshCw, Lightbulb, CheckSquare,
  Copy, Check, ChevronDown, ChevronUp, Loader2, RotateCcw,
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

function SuggestionCard({
  result,
  onApply,
  onDismiss,
}: {
  result: ApiAIWritingResponse;
  onApply: (text: string) => void;
  onDismiss: () => void;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
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
      <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-primary/5 to-transparent border-b">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs text-foreground">{result.title}</span>
          <ConfidenceBadge confidence={result.confidence} />
        </div>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-3 py-2.5 space-y-2">
        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
          <p className="text-[10px] font-semibold text-emerald-700 mb-1 uppercase tracking-wide">Suggestion</p>
          <p className="text-xs leading-relaxed text-foreground">{result.suggestion}</p>
        </div>

        <div>
          <button
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowOriginal(v => !v)}
          >
            {showOriginal ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Original text
          </button>
          {showOriginal && (
            <div className="mt-1 bg-muted/40 border rounded-lg p-2 text-xs text-muted-foreground leading-relaxed">
              {result.original}
            </div>
          )}
        </div>

        {result.changes_made > 0 && (
          <p className="text-[10px] text-muted-foreground">
            {result.changes_made} phrase{result.changes_made !== 1 ? "s" : ""} improved
          </p>
        )}

        <div className="flex gap-1.5 pt-1">
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
          >
            {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

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
