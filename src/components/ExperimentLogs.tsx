import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ApiExperiment } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Paperclip, Clock, FlaskConical, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

interface Props {
  projectId: number;
  canWrite?: boolean;
}

export default function ExperimentLogs({ projectId, canWrite = true }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", notes: "", attachments: "" });

  const { data: experiments, isLoading } = useQuery<ApiExperiment[]>({
    queryKey: ["/projects", projectId, "experiments"],
    queryFn: () => api.getExperiments(projectId),
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createExperiment(projectId, {
        name: form.name,
        description: form.description || undefined,
        notes: form.notes || undefined,
        attachments: form.attachments || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/projects", projectId, "experiments"] });
      setForm({ name: "", description: "", notes: "", attachments: "" });
      setOpen(false);
      toast({ title: "Experiment logged" });
    },
  });

  const handleAdd = () => {
    if (!form.name.trim()) return;
    createMutation.mutate();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-foreground">Experiment Timeline</h2>
        {canWrite ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-experiment">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Experiment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Log New Experiment</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input placeholder="Experiment title" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input placeholder="Brief description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea placeholder="Observations, results, parameters…" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} />
                </div>
                <div className="space-y-2">
                  <Label>Attachments (comma-separated filenames)</Label>
                  <Input placeholder="log.txt, results.csv" value={form.attachments} onChange={e => setForm({ ...form, attachments: e.target.value })} />
                </div>
                <Button onClick={handleAdd} className="w-full" disabled={createMutation.isPending} data-testid="button-confirm-experiment">
                  {createMutation.isPending ? "Logging…" : "Log Experiment"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-md">
            <Eye className="w-3.5 h-3.5" /> Read-only
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map(i => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
        </div>
      ) : experiments?.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No experiments logged yet.</p>
      ) : (
        <div className="relative space-y-0">
          {experiments?.map((exp, i) => (
            <div key={exp.id} className="relative flex gap-4 pb-8 last:pb-0" data-testid={`card-experiment-${exp.id}`}>
              {i < (experiments?.length ?? 0) - 1 && (
                <div className="absolute left-[18px] top-10 bottom-0 w-px bg-border" />
              )}
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 z-10">
                <FlaskConical className="w-4 h-4" />
              </div>
              <div className="flex-1 p-4 rounded-lg border bg-card">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-medium text-foreground text-sm">{exp.name}</h4>
                  <span className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                    <Clock className="w-3 h-3" /> {formatDate(exp.created_at)}
                  </span>
                </div>
                {exp.description && <p className="text-xs text-muted-foreground mt-1">{exp.description}</p>}
                {exp.notes && <p className="text-sm text-foreground mt-2 leading-relaxed">{exp.notes}</p>}
                {exp.attachments && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {exp.attachments.split(",").map(a => a.trim()).filter(Boolean).map(a => (
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
      )}
    </div>
  );
}
