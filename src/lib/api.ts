// All requests go through Vite's /api proxy → http://localhost:8000
// This avoids cross-origin issues when running behind the Replit proxy.
const BASE = "/api";

export interface ApiUser {
  id: number;
  email: string;
  role: string;
  created_at: string;
}

export interface ApiProject {
  id: number;
  title: string;
  owner_id: number;
  created_at: string;
}

export interface ApiManuscript {
  id: number;
  content: string;
  project_id: number;
  created_at: string;
  updated_at?: string | null;
}

export interface ApiDataset {
  id: number;
  name: string;
  description: string | null;
  file_name: string | null;
  file_size: string | null;
  uploaded_by: number | null;
  uploaded_by_email: string | null;
  stored_filename: string | null;
  file_path: string | null;
  has_file: boolean;
  project_id: number;
  created_at: string;
  ipfs_hash: string | null;
  ipfs_uploaded_at: string | null;
  integrity_verified: string | null;
}

export interface ApiInvite {
  id: number;
  email: string;
  role: string;
  project_id: number;
  invited_by: number;
  status: string;
  created_at: string;
  email_warning?: string | null;
}

export interface ApiInvitePreview {
  invite_id: number;
  email: string;
  role: string;
  status: string;
  project_title: string;
  inviter_email: string;
  created_at: string;
}

export interface ApiInviteAcceptResponse {
  message: string;
  project_id: number;
  project_title: string;
  role: string;
  collaborator_id: number;
}

export interface ApiCollaborator {
  id: number;
  project_id: number;
  invite_id: number | null;
  email: string;
  role: string;
  user_id: number | null;
  joined_at: string;
}

export interface ApiExperiment {
  id: number;
  name: string;
  description: string | null;
  notes: string | null;
  attachments: string | null;
  attachment_path: string | null;
  attachment_filename: string | null;
  attachment_stored_name: string | null;
  linked_dataset_ids: string | null;
  has_attachment: boolean;
  project_id: number;
  created_at: string;
  ipfs_hash: string | null;
  ipfs_uploaded_at: string | null;
  integrity_verified: string | null;
}

export interface ApiIpfsResult {
  ipfs_hash: string;
  ipfs_uploaded_at: string;
  integrity_verified: string;
  gateway_url: string;
}

export interface ApiIpfsVerify {
  ipfs_hash: string;
  integrity_verified: string;
  match: boolean;
  gateway_url: string;
}

export interface ApiAccessRequest {
  id: number;
  project_id: number;
  requester_id: number;
  requested_role: string;
  status: string;
  created_at: string;
}

export interface ApiCitation {
  id: number;
  project_id: number;
  doi?: string | null;
  title: string;
  authors: string[];
  journal?: string | null;
  year?: number | null;
  citation_type: string;
  formatted_apa?: string | null;
  formatted_ieee?: string | null;
  created_at: string;
}

export interface ApiContribution {
  id: number;
  user_id: number;
  project_id: number;
  action_type: string;
  contribution_score: number;
  metadata?: string | null;
  timestamp: string;
}

export interface ApiManuscriptVersion {
  id: number;
  manuscript_id: number;
  content: string;
  saved_by?: number | null;
  saved_by_email?: string | null;
  preview?: string | null;
  created_at: string;
}

export interface ApiContributionSummary {
  contributors: {
    user_id: number;
    email: string;
    total_score: number;
    percentage: number;
    actions: Record<string, number>;
  }[];
  total_score: number;
  recent_activity: {
    action_type: string;
    label: string;
    email: string;
    score: number;
    timestamp: string;
  }[];
  action_scores: Record<string, number>;
}

// ── Reviews ───────────────────────────────────────────────────────────────────

export interface ApiReview {
  id: number;
  manuscript_id: number;
  reviewer_id: number;
  reviewer_email: string | null;
  assigned_by: number;
  assigned_by_email: string | null;
  status: string;
  comments: string | null;
  decision: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface AssignReviewerPayload {
  manuscript_id: number;
  reviewer_id: number;
  project_id: number;
}

// ── Reproducibility ───────────────────────────────────────────────────────────

export interface ApiReproducibilityGraph {
  datasets: { id: number; name: string; description: string | null; created_at: string }[];
  experiments: { id: number; name: string; description: string | null; created_at: string }[];
  dataset_experiment_links: { id: number; dataset_id: number; experiment_id: number; relationship_note: string | null }[];
  experiment_manuscript_links: { id: number; experiment_id: number; manuscript_section: string; figure_reference: string | null; description: string | null }[];
}

export interface LinkDatasetPayload {
  dataset_id: number;
  experiment_id: number;
  project_id: number;
  relationship_note?: string;
}

export interface LinkExperimentPayload {
  experiment_id: number;
  manuscript_section: string;
  project_id: number;
  figure_reference?: string;
  description?: string;
}

// ── Search ────────────────────────────────────────────────────────────────────

export interface SearchProjectResult {
  id: number;
  title: string;
  owner_id: number;
  owner_email: string | null;
  user_role: string;
  created_at: string;
  snippet: string | null;
}

export interface SearchManuscriptResult {
  id: number;
  project_id: number;
  project_title: string | null;
  matched_section: string | null;
  snippet: string | null;
  updated_at: string;
}

export interface SearchDatasetResult {
  id: number;
  name: string;
  description: string | null;
  file_name: string | null;
  file_size: string | null;
  has_file: boolean;
  uploaded_by_email: string | null;
  project_id: number;
  project_title: string | null;
  snippet: string | null;
  created_at: string;
}

export interface SearchExperimentResult {
  id: number;
  name: string;
  description: string | null;
  notes: string | null;
  has_attachment: boolean;
  project_id: number;
  project_title: string | null;
  snippet: string | null;
  created_at: string;
}

// ── AI Writing ────────────────────────────────────────────────────────────────

export interface ApiAIWritingResponse {
  title: string;
  original: string;
  suggestion: string;
  improvements: string[];
  confidence: number;
  changes_made: number;
}

export interface ApiSuggestion {
  keywords: string[];
  title: string;
  authors: string[];
  journal: string;
  year: number;
  doi: string;
  formatted_apa: string;
  formatted_ieee: string;
  domain?: string;
  reason?: string;
  confidence?: number;
}

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const url = `${BASE}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail ?? "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  signup: (body: { email: string; password: string; role?: string }) =>
    request<ApiUser>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ role: "owner", ...body }),
    }),

  login: (body: { email: string; password: string }) =>
    request<{ access_token: string; token_type: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getMe: () => request<ApiUser>("/users/me"),

  // ── Projects ─────────────────────────────────────────────────────────────────
  getProjects: () => request<ApiProject[]>("/projects"),
  getProject: (id: number) => request<ApiProject>(`/projects/${id}`),
  createProject: (title: string) =>
    request<ApiProject>("/projects", { method: "POST", body: JSON.stringify({ title }) }),
  updateProject: (id: number, body: { title?: string }) =>
    request<ApiProject>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteProject: (id: number) =>
    request<void>(`/projects/${id}`, { method: "DELETE" }),
  getMyRole: (projectId: number) =>
    request<{ role: string }>(`/projects/${projectId}/my-role`),

  // ── Manuscript ───────────────────────────────────────────────────────────────
  getManuscript: (projectId: number) =>
    request<ApiManuscript | null>(`/projects/${projectId}/manuscript`),
  saveManuscript: (projectId: number, content: string) =>
    request<ApiManuscript>(`/projects/${projectId}/manuscript`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  updateManuscript: (projectId: number, content: string) =>
    request<ApiManuscript>(`/projects/${projectId}/manuscript`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    }),
  deleteManuscript: (projectId: number) =>
    request<void>(`/projects/${projectId}/manuscript`, { method: "DELETE" }),

  // ── Datasets ─────────────────────────────────────────────────────────────────
  getDatasets: (projectId: number) =>
    request<ApiDataset[]>(`/projects/${projectId}/datasets`),
  getDataset: (projectId: number, datasetId: number) =>
    request<ApiDataset>(`/projects/${projectId}/datasets/${datasetId}`),
  createDataset: (projectId: number, body: { name: string; description?: string; file_name?: string; file_size?: string }) =>
    request<ApiDataset>(`/projects/${projectId}/datasets`, { method: "POST", body: JSON.stringify(body) }),
  uploadDataset: async (projectId: number, file: File, name: string, description: string): Promise<ApiDataset> => {
    const token = localStorage.getItem("token");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", name);
    fd.append("description", description);
    const res = await fetch(`${BASE}/projects/${projectId}/datasets/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Upload failed" }));
      throw new Error(err.detail ?? "Upload failed");
    }
    return res.json();
  },
  downloadDataset: (datasetId: number) => {
    const token = localStorage.getItem("token");
    const url = `${BASE}/datasets/${datasetId}/download`;
    const a = document.createElement("a");
    a.href = url + (token ? `?token=${token}` : "");
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => {
        const cd = r.headers.get("content-disposition") || "";
        const match = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        const filename = match ? match[1].replace(/['"]/g, "") : "download";
        return r.blob().then(blob => ({ blob, filename }));
      })
      .then(({ blob, filename }) => {
        const burl = URL.createObjectURL(blob);
        a.href = burl;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(burl);
      });
  },
  updateDataset: (projectId: number, datasetId: number, body: { name?: string; description?: string; file_name?: string; file_size?: string }) =>
    request<ApiDataset>(`/projects/${projectId}/datasets/${datasetId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteDataset: (projectId: number, datasetId: number) =>
    request<void>(`/projects/${projectId}/datasets/${datasetId}`, { method: "DELETE" }),

  // ── Experiments ──────────────────────────────────────────────────────────────
  getExperiments: (projectId: number) =>
    request<ApiExperiment[]>(`/projects/${projectId}/experiments`),
  getExperiment: (projectId: number, experimentId: number) =>
    request<ApiExperiment>(`/projects/${projectId}/experiments/${experimentId}`),
  createExperiment: (projectId: number, body: { name: string; description?: string; notes?: string; attachments?: string }) =>
    request<ApiExperiment>(`/projects/${projectId}/experiments`, { method: "POST", body: JSON.stringify(body) }),
  uploadExperiment: async (
    projectId: number,
    fields: { name: string; description?: string; notes?: string; datasetIds?: number[] },
    file?: File | null,
  ): Promise<ApiExperiment> => {
    const token = localStorage.getItem("token");
    const fd = new FormData();
    fd.append("name", fields.name);
    fd.append("description", fields.description ?? "");
    fd.append("notes", fields.notes ?? "");
    fd.append("dataset_ids", (fields.datasetIds ?? []).join(","));
    if (file) fd.append("file", file);
    const res = await fetch(`${BASE}/projects/${projectId}/experiments/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Upload failed" }));
      throw new Error(err.detail ?? "Upload failed");
    }
    return res.json();
  },
  downloadExperiment: (experimentId: number) => {
    const token = localStorage.getItem("token");
    const url = `${BASE}/experiments/${experimentId}/download`;
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => {
        const cd = r.headers.get("content-disposition") || "";
        const match = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        const filename = match ? match[1].replace(/['"]/g, "") : "attachment";
        return r.blob().then(blob => ({ blob, filename }));
      })
      .then(({ blob, filename }) => {
        const burl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = burl;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(burl);
      });
  },
  updateExperiment: (projectId: number, experimentId: number, body: { name?: string; description?: string; notes?: string; attachments?: string }) =>
    request<ApiExperiment>(`/projects/${projectId}/experiments/${experimentId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteExperiment: (projectId: number, experimentId: number) =>
    request<void>(`/projects/${projectId}/experiments/${experimentId}`, { method: "DELETE" }),

  // ── Invites ───────────────────────────────────────────────────────────────────
  sendInvite: (body: { email: string; project_id: number; role: string }) =>
    request<ApiInvite>("/invite", { method: "POST", body: JSON.stringify(body) }),
  getInvites: () => request<ApiInvite[]>("/invite"),
  previewInvite: (token: string) =>
    request<ApiInvitePreview>(`/invite/preview/${token}`),
  acceptInvite: (token: string) =>
    request<ApiInviteAcceptResponse>(`/invite/accept/${token}`, { method: "POST" }),

  // ── Collaborators ─────────────────────────────────────────────────────────────
  getCollaborators: (projectId: number) =>
    request<ApiCollaborator[]>(`/projects/${projectId}/collaborators`),
  updateCollaboratorRole: (projectId: number, userId: number, role: string) =>
    request<ApiCollaborator>(`/projects/${projectId}/collaborators/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  removeCollaborator: (projectId: number, userId: number) =>
    request<void>(`/projects/${projectId}/collaborators/${userId}`, { method: "DELETE" }),

  // ── Access Requests ───────────────────────────────────────────────────────────
  requestRole: (projectId: number, requestedRole: string) =>
    request<ApiAccessRequest>(`/projects/${projectId}/request-role`, {
      method: "POST",
      body: JSON.stringify({ requested_role: requestedRole }),
    }),
  getAccessRequests: (projectId: number) =>
    request<ApiAccessRequest[]>(`/projects/${projectId}/requests`),
  getMyAccessRequests: (projectId: number) =>
    request<ApiAccessRequest[]>(`/projects/${projectId}/my-requests`),
  reviewAccessRequest: (requestId: number, status: "approved" | "rejected") =>
    request<ApiAccessRequest>(`/requests/${requestId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  // ── Citations ─────────────────────────────────────────────────────────────────
  getCitations: (projectId: number) =>
    request<ApiCitation[]>(`/projects/${projectId}/citations`),
  addCitationByDoi: (projectId: number, doi: string) =>
    request<ApiCitation>(`/projects/${projectId}/citations/doi`, {
      method: "POST",
      body: JSON.stringify({ doi }),
    }),
  importBibtex: (projectId: number, bibtex: string) =>
    request<ApiCitation[]>(`/projects/${projectId}/citations/bibtex`, {
      method: "POST",
      body: JSON.stringify({ bibtex }),
    }),
  deleteCitation: (projectId: number, citationId: number) =>
    request<void>(`/projects/${projectId}/citations/${citationId}`, { method: "DELETE" }),
  getCitationSuggestions: (projectId: number) =>
    request<{ suggestions: ApiSuggestion[] }>(`/projects/${projectId}/citations/suggestions`),
  getCitationSuggestionsByText: (projectId: number, text: string) =>
    request<{ suggestions: ApiSuggestion[] }>(`/projects/${projectId}/citations/suggestions`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  // ── Manuscript Versions ───────────────────────────────────────────────────────
  saveVersion: (projectId: number) =>
    request<ApiManuscriptVersion>(`/projects/${projectId}/manuscript/version`, { method: "POST" }),
  getVersionHistory: (projectId: number) =>
    request<ApiManuscriptVersion[]>(`/projects/${projectId}/manuscript/history`),

  // ── Contributions ─────────────────────────────────────────────────────────────
  getContributions: (projectId: number) =>
    request<ApiContribution[]>(`/projects/${projectId}/contributions`),
  getContributionSummary: (projectId: number) =>
    request<ApiContributionSummary>(`/projects/${projectId}/contributions/summary`),

  // ── Reviews ───────────────────────────────────────────────────────────────────
  assignReviewer: (payload: AssignReviewerPayload) =>
    request<ApiReview>("/reviews/assign", { method: "POST", body: JSON.stringify(payload) }),
  getProjectReviews: (projectId: number) =>
    request<ApiReview[]>(`/reviews/project/${projectId}`),
  getManuscriptReviews: (manuscriptId: number) =>
    request<ApiReview[]>(`/reviews/manuscript/${manuscriptId}`),
  getMyReviews: () =>
    request<ApiReview[]>("/reviews/mine"),
  addReviewComment: (reviewId: number, comments: string) =>
    request<ApiReview>(`/reviews/${reviewId}/comment`, {
      method: "POST",
      body: JSON.stringify({ comments }),
    }),
  submitReviewDecision: (reviewId: number, decision: string, comments?: string) =>
    request<ApiReview>(`/reviews/${reviewId}/decision`, {
      method: "PATCH",
      body: JSON.stringify({ decision, ...(comments ? { comments } : {}) }),
    }),
  getReviewHistory: (manuscriptId: number) =>
    request<ApiReview[]>(`/reviews/history/${manuscriptId}`),

  // ── Reproducibility ───────────────────────────────────────────────────────────
  getReproducibilityGraph: (projectId: number) =>
    request<ApiReproducibilityGraph>(`/reproducibility/project/${projectId}`),
  linkDatasetToExperiment: (payload: LinkDatasetPayload) =>
    request<unknown>("/reproducibility/link-dataset", { method: "POST", body: JSON.stringify(payload) }),
  linkExperimentToManuscript: (payload: LinkExperimentPayload) =>
    request<unknown>("/reproducibility/link-experiment", { method: "POST", body: JSON.stringify(payload) }),
  deleteDatasetLink: (linkId: number, projectId: number) =>
    request<void>(`/reproducibility/link-dataset/${linkId}?project_id=${projectId}`, { method: "DELETE" }),
  deleteExperimentLink: (linkId: number, projectId: number) =>
    request<void>(`/reproducibility/link-experiment/${linkId}?project_id=${projectId}`, { method: "DELETE" }),

  // ── Presence ──────────────────────────────────────────────────────────────────
  heartbeat: (projectId: number, currentTab?: string) =>
    request<{ status: string }>("/presence/heartbeat", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, current_tab: currentTab ?? null }),
    }),
  getPresence: (projectId: number) =>
    request<{
      user_id: number;
      email: string;
      current_tab: string | null;
      last_seen: string;
      is_me: boolean;
    }[]>(`/presence/project/${projectId}`),

  // ── IPFS ──────────────────────────────────────────────────────────────────────
  pinDataset: (datasetId: number) =>
    request<ApiIpfsResult>(`/ipfs/datasets/${datasetId}/pin`, { method: "POST" }),
  verifyDataset: (datasetId: number) =>
    request<ApiIpfsVerify>(`/ipfs/datasets/${datasetId}/verify`),
  pinExperiment: (experimentId: number) =>
    request<ApiIpfsResult>(`/ipfs/experiments/${experimentId}/pin`, { method: "POST" }),
  verifyExperiment: (experimentId: number) =>
    request<ApiIpfsVerify>(`/ipfs/experiments/${experimentId}/verify`),

  // ── Search ────────────────────────────────────────────────────────────────────
  searchProjects: (params: { q?: string; role?: string; created_by?: string; collaborator?: string }) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.role) qs.set("role", params.role);
    if (params.created_by) qs.set("created_by", params.created_by);
    if (params.collaborator) qs.set("collaborator", params.collaborator);
    return request<SearchProjectResult[]>(`/search/projects?${qs}`);
  },
  searchManuscripts: (q: string, projectId?: number) => {
    const qs = new URLSearchParams({ q });
    if (projectId) qs.set("project_id", String(projectId));
    return request<SearchManuscriptResult[]>(`/search/manuscripts?${qs}`);
  },
  searchDatasets: (q: string, projectId?: number) => {
    const qs = new URLSearchParams({ q });
    if (projectId) qs.set("project_id", String(projectId));
    return request<SearchDatasetResult[]>(`/search/datasets?${qs}`);
  },
  searchExperiments: (q: string, projectId?: number) => {
    const qs = new URLSearchParams({ q });
    if (projectId) qs.set("project_id", String(projectId));
    return request<SearchExperimentResult[]>(`/search/experiments?${qs}`);
  },

  // ── AI Writing ────────────────────────────────────────────────────────────────
  aiWriting: (action: "improve-writing" | "rewrite" | "clarity" | "grammar", text: string, projectId?: number) =>
    request<ApiAIWritingResponse>(`/ai/${action}`, {
      method: "POST",
      body: JSON.stringify({ text, ...(projectId ? { project_id: projectId } : {}) }),
    }),
};
