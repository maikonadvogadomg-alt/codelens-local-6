import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  Loader2,
  FileX,
  ChevronLeft,
  ChevronRight,
  Eye,
  Save,
  X,
  Pencil,
} from "lucide-react";
import type { FileContent } from "@workspace/api-client-react";
import { useWriteFile, getGetProjectQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { CodeEditor } from "./code-editor";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";

interface CodeViewerProps {
  file: FileContent | undefined;
  isLoading: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onBack?: () => void;
  onForward?: () => void;
  /** Called when user clicks "Visualizar" on an HTML/SVG file */
  onPreview?: (filePath: string) => void;
  /** Project ID – enables inline editing + save */
  projectId?: string;
}

const PREVIEWABLE_EXTS = new Set(["html", "htm", "svg"]);

// Map file language to highlight.js aliases (view-only fallback for binary)
const LANG_MAP: Record<string, string> = {
  typescript: "typescript", tsx: "typescript", javascript: "javascript",
  jsx: "javascript", python: "python", rust: "rust", go: "go",
  java: "java", css: "css", scss: "scss", html: "html", xml: "xml",
  json: "json", yaml: "yaml", markdown: "markdown", md: "markdown",
  bash: "bash", sh: "bash", shell: "bash", sql: "sql", php: "php",
  ruby: "ruby", cpp: "cpp", c: "c", csharp: "csharp", swift: "swift",
  kotlin: "kotlin", dart: "dart", toml: "ini", dockerfile: "dockerfile",
};

export function CodeViewer({
  file,
  isLoading,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onPreview,
  projectId,
}: CodeViewerProps) {
  const ext = file?.path?.split(".").pop()?.toLowerCase() ?? "";
  const isPreviewable = PREVIEWABLE_EXTS.has(ext);
  const canEdit = !!projectId && !!file && !file.isBinary;

  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const writeMutation = useWriteFile();

  const enterEdit = useCallback(() => {
    setEditContent(file?.content ?? "");
    setEditMode(true);
  }, [file?.content]);

  const cancelEdit = useCallback(() => {
    setEditMode(false);
    setEditContent("");
  }, []);

  const saveFile = useCallback(async () => {
    if (!file || !projectId) return;
    setSaving(true);
    try {
      await writeMutation.mutateAsync({
        projectId,
        data: { path: file.path, content: editContent },
      });
      queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/files`] });
      setEditMode(false);
      toast({ title: "Arquivo salvo" });
    } catch (e: unknown) {
      toast({ title: "Erro ao salvar", description: e instanceof Error ? e.message : "Erro", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [file, projectId, editContent, writeMutation, queryClient, toast]);

  // Exit edit mode when file changes
  useEffect(() => {
    setEditMode(false);
    setEditContent("");
  }, [file?.path]);

  // ── View-mode: hljs highlighted (used only for line count display) ─────────
  const { lineCount } = useMemo(() => {
    if (!file?.content) return { lineCount: 0 };
    return { lineCount: (file.content.match(/\n/g)?.length ?? 0) + 1 };
  }, [file?.content]);

  const displayLineCount = editMode
    ? (editContent.match(/\n/g)?.length ?? 0) + 1
    : lineCount;

  // ─── States ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[#0d1117]">
        <Loader2 className="w-6 h-6 animate-spin text-[#8b949e]" />
      </div>
    );
  }

  if (!file) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-[#0d1117] text-[#8b949e]">
        <FileX className="w-12 h-12 mb-4 opacity-40" />
        <p className="text-sm">Selecione um arquivo para ver o conteúdo</p>
      </div>
    );
  }

  if (file.isBinary) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-[#0d1117] text-[#8b949e]">
        <FileX className="w-12 h-12 mb-4 opacity-40" />
        <p className="text-sm">Arquivo binário não pode ser exibido</p>
        <p className="text-xs opacity-70 mt-1 font-mono">{file.path}</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-[#0d1117] overflow-hidden">
      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div className="h-10 shrink-0 border-b border-[#30363d] bg-[#161b22] flex items-center px-2 gap-1 overflow-x-auto">
        {/* Back / Forward */}
        <button onClick={onBack} disabled={!canGoBack}
          className="p-1.5 rounded text-[#8b949e] hover:text-[#e6edf3] disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
          title="Arquivo anterior">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={onForward} disabled={!canGoForward}
          className="p-1.5 rounded text-[#8b949e] hover:text-[#e6edf3] disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
          title="Próximo arquivo">
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-[#30363d] mx-1 shrink-0" />

        {/* File name */}
        <span className="text-sm text-[#c9d1d9] font-mono truncate flex-1 min-w-0">
          {file.path.split("/").pop()}
          {editMode && (
            <span className="ml-1.5 text-[10px] text-yellow-400 font-medium">• editando</span>
          )}
        </span>

        {/* Full path */}
        <span className="text-[10px] text-[#8b949e] truncate hidden md:block max-w-[200px] shrink-0">
          {file.path}
        </span>

        <div className="w-px h-5 bg-[#30363d] mx-1 shrink-0" />

        {/* Preview button for HTML/SVG */}
        {isPreviewable && onPreview && !editMode && (
          <button onClick={() => onPreview(file.path)}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/30 transition-colors shrink-0">
            <Eye className="w-3 h-3" />
            Visualizar
          </button>
        )}

        {/* Edit / Save / Cancel */}
        {canEdit && !editMode && (
          <button onClick={enterEdit}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#30363d] text-[#8b949e] hover:text-[#e6edf3] border border-[#444d56] transition-colors shrink-0"
            title="Editar arquivo (duplo clique também funciona)">
            <Pencil className="w-3 h-3" />
            Editar
          </button>
        )}

        {editMode && (
          <>
            <button onClick={saveFile} disabled={saving}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30 transition-colors shrink-0"
              title="Salvar (Ctrl+S)">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Salvar
            </button>
            <button onClick={cancelEdit}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#30363d] text-[#8b949e] hover:text-[#e6edf3] border border-[#444d56] transition-colors shrink-0"
              title="Cancelar (Esc)">
              <X className="w-3 h-3" />
              Cancelar
            </button>
          </>
        )}

        {/* Language + line count */}
        {file.language && (
          <span className="text-[10px] uppercase tracking-wider font-semibold text-[#8b949e] shrink-0">
            {file.language}
          </span>
        )}
        <span className="text-[10px] text-[#8b949e] shrink-0 tabular-nums ml-1">
          {displayLineCount} ln
        </span>
      </div>

      {/* ── Code area ────────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-hidden"
        onDoubleClick={canEdit && !editMode ? enterEdit : undefined}
      >
        {editMode ? (
          /* ── CodeMirror editor (full syntax highlight + line numbers) ── */
          <CodeEditor
            key={file.path}
            value={editContent}
            onChange={setEditContent}
            language={file.language}
            path={file.path}
            onSave={saveFile}
            onCancel={cancelEdit}
          />
        ) : (
          /* ── View mode: hljs highlight + line numbers ─────────────────── */
          <ViewerBody file={file} />
        )}
      </div>
    </div>
  );
}

// ─── View-mode body ────────────────────────────────────────────────────────────

function ViewerBody({ file }: { file: FileContent }) {
  const { highlighted, lineCount } = useMemo(() => {
    if (!file.content) return { highlighted: "", lineCount: 0 };
    const lang = file.language ? LANG_MAP[file.language.toLowerCase()] : undefined;
    try {
      const result =
        lang && hljs.getLanguage(lang)
          ? hljs.highlight(file.content, { language: lang })
          : hljs.highlightAuto(file.content);
      return {
        highlighted: result.value,
        lineCount: (file.content.match(/\n/g)?.length ?? 0) + 1,
      };
    } catch {
      return {
        highlighted: file.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
        lineCount: (file.content.match(/\n/g)?.length ?? 0) + 1,
      };
    }
  }, [file.content, file.language]);

  const lineNumWidth = Math.max(String(lineCount).length, 2);

  return (
    <div className="h-full w-full overflow-auto flex bg-[#0d1117]">
      {/* Line numbers */}
      <div
        className="select-none text-right text-[#8b949e] text-[12px] font-mono leading-relaxed pt-3 pb-3 pr-3 pl-4 border-r border-[#30363d] shrink-0"
        style={{
          minWidth: `${lineNumWidth + 3}ch`,
          fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
        }}
        aria-hidden="true"
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i + 1} className="leading-relaxed hover:text-[#c9d1d9]">
            {i + 1}
          </div>
        ))}
      </div>
      {/* Highlighted code */}
      <pre
        className="flex-1 pl-4 pr-6 pt-3 pb-3 text-[13px] font-mono leading-relaxed overflow-x-auto m-0 bg-transparent"
        style={{
          tabSize: 2,
          fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
        }}
      >
        <code className="hljs" dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  );
}
