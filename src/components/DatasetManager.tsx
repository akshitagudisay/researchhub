import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ApiDataset } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, FileText, Plus, HardDrive, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function DatasetManager({ projectId }: { projectId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", file_name: "", file_size: "" });

  const { data: datasets, isLoading } = useQuery<ApiDataset[]>({
    queryKey: ["/projects", projectId, "datasets"],
    queryFn: () => api.getDatasets(projectId),
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: () => api.createDataset(projectId, {
      name: form.name,
      description: form.description || undefined,
      file_name: form.file_name || undefined,
      file_size: form.file_size || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/projects", projectId, "datasets"] });
      setForm({ name: "", description: "", file_name: "", file_size: "" });
      setOpen(false);
      toast({ title: "Dataset added" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (datasetId: number) => api.deleteDataset(projectId, datasetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/projects", projectId, "datasets"] });
      toast({ title: "Dataset removed" });
    },
  });

  const simulateUpload = useCallback((fileName: string) => {
    const size = `${(Math.random() * 500 + 10).toFixed(0)} MB`;
    setForm({
      name: fileName.split(".")[0].replace(/[_-]/g, " "),
      description: "",
      file_name: fileName,
      file_size: size,
    });
    setOpen(true);
  }, []);

  const handleAdd = () => {
    if (!form.name.trim()) return;
    createMutation.mutate();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) simulateUpload(f.name); }}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
        }`}
      >
        <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Drag & drop files here, or</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="mt-3" data-testid="button-add-dataset">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Dataset
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Dataset</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input placeholder="Dataset name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>File Name</Label>
                <Input placeholder="dataset.csv" value={form.file_name} onChange={e => setForm({ ...form, file_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea placeholder="Brief description…" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
              </div>
              <Button onClick={handleAdd} className="w-full" disabled={createMutation.isPending} data-testid="button-confirm-dataset">
                {createMutation.isPending ? "Adding…" : "Add Dataset"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Dataset list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : datasets?.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No datasets yet.</p>
      ) : (
        <div className="space-y-3">
          {datasets?.map(d => (
            <div key={d.id} className="flex items-start gap-4 p-4 rounded-lg border bg-card" data-testid={`card-dataset-${d.id}`}>
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-foreground text-sm">{d.name}</h4>
                {d.description && <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>}
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  {d.file_name && <span className="font-mono">{d.file_name}</span>}
                  {d.file_size && <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" /> {d.file_size}</span>}
                  <span>{formatDate(d.created_at)}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => deleteMutation.mutate(d.id)}
                disabled={deleteMutation.isPending}
                data-testid={`button-delete-dataset-${d.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
