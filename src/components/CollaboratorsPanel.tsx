import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type ApiInvite,
  type ApiCollaborator,
  type ApiAccessRequest,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  UserPlus,
  Mail,
  CheckCircle,
  Clock,
  AlertTriangle,
  Send,
  Users,
  Trash2,
  ArrowUpCircle,
  XCircle,
} from "lucide-react";

interface Props {
  projectId: number;
  userRole: string;
}

const ROLE_COLOR: Record<string, string> = {
  owner: "bg-primary/10 text-primary",
  editor: "bg-blue-50 text-blue-700",
  viewer: "bg-muted text-muted-foreground",
};

const STATUS_CONFIG = {
  pending: { color: "bg-yellow-50 text-yellow-700", label: "Pending review", icon: Clock },
  approved: { color: "bg-green-50 text-green-700", label: "Approved", icon: CheckCircle },
  rejected: { color: "bg-red-50 text-red-600", label: "Rejected", icon: XCircle },
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${ROLE_COLOR[role] ?? ROLE_COLOR.viewer}`}>
      {role}
    </span>
  );
}

export default function CollaboratorsPanel({ projectId, userRole }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOwner = userRole === "owner";

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [testResult, setTestResult] = useState<string | null>(null);

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: allInvites, isLoading: invitesLoading } = useQuery<ApiInvite[]>({
    queryKey: ["/invite"],
    queryFn: () => api.getInvites(),
    enabled: isOwner,
  });
  const pendingInvites = allInvites?.filter(
    (inv) => inv.project_id === projectId && inv.status === "pending"
  ) ?? [];

  const { data: collaborators, isLoading: collabLoading } = useQuery<ApiCollaborator[]>({
    queryKey: ["/collaborators", projectId],
    queryFn: () => api.getCollaborators(projectId),
  });

  const { data: pendingRequests, isLoading: requestsLoading } = useQuery<ApiAccessRequest[]>({
    queryKey: ["/access-requests", projectId],
    queryFn: () => api.getAccessRequests(projectId),
    enabled: isOwner,
  });

  const { data: myRequests } = useQuery<ApiAccessRequest[]>({
    queryKey: ["/my-requests", projectId],
    queryFn: () => api.getMyAccessRequests(projectId),
    enabled: !isOwner,
  });

  // Latest personal request (any status)
  const latestMyRequest = myRequests?.[0] ?? null;
  const hasPendingRequest = latestMyRequest?.status === "pending";

  // ── Invite mutations ─────────────────────────────────────────────────────────

  const inviteMutation = useMutation({
    mutationFn: (vars: { email: string; role: string; isTest?: boolean }) =>
      api.sendInvite({ email: vars.email, project_id: projectId, role: vars.role }),
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/invite"] });
      if (vars.isTest) {
        setTestResult(
          data.email_warning ? `Warning: ${data.email_warning}` : `Test email sent to ${data.email}`
        );
        return;
      }
      if (data.email_warning) {
        toast({ title: "Invite saved — email not delivered", description: data.email_warning, variant: "destructive" });
      } else {
        toast({ title: "Invite sent!", description: `${data.email} was invited as ${data.role}.` });
      }
      setEmail("");
    },
    onError: (err: Error) => {
      toast({ title: "Invite failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Role update mutation ─────────────────────────────────────────────────────

  const roleUpdateMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      api.updateCollaboratorRole(projectId, userId, role),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["/collaborators", projectId] });
      toast({ title: "Role updated", description: `Role changed to ${updated.role}.` });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Remove collaborator mutation ──────────────────────────────────────────────

  const removeMutation = useMutation({
    mutationFn: (userId: number) => api.removeCollaborator(projectId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/collaborators", projectId] });
      toast({ title: "Collaborator removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Remove failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Access request mutation ───────────────────────────────────────────────────

  const requestRoleMutation = useMutation({
    mutationFn: (role: string) => api.requestRole(projectId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/my-requests", projectId] });
      toast({ title: "Request submitted", description: "The project owner will be notified." });
    },
    onError: (err: Error) => {
      toast({ title: "Request failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Review request mutation ───────────────────────────────────────────────────

  const reviewMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "approved" | "rejected" }) =>
      api.reviewAccessRequest(id, status),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["/access-requests", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/collaborators", projectId] });
      toast({
        title: updated.status === "approved" ? "Request approved" : "Request rejected",
        description: updated.status === "approved"
          ? `Role upgraded to ${updated.requested_role}.`
          : "The collaborator has been notified.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Review failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleInvite = () => {
    if (!email.includes("@")) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    setTestResult(null);
    inviteMutation.mutate({ email, role: inviteRole });
  };

  const handleTestEmail = () => {
    if (!email.includes("@")) {
      toast({ title: "Enter an email first", description: "Fill in the email field above.", variant: "destructive" });
      return;
    }
    setTestResult(null);
    inviteMutation.mutate({ email, role: inviteRole, isTest: true });
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-2xl space-y-6">

      {/* ── Owner: Invite form ────────────────────────────────────────────────── */}
      {isOwner && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <UserPlus className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">Invite a Collaborator</h3>
          </div>

          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="collab-email" className="text-xs text-muted-foreground">Email</Label>
              <Input
                id="collab-email"
                data-testid="input-invite-email"
                placeholder="colleague@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              />
            </div>
            <div className="w-36 space-y-1.5">
              <Label htmlFor="collab-role" className="text-xs text-muted-foreground">Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger id="collab-role" data-testid="select-invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              data-testid="button-send-invite"
              onClick={handleInvite}
              disabled={inviteMutation.isPending}
              className="flex-1"
            >
              {inviteMutation.isPending && !inviteMutation.variables?.isTest ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Sending…
                </span>
              ) : (
                <span className="flex items-center gap-2"><Send className="w-3.5 h-3.5" /> Send Invite</span>
              )}
            </Button>
            <Button
              data-testid="button-test-email"
              variant="outline"
              onClick={handleTestEmail}
              disabled={inviteMutation.isPending}
              title="Send a test invite to verify SMTP is working"
            >
              {inviteMutation.isPending && inviteMutation.variables?.isTest ? (
                <span className="w-3.5 h-3.5 border-2 border-muted-foreground/40 border-t-muted-foreground rounded-full animate-spin" />
              ) : (
                <Mail className="w-3.5 h-3.5" />
              )}
              <span className="ml-1.5 text-xs">Test Email</span>
            </Button>
          </div>

          {testResult && (
            <div
              data-testid="text-test-result"
              className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                testResult.startsWith("Warning") || testResult.startsWith("Error")
                  ? "bg-destructive/10 text-destructive"
                  : "bg-green-50 text-green-700"
              }`}
            >
              {testResult.startsWith("Warning") || testResult.startsWith("Error") ? (
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              ) : (
                <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              )}
              {testResult}
            </div>
          )}
        </div>
      )}

      {/* ── Owner: Pending access requests ───────────────────────────────────── */}
      {isOwner && (requestsLoading || (pendingRequests && pendingRequests.length > 0)) && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50/40 p-5 space-y-3">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <ArrowUpCircle className="w-4 h-4 text-yellow-600" />
            Access Requests
            {pendingRequests && pendingRequests.length > 0 && (
              <span className="ml-auto bg-yellow-100 text-yellow-800 text-xs font-medium px-2 py-0.5 rounded-full">
                {pendingRequests.length} pending
              </span>
            )}
          </h3>
          {requestsLoading ? (
            <Skeleton className="h-16 w-full rounded-lg" />
          ) : (
            <div className="divide-y divide-yellow-100">
              {pendingRequests?.map((req) => {
                const requesterCollab = collaborators?.find(c => c.user_id === req.requester_id);
                const displayEmail = requesterCollab?.email ?? `User #${req.requester_id}`;
                return (
                  <div key={req.id} className="flex items-center gap-3 py-3" data-testid={`row-request-${req.id}`}>
                    <div className="w-8 h-8 rounded-full bg-yellow-100 text-yellow-800 text-xs font-semibold flex items-center justify-center shrink-0">
                      {displayEmail.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{displayEmail}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <ArrowUpCircle className="w-3 h-3 text-yellow-600" />
                        Requesting <span className="font-medium text-yellow-700 ml-0.5">{req.requested_role}</span> access
                        <span className="ml-1">· {new Date(req.created_at).toLocaleDateString()}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs text-green-700 border-green-200 hover:bg-green-50"
                        onClick={() => reviewMutation.mutate({ id: req.id, status: "approved" })}
                        disabled={reviewMutation.isPending}
                        data-testid={`button-approve-request-${req.id}`}
                      >
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => reviewMutation.mutate({ id: req.id, status: "rejected" })}
                        disabled={reviewMutation.isPending}
                        data-testid={`button-reject-request-${req.id}`}
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Collaborator: Request role upgrade ───────────────────────────────── */}
      {!isOwner && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <ArrowUpCircle className="w-4 h-4 text-muted-foreground" />
            Request Access Upgrade
          </h3>

          {latestMyRequest ? (
            <div className="space-y-2">
              {/* Show status of latest request */}
              {(() => {
                const cfg = STATUS_CONFIG[latestMyRequest.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
                const Icon = cfg.icon;
                return (
                  <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${cfg.color}`}>
                    <Icon className="w-4 h-4 shrink-0" />
                    <div>
                      <span className="font-medium">{cfg.label}</span>
                      <span className="text-xs ml-1.5 opacity-75">
                        — requested <span className="font-medium">{latestMyRequest.requested_role}</span> access
                        on {new Date(latestMyRequest.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })()}
              {/* Allow re-request only if rejected */}
              {latestMyRequest.status === "rejected" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => requestRoleMutation.mutate("editor")}
                  disabled={requestRoleMutation.isPending}
                  className="w-full"
                  data-testid="button-rerequest-editor"
                >
                  <ArrowUpCircle className="w-3.5 h-3.5 mr-1.5" />
                  Request Editor Access Again
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                You currently have <span className="font-medium capitalize">{userRole}</span> access.
                {userRole === "viewer" && " Request editor access to create and edit content."}
              </p>
              {userRole === "viewer" && (
                <Button
                  size="sm"
                  onClick={() => requestRoleMutation.mutate("editor")}
                  disabled={requestRoleMutation.isPending || hasPendingRequest}
                  className="w-full"
                  data-testid="button-request-editor"
                >
                  <ArrowUpCircle className="w-3.5 h-3.5 mr-1.5" />
                  {requestRoleMutation.isPending ? "Submitting…" : "Request Editor Access"}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Collaborator list ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          Active Collaborators
          {collaborators && collaborators.length > 0 && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {collaborators.length} member{collaborators.length !== 1 ? "s" : ""}
            </span>
          )}
        </h3>

        {collabLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ) : !collaborators || collaborators.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No one has accepted an invite yet.
          </p>
        ) : (
          <div className="divide-y">
            {collaborators.map((c) => (
              <div
                key={c.id}
                data-testid={`row-collaborator-${c.id}`}
                className="flex items-center gap-3 py-3"
              >
                <div className="w-8 h-8 rounded-full bg-green-50 text-green-700 text-xs font-semibold flex items-center justify-center shrink-0">
                  {c.email.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    data-testid={`text-collab-email-${c.id}`}
                    className="text-sm font-medium text-foreground truncate"
                  >
                    {c.email}
                    {c.user_id === user?.id && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">(you)</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-green-500" />
                    Joined {new Date(c.joined_at).toLocaleDateString()}
                  </p>
                </div>

                {isOwner ? (
                  /* Owner: role dropdown + remove button */
                  <div className="flex items-center gap-2 shrink-0">
                    <Select
                      value={c.role}
                      onValueChange={(newRole) => {
                        if (c.user_id !== null) {
                          roleUpdateMutation.mutate({ userId: c.user_id, role: newRole });
                        }
                      }}
                      disabled={roleUpdateMutation.isPending || c.user_id === null}
                    >
                      <SelectTrigger
                        className="h-7 text-xs w-28"
                        data-testid={`select-role-${c.id}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => c.user_id !== null && removeMutation.mutate(c.user_id)}
                      disabled={removeMutation.isPending || c.user_id === null}
                      data-testid={`button-remove-collab-${c.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  /* Non-owner: just show role badge */
                  <RoleBadge role={c.role} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Owner: Pending invites ────────────────────────────────────────────── */}
      {isOwner && (invitesLoading || pendingInvites.length > 0) && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Pending Invites
            {pendingInvites.length > 0 && (
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {pendingInvites.length} pending
              </span>
            )}
          </h3>

          {invitesLoading ? (
            <Skeleton className="h-12 w-full rounded-lg" />
          ) : (
            <div className="divide-y">
              {pendingInvites.map((inv) => (
                <div
                  key={inv.id}
                  data-testid={`row-invite-${inv.id}`}
                  className="flex items-center gap-3 py-3"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
                    {inv.email.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      data-testid={`text-invite-email-${inv.id}`}
                      className="text-sm font-medium text-foreground truncate"
                    >
                      {inv.email}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Sent {new Date(inv.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <RoleBadge role={inv.role} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
