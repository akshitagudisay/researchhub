import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { mockProjects, type Project } from '@/lib/mock-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, LogOut, FlaskConical, Clock } from 'lucide-react';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>(mockProjects);
  const [open, setOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    const p: Project = {
      id: String(Date.now()),
      title: newTitle,
      description: newDesc,
      members: [{ id: '1', name: user?.name || 'You', email: user?.email || '', avatar: (user?.name || 'U').slice(0, 2).toUpperCase() }],
      lastUpdated: 'Just now',
    };
    setProjects([p, ...projects]);
    setNewTitle('');
    setNewDesc('');
    setOpen(false);
  };

  const handleLogout = () => { logout(); navigate('/login'); };

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
            <span className="text-sm text-muted-foreground hidden sm:inline">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-1.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-semibold text-foreground">Projects</h1>
            <p className="text-muted-foreground mt-1">Your research workspace</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-1.5" /> New Project</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create New Project</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Project Title</Label>
                  <Input placeholder="e.g. Protein Folding Analysis" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea placeholder="Brief description of the research project..." value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={3} />
                </div>
                <Button onClick={handleCreate} className="w-full">Create Project</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => navigate(`/project/${p.id}`)}
              className="text-left bg-card rounded-xl border p-5 shadow-card hover:shadow-elevated transition-shadow group"
            >
              <h3 className="font-display font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">{p.title}</h3>
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{p.description}</p>
              <div className="flex items-center justify-between mt-4">
                <div className="flex -space-x-2">
                  {p.members.slice(0, 4).map(m => (
                    <div key={m.id} className="w-7 h-7 rounded-full bg-primary/10 text-primary text-[10px] font-medium flex items-center justify-center border-2 border-card">
                      {m.avatar}
                    </div>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {p.lastUpdated}
                </span>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
