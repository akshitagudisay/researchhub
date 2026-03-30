import { useState } from 'react';
import { mockExperiments, type Experiment } from '@/lib/mock-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Paperclip, Clock, FlaskConical } from 'lucide-react';

export default function ExperimentLogs() {
  const [experiments, setExperiments] = useState<Experiment[]>(mockExperiments);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', notes: '', attachments: '' });

  const handleAdd = () => {
    if (!form.title.trim()) return;
    const exp: Experiment = {
      id: String(Date.now()),
      title: form.title,
      description: form.description,
      notes: form.notes,
      attachments: form.attachments ? form.attachments.split(',').map(s => s.trim()) : [],
      timestamp: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    };
    setExperiments([exp, ...experiments]);
    setForm({ title: '', description: '', notes: '', attachments: '' });
    setOpen(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-foreground">Experiment Timeline</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-3.5 h-3.5 mr-1.5" /> Add Experiment</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Log New Experiment</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input placeholder="Experiment title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input placeholder="Brief description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea placeholder="Observations, results, parameters..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Attachments (comma-separated filenames)</Label>
                <Input placeholder="log.txt, results.csv" value={form.attachments} onChange={e => setForm({ ...form, attachments: e.target.value })} />
              </div>
              <Button onClick={handleAdd} className="w-full">Log Experiment</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Timeline */}
      <div className="relative space-y-0">
        {experiments.map((exp, i) => (
          <div key={exp.id} className="relative flex gap-4 pb-8 last:pb-0">
            {/* Timeline line */}
            {i < experiments.length - 1 && (
              <div className="absolute left-[18px] top-10 bottom-0 w-px bg-border" />
            )}
            {/* Dot */}
            <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 z-10">
              <FlaskConical className="w-4 h-4" />
            </div>
            {/* Card */}
            <div className="flex-1 p-4 rounded-lg border bg-card">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-medium text-foreground text-sm">{exp.title}</h4>
                <span className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                  <Clock className="w-3 h-3" /> {exp.timestamp}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{exp.description}</p>
              <p className="text-sm text-foreground mt-2 leading-relaxed">{exp.notes}</p>
              {exp.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {exp.attachments.map(a => (
                    <span key={a} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs text-muted-foreground">
                      <Paperclip className="w-3 h-3" /> {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
