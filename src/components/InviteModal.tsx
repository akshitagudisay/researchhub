import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { UserPlus, X } from 'lucide-react';
import type { Collaborator } from '@/lib/mock-data';

interface InviteModalProps {
  collaborators: Collaborator[];
  onAdd: (c: Collaborator) => void;
  onRemove: (id: string) => void;
}

export default function InviteModal({ collaborators, onAdd, onRemove }: InviteModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'Editor' | 'Viewer'>('Editor');
  const [open, setOpen] = useState(false);

  const handleInvite = () => {
    if (!email.includes('@')) return;
    const name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const c: Collaborator = {
      id: String(Date.now()),
      email,
      name,
      role,
      avatar: name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
    };
    onAdd(c);
    setEmail('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Invite
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Invite Collaborators</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex gap-2">
            <div className="flex-1 space-y-2">
              <Label>Email</Label>
              <Input placeholder="colleague@university.edu" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="w-32 space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={v => setRole(v as 'Editor' | 'Viewer')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Editor">Editor</SelectItem>
                  <SelectItem value="Viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleInvite} className="w-full">Send Invite</Button>

          {collaborators.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <Label className="text-xs text-muted-foreground">Team Members</Label>
              {collaborators.map(c => (
                <div key={c.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-[10px] font-medium flex items-center justify-center">
                      {c.avatar}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{c.role}</span>
                    {c.role !== 'Owner' && (
                      <button onClick={() => onRemove(c.id)} className="text-muted-foreground hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
