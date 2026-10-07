/**
 * Ligação da tela com o servidor — substitui o "@workspace/api-client-react"
 * que ficou preso na Replit. Cada função aqui chama um endereço /api/... .
 */
import {
  useQuery,
  useMutation,
  type UseQueryOptions,
  type UseMutationOptions,
  type QueryKey,
} from "@tanstack/react-query";

// ── Tipos ────────────────────────────────────────────────────────────────────
export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}
export interface FileContent {
  path: string;
  content: string;
  language: string;
  isBinary: boolean;
}
export interface Project {
  id: string;
  name: string;
  createdAt: string;
  fileCount: number;
  sizeBytes: number;
}
export interface ProjectDetail extends Project {
  tree: FileNode;
}
export interface Settings {
  aiApiKeySet: boolean;
  aiBaseUrl: string | null;
  aiModel: string | null;
  githubTokenSet: boolean;
}
export interface UpdateSettingsBody {
  aiApiKey?: string | null;
  aiBaseUrl?: string | null;
  aiModel?: string | null;
  githubToken?: string | null;
}
export interface ChatMessage { role: string; content: string }
export interface AiChatBody {
  messages: ChatMessage[];
  fileContext?: string | null;
  filePath?: string | null;
  projectId?: string | null;
  projectContext?: unknown;
  terminalContext?: unknown;
  [k: string]: unknown;
}
export interface AiChatResponse { reply: string; model?: string; [k: string]: any }

// ── Pedido básico ────────────────────────────────────────────────────────────
const BASE = ((import.meta as any).env?.BASE_URL ?? "/").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, message: string, data: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body && !(init.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: any = text;
  try { data = text ? JSON.parse(text) : undefined; } catch { /* resposta não é JSON */ }
  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && (data.error || data.message)) ||
      (typeof data === "string" && data.trim().startsWith("<")
        ? `O servidor não respondeu (erro ${res.status}). Ele está ligado?`
        : `Erro ${res.status}`);
    throw new ApiError(res.status, String(msg), data);
  }
  if (typeof data === "string" && data.trim().startsWith("<")) {
    throw new ApiError(res.status, "O servidor não respondeu (veio uma página no lugar). Ele está ligado?", data);
  }
  return data as T;
}

const json = (v: unknown) => JSON.stringify(v);
const qs = (p: Record<string, unknown>) =>
  "?" + new URLSearchParams(Object.entries(p).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString();

type QOpts<T> = { query?: Partial<UseQueryOptions<T, ApiError, T, QueryKey>> };
type MOpts<T, V> = { mutation?: UseMutationOptions<T, ApiError, V> };

// ── Chaves de cache ──────────────────────────────────────────────────────────
export const getListProjectsQueryKey = () => ["/api/projects"] as const;
export const getGetProjectQueryKey = (projectId: string) => [`/api/projects/${projectId}`] as const;
export const getGetFileContentQueryKey = (projectId: string, params?: { path: string }) =>
  (params ? [`/api/projects/${projectId}/files`, params] : [`/api/projects/${projectId}/files`]) as QueryKey;
export const getGetSettingsQueryKey = () => ["/api/settings"] as const;

// ── Consultas ────────────────────────────────────────────────────────────────
export function useListProjects(opts?: QOpts<Project[]>) {
  return useQuery<Project[], ApiError, Project[], QueryKey>({
    queryKey: getListProjectsQueryKey(),
    queryFn: () => apiFetch<Project[]>("/projects"),
    ...(opts?.query as object),
  });
}

export function useGetProject(projectId: string, opts?: QOpts<ProjectDetail>) {
  return useQuery<ProjectDetail, ApiError, ProjectDetail, QueryKey>({
    queryKey: getGetProjectQueryKey(projectId),
    queryFn: () => apiFetch<ProjectDetail>(`/projects/${encodeURIComponent(projectId)}`),
    enabled: !!projectId,
    ...(opts?.query as object),
  });
}

export function useGetFileContent(projectId: string, params: { path: string }, opts?: QOpts<FileContent>) {
  return useQuery<FileContent, ApiError, FileContent, QueryKey>({
    queryKey: getGetFileContentQueryKey(projectId, params),
    queryFn: () => apiFetch<FileContent>(`/projects/${encodeURIComponent(projectId)}/files${qs(params)}`),
    ...(opts?.query as object),
  });
}

export function useGetSettings(opts?: QOpts<Settings>) {
  return useQuery<Settings, ApiError, Settings, QueryKey>({
    queryKey: getGetSettingsQueryKey(),
    queryFn: () => apiFetch<Settings>("/settings"),
    ...(opts?.query as object),
  });
}

// ── Ações ────────────────────────────────────────────────────────────────────
export function useUpdateSettings(opts?: MOpts<Settings, { data: UpdateSettingsBody }>) {
  return useMutation<Settings, ApiError, { data: UpdateSettingsBody }>({
    mutationFn: ({ data }) => apiFetch<Settings>("/settings", { method: "PUT", body: json(data) }),
    ...opts?.mutation,
  });
}

export function useUploadProject(opts?: MOpts<Project, { data: { file: Blob; name?: string } }>) {
  return useMutation<Project, ApiError, { data: { file: Blob; name?: string } }>({
    mutationFn: ({ data }) => {
      const fd = new FormData();
      fd.append("file", data.file, (data.file as File).name || "projeto.zip");
      if (data.name) fd.append("name", data.name);
      return apiFetch<Project>("/projects", { method: "POST", body: fd });
    },
    ...opts?.mutation,
  });
}

export function useDeleteProject(opts?: MOpts<void, { projectId: string }>) {
  return useMutation<void, ApiError, { projectId: string }>({
    mutationFn: ({ projectId }) => apiFetch<void>(`/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" }),
    ...opts?.mutation,
  });
}

export function useImportFromGithub(opts?: MOpts<Project, { data: { repoUrl: string; branch?: string | null } }>) {
  return useMutation<Project, ApiError, { data: { repoUrl: string; branch?: string | null } }>({
    mutationFn: ({ data }) => apiFetch<Project>("/projects/import-github", { method: "POST", body: json(data) }),
    ...opts?.mutation,
  });
}

export function useWriteFile(opts?: MOpts<any, { projectId: string; data: { path: string; content: string } }>) {
  return useMutation<any, ApiError, { projectId: string; data: { path: string; content: string } }>({
    mutationFn: ({ projectId, data }) =>
      apiFetch(`/projects/${encodeURIComponent(projectId)}/files`, { method: "PUT", body: json(data) }),
    ...opts?.mutation,
  });
}

export function useDeleteFile(opts?: MOpts<void, { projectId: string; params: { path: string } }>) {
  return useMutation<void, ApiError, { projectId: string; params: { path: string } }>({
    mutationFn: ({ projectId, params }) =>
      apiFetch<void>(`/projects/${encodeURIComponent(projectId)}/files${qs(params)}`, { method: "DELETE" }),
    ...opts?.mutation,
  });
}

export function useAiChat(opts?: MOpts<AiChatResponse, { data: AiChatBody }>) {
  return useMutation<AiChatResponse, ApiError, { data: AiChatBody }>({
    mutationFn: ({ data }) => apiFetch<AiChatResponse>("/ai/chat", { method: "POST", body: json(data) }),
    ...opts?.mutation,
  });
}

export function useCreateGithubRepo(opts?: MOpts<any, { data: any }>) {
  return useMutation<any, ApiError, { data: any }>({
    mutationFn: ({ data }) => apiFetch("/github/create-repo", { method: "POST", body: json(data) }),
    ...opts?.mutation,
  });
}
