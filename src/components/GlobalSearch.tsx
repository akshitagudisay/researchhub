import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  api,
  type SearchProjectResult,
  type SearchManuscriptResult,
  type SearchDatasetResult,
  type SearchExperimentResult,
} from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Search, FolderOpen, FileText, Database, FlaskConical, X, Loader2 } from "lucide-react";

interface Props {
  roleFilter: string;
  ownershipFilter: string;
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q.trim()) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function SectionHeader({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-b">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="ml-auto text-xs text-muted-foreground">{count}</span>
    </div>
  );
}

export default function GlobalSearch({ roleFilter, ownershipFilter }: Props) {
  const [inputValue, setInputValue] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(inputValue.trim()), 300);
    return () => clearTimeout(t);
  }, [inputValue]);

  useEffect(() => {
    setOpen(debouncedQ.length > 0);
  }, [debouncedQ]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const searchParams = {
    q: debouncedQ,
    ...(roleFilter !== "all" && roleFilter !== "collaborator" ? { role: roleFilter } : {}),
    ...(roleFilter === "collaborator" ? {} : {}),
    ...(ownershipFilter === "me" ? { created_by: "me" } : {}),
  };

  const enabled = debouncedQ.length > 0;

  const { data: projectResults, isFetching: fetchingProjects } = useQuery({
    queryKey: ["search/projects", debouncedQ, roleFilter, ownershipFilter],
    queryFn: () => api.searchProjects(searchParams),
    enabled,
    staleTime: 10_000,
  });

  const { data: manuscriptResults, isFetching: fetchingManuscripts } = useQuery({
    queryKey: ["search/manuscripts", debouncedQ],
    queryFn: () => api.searchManuscripts(debouncedQ),
    enabled,
    staleTime: 10_000,
  });

  const { data: datasetResults, isFetching: fetchingDatasets } = useQuery({
    queryKey: ["search/datasets", debouncedQ],
    queryFn: () => api.searchDatasets(debouncedQ),
    enabled,
    staleTime: 10_000,
  });

  const { data: experimentResults, isFetching: fetchingExperiments } = useQuery({
    queryKey: ["search/experiments", debouncedQ],
    queryFn: () => api.searchExperiments(debouncedQ),
    enabled,
    staleTime: 10_000,
  });

  const isFetching = fetchingProjects || fetchingManuscripts || fetchingDatasets || fetchingExperiments;

  const projects = projectResults ?? [];
  const manuscripts = manuscriptResults ?? [];
  const datasets = datasetResults ?? [];
  const experiments = experimentResults ?? [];
  const totalResults = projects.length + manuscripts.length + datasets.length + experiments.length;

  const clear = useCallback(() => {
    setInputValue("");
    setDebouncedQ("");
    setOpen(false);
  }, []);

  const goToProject = (id: number) => {
    setOpen(false);
    navigate(`/project/${id}`);
  };

  const hasResults = totalResults > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-lg">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search projects, manuscripts, datasets, experiments…"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onFocus={() => debouncedQ && setOpen(true)}
          className="pl-9 pr-8 h-9 text-sm"
          data-testid="input-global-search"
        />
        {inputValue && (
          <button
            onClick={clear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && debouncedQ && (
        <div className="absolute z-50 top-full mt-1.5 w-full min-w-[380px] max-w-[580px] bg-card border rounded-xl shadow-elevated overflow-hidden max-h-[480px] overflow-y-auto">
          {isFetching && !hasResults && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching…
            </div>
          )}

          {!isFetching && !hasResults && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No results found for <span className="font-medium text-foreground">"{debouncedQ}"</span>
            </div>
          )}

          {projects.length > 0 && (
            <div>
              <SectionHeader
                icon={<FolderOpen className="w-3.5 h-3.5" />}
                label="Projects"
                count={projects.length}
              />
              {projects.map((p: SearchProjectResult) => (
                <button
                  key={p.id}
                  onClick={() => goToProject(p.id)}
                  className="w-full text-left px-4 py-2.5 hover:bg-muted/60 transition-colors flex items-start gap-3 border-b last:border-0"
                >
                  <FolderOpen className="w-4 h-4 mt-0.5 shrink-0 text-primary/70" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {highlight(p.title, debouncedQ)}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{p.user_role}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {manuscripts.length > 0 && (
            <div>
              <SectionHeader
                icon={<FileText className="w-3.5 h-3.5" />}
                label="Manuscripts"
                count={manuscripts.length}
              />
              {manuscripts.map((m: SearchManuscriptResult) => (
                <button
                  key={m.id}
                  onClick={() => goToProject(m.project_id)}
                  className="w-full text-left px-4 py-2.5 hover:bg-muted/60 transition-colors flex items-start gap-3 border-b last:border-0"
                >
                  <FileText className="w-4 h-4 mt-0.5 shrink-0 text-blue-500/70" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{m.project_title}</p>
                    {m.matched_section && (
                      <p className="text-xs text-muted-foreground capitalize">In {m.matched_section}</p>
                    )}
                    {m.snippet && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {highlight(m.snippet, debouncedQ)}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {datasets.length > 0 && (
            <div>
              <SectionHeader
                icon={<Database className="w-3.5 h-3.5" />}
                label="Datasets"
                count={datasets.length}
              />
              {datasets.map((d: SearchDatasetResult) => (
                <button
                  key={d.id}
                  onClick={() => goToProject(d.project_id)}
                  className="w-full text-left px-4 py-2.5 hover:bg-muted/60 transition-colors flex items-start gap-3 border-b last:border-0"
                >
                  <Database className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500/70" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {highlight(d.name, debouncedQ)}
                    </p>
                    <p className="text-xs text-muted-foreground">{d.project_title} {d.file_size ? `· ${d.file_size}` : ""}</p>
                    {d.snippet && d.snippet !== d.name && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {highlight(d.snippet, debouncedQ)}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {experiments.length > 0 && (
            <div>
              <SectionHeader
                icon={<FlaskConical className="w-3.5 h-3.5" />}
                label="Experiments"
                count={experiments.length}
              />
              {experiments.map((e: SearchExperimentResult) => (
                <button
                  key={e.id}
                  onClick={() => goToProject(e.project_id)}
                  className="w-full text-left px-4 py-2.5 hover:bg-muted/60 transition-colors flex items-start gap-3 border-b last:border-0"
                >
                  <FlaskConical className="w-4 h-4 mt-0.5 shrink-0 text-violet-500/70" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {highlight(e.name, debouncedQ)}
                    </p>
                    <p className="text-xs text-muted-foreground">{e.project_title}</p>
                    {e.snippet && e.snippet !== e.name && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {highlight(e.snippet, debouncedQ)}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {hasResults && (
            <div className="px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground text-center">
              {totalResults} result{totalResults !== 1 ? "s" : ""} for "{debouncedQ}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
