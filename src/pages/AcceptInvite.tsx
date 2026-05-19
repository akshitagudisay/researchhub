import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, type ApiInvitePreview, type ApiInviteAcceptResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  CheckCircle,
  Users,
  FlaskConical,
  AlertTriangle,
  Loader2,
  LogIn,
  UserPlus,
} from "lucide-react";

type PageState =
  | { phase: "loading" }
  | { phase: "preview"; preview: ApiInvitePreview }
  | { phase: "accepting" }
  | { phase: "accepted"; result: ApiInviteAcceptResponse }
  | { phase: "already_accepted"; result: ApiInviteAcceptResponse }
  | { phase: "error"; message: string };

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

const ROLE_COLOR: Record<string, string> = {
  owner: "bg-primary/10 text-primary",
  editor: "bg-blue-50 text-blue-700",
  viewer: "bg-muted text-muted-foreground",
};

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<PageState>({ phase: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ phase: "error", message: "Invalid invite link." });
      return;
    }
    api
      .previewInvite(token)
      .then((preview) => setState({ phase: "preview", preview }))
      .catch((err: Error) =>
        setState({ phase: "error", message: err.message })
      );
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setState({ phase: "accepting" });
    try {
      const result = await api.acceptInvite(token);
      if (result.message === "already_accepted") {
        setState({ phase: "already_accepted", result });
      } else {
        setState({ phase: "accepted", result });
      }
    } catch (err: unknown) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-primary" />
          </div>
          <span className="font-display font-bold text-foreground text-lg tracking-tight">
            ResearchHub
          </span>
        </div>

        <div className="rounded-2xl border bg-card shadow-sm p-8">
          {/* ── Loading ── */}
          {state.phase === "loading" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
              <p className="text-sm text-muted-foreground">Loading invitation…</p>
            </div>
          )}

          {/* ── Error ── */}
          {state.phase === "error" && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground text-lg">
                  Invalid Invitation
                </h2>
                <p className="text-sm text-muted-foreground mt-1">{state.message}</p>
              </div>
              <Button variant="outline" onClick={() => navigate("/login")}>
                Go to sign in
              </Button>
            </div>
          )}

          {/* ── Preview ── */}
          {state.phase === "preview" && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <h2 className="font-display font-bold text-foreground text-xl">
                  You've been invited!
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {state.preview.inviter_email} has invited you to collaborate
                </p>
              </div>

              <div className="rounded-xl bg-muted/50 border p-4 space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Project</span>
                  <span
                    className="font-semibold text-foreground"
                    data-testid="text-project-title"
                  >
                    {state.preview.project_title}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Invited as</span>
                  <span
                    data-testid="text-invite-role"
                    className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${
                      ROLE_COLOR[state.preview.role] ?? ROLE_COLOR.viewer
                    }`}
                  >
                    {ROLE_LABEL[state.preview.role] ?? state.preview.role}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Your email</span>
                  <span className="text-foreground">{state.preview.email}</span>
                </div>
              </div>

              <Button
                data-testid="button-accept-invite"
                className="w-full"
                onClick={handleAccept}
              >
                Accept Invitation
              </Button>
            </div>
          )}

          {/* ── Accepting ── */}
          {state.phase === "accepting" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Accepting invitation…</p>
            </div>
          )}

          {/* ── Accepted ── */}
          {(state.phase === "accepted" || state.phase === "already_accepted") && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <h2 className="font-display font-bold text-foreground text-xl">
                  {state.phase === "already_accepted"
                    ? "Already a collaborator"
                    : "Invitation accepted!"}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {state.phase === "already_accepted"
                    ? "You have already accepted this invitation."
                    : `You've joined "${state.result.project_title}" as ${state.result.role}.`}
                </p>
              </div>

              <div className="rounded-xl bg-muted/50 border p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Project</span>
                  <span
                    className="font-semibold text-foreground"
                    data-testid="text-accepted-project"
                  >
                    {state.result.project_title}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Role</span>
                  <span
                    data-testid="text-accepted-role"
                    className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${
                      ROLE_COLOR[state.result.role] ?? ROLE_COLOR.viewer
                    }`}
                  >
                    {ROLE_LABEL[state.result.role] ?? state.result.role}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  data-testid="button-sign-in"
                  className="w-full"
                  onClick={() => navigate("/login")}
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Sign in to ResearchHub
                </Button>
                <Button
                  data-testid="button-sign-up"
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate("/signup")}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Create an account
                </Button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Questions? Contact the person who invited you.
        </p>
      </div>
    </div>
  );
}
