import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ApiExperiment, type ApiDataset } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Plus, Paperclip, Clock, FlaskConical, Eye, Download, Trash2, RefreshCw, Database, Upload, Shield, ShieldCheck, ShieldAlert, Link2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ALLOWED_EXTS = [".txt", ".csv", ".json", ".png", ".jpg", ".jpeg", ".pdf", ".zip"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function fileTypeIcon(filename: string | null) {
  if (!filename) return "📎";
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = { pdf: "📄", png: "🖼️", jpg: "🖼️", jpeg: "🖼️", csv: "📊", json: "📋", txt: "📝", zip: "🗜️" };
  return map[ext ?? ""] ?? "📎";
}

interface Props {
  projectId: number;
  canWrite?: boolean;
}

export default function ExperimentLogs({ projectId, canWrite = true }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<number[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", notes: "" });

  const { data: experiments, isLoading } = useQuery<ApiExperiment[]>({
    queryKey: ["/projects", projectId, "experiments"],
    queryFn: () => api.getExperiments(projectId),
    enabled: !!projectId,
  });

  const { data: datasets } = useQuery<ApiDataset[]>({
    queryKey: ["/projects", projectId, "datasets"],
    queryFn: () => api.getDatasets(projectId),
    enabled: !!projectId,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      setUploadProgress(10);
      const result = await api.uploadExperiment(
        projectId,
        {
          name: form.name,
          description: form.description || undefined,
          notes: form.notes || undefined,
          datasetIds: selectedDatasetIds,
        },
        selectedFile,
      );
      setUploadProgress(100);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/projects", projectId, "experiments"] });
      queryClient.invalidateQueries({ queryKey: ["/reproducibility"] });
      setForm({ name: "", description: "", notes: "" });
      setSelectedFile(null);
      setSelectedDatasetIds([]);
      setUploadProgress(null);
      setUploadError(null);
      setOpen(false);
      toast({ title: "Experiment logged", description: "Saved with all attachments." });
    },
    onError: (err: Error) => {
      setUploadProgress(null);
      setUploadError(err.message);
      toast({ title: "Failed to log experiment", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (experimentId: number) => api.deleteExperiment(projectId, experimentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/projects", projectId, "experiments"] });
      toast({ title: "Experiment removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFileSelected = (file: File) => {
    const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      toast({
        title: "File type not allowed",
        description: `Allowed types: ${ALLOWED_EXTS.join(", ")}`,
        variant: "destructive",
      });
      return;
    }
    setSelectedFile(file);
    setUploadError(null);
  };

  const handleOpenChange = (val: boolean) => {
    setOpen(val);
    if (!val) {
      setSelectedFile(null);
      setUploadProgress(null);
      setUploadError(null);
      setSelectedDatasetIds([]);
      setForm({ name: "", description: "", notes: "" });
    }
  };

  const toggleDataset = (id: number) => {
    setSelectedDatasetIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    setUploadError(null);
    uploadMutation.mutate();
  };

  const isUploading = uploadMutation.isPending;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-foreground">Experiment Timeline</h2>
        {canWrite ? (
          <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-experiment">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Experiment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Log New Experiment</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">

                <div className="space-y-2">
                  <Label>Title <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="Experiment title"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    placeholder="Brief description"
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Observations, results, parameters…"
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                  />
                </div>

                {/* Attachment upload */}
                <div className="space-y-2">
                  <Label>Attachment (optional)</Label>
                  <div
                    className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${
                      selectedFile ? "border-primary/50 bg-primary/5" : "border-border hover:border-muted-foreground/40"
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {selectedFile ? (
                      <div className="flex items-center justify-center gap-2 text-sm">
                        <span className="text-base">{fileTypeIcon(selectedFile.name)}</span>
                        <div className="text-left">
                          <p className="font-medium text-foreground text-xs truncate max-w-[200px]">{selectedFile.name}</p>
                          <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(0)} KB</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto text-muted-foreground text-xs h-7"
                          onClick={e => { e.stopPropagation(); setSelectedFile(null); }}
                        >
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                        <p className="text-xs text-muted-foreground">Click to attach a file</p>
                        <p className="text-xs text-muted-foreground/60">{ALLOWED_EXTS.join(", ")}</p>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ALLOWED_EXTS.join(",")}
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handleFileSelected(f);
                      e.target.value = "";
                    }}
                  />
                </div>

                {/* Dataset linking */}
                {datasets && datasets.length > 0 && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5" /> Link Related Datasets
                    </Label>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto rounded-lg border p-2">
                      {datasets.map(ds => (
                        <label
                          key={ds.id}
                          className="flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedDatasetIds.includes(ds.id)}
                            onChange={() => toggleDataset(ds.id)}
                            className="rounded"
                          />
                          <span className="text-xs font-medium text-foreground">{ds.name}</span>
                          {ds.file_name && (
                            <span className="text-xs text-muted-foreground font-mono truncate">{ds.file_name}</span>
                          )}
                        </label>
                      ))}
                    </div>
                    {selectedDatasetIds.length > 0 && (
                      <p className="text-xs text-primary">
                        {selectedDatasetIds.length} dataset{selectedDatasetIds.length > 1 ? "s" : ""} selected
                      </p>
                    )}
                  </div>
                )}

                {/* Upload progress */}
                {isUploading && uploadProgress !== null && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Saving experiment…
                    </div>
                    <Progress value={uploadProgress} className="h-1.5" />
                  </div>
                )}

                {uploadError && (
                  <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{uploadError}</p>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={handleSubmit}
                    className="flex-1"
                    disabled={isUploading}
                    data-testid="button-confirm-experiment"
                  >
                    {isUploading ? (
                      <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Logging…</>
                    ) : (
                      "Log Experiment"
                    )}
                  </Button>
                  {uploadMutation.isError && (
                    <Button variant="outline" onClick={() => uploadMutation.mutate()}>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
                    </Button>
                  )}
                </div>
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
          {experiments?.map((exp, i) => {
            const linkedIds = exp.linked_dataset_ids
              ? exp.linked_dataset_ids.split(",").map(x => parseInt(x)).filter(Boolean)
              : [];
            const linkedDatasets = datasets?.filter(d => linkedIds.includes(d.id)) ?? [];

            return (
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
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                        <Clock className="w-3 h-3" /> {formatDate(exp.created_at)}
                      </span>
                      {canWrite && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive ml-1"
                          onClick={() => deleteMutation.mutate(exp.id)}
                          disabled={deleteMutation.isPending}
                          title="Delete experiment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {exp.description && <p className="text-xs text-muted-foreground mt-1">{exp.description}</p>}
                  {exp.notes && <p className="text-sm text-foreground mt-2 leading-relaxed">{exp.notes}</p>}

                  {/* Real attachment */}
                  {exp.has_attachment && exp.attachment_filename && (
                    <div className="mt-3 p-2 rounded-md bg-muted/50 border space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{fileTypeIcon(exp.attachment_filename)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-medium text-foreground truncate">{exp.attachment_filename}</p>
                            {exp.ipfs_hash && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-teal-100 text-teal-700 font-medium">
                                <Link2 className="w-2.5 h-2.5" /> Decentralized
                              </span>
                            )}
                            {exp.integrity_verified === "verified" && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 font-medium">
                                <ShieldCheck className="w-2.5 h-2.5" /> Verified
                              </span>
                            )}
                            {exp.integrity_verified === "tampered" && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-700 font-medium">
                                <ShieldAlert className="w-2.5 h-2.5" /> Tampered
                              </span>
                            )}
                          </div>
                          {exp.ipfs_hash && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[10px] text-teal-700 bg-teal-50 px-1 py-0.5 rounded">
                                {exp.ipfs_hash.slice(0, 6)}…{exp.ipfs_hash.slice(-4)}
                              </span>
                              <a
                                href={`https://ipfs.io/ipfs/${exp.ipfs_hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-[10px] text-teal-600 hover:underline"
                              >
                                <ExternalLink className="w-2.5 h-2.5" /> IPFS
                              </a>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => api.downloadExperiment(exp.id)}
                          >
                            <Download className="w-3 h-3 mr-1" /> Download
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Linked datasets */}
                  {linkedDatasets.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-1">
                        <Database className="w-3 h-3" /> Linked Datasets
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {linkedDatasets.map(ds => (
                          <span
                            key={ds.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium"
                          >
                            <Database className="w-2.5 h-2.5" /> {ds.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Legacy text attachments (backward compat) */}
                  {!exp.has_attachment && exp.attachments && (
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
            );
          })}
        </div>
      )}
    </div>
  );
}
