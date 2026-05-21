import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ApiReview, type ApiCollaborator } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  X, UserCheck, CheckCircle2, XCircle, RotateCcw,
  Clock, AlertCircle, ChevronDown, ChevronUp, Send,
} from "lucide-react";

interface Props {
  projectId: number;
  manuscriptId: number | null;
  userRole: string;
  currentUserId: number;
  onClose: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-200", icon: <Clock className="w-3 h-3" /> },
  in_review: { label: "In Review", color: "bg-blue-100 text-blue-700 border-blue-200", icon: <RotateCcw className="w-3 h-3 animate-spin" /> },
  approved: { label: "Approved", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700 border-red-200", icon: <XCircle className="w-3 h-3" /> },
  revision_requested: { label: "Revision", color: "bg-violet-100 text-violet-700 border-violet-200", icon: <AlertCircle className="w-3 h-3" /> },
};

const DECISION_BUTTONS = [
  { decision: "approve", label: "Approve", className: "bg-emerald-600 hover:bg-emerald-700 text-white" },
  { decision: "reject", label: "Reject", className: "bg-red-600 hover:bg-red-700 text-white" },
  { decision: "minor_revision", label: "Minor Revision", className: "bg-amber-500 hover:bg-amber-600 text-white" },
  { decision: "major_revision", label: "Major Revision", className: "bg-violet-600 hover:bg-violet-700 text-white" },
];

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function ReviewCard({
  review,
  currentUserId,
  projectId,
  manuscriptId,
  onUpdate,
}: {
  review: ApiReview;
  currentUserId: number;
  projectId: number;
  manuscriptId: number;
  onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [draftComment, setDraftComment] = useState(review.comments ?? "");
  const [submittingDecision, setSubmittingDecision] = useState<string | null>(null);
  const { toast } = useToast();
  const isMyReview = review.reviewer_id === currentUserId;
  const canAct = isMyReview && !["approved", "rejected"].includes(review.status);

  const handleComment = async () => {
    if (!draftComment.trim()) return;
    try {
      await api.addReviewComment(review.id, draftComment);
      toast({ title: "Comment saved" });
      onUpdate();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    }
  };

  const handleDecision = async (decision: string) => {
    setSubmittingDecision(decision);
    try {
      await api.submitReviewDecision(review.id, decision, draftComment || undefined);
      toast({ title: "Decision submitted", description: `Review marked as ${decision.replace("_", " ")}` });
      onUpdate();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    } finally {
      setSubmittingDecision(null);
    }
  };

  return (
    <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
            {(review.reviewer_email ?? "?").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{review.reviewer_email?.split("@")[0] ?? "Unknown"}</p>
            <p className="text-[10px] text-muted-foreground">
              Assigned by {review.assigned_by_email?.split("@")[0] ?? "owner"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={review.status} />
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-3 bg-muted/10">
          {review.decision && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Decision:</span>
              <span className="font-semibold capitalize">{review.decision.replace("_", " ")}</span>
            </div>
          )}

          {review.comments && (
            <div className="bg-white rounded-lg border p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Review Notes</p>
              <p className="text-sm leading-relaxed">{review.comments}</p>
            </div>
          )}

          {canAct && (
            <div className="space-y-2">
              <Textarea
                value={draftComment}
                onChange={e => setDraftComment(e.target.value)}
                placeholder="Add your review notes…"
                className="text-sm min-h-[80px] resize-none"
              />
              <Button
                size="sm"
                variant="outline"
                className="w-full h-8 text-xs"
                onClick={handleComment}
                disabled={!draftComment.trim()}
              >
                <Send className="w-3 h-3 mr-1.5" /> Save Notes
              </Button>
              <div className="grid grid-cols-2 gap-1.5">
                {DECISION_BUTTONS.map(btn => (
                  <button
                    key={btn.decision}
                    onClick={() => handleDecision(btn.decision)}
                    disabled={submittingDecision !== null}
                    className={`text-xs py-1.5 px-2 rounded-lg font-semibold transition-opacity disabled:opacity-50 ${btn.className}`}
                  >
                    {submittingDecision === btn.decision ? "…" : btn.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground">
            Assigned {new Date(review.created_at).toLocaleDateString()}
            {review.updated_at && ` · Updated ${new Date(review.updated_at).toLocaleDateString()}`}
          </p>
        </div>
      )}
    </div>
  );
}

export default function ReviewPanel({ projectId, manuscriptId, userRole, currentUserId, onClose }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showAssign, setShowAssign] = useState(false);
  const [selectedReviewerId, setSelectedReviewerId] = useState<number | "">("");

  const isOwner = userRole === "owner";

  const { data: reviews, isLoading: reviewsLoading } = useQuery<ApiReview[]>({
    queryKey: ["/reviews/project", projectId],
    queryFn: () => api.getProjectReviews(projectId),
    enabled: !!projectId,
    refetchInterval: 15000,
  });

  const { data: collaborators } = useQuery<ApiCollaborator[]>({
    queryKey: ["/projects", projectId, "collaborators"],
    queryFn: () => api.getCollaborators(projectId),
    enabled: isOwner,
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ["/reviews/project", projectId] });
  };

  const assignMutation = useMutation({
    mutationFn: () => {
      if (!selectedReviewerId || !manuscriptId) throw new Error("Select a reviewer first");
      return api.assignReviewer({ manuscript_id: manuscriptId, reviewer_id: Number(selectedReviewerId), project_id: projectId });
    },
    onSuccess: () => {
      toast({ title: "Reviewer assigned successfully" });
      setShowAssign(false);
      setSelectedReviewerId("");
      refetch();
    },
    onError: (e: Error) => {
      toast({ title: "Failed to assign", description: e.message, variant: "destructive" });
    },
  });

  const assignedReviewerIds = new Set((reviews ?? []).map(r => r.reviewer_id));
  const eligibleCollaborators = (collaborators ?? []).filter(
    c => c.user_id && !assignedReviewerIds.has(c.user_id)
  );

  return (
    <div className="w-72 border-l bg-card flex flex-col flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm text-foreground">Peer Review</h3>
          {reviews && reviews.length > 0 && (
            <span className="bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {reviews.length}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {isOwner && manuscriptId && (
        <div className="px-4 py-3 border-b flex-shrink-0">
          {!showAssign ? (
            <Button
              size="sm"
              className="w-full h-8 text-xs"
              onClick={() => setShowAssign(true)}
            >
              <UserCheck className="w-3.5 h-3.5 mr-1.5" /> Assign Reviewer
            </Button>
          ) : (
            <div className="space-y-2">
              <select
                value={selectedReviewerId}
                onChange={e => setSelectedReviewerId(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full text-sm border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Select collaborator…</option>
                {eligibleCollaborators.map(c => (
                  <option key={c.user_id} value={c.user_id!}>
                    {c.email.split("@")[0]} ({c.role})
                  </option>
                ))}
              </select>
              {eligibleCollaborators.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  No eligible collaborators. Invite editors first.
                </p>
              )}
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={() => assignMutation.mutate()}
                  disabled={!selectedReviewerId || assignMutation.isPending}
                >
                  {assignMutation.isPending ? "Assigning…" : "Assign"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => { setShowAssign(false); setSelectedReviewerId(""); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {reviewsLoading ? (
          <div className="space-y-2">
            {[0, 1].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : !reviews || reviews.length === 0 ? (
          <div className="text-center py-10">
            <UserCheck className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground font-medium">No reviews yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              {isOwner ? "Assign a reviewer using the button above." : "Wait for the owner to assign a reviewer."}
            </p>
          </div>
        ) : (
          reviews.map(review => (
            <ReviewCard
              key={review.id}
              review={review}
              currentUserId={currentUserId}
              projectId={projectId}
              manuscriptId={manuscriptId!}
              onUpdate={refetch}
            />
          ))
        )}
      </div>

      {reviews && reviews.length > 0 && (
        <div className="border-t px-4 py-3 flex-shrink-0 bg-muted/20">
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              {reviews.filter(r => r.status === "approved").length} approved
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-amber-500" />
              {reviews.filter(r => ["pending", "in_review"].includes(r.status)).length} pending
            </span>
            <span className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-violet-500" />
              {reviews.filter(r => r.status === "revision_requested").length} revisions
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
