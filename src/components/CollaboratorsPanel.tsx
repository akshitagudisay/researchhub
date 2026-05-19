import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiInvite } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

interface CollaboratorsPanelProps {
  projectId: number;
}

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-primary/10 text-primary",
  editor: "bg-blue-50 text-blue-700",
  viewer: "bg-muted text-muted-foreground",
};

const STATUS_ICON: Record<string, typeof Clock> = {
  pending: Clock,
  accepted: CheckCircle,
};

export default function CollaboratorsPanel({ projectId }: CollaboratorsPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [testResult, setTestResult] = useState<string | null>(null);

  const { data: allInvites, isLoading } = useQuery<ApiInvite[]>({
    queryKey: ["/invite"],
    queryFn: () => api.getInvites(),
  });

  const invites = allInvites?.filter((inv) => inv.project_id === projectId) ?? [];

  const inviteMutation = useMutation({
    mutationFn: (vars: { email: string; role: string; isTest?: boolean }) =>
      api.sendInvite({ email: vars.email, project_id: projectId, role: vars.role }),
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/invite"] });

      if (vars.isTest) {
        if (data.email_warning) {
          setTestResult(`Warning: ${data.email_warning}`);
        } else {
          setTestResult(`Test email sent to ${data.email}`);
        }
        return;
      }

      if (data.email_warning) {
        toast({
          title: "Invite saved — email not sent",
          description: data.email_warning,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Invite sent!",
          description: `${data.email} has been invited as ${data.role}.`,
        });
      }
      setEmail("");
    },
    onError: (err: Error) => {
      toast({
        title: "Invite failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleInvite = () => {
    if (!email.includes("@")) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    setTestResult(null);
    inviteMutation.mutate({ email, role });
  };

  const handleTestEmail = () => {
    if (!email.includes("@")) {
      toast({ title: "Enter an email first", description: "Fill in the email field above.", variant: "destructive" });
      return;
    }
    setTestResult(null);
    inviteMutation.mutate({ email, role, isTest: true });
  };

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* Invite form */}
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
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="collab-role" data-testid="select-invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Owner</SelectItem>
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
              <span className="flex items-center gap-2">
                <Send className="w-3.5 h-3.5" /> Send Invite
              </span>
            )}
          </Button>

          <Button
            data-testid="button-test-email"
            variant="outline"
            onClick={handleTestEmail}
            disabled={inviteMutation.isPending}
            title="Send a test invite email to verify SMTP is working"
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

      {/* Collaborator list */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
          <Mail className="w-4 h-4 text-muted-foreground" />
          Invited Collaborators
          {invites.length > 0 && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">{invites.length} invite{invites.length !== 1 ? "s" : ""}</span>
          )}
        </h3>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : invites.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No collaborators invited yet. Send the first invite above.
          </p>
        ) : (
          <div className="divide-y">
            {invites.map((inv) => {
              const StatusIcon = STATUS_ICON[inv.status] ?? Clock;
              const initials = inv.email.slice(0, 2).toUpperCase();
              return (
                <div
                  key={inv.id}
                  data-testid={`row-invite-${inv.id}`}
                  className="flex items-center gap-3 py-3"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      data-testid={`text-invite-email-${inv.id}`}
                      className="text-sm font-medium text-foreground truncate"
                    >
                      {inv.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(inv.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      data-testid={`text-invite-role-${inv.id}`}
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${ROLE_COLORS[inv.role] ?? ROLE_COLORS.viewer}`}
                    >
                      {inv.role}
                    </span>
                    <span
                      data-testid={`text-invite-status-${inv.id}`}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground"
                    >
                      <StatusIcon className="w-3 h-3" />
                      {inv.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
