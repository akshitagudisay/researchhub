import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ApiDataset } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, Plus, HardDrive, Trash2, Eye, Download, User, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ALLOWED_EXTS = [".csv", ".xlsx", ".json", ".txt", ".zip"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fileTypeIcon(filename: string | null) {
  if (!filename) return "📄";
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = { csv: "📊", xlsx: "📊", json: "📋", txt: "📝", zip: "🗜️" };
  return map[ext ?? ""] ?? "📄";
}

interface Props {
  projectId: number;
  canWrite?: boolean;
}

export default function DatasetManager({ projectId, canWrite = true }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: datasets, isLoading } = useQuery<ApiDataset[]>({
    queryKey: ["/projects", projectId, "datasets"],
    queryFn: () => api.getDatasets(projectId),
    enabled: !!projectId,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("No file selected");
      setUploadProgress(10);
      const result = await api.uploadDataset(projectId, selectedFile, form.name, form.description);
      setUploadProgress(100);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/projects", projectId, "datasets"] });
      setForm({ name: "", description: "" });
      setSelectedFile(null);
      setUploadProgress(null);
      setUploadError(null);
      setOpen(false);
      toast({ title: "Dataset uploaded", description: "File saved permanently to the project." });
    },
    onError: (err: Error) => {
      setUploadProgress(null);
      setUploadError(err.message);
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (datasetId: number) => api.deleteDataset(projectId, datasetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/projects", projectId, "datasets"] });
      toast({ title: "Dataset removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFileSelected = useCallback((file: File) => {
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
    if (!form.name) {
      setForm(f => ({ ...f, name: file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ") }));
    }
    setOpen(true);
  }, [form.name, toast]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!canWrite) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
    e.target.value = "";
  };

  const handleOpenChange = (val: boolean) => {
    setOpen(val);
    if (!val) {
      setSelectedFile(null);
      setUploadProgress(null);
      setUploadError(null);
      setForm({ name: "", description: "" });
    }
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (!selectedFile) {
      toast({ title: "Please select a file to upload", variant: "destructive" });
      return;
    }
    setUploadError(null);
    uploadMutation.mutate();
  };

  const isUploading = uploadMutation.isPending;

  return (
    <div className="p-6 space-y-6">
      {/* Drop zone */}
      {canWrite ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">Drag & drop a file here</p>
          <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
          <p className="text-xs text-muted-foreground/70 mt-2">
            Supported: {ALLOWED_EXTS.join(", ")} — max 50 MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_EXTS.join(",")}
            className="hidden"
            onChange={handleInputChange}
          />
          <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                data-testid="button-add-dataset"
                onClick={e => { e.stopPropagation(); setOpen(true); }}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Dataset
              </Button>
            </DialogTrigger>
            <DialogContent onClick={e => e.stopPropagation()}>
              <DialogHeader><DialogTitle>Upload Dataset</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                {/* File picker */}
                <div className="space-y-2">
                  <Label>File</Label>
                  <div
                    className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                      selectedFile ? "border-primary/50 bg-primary/5" : "border-border hover:border-muted-foreground/40"
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {selectedFile ? (
                      <div className="flex items-center justify-center gap-2 text-sm">
                        <span className="text-lg">{fileTypeIcon(selectedFile.name)}</span>
                        <div className="text-left">
                          <p className="font-medium text-foreground truncate max-w-[220px]">{selectedFile.name}</p>
                          <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(0)} KB</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto text-muted-foreground"
                          onClick={e => { e.stopPropagation(); setSelectedFile(null); }}
                        >
                          Change
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                        <p className="text-xs text-muted-foreground">Click to select file</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">{ALLOWED_EXTS.join(", ")}</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Dataset Name <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="e.g. Patient Survey Data"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    placeholder="Brief description of this dataset…"
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    rows={2}
                  />
                </div>

                {/* Upload progress */}
                {isUploading && uploadProgress !== null && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Uploading…
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
                    disabled={isUploading || !selectedFile}
                    data-testid="button-confirm-dataset"
                  >
                    {isUploading ? (
                      <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Uploading…</>
                    ) : (
                      <><Upload className="w-3.5 h-3.5 mr-1.5" /> Upload Dataset</>
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
        </div>
      ) : (
        <div className="border-2 border-dashed rounded-xl p-8 text-center border-border bg-muted/30">
          <Eye className="w-7 h-7 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground font-medium">Read-only access</p>
          <p className="text-xs text-muted-foreground mt-1">You can view and download datasets but cannot add or remove them.</p>
        </div>
      )}

      {/* Dataset list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : datasets?.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No datasets yet. Upload the first one above.</p>
      ) : (
        <div className="space-y-3">
          {datasets?.map(d => (
            <div key={d.id} className="flex items-start gap-4 p-4 rounded-lg border bg-card" data-testid={`card-dataset-${d.id}`}>
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 text-lg">
                {fileTypeIcon(d.file_name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-foreground text-sm">{d.name}</h4>
                  {d.has_file && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-700 font-medium">
                      ✓ File stored
                    </span>
                  )}
                </div>
                {d.description && <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>}
                <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                  {d.file_name && <span className="font-mono truncate max-w-[160px]">{d.file_name}</span>}
                  {d.file_size && (
                    <span className="flex items-center gap-1">
                      <HardDrive className="w-3 h-3" /> {d.file_size}
                    </span>
                  )}
                  {d.uploaded_by_email && (
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" /> {d.uploaded_by_email}
                    </span>
                  )}
                  <span>{formatDate(d.created_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {d.has_file && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => api.downloadDataset(d.id)}
                    title="Download dataset file"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" /> Download
                  </Button>
                )}
                {canWrite && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteMutation.mutate(d.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-dataset-${d.id}`}
                    title="Delete dataset"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
