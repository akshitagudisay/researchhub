import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api, type ApiProject } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, LogOut, FlaskConical, Clock, Crown, Users, X } from "lucide-react";
import GlobalSearch from "@/components/GlobalSearch";

function initials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function OwnerBadge() {
  return (
    <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
      <Crown className="w-2.5 h-2.5" /> Owner
    </span>
  );
}

function CollaboratorBadge() {
  return (
    <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">
      <Users className="w-2.5 h-2.5" /> Collaborator
    </span>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const [localSearch, setLocalSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [ownershipFilter, setOwnershipFilter] = useState("all");

  const { data: projects, isLoading } = useQuery<ApiProject[]>({
    queryKey: ["/projects"],
    queryFn: () => api.getProjects(),
  });

  const createMutation = useMutation({
    mutationFn: (title: string) => api.createProject(title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/projects"] });
      setNewTitle("");
      setNewDesc("");
      setOpen(false);
    },
  });

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    createMutation.mutate(newTitle.trim());
  };

  const handleLogout = () => { logout(); navigate("/login"); };

  const hasFilters = localSearch.trim() || roleFilter !== "all" || ownershipFilter !== "all";

  const clearFilters = () => {
    setLocalSearch("");
    setRoleFilter("all");
    setOwnershipFilter("all");
  };

  const filteredProjects = (projects ?? []).filter(p => {
    const q = localSearch.trim().toLowerCase();
    if (q && !p.title.toLowerCase().includes(q)) return false;
    if (ownershipFilter === "me" && p.owner_id !== user?.id) return false;
    if (ownershipFilter === "shared" && p.owner_id === user?.id) return false;
    if (roleFilter === "owner" && p.owner_id !== user?.id) return false;
    if (roleFilter === "collaborator" && p.owner_id === user?.id) return false;
    return true;
  });

  const ownedProjects = filteredProjects.filter(p => p.owner_id === user?.id);
  const sharedProjects = filteredProjects.filter(p => p.owner_id !== user?.id);

  const renderCard = (p: ApiProject, isOwner: boolean) => (
    <button
      key={p.id}
      onClick={() => navigate(`/project/${p.id}`)}
      className="text-left bg-card rounded-xl border p-5 shadow-card hover:shadow-elevated transition-shadow group"
      data-testid={`card-project-${p.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-display font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 flex-1">
          {localSearch.trim() ? (
            (() => {
              const q = localSearch.trim();
              const idx = p.title.toLowerCase().indexOf(q.toLowerCase());
              if (idx === -1) return p.title;
              return (
                <>
                  {p.title.slice(0, idx)}
                  <mark className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5 not-italic font-semibold">
                    {p.title.slice(idx, idx + q.length)}
                  </mark>
                  {p.title.slice(idx + q.length)}
                </>
              );
            })()
          ) : p.title}
        </h3>
        {isOwner ? <OwnerBadge /> : <CollaboratorBadge />}
      </div>
      <div className="flex items-center justify-between mt-4">
        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-[10px] font-medium flex items-center justify-center border-2 border-card">
          {initials(isOwner ? (user?.email ?? "?") : p.owner_id.toString())}
        </div>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="w-3 h-3" /> {timeAgo(p.created_at)}
        </span>
      </div>
    </button>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <FlaskConical className="w-4 h-4" />
            </div>
            <span className="font-display font-semibold text-foreground">ResearchHub</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline" data-testid="text-user-email">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="button-signout">
              <LogOut className="w-4 h-4 mr-1.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        {/* Header row */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-display font-semibold text-foreground">Projects</h1>
            <p className="text-muted-foreground mt-1">Your research workspace</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-project">
                <Plus className="w-4 h-4 mr-1.5" /> New Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create New Project</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Project Title</Label>
                  <Input
                    placeholder="e.g. Protein Folding Analysis"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    data-testid="input-project-title"
                    onKeyDown={e => e.key === "Enter" && handleCreate()}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Textarea
                    placeholder="Brief description of the research project..."
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                    rows={3}
                  />
                </div>
                <Button
                  onClick={handleCreate}
                  className="w-full"
                  disabled={createMutation.isPending || !newTitle.trim()}
                  data-testid="button-create-project"
                >
                  {createMutation.isPending ? "Creating…" : "Create Project"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search + Filter bar */}
        <div className="space-y-3">
          <GlobalSearch roleFilter={roleFilter} ownershipFilter={ownershipFilter} />

          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Filter projects by name…"
              value={localSearch}
              onChange={e => setLocalSearch(e.target.value)}
              className="h-8 text-sm w-56"
              data-testid="input-project-filter"
            />

            <Select value={ownershipFilter} onValueChange={setOwnershipFilter}>
              <SelectTrigger className="h-8 text-sm w-36">
                <SelectValue placeholder="Ownership" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                <SelectItem value="me">My projects</SelectItem>
                <SelectItem value="shared">Shared with me</SelectItem>
              </SelectContent>
            </Select>

            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-8 text-sm w-36">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="collaborator">Collaborator</SelectItem>
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-8 text-xs text-muted-foreground gap-1"
              >
                <X className="w-3 h-3" /> Clear
              </Button>
            )}

            {hasFilters && !isLoading && (
              <span className="text-xs text-muted-foreground ml-1">
                {filteredProjects.length} result{filteredProjects.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Project list */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border p-5 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : (projects ?? []).length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <FlaskConical className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No projects yet. Create your first one!</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FlaskConical className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No projects match your filters.</p>
            <button onClick={clearFilters} className="mt-2 text-xs text-primary hover:underline">
              Clear filters
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {ownedProjects.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Crown className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">My Projects</h2>
                  <span className="text-xs text-muted-foreground">({ownedProjects.length})</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {ownedProjects.map(p => renderCard(p, true))}
                </div>
              </section>
            )}

            {sharedProjects.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Users className="w-4 h-4 text-blue-600" />
                  <h2 className="text-sm font-semibold text-foreground">Shared with Me</h2>
                  <span className="text-xs text-muted-foreground">({sharedProjects.length})</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {sharedProjects.map(p => renderCard(p, false))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
