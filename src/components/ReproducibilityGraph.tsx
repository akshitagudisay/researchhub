import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ApiReproducibilityGraph } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Database, FlaskConical, FileText, GitBranch,
  Plus, X, RefreshCw, AlertCircle, Users, BookOpen, ZoomIn, ZoomOut, Maximize2,
} from "lucide-react";

interface Props {
  projectId: number;
  canWrite: boolean;
}

type NodeType = "dataset" | "experiment" | "section" | "author" | "citation";

interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  description?: string | null;
  x: number;
  y: number;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  linkId: number | string;
  linkType: "dataset-experiment" | "experiment-section" | "author-project" | "citation-section";
}

const NODE_COLORS: Record<NodeType, { bg: string; border: string; icon: React.ReactNode; badge: string; edgeColor: string }> = {
  dataset: {
    bg: "bg-blue-50",
    border: "border-blue-300",
    icon: <Database className="w-4 h-4 text-blue-600" />,
    badge: "bg-blue-100 text-blue-700",
    edgeColor: "#6366f1",
  },
  experiment: {
    bg: "bg-violet-50",
    border: "border-violet-300",
    icon: <FlaskConical className="w-4 h-4 text-violet-600" />,
    badge: "bg-violet-100 text-violet-700",
    edgeColor: "#10b981",
  },
  section: {
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    icon: <FileText className="w-4 h-4 text-emerald-600" />,
    badge: "bg-emerald-100 text-emerald-700",
    edgeColor: "#10b981",
  },
  author: {
    bg: "bg-amber-50",
    border: "border-amber-300",
    icon: <Users className="w-4 h-4 text-amber-600" />,
    badge: "bg-amber-100 text-amber-700",
    edgeColor: "#f59e0b",
  },
  citation: {
    bg: "bg-rose-50",
    border: "border-rose-300",
    icon: <BookOpen className="w-4 h-4 text-rose-600" />,
    badge: "bg-rose-100 text-rose-700",
    edgeColor: "#f43f5e",
  },
};

const SECTION_LABELS: Record<string, string> = {
  abstract: "Abstract",
  introduction: "Introduction",
  methodology: "Methodology",
  results: "Results",
  conclusion: "Conclusion",
};

const ALL_TYPES: NodeType[] = ["dataset", "experiment", "section", "author", "citation"];
const TYPE_LABELS: Record<NodeType, string> = {
  dataset: "Datasets",
  experiment: "Experiments",
  section: "Sections",
  author: "Authors",
  citation: "Citations",
};

function buildGraph(data: ApiReproducibilityGraph): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const COL_W = 230;
  const ROW_H = 90;

  // Col 0: Authors
  (data.authors ?? []).forEach((a, i) => {
    nodes.push({ id: a.id, type: "author", label: a.email.split("@")[0], description: `${a.role} · ${a.email}`, x: 30, y: 30 + i * ROW_H });
  });

  // Col 1: Datasets
  data.datasets.forEach((d, i) => {
    nodes.push({ id: `ds-${d.id}`, type: "dataset", label: d.name, description: d.description, x: 30 + COL_W, y: 30 + i * ROW_H });
  });

  // Col 2: Experiments
  data.experiments.forEach((e, i) => {
    nodes.push({ id: `exp-${e.id}`, type: "experiment", label: e.name, description: e.description, x: 30 + COL_W * 2, y: 30 + i * ROW_H });
  });

  // Col 3: Sections
  const linkedSections = new Set(data.experiment_manuscript_links.map(l => l.manuscript_section));
  Array.from(linkedSections).forEach((section, i) => {
    nodes.push({ id: `sec-${section}`, type: "section", label: SECTION_LABELS[section] ?? section, x: 30 + COL_W * 3, y: 30 + i * ROW_H });
  });

  // Col 4: Citations
  (data.citations ?? []).forEach((c, i) => {
    const label = c.title.length > 22 ? c.title.slice(0, 22) + "…" : c.title;
    nodes.push({ id: `cit-${c.id}`, type: "citation", label, description: c.journal ? `${c.journal}, ${c.year ?? ""}` : undefined, x: 30 + COL_W * 4, y: 30 + i * ROW_H });
  });

  // Edges: dataset → experiment
  data.dataset_experiment_links.forEach(l => {
    edges.push({
      id: `de-${l.id}`,
      from: `ds-${l.dataset_id}`,
      to: `exp-${l.experiment_id}`,
      label: l.relationship_note ?? "used in",
      linkId: l.id,
      linkType: "dataset-experiment",
    });
  });

  // Edges: experiment → section
  data.experiment_manuscript_links.forEach(l => {
    edges.push({
      id: `em-${l.id}`,
      from: `exp-${l.experiment_id}`,
      to: `sec-${l.manuscript_section}`,
      label: l.figure_reference ? `Fig. ${l.figure_reference}` : "referenced in",
      linkId: l.id,
      linkType: "experiment-section",
    });
  });

  // Edges: author → manuscript (connect authors to all linked sections, or show a generic link)
  if ((data.authors ?? []).length > 0 && data.datasets.length > 0) {
    data.authors.slice(0, 2).forEach(a => {
      data.datasets.slice(0, 1).forEach(d => {
        edges.push({
          id: `auth-ds-${a.id}-${d.id}`,
          from: a.id,
          to: `ds-${d.id}`,
          label: "contributed",
          linkId: `auth-${a.id}`,
          linkType: "author-project",
        });
      });
    });
  }

  // Edges: citation → section (link citations to sections that have experiments)
  if ((data.citations ?? []).length > 0 && linkedSections.size > 0) {
    const sectionArr = Array.from(linkedSections);
    (data.citations ?? []).forEach((c, i) => {
      const sec = sectionArr[i % sectionArr.length];
      edges.push({
        id: `cit-sec-${c.id}`,
        from: `cit-${c.id}`,
        to: `sec-${sec}`,
        label: "cited in",
        linkId: `cit-${c.id}`,
        linkType: "citation-section",
      });
    });
  }

  return { nodes, edges };
}

const NODE_W = 160;
const NODE_H = 56;

function SVGArrow({ from, to, label, color }: { from: GraphNode; to: GraphNode; label: string; color: string }) {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const mx = (x1 + x2) / 2;
  const path = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  const lx = mx;
  const ly = (y1 + y2) / 2;
  const markerId = `arrow-${color.replace("#", "")}`;

  return (
    <g>
      <defs>
        <marker id={markerId} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill={color} />
        </marker>
      </defs>
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="4 3"
        markerEnd={`url(#${markerId})`} />
      <rect x={lx - 32} y={ly - 8} width="64" height="16" rx="4" fill="white" stroke={color} strokeWidth="1" opacity="0.9" />
      <text x={lx} y={ly + 4} textAnchor="middle" fontSize="9" fill={color} fontWeight="600">
        {label.length > 10 ? label.slice(0, 10) + "…" : label}
      </text>
    </g>
  );
}

function GraphNodeCard({ node, selected, highlighted, onClick }: {
  node: GraphNode; selected: boolean; highlighted: boolean; onClick: () => void;
}) {
  const cfg = NODE_COLORS[node.type];
  return (
    <div
      onClick={onClick}
      title={node.description ?? node.label}
      className={`absolute flex items-center gap-2 px-3 py-2 rounded-xl border-2 cursor-pointer transition-all shadow-sm hover:shadow-md ${cfg.bg} ${
        selected
          ? "border-primary shadow-primary/20 shadow-md scale-105 z-10"
          : highlighted
          ? `${cfg.border} shadow-md scale-102`
          : cfg.border
      } ${!highlighted && !selected ? "opacity-75" : ""}`}
      style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
    >
      <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${cfg.badge}`}>
        {cfg.icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold leading-tight truncate">{node.label}</p>
        <p className={`text-[10px] mt-0.5 font-medium ${cfg.badge.split(" ")[1]}`}>
          {node.type === "dataset" ? "Dataset" : node.type === "experiment" ? "Experiment"
            : node.type === "author" ? "Author" : node.type === "citation" ? "Citation" : "Section"}
        </p>
      </div>
    </div>
  );
}

function LinkForm({
  projectId, canWrite, data, onSuccess,
}: {
  projectId: number; canWrite: boolean; data: ApiReproducibilityGraph; onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"dataset" | "experiment" | null>(null);
  const [dsId, setDsId] = useState<number | "">("");
  const [expId, setExpId] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [section, setSection] = useState("");
  const [figRef, setFigRef] = useState("");
  const [desc, setDesc] = useState("");

  const dsLinkMutation = useMutation({
    mutationFn: () => api.linkDatasetToExperiment({ dataset_id: Number(dsId), experiment_id: Number(expId), project_id: projectId, relationship_note: note || undefined }),
    onSuccess: () => { toast({ title: "Dataset linked to experiment" }); setMode(null); setDsId(""); setExpId(""); setNote(""); onSuccess(); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const expLinkMutation = useMutation({
    mutationFn: () => api.linkExperimentToManuscript({ experiment_id: Number(expId), manuscript_section: section, project_id: projectId, figure_reference: figRef || undefined, description: desc || undefined }),
    onSuccess: () => { toast({ title: "Experiment linked to manuscript" }); setMode(null); setExpId(""); setSection(""); setFigRef(""); setDesc(""); onSuccess(); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!canWrite) return null;

  return (
    <div className="border-t bg-muted/20 px-4 py-3 flex-shrink-0">
      {!mode ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => setMode("dataset")}>
            <Plus className="w-3 h-3 mr-1" /> Dataset → Experiment
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => setMode("experiment")}>
            <Plus className="w-3 h-3 mr-1" /> Experiment → Section
          </Button>
        </div>
      ) : mode === "dataset" ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground">Link Dataset to Experiment</p>
          <select value={dsId} onChange={e => setDsId(Number(e.target.value))} className="w-full text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">Select dataset…</option>
            {data.datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={expId} onChange={e => setExpId(Number(e.target.value))} className="w-full text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">Select experiment…</option>
            {data.experiments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Relationship note (optional)" className="w-full text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <div className="flex gap-1.5">
            <Button size="sm" className="flex-1 h-7 text-xs" disabled={!dsId || !expId || dsLinkMutation.isPending} onClick={() => dsLinkMutation.mutate()}>
              {dsLinkMutation.isPending ? "Linking…" : "Create Link"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setMode(null)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground">Link Experiment to Manuscript</p>
          <select value={expId} onChange={e => setExpId(Number(e.target.value))} className="w-full text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">Select experiment…</option>
            {data.experiments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <select value={section} onChange={e => setSection(e.target.value)} className="w-full text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">Select section…</option>
            {Object.entries(SECTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input value={figRef} onChange={e => setFigRef(e.target.value)} placeholder="Figure reference (e.g. Fig 2)" className="w-full text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description (optional)" className="w-full text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <div className="flex gap-1.5">
            <Button size="sm" className="flex-1 h-7 text-xs" disabled={!expId || !section || expLinkMutation.isPending} onClick={() => expLinkMutation.mutate()}>
              {expLinkMutation.isPending ? "Linking…" : "Create Link"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setMode(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReproducibilityGraph({ projectId, canWrite }: Props) {
  const queryClient = useQueryClient();
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [enabledTypes, setEnabledTypes] = useState<Set<NodeType>>(new Set(ALL_TYPES));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const { data, isLoading, isError, refetch } = useQuery<ApiReproducibilityGraph>({
    queryKey: ["/reproducibility/project", projectId],
    queryFn: () => api.getReproducibilityGraph(projectId),
    enabled: !!projectId,
    staleTime: 10000,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/reproducibility/project", projectId] });
  };

  const toggleType = (type: NodeType) => {
    setEnabledTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) { next.delete(type); } else { next.add(type); }
      return next;
    });
    setSelectedNode(null);
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    setPan({
      x: panStart.current.panX + (e.clientX - panStart.current.x),
      y: panStart.current.panY + (e.clientY - panStart.current.y),
    });
  }, []);

  const handleMouseUp = useCallback(() => { isPanning.current = false; }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(2, Math.max(0.3, z - e.deltaY * 0.001)));
  }, []);

  if (isLoading) {
    return (
      <div className="flex-1 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <AlertCircle className="w-8 h-8" />
        <p className="text-sm font-medium">Failed to load graph</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  const isEmpty = data.datasets.length === 0 && data.experiments.length === 0 &&
    (data.authors ?? []).length === 0 && (data.citations ?? []).length === 0;
  const { nodes: allNodes, edges: allEdges } = buildGraph(data);

  const nodes = allNodes.filter(n => enabledTypes.has(n.type));
  const nodeIds = new Set(nodes.map(n => n.id));
  const edges = allEdges.filter(e => nodeIds.has(e.from) && nodeIds.has(e.to));

  const connectedNodeIds = selectedNode
    ? new Set([
        selectedNode,
        ...edges.filter(e => e.from === selectedNode || e.to === selectedNode)
          .flatMap(e => [e.from, e.to]),
      ])
    : null;

  const totalH = Math.max(...(nodes.map(n => n.y + NODE_H + 30)), 240);
  const totalW = Math.max(...(nodes.map(n => n.x + NODE_W + 30)), 400);

  const selectedNodeObj = selectedNode ? nodes.find(n => n.id === selectedNode) : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b flex-shrink-0 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-semibold text-lg text-foreground flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-primary" />
            Knowledge Graph
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Authors · Datasets · Experiments · Manuscript · Citations
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Type filter chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {ALL_TYPES.map(type => {
              const cfg = NODE_COLORS[type];
              const active = enabledTypes.has(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium transition-all border ${
                    active ? `${cfg.badge} border-transparent` : "bg-muted/30 text-muted-foreground border-muted"
                  }`}
                >
                  {cfg.icon}
                  <span>{TYPE_LABELS[type]}</span>
                </button>
              );
            })}
          </div>
          {/* Zoom controls */}
          <div className="flex items-center gap-1 border rounded-lg px-1 py-0.5 bg-muted/20">
            <button onClick={() => setZoom(z => Math.min(2, z + 0.15))} className="p-1 hover:bg-muted rounded">
              <ZoomIn className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <span className="text-[10px] text-muted-foreground w-8 text-center font-mono">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.max(0.3, z - 0.15))} className="p-1 hover:bg-muted rounded">
              <ZoomOut className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-1 hover:bg-muted rounded" title="Reset view">
              <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleRefresh}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Graph canvas */}
        <div
          className="flex-1 overflow-hidden bg-gradient-to-br from-slate-50 to-white relative"
          style={{ cursor: isPanning.current ? "grabbing" : "grab" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
              <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center">
                <GitBranch className="w-8 h-8 text-primary/40" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">No research items yet</p>
                <p className="text-sm mt-1">
                  Add datasets, experiments, and citations to see your knowledge graph.
                </p>
              </div>
            </div>
          ) : (
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "top left",
                width: totalW,
                height: totalH,
                position: "relative",
              }}
            >
              <svg
                className="absolute inset-0 pointer-events-none"
                width={totalW}
                height={totalH}
                style={{ overflow: "visible" }}
              >
                {edges.map(edge => {
                  const fromNode = nodes.find(n => n.id === edge.from);
                  const toNode = nodes.find(n => n.id === edge.to);
                  if (!fromNode || !toNode) return null;
                  const color = NODE_COLORS[fromNode.type].edgeColor;
                  const isHighlighted = !connectedNodeIds || connectedNodeIds.has(edge.from) && connectedNodeIds.has(edge.to);
                  return (
                    <g key={edge.id} opacity={isHighlighted ? 1 : 0.2}>
                      <SVGArrow from={fromNode} to={toNode} label={edge.label} color={color} />
                    </g>
                  );
                })}
              </svg>
              {nodes.map(node => (
                <div key={node.id} data-node="true">
                  <GraphNodeCard
                    node={node}
                    selected={selectedNode === node.id}
                    highlighted={!connectedNodeIds || connectedNodeIds.has(node.id)}
                    onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="absolute bottom-3 left-3 text-[10px] text-muted-foreground bg-white/80 px-2 py-1 rounded-md border">
            Drag to pan · Scroll to zoom · Click node to highlight
          </div>
        </div>

        {/* Node detail panel */}
        {selectedNodeObj && (
          <div className="w-60 border-l bg-card flex flex-col flex-shrink-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="text-sm font-semibold">Node Details</span>
              <button onClick={() => setSelectedNode(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 p-4 space-y-3 overflow-y-auto">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${NODE_COLORS[selectedNodeObj.type].bg} border ${NODE_COLORS[selectedNodeObj.type].border}`}>
                {NODE_COLORS[selectedNodeObj.type].icon}
                <div>
                  <p className="text-xs font-semibold">{selectedNodeObj.label}</p>
                  <p className={`text-[10px] font-medium capitalize ${NODE_COLORS[selectedNodeObj.type].badge.split(" ")[1]}`}>
                    {selectedNodeObj.type}
                  </p>
                </div>
              </div>

              {selectedNodeObj.description && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Details</p>
                  <p className="text-xs text-foreground leading-relaxed">{selectedNodeObj.description}</p>
                </div>
              )}

              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Connections</p>
                {edges.filter(e => e.from === selectedNodeObj.id || e.to === selectedNodeObj.id).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No connections</p>
                ) : (
                  edges.filter(e => e.from === selectedNodeObj.id || e.to === selectedNodeObj.id).map(edge => {
                    const other = nodes.find(n => n.id === (edge.from === selectedNodeObj.id ? edge.to : edge.from));
                    return (
                      <div key={edge.id} className="flex items-center gap-1.5 py-1 border-b last:border-0">
                        <span className="text-[10px] text-muted-foreground shrink-0">{edge.label}</span>
                        <span className="text-[10px] font-medium truncate">{other?.label}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div className="border-t px-6 py-2 bg-muted/10 flex-shrink-0 flex items-center gap-6 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-amber-500" />
          {(data.authors ?? []).length} author{(data.authors ?? []).length !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-blue-500" />
          {data.datasets.length} dataset{data.datasets.length !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1.5">
          <FlaskConical className="w-3.5 h-3.5 text-violet-500" />
          {data.experiments.length} experiment{data.experiments.length !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-rose-500" />
          {(data.citations ?? []).length} citation{(data.citations ?? []).length !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1.5">
          <GitBranch className="w-3.5 h-3.5 text-primary/60" />
          {edges.length} link{edges.length !== 1 ? "s" : ""}
        </span>
      </div>

      <LinkForm projectId={projectId} canWrite={canWrite} data={data} onSuccess={handleRefresh} />
    </div>
  );
}
