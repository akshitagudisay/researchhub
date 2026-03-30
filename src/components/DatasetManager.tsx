import { useState, useCallback } from 'react';
import { mockDatasets, type Dataset } from '@/lib/mock-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, FileText, Plus, HardDrive } from 'lucide-react';

export default function DatasetManager() {
  const [datasets, setDatasets] = useState<Dataset[]>(mockDatasets);
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', fileName: '', date: '' });

  const simulateUpload = useCallback((name: string) => {
    setForm(f => ({ ...f, fileName: name, title: name.split('.')[0].replace(/[_-]/g, ' '), date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }));
    setOpen(true);
  }, []);

  const handleAdd = () => {
    if (!form.title.trim() || !form.fileName.trim()) return;
    const d: Dataset = {
      id: String(Date.now()),
      title: form.title,
      description: form.description,
      fileName: form.fileName,
      fileSize: `${(Math.random() * 500 + 10).toFixed(0)} MB`,
      date: form.date || new Date().toLocaleDateString(),
    };
    setDatasets([d, ...datasets]);
    setForm({ title: '', description: '', fileName: '', date: '' });
    setOpen(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) simulateUpload(f.name); }}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
        }`}
      >
        <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Drag & drop files here, or</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="mt-3">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Dataset
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Dataset</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>File Name</Label>
                <Input placeholder="dataset.csv" value={form.fileName} onChange={e => setForm({ ...form, fileName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input placeholder="Dataset title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea placeholder="Brief description..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
              </div>
              <Button onClick={handleAdd} className="w-full">Add Dataset</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Dataset list */}
      <div className="space-y-3">
        {datasets.map(d => (
          <div key={d.id} className="flex items-start gap-4 p-4 rounded-lg border bg-card">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-foreground text-sm">{d.title}</h4>
              <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span className="font-mono">{d.fileName}</span>
                <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" /> {d.fileSize}</span>
                <span>{d.date}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
