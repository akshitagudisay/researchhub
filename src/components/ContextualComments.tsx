import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ApiComment } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  MessageCircle, X, CheckCircle2, RotateCcw,
  Reply, Trash2, AlertCircle, ChevronDown, ChevronRight,
} from "lucide-react";

interface Props {
  projectId: number;
  targetType: "dataset" | "experiment" | "section";
  targetId: string;
  targetLabel: string;
  canWrite: boolean;
  onClose: () => void;
  inline?: boolean;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getInitials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-teal-500",
  "bg-amber-500", "bg-rose-500", "bg-indigo-500",
];
function avatarColor(email: string) {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function CommentThread({
  comment,
  projectId,
  canWrite,
  depth = 0,
}: {
  comment: ApiComment;
  projectId: number;
  canWrite: boolean;
  depth?: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/comments", projectId, comment.target_type, comment.target_id] });

  const replyMutation = useMutation({
    mutationFn: () =>
      api.createComment(projectId, {
        target_type: comment.target_type,
        target_id: comment.target_id,
        content: replyText.trim(),
        parent_id: comment.id,
      }),
    onSuccess: () => { setReplyText(""); setReplyOpen(false); invalidate(); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resolveMutation = useMutation({
    mutationFn: () => api.resolveComment(comment.id, !comment.resolved),
    onSuccess: invalidate,
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteComment(comment.id),
    onSuccess: invalidate,
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className={`${depth > 0 ? "ml-6 border-l-2 border-muted pl-3" : ""}`}>
      <div className={`rounded-lg p-3 transition-colors ${comment.resolved ? "bg-muted/30 opacity-70" : "bg-card border"}`}>
        <div className="flex items-start gap-2">
          <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[9px] font-bold ${avatarColor(comment.author_email)}`}>
            {getInitials(comment.author_email)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-foreground truncate">
                {comment.author_email.split("@")[0]}
              </span>
              <span className="text-[10px] text-muted-foreground">{formatTime(comment.created_at)}</span>
              {comment.resolved && (
                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">
                  Resolved
                </span>
              )}
            </div>
            <p className="text-xs text-foreground mt-1 leading-relaxed whitespace-pre-wrap break-words">
              {comment.content}
            </p>
          </div>
        </div>

        {canWrite && depth === 0 && (
          <div className="flex items-center gap-1 mt-2 ml-8">
            <button
              onClick={() => setReplyOpen(r => !r)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
            >
              <Reply className="w-3 h-3" /> Reply
            </button>
            <button
              onClick={() => resolveMutation.mutate()}
              disabled={resolveMutation.isPending}
              className={`flex items-center gap-1 text-[10px] transition-colors ${comment.resolved ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground hover:text-emerald-600"}`}
            >
              {comment.resolved
                ? <><RotateCcw className="w-3 h-3" /> Reopen</>
                : <><CheckCircle2 className="w-3 h-3" /> Resolve</>}
            </button>
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-red-500 transition-colors ml-auto"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {replyOpen && (
        <div className="ml-6 mt-1.5 space-y-1.5">
          <textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            placeholder="Write a reply…"
            rows={2}
            className="w-full text-xs border rounded-lg px-2.5 py-1.5 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-6 text-[10px] px-2"
              disabled={!replyText.trim() || replyMutation.isPending}
              onClick={() => replyMutation.mutate()}
            >
              {replyMutation.isPending ? "Posting…" : "Post Reply"}
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setReplyOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {comment.replies.length > 0 && (
        <div className="mt-1.5">
          <button
            onClick={() => setCollapsed(c => !c)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground ml-6 mb-1"
          >
            {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {comment.replies.length} {comment.replies.length === 1 ? "reply" : "replies"}
          </button>
          {!collapsed && (
            <div className="space-y-1.5 mt-1">
              {comment.replies.map(reply => (
                <CommentThread
                  key={reply.id}
                  comment={reply}
                  projectId={projectId}
                  canWrite={canWrite}
                  depth={depth + 1}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ContextualComments({
  projectId,
  targetType,
  targetId,
  targetLabel,
  canWrite,
  onClose,
  inline = false,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [showResolved, setShowResolved] = useState(false);

  const queryKey = ["/comments", projectId, targetType, targetId];

  const { data: comments, isLoading, isError } = useQuery<ApiComment[]>({
    queryKey,
    queryFn: () => api.getComments(projectId, targetType, targetId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createComment(projectId, { target_type: targetType, target_id: targetId, content: newComment.trim() }),
    onSuccess: () => {
      setNewComment("");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const visible = comments
    ? (showResolved ? comments : comments.filter(c => !c.resolved))
    : [];
  const resolvedCount = comments ? comments.filter(c => c.resolved).length : 0;
  const openCount = comments ? comments.filter(c => !c.resolved).length : 0;

  if (inline) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">Comments</span>
            <span className="text-[10px] text-muted-foreground">
              {openCount} open{resolvedCount > 0 ? ` · ${resolvedCount} resolved` : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {resolvedCount > 0 && (
              <button onClick={() => setShowResolved(r => !r)} className="text-[10px] text-primary hover:underline">
                {showResolved ? "Hide resolved" : "Show resolved"}
              </button>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="space-y-2 max-h-56 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2">{[0, 1].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : isError ? (
            <p className="text-xs text-muted-foreground text-center py-3">Failed to load comments</p>
          ) : visible.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">No comments yet</p>
          ) : (
            visible.map(c => (
              <CommentThread key={c.id} comment={c} projectId={projectId} canWrite={canWrite} />
            ))
          )}
        </div>

        {canWrite && (
          <div className="flex gap-2">
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder={`Add a comment…`}
              rows={2}
              className="flex-1 text-xs border rounded-lg px-2.5 py-1.5 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              onKeyDown={e => {
                if (e.key === "Enter" && e.metaKey && newComment.trim()) {
                  e.preventDefault();
                  createMutation.mutate();
                }
              }}
            />
            <Button
              size="sm"
              className="h-auto px-3 text-xs self-end"
              disabled={!newComment.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "…" : "Post"}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-72 border-l bg-card flex flex-col flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-primary" />
          <div>
            <p className="text-sm font-semibold text-foreground">Comments</p>
            <p className="text-[10px] text-muted-foreground truncate max-w-[150px]">{targetLabel}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/20 flex-shrink-0">
        <span className="text-[10px] text-muted-foreground">
          {openCount} open
          {resolvedCount > 0 && ` · ${resolvedCount} resolved`}
        </span>
        {resolvedCount > 0 && (
          <button
            onClick={() => setShowResolved(r => !r)}
            className="ml-auto text-[10px] text-primary hover:underline"
          >
            {showResolved ? "Hide resolved" : "Show resolved"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : isError ? (
          <div className="text-center py-6">
            <AlertCircle className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Failed to load comments</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-8">
            <MessageCircle className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground font-medium">No comments yet</p>
            {canWrite && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Add a contextual note below
              </p>
            )}
          </div>
        ) : (
          visible.map(c => (
            <CommentThread
              key={c.id}
              comment={c}
              projectId={projectId}
              canWrite={canWrite}
            />
          ))
        )}
      </div>

      {canWrite && (
        <div className="border-t p-3 space-y-2 flex-shrink-0">
          <textarea
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder={`Comment on ${targetLabel}…`}
            rows={3}
            className="w-full text-xs border rounded-lg px-2.5 py-1.5 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            onKeyDown={e => {
              if (e.key === "Enter" && e.metaKey && newComment.trim()) {
                e.preventDefault();
                createMutation.mutate();
              }
            }}
          />
          <Button
            size="sm"
            className="w-full h-7 text-xs"
            disabled={!newComment.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? "Posting…" : "Post Comment"}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">⌘+Enter to post</p>
        </div>
      )}
    </div>
  );
}
