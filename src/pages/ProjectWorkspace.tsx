import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mockProjects, mockUsers, type Collaborator } from '@/lib/mock-data';
import ManuscriptEditor from '@/components/ManuscriptEditor';
import DatasetManager from '@/components/DatasetManager';
import ExperimentLogs from '@/components/ExperimentLogs';
import InviteModal from '@/components/InviteModal';
import { Button } from '@/components/ui/button';
import { FileText, Database, FlaskConical, ArrowLeft } from 'lucide-react';

type Tab = 'manuscript' | 'datasets' | 'experiments';

const tabs: { key: Tab; label: string; icon: typeof FileText }[] = [
  { key: 'manuscript', label: 'Manuscript', icon: FileText },
  { key: 'datasets', label: 'Datasets', icon: Database },
  { key: 'experiments', label: 'Experiments', icon: FlaskConical },
];

export default function ProjectWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const project = mockProjects.find(p => p.id === id) || mockProjects[0];
  const [activeTab, setActiveTab] = useState<Tab>('manuscript');
  const [collaborators, setCollaborators] = useState<Collaborator[]>(
    project.members.map(m => ({ ...m, role: 'Owner' as const, avatar: m.avatar }))
  );

  const addCollaborator = (c: Collaborator) => setCollaborators(prev => [...prev, c]);
  const removeCollaborator = (cid: string) => setCollaborators(prev => prev.filter(c => c.id !== cid));

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-56 border-r bg-card flex flex-col flex-shrink-0">
        <div className="p-4 border-b">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="mb-3 -ml-2 text-muted-foreground">
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back
          </Button>
          <h2 className="font-display font-semibold text-foreground text-sm line-clamp-2">{project.title}</h2>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === t.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-12 border-b bg-card flex items-center justify-between px-5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="font-medium text-foreground text-sm">{project.title}</h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex -space-x-1.5">
              {collaborators.slice(0, 4).map(m => (
                <div key={m.id} className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[9px] font-medium flex items-center justify-center border-2 border-card">
                  {m.avatar}
                </div>
              ))}
              {collaborators.length > 4 && (
                <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground text-[9px] font-medium flex items-center justify-center border-2 border-card">
                  +{collaborators.length - 4}
                </div>
              )}
            </div>
            <InviteModal collaborators={collaborators} onAdd={addCollaborator} onRemove={removeCollaborator} />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          {activeTab === 'manuscript' && <ManuscriptEditor />}
          {activeTab === 'datasets' && <DatasetManager />}
          {activeTab === 'experiments' && <ExperimentLogs />}
        </main>
      </div>
    </div>
  );
}
