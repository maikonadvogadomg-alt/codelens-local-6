import React, { useEffect, useState } from "react";
import { CartaoConta, ListaRepos, useContaGithub } from "@/components/github-conta";
import { useLocation, Link } from "wouter";
import { format } from "date-fns";
import {
  useListProjects,
  useUploadProject,
  useDeleteProject,
  useImportFromGithub,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Trash2,
  FolderArchive,
  Loader2,
  Clock,
  HardDrive,
  FileCode2,
  Github,
  Upload,
  FileText,
  Globe,
  Box,
  Atom,
  PlaySquare,
  MessageSquare,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { formatBytes, cn } from "@/lib/utils";

// ─── Templates ───────────────────────────────────────────────────────────────

interface Template {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  badge?: { text: string; color: string };
}

const TEMPLATES: Template[] = [
  {
    id: "html",
    label: "HTML + CSS + JS",
    description: "Site estático pronto. Preview funciona na hora, sem instalar nada.",
    icon: <Globe className="w-5 h-5" />,
    color: "text-orange-400",
    badge: { text: "👁 PREVIEW IMEDIATO", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  },
  {
    id: "node",
    label: "Node.js (servidor)",
    description: "Servidor HTTP sem dependências. Clique em Iniciar no Preview para rodar.",
    icon: <Box className="w-5 h-5" />,
    color: "text-green-400",
    badge: { text: "🟢 AO VIVO (1 clique)", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  },
  {
    id: "express",
    label: "Express + API",
    description: "Servidor Express com rota de API. Requer npm install, depois Iniciar.",
    icon: <Box className="w-5 h-5" />,
    color: "text-emerald-400",
    badge: { text: "npm install primeiro", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/20" },
  },
  {
    id: "react",
    label: "React + Vite",
    description: "App com React. Requer npm install e npm run dev para ver ao vivo.",
    icon: <Atom className="w-5 h-5" />,
    color: "text-blue-400",
    badge: { text: "npm install primeiro", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/20" },
  },
  {
    id: "blank",
    label: "Projeto em Branco",
    description: "Só um README.md. Para começar do zero ou importar código.",
    icon: <FileText className="w-5 h-5" />,
    color: "text-gray-400",
    badge: { text: "sem preview", color: "bg-gray-500/20 text-gray-400 border-gray-500/20" },
  },
];

// ─── Project type colors ──────────────────────────────────────────────────────

const PROJECT_COLORS = [
  "#E50914", "#e67e22", "#27ae60", "#2980b9",
  "#8e44ad", "#16a085", "#c0392b", "#d35400",
];

function projectColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length];
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Home() {
  const gh = useContaGithub();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [githubDialogOpen, setGithubDialogOpen] = useState(false);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectTemplate, setNewProjectTemplate] = useState("html");
  const [isCreatingBlank, setIsCreatingBlank] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: projects, isLoading } = useListProjects({
    query: { queryKey: getListProjectsQueryKey() },
  });

  const uploadMutation = useUploadProject({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        toast({ title: "Projeto enviado com sucesso" });
        setLocation(`/projects/${data.id}`);
      },
      onError: (error) => {
        toast({ title: "Falha no upload", description: error.message || "Arquivo muito grande ou ZIP inválido", variant: "destructive" });
      },
    },
  });

  const importGithubMutation = useImportFromGithub({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        toast({ title: `Repositório "${data.name}" importado com sucesso` });
        setGithubDialogOpen(false);
        setRepoUrl(""); setBranch("");
        setLocation(`/projects/${data.id}`);
      },
      onError: (error) => {
        toast({ title: "Falha ao importar", description: error.message || "Erro desconhecido", variant: "destructive" });
      },
    },
  });

  const deleteMutation = useDeleteProject({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        toast({ title: "Projeto excluído" });
        setDeleteTarget(null);
      },
      onError: () => {
        toast({ title: "Erro ao excluir projeto", variant: "destructive" });
        setDeleteTarget(null);
      },
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.(zip|tar|tgz|tar\.gz)$/i.test(file.name)) {
      toast({ title: "Tipo de arquivo inválido", description: "Envie um arquivo .zip, .tar, .tar.gz ou .tgz", variant: "destructive" });
      e.target.value = ""; return;
    }
    const maxSize = 4 * 1024 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({ title: "Arquivo muito grande", description: `O arquivo não pode passar de 4 GB`, variant: "destructive" });
      e.target.value = ""; return;
    }
    uploadMutation.mutate({ data: { file, name: file.name.replace(/\.(zip|tgz|tar\.gz|tar)$/i, "") } });
    e.target.value = "";
  };

  const handleDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.preventDefault(); e.stopPropagation();
    setDeleteTarget({ id, name });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ projectId: deleteTarget.id });
  };

  useEffect(() => { if (githubDialogOpen) gh.carregar(); }, [githubDialogOpen]); // eslint-disable-line
  const handleGithubImport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    importGithubMutation.mutate({ data: { repoUrl: repoUrl.trim(), branch: branch.trim() || null } });
  };

  const handleCreateBlank = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProjectName.trim() || "Novo Projeto";
    setIsCreatingBlank(true);
    try {
      const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const resp = await fetch(`${base}/api/projects/blank`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, template: newProjectTemplate }),
      });
      if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.error || "Falha ao criar projeto"); }
      const data = await resp.json();
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      toast({ title: `Projeto "${data.name}" criado com sucesso` });
      setNewProjectDialogOpen(false);
      setNewProjectName(""); setNewProjectTemplate("blank");
      setLocation(`/projects/${data.id}`);
    } catch (err: any) {
      toast({ title: "Erro ao criar projeto", description: err.message, variant: "destructive" });
    } finally { setIsCreatingBlank(false); }
  };

  const isUploading = uploadMutation.isPending || importGithubMutation.isPending;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="flex-1 overflow-auto" style={{ background: "#141414" }}>

        {/* ── HERO ────────────────────────────────────────────────────────── */}
        <div
          className="relative w-full overflow-hidden"
          style={{
            background: "linear-gradient(105deg, #000 0%, #1a0000 40%, #141414 100%)",
            minHeight: 220,
          }}
        >
          {/* Decorative grid lines */}
          <div className="absolute inset-0 opacity-[0.04]"
            style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "40px 40px" }} />
          {/* Red left accent bar */}
          <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: "#E50914" }} />

          <div className="relative px-8 sm:px-12 py-10 sm:py-14 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="font-black text-4xl sm:text-5xl tracking-tight" style={{ color: "#E50914" }}>N</span>
                <h1 className="font-black text-2xl sm:text-3xl tracking-widest uppercase" style={{ color: "#e5e5e5", letterSpacing: "0.2em" }}>
                  CodeLens
                </h1>
              </div>
              <p className="text-sm sm:text-base" style={{ color: "#aaa", maxWidth: 420, lineHeight: 1.6 }}>
                Seu ambiente de desenvolvimento completo — edite, execute, visualize e use IA direto no navegador.
              </p>
              <div className="flex flex-wrap gap-3 mt-5">
                <button
                  onClick={() => setNewProjectDialogOpen(true)}
                  disabled={isUploading}
                  className="flex items-center gap-2 px-5 py-2 rounded font-semibold text-sm transition-all hover:opacity-90 active:scale-95"
                  style={{ background: "#E50914", color: "#fff" }}
                >
                  <Plus className="w-4 h-4" /> Novo Projeto
                </button>
                <button
                  onClick={() => setGithubDialogOpen(true)}
                  disabled={isUploading}
                  className="flex items-center gap-2 px-5 py-2 rounded font-semibold text-sm transition-all hover:opacity-90"
                  style={{ background: "rgba(255,255,255,0.1)", color: "#e5e5e5", border: "1px solid rgba(255,255,255,0.15)" }}
                >
                  <Github className="w-4 h-4" /> GitHub
                </button>
                <label className="flex items-center gap-2 px-5 py-2 rounded font-semibold text-sm cursor-pointer transition-all hover:opacity-90"
                  style={{ background: "rgba(255,255,255,0.1)", color: "#e5e5e5", border: "1px solid rgba(255,255,255,0.15)" }}>
                  <input id="zip-file-input" type="file" accept=".zip,.tar,.tgz,.gz,application/zip,application/x-tar,application/gzip" className="sr-only" onChange={handleFileSelect} disabled={isUploading} />
                  {uploadMutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                    : <><Upload className="w-4 h-4" /> Upload ZIP</>}
                </label>
              </div>
            </div>

            {/* Feature pills */}
            <div className="flex flex-col gap-2 shrink-0">
              {[
                { icon: <Sparkles className="w-3.5 h-3.5" />, label: "IA com sua chave" },
                { icon: <PlaySquare className="w-3.5 h-3.5" />, label: "Playground HTML / React / Python" },
                { icon: <MessageSquare className="w-3.5 h-3.5" />, label: "Assistente Livre" },
              ].map(({ icon, label }) => (
                <div key={label} className="flex items-center gap-2 text-xs" style={{ color: "#888" }}>
                  <span style={{ color: "#E50914" }}>{icon}</span>
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── PROJECTS ─────────────────────────────────────────────────────── */}
        <div className="px-6 sm:px-10 pt-8 pb-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-1 h-5 rounded-full" style={{ background: "#E50914" }} />
            <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "#888" }}>Meus Projetos</h2>
            {projects && projects.length > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "#E50914", color: "#fff" }}>
                {projects.length}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-44 rounded-lg animate-pulse" style={{ background: "#1a1a1a" }} />
              ))}
            </div>
          ) : projects && projects.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {projects.map((project) => {
                const color = projectColor(project.name);
                const displayName = project.name.includes("/") ? project.name.split("/")[1] : project.name;
                const isGithub = project.name.includes("/");
                return (
                  <Link key={project.id} href={`/projects/${project.id}`}>
                    <div
                      className="group relative rounded-lg overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.04] hover:z-10"
                      style={{
                        background: "#1a1a1a",
                        border: "1px solid #2a2a2a",
                        height: 176,
                      }}
                    >
                      {/* Colored top bar */}
                      <div className="h-1 w-full" style={{ background: color }} />

                      {/* Card body */}
                      <div className="flex flex-col h-[calc(100%-4px)] p-3">
                        {/* Icon + delete */}
                        <div className="flex items-start justify-between mb-3">
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-black text-lg shrink-0"
                            style={{ background: color + "22", color }}
                          >
                            {isGithub ? <Github className="w-5 h-5" /> : displayName.charAt(0).toUpperCase()}
                          </div>
                          <button
                            onClick={(e) => handleDelete(e, project.id, project.name)}
                            disabled={deleteMutation.isPending}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                            style={{ background: "rgba(229,9,20,0.15)", color: "#E50914" }}
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Name */}
                        <div className="flex-1 min-h-0">
                          <p className="font-bold text-sm leading-tight line-clamp-2" style={{ color: "#e5e5e5" }} title={displayName}>
                            {displayName}
                          </p>
                          {isGithub && (
                            <p className="text-[10px] mt-0.5 truncate" style={{ color: "#666" }}>
                              {project.name.split("/")[0]}
                            </p>
                          )}
                        </div>

                        {/* Meta */}
                        <div className="grid grid-cols-2 gap-1 mt-2 text-[10px]" style={{ color: "#555" }}>
                          <div className="flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {format(new Date(project.createdAt), "dd/MM/yy")}
                          </div>
                          <div className="flex items-center gap-1">
                            <HardDrive className="w-2.5 h-2.5" />
                            {formatBytes(project.sizeBytes)}
                          </div>
                          <div className="flex items-center gap-1 col-span-2">
                            <FileCode2 className="w-2.5 h-2.5" />
                            {project.fileCount} arquivos
                          </div>
                        </div>
                      </div>

                      {/* Hover overlay — red border glow */}
                      <div
                        className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                        style={{ border: `2px solid ${color}`, boxShadow: `0 0 20px ${color}33` }}
                      />
                    </div>
                  </Link>
                );
              })}

              {/* Add new card */}
              <button
                onClick={() => setNewProjectDialogOpen(true)}
                className="group rounded-lg flex flex-col items-center justify-center gap-2 transition-all duration-300 hover:scale-[1.04]"
                style={{ height: 176, background: "#1a1a1a", border: "1px dashed #333" }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
                  style={{ background: "rgba(229,9,20,0.12)", color: "#E50914" }}
                >
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#555" }}>
                  Novo
                </span>
              </button>
            </div>
          ) : (
            /* Empty state */
            <div
              className="flex flex-col items-center justify-center py-16 px-8 rounded-xl text-center"
              style={{ background: "#1a1a1a", border: "1px dashed #2a2a2a" }}
            >
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: "rgba(229,9,20,0.1)" }}>
                <FolderArchive className="w-8 h-8" style={{ color: "#E50914" }} />
              </div>
              <h3 className="text-lg font-bold mb-1" style={{ color: "#e5e5e5" }}>Nenhum projeto ainda</h3>
              <p className="text-sm mb-6 max-w-sm" style={{ color: "#666" }}>
                Crie um novo projeto, envie um ZIP ou importe do GitHub para começar.
              </p>
              <div className="flex gap-3 flex-wrap justify-center">
                <button
                  onClick={() => setNewProjectDialogOpen(true)}
                  className="flex items-center gap-2 px-5 py-2 rounded font-semibold text-sm transition-all hover:opacity-90"
                  style={{ background: "#E50914", color: "#fff" }}
                >
                  <Plus className="w-4 h-4" /> Novo Projeto
                </button>
                <button
                  onClick={() => setGithubDialogOpen(true)}
                  className="flex items-center gap-2 px-5 py-2 rounded font-semibold text-sm transition-all hover:opacity-90"
                  style={{ background: "rgba(255,255,255,0.08)", color: "#e5e5e5", border: "1px solid rgba(255,255,255,0.15)" }}
                >
                  <Github className="w-4 h-4" /> GitHub
                </button>
                <label
                  className="flex items-center gap-2 px-5 py-2 rounded font-semibold text-sm cursor-pointer transition-all hover:opacity-90"
                  style={{ background: "rgba(255,255,255,0.08)", color: "#e5e5e5", border: "1px solid rgba(255,255,255,0.15)" }}
                >
                  <Upload className="w-4 h-4" /> Upload ZIP
                </label>
              </div>
            </div>
          )}
        </div>

        {/* ── QUICK ACCESS ─────────────────────────────────────────────────── */}
        <div className="px-6 sm:px-10 pt-0 pb-16">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-5 rounded-full" style={{ background: "#E50914" }} />
            <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "#888" }}>Ferramentas separadas</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/playground">
              <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg cursor-pointer transition-all hover:scale-[1.02] group"
                style={{ background: "#1f1f1f", border: "1px solid #2a2a2a" }}>
                <PlaySquare className="w-4 h-4" style={{ color: "#E50914" }} />
                <div>
                  <div className="text-sm font-semibold" style={{ color: "#e5e5e5" }}>Playground</div>
                  <div className="text-[10px]" style={{ color: "#666" }}>HTML · React · Python</div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 ml-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "#E50914" }} />
              </div>
            </Link>
            <Link href="/assistant">
              <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg cursor-pointer transition-all hover:scale-[1.02] group"
                style={{ background: "#1f1f1f", border: "1px solid #2a2a2a" }}>
                <MessageSquare className="w-4 h-4" style={{ color: "#E50914" }} />
                <div>
                  <div className="text-sm font-semibold" style={{ color: "#e5e5e5" }}>Assistente Livre</div>
                  <div className="text-[10px]" style={{ color: "#666" }}>Groq · Gemini · OpenAI · xAI...</div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 ml-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "#E50914" }} />
              </div>
            </Link>
          </div>
        </div>

      </div>

      {/* ─── Novo Projeto Dialog ─────────────────────────────────────────────── */}
      <Dialog open={newProjectDialogOpen} onOpenChange={setNewProjectDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" style={{ color: "#E50914" }} />
              Novo Projeto
            </DialogTitle>
            <DialogDescription>
              O template <strong>HTML + CSS + JS</strong> abre o preview na hora — ideal para começar.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateBlank}>
            <div className="space-y-5 py-2">
              <div className="space-y-2">
                <Label htmlFor="projectName">Nome do projeto</Label>
                <Input
                  id="projectName"
                  placeholder="Meu Projeto"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  disabled={isCreatingBlank}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Template</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setNewProjectTemplate(t.id)}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                        newProjectTemplate === t.id
                          ? "ring-1"
                          : "hover:bg-accent/30"
                      )}
                      style={
                        newProjectTemplate === t.id
                          ? { borderColor: "#E50914", background: "rgba(229,9,20,0.07)", boxShadow: "0 0 0 1px #E50914" }
                          : { borderColor: "#2a2a2a" }
                      }
                    >
                      <div className={cn("p-1.5 rounded shrink-0 mt-0.5", t.color)}>
                        {t.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold" style={{ color: "#e5e5e5" }}>{t.label}</p>
                          {t.badge && (
                            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full border whitespace-nowrap", t.badge.color)}>
                              {t.badge.text}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] mt-0.5" style={{ color: "#666" }}>{t.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setNewProjectDialogOpen(false)} disabled={isCreatingBlank}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isCreatingBlank}
                className="gap-2"
                style={{ background: "#E50914", color: "#fff", border: "none" }}
              >
                {isCreatingBlank ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</> : <><Plus className="w-4 h-4" /> Criar Projeto</>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── GitHub Import Dialog ───────────────────────────────────────────── */}
      <Dialog open={githubDialogOpen} onOpenChange={setGithubDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Github className="w-5 h-5" />
              Importar do GitHub
            </DialogTitle>
            <DialogDescription>
              Escolha um dos seus repositórios, ou cole a URL de qualquer repositório.
            </DialogDescription>
          </DialogHeader>
          <CartaoConta conta={gh.conta} carregando={gh.carregando} onMudou={gh.carregar} />
          {gh.conta?.conectado && (
            <ListaRepos repos={gh.repos} rotuloAcao="Importar" ocupado={importGithubMutation.isPending ? repoUrl : null}
              acao={(r) => { setRepoUrl(r.nome); importGithubMutation.mutate({ data: { repoUrl: r.nome, branch: null } }); }} />
          )}
          <form onSubmit={handleGithubImport}>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="repoUrl">URL do Repositório</Label>
                <Input
                  id="repoUrl"
                  placeholder="https://github.com/usuario/repositorio"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  disabled={importGithubMutation.isPending}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch">Branch <span style={{ color: "#666", fontWeight: 400 }}>(opcional)</span></Label>
                <Input
                  id="branch"
                  placeholder="main"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  disabled={importGithubMutation.isPending}
                />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setGithubDialogOpen(false)} disabled={importGithubMutation.isPending}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={!repoUrl.trim() || importGithubMutation.isPending}
                className="gap-2"
                style={{ background: "#E50914", color: "#fff", border: "none" }}
              >
                {importGithubMutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando...</>
                  : <><Github className="w-4 h-4" /> Importar</>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation ─────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir projeto?</AlertDialogTitle>
            <AlertDialogDescription>
              O projeto <strong>"{deleteTarget?.name}"</strong> e todos os seus arquivos serão excluídos permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              style={{ background: "#E50914", color: "#fff" }}
              className="gap-2"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
