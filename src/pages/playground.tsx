import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Play, Code2, Eye, Copy, Download, Trash2, FileCode, Paintbrush, Braces,
  Save, FolderOpen, RotateCcw, Pencil, Check, X, Search, CodeXml, Upload,
  Maximize, PanelLeftClose, PanelLeftOpen, Atom, Terminal, Globe, Loader2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ─── Types ───────────────────────────────────────────────────────────────────

type PlaygroundMode = "html" | "react" | "python";
type ActiveTab = "html" | "css" | "js" | "jsx" | "python";
type MobileView = "editor" | "preview";

export interface Snippet {
  id: string;
  title: string;
  html: string;
  css: string;
  js: string;
  mode: string;
  createdAt: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

function apiBase() {
  return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${apiBase()}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_HTML = `<div style="max-width:600px;margin:40px auto;padding:20px;font-family:sans-serif;">
  <h1 style="color:#333;">Bem-vindo ao HTML Playground</h1>
  <p style="color:#666;margin:16px 0;">Cole seu código HTML aqui e veja o resultado ao vivo!</p>
  <button onclick="alert('Funcionou!')" style="padding:10px 24px;font-size:16px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;">Clique aqui</button>
</div>`;

const DEFAULT_JSX = `// React Playground — componente App() renderizado automaticamente
const { useState, useEffect } = React;

function App() {
  const [count, setCount] = useState(0);
  return (
    <div style={{maxWidth:480,margin:"40px auto",padding:24,fontFamily:"system-ui,sans-serif",textAlign:"center"}}>
      <h1 style={{color:"#6366f1",marginBottom:8}}>React Playground</h1>
      <p style={{color:"#64748b"}}>Edite e veja o resultado ao vivo.</p>
      <div style={{margin:"24px 0",fontSize:48,fontWeight:"bold",color:"#1e293b"}}>{count}</div>
      <button
        onClick={() => setCount(c => c + 1)}
        style={{padding:"10px 28px",background:"#6366f1",color:"white",border:"none",borderRadius:8,fontSize:16,cursor:"pointer"}}
      >
        +1
      </button>
      <button
        onClick={() => setCount(0)}
        style={{marginLeft:8,padding:"10px 20px",background:"#e2e8f0",color:"#1e293b",border:"none",borderRadius:8,fontSize:16,cursor:"pointer"}}
      >
        Reset
      </button>
    </div>
  );
}`;

const DEFAULT_PYTHON = `# Python no servidor — use print() para ver resultados
import math

dados = [10, 25, 3, 47, 8, 15]
print("Dados:", dados)
print("Maior:", max(dados))
print("Menor:", min(dados))
print("Média:", sum(dados) / len(dados))
print("Raiz de 2:", round(math.sqrt(2), 6))
`;

const DEFAULT_CSS = ``;
const DEFAULT_JS = `// JavaScript extra (além do HTML)
console.log("Playground pronto!");`;

const AUTOSAVE_KEY = "codelens-playground-autosave";

// ─── Mode detection ───────────────────────────────────────────────────────────

function detectMode(code: string): PlaygroundMode | null {
  const c = code.trim();
  if (/import\s+React/i.test(c) || /from ['"]react['"]/i.test(c) || /<[A-Z][a-zA-Z]*[\s/>]/.test(c)
    || /useState|useEffect|useRef|useCallback/i.test(c)) return "react";
  if (!c.includes("<") && (
    /^(def |class |import |from |print\()/im.test(c)
    || /:\s*\n\s+/.test(c)
  )) return "python";
  return null;
}

function preprocessJSX(code: string): string {
  return code
    .replace(/^import\s+React[^;]*;?\s*\n?/gm, "")
    .replace(/^import\s+ReactDOM[^;]*;?\s*\n?/gm, "")
    .replace(/^import\s+\{[^}]*\}\s+from\s+['"]react['"][;]?\s*\n?/gm, "")
    .replace(/^export\s+default\s+function\s+(\w+)/gm, "function $1")
    .replace(/^export\s+default\s+(\w+)\s*;?\s*$/gm, "")
    .replace(/^export\s+\{[^}]*\}\s*;?\s*$/gm, "");
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Playground() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const mobileIframeRef = useRef<HTMLIFrameElement>(null);
  const htmlFileInputRef = useRef<HTMLInputElement>(null);
  const prevBlobUrl = useRef<string | null>(null);

  const load = <T,>(key: string, fallback: T): T => {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) return (JSON.parse(saved)[key] as T) ?? fallback;
    } catch {}
    return fallback;
  };

  const [html, setHtml] = useState(() => load("html", DEFAULT_HTML));
  const [css, setCss] = useState(() => load("css", DEFAULT_CSS));
  const [js, setJs] = useState(() => load("js", DEFAULT_JS));
  const [jsx, setJsx] = useState(() => load("jsx", DEFAULT_JSX));
  const [python, setPython] = useState(() => load("python", DEFAULT_PYTHON));
  const [title, setTitle] = useState(() => load("title", "Sem título"));
  const [mode, setMode] = useState<PlaygroundMode>(() => { const m = load<string>("mode", "html"); return (m === "html" || m === "react" || m === "python") ? m : "html"; });
  const [activeTab, setActiveTab] = useState<ActiveTab>("html");
  const [editorCollapsed, setEditorCollapsed] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("editor");
  // Código que voltou do salvamento NÃO roda sozinho ao abrir: se ele travava, travava a tela toda
  // de novo a cada abertura ("ontem abria, hoje não abre"). Toque em ▶ ou ligue o "ao vivo".
  const [autoRun, setAutoRun] = useState(() => { try { return !localStorage.getItem(AUTOSAVE_KEY); } catch { return true; } });
  const [savedDialogOpen, setSavedDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [codeOutput, setCodeOutput] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeRunning, setCodeRunning] = useState(false);

  // Autosave
  useEffect(() => {
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ html, css, js, title, mode, jsx, python })); }
    catch {}
  }, [html, css, js, title, mode, jsx, python]);

  // ── Snippets API ─────────────────────────────────────────────────────────────

  const snippetsQuery = useQuery<Snippet[]>({
    queryKey: ["/api/snippets"],
    queryFn: () => apiFetch("/snippets"),
  });

  const saveSnippetMutation = useMutation({
    mutationFn: async () => {
      const content = mode === "react" ? { html: jsx, css: "", js: "" }
        : mode === "python" ? { html: python, css: "", js: "" }
        : { html, css, js };
      return apiFetch("/snippets", { method: "POST", body: JSON.stringify({ title, ...content, mode }) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/snippets"] }); toast({ title: "Salvo!" }); },
    onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
  });

  const deleteSnippetMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/snippets/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/snippets"] }); toast({ title: "Removido" }); },
  });

  const renameSnippetMutation = useMutation({
    mutationFn: ({ id, newTitle }: { id: string; newTitle: string }) =>
      apiFetch(`/snippets/${id}`, { method: "PATCH", body: JSON.stringify({ title: newTitle }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/snippets"] }); setRenamingId(null); toast({ title: "Renomeado!" }); },
    onError: () => toast({ title: "Erro ao renomear", variant: "destructive" }),
  });

  // ── Python execution ─────────────────────────────────────────────────────────

  const runPython = async () => {
    if (!python.trim() || codeRunning) return;
    setCodeRunning(true); setCodeOutput(""); setCodeError("");
    try {
      const data = await apiFetch("/code/run", {
        method: "POST",
        body: JSON.stringify({ code: python, language: "python" }),
      });
      setCodeOutput(data.output || "");
      setCodeError(data.error || "");
    } catch (e: any) {
      setCodeError(e.message || "Erro de conexão");
    } finally {
      setCodeRunning(false);
    }
  };

  // ── Document builder ─────────────────────────────────────────────────────────

  const hasCompleteDocument = useCallback((code: string) => {
    const l = code.trim().toLowerCase();
    return l.includes("<!doctype") || (l.includes("<html") && l.includes("</html>"));
  }, []);

  const extractCompleteDocument = useCallback((code: string) => {
    const lower = code.toLowerCase();
    const di = lower.indexOf("<!doctype");
    const hi = lower.indexOf("<html");
    const start = di >= 0 ? di : hi;
    return start > 0 ? code.substring(start) : code;
  }, []);

  const buildReactDocument = useCallback(() => {
    const processed = preprocessJSX(jsx);
    const needsPdf = jsx.includes("pdfjsLib");
    const pdfScript = needsPdf ? `
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js"></script>
<script>document.addEventListener('DOMContentLoaded',()=>{if(window.pdfjsLib)window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';});</script>` : "";
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
${pdfScript}
<style>*{box-sizing:border-box;}body{margin:0;font-family:sans-serif;}${css}</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
const{useState,useEffect,useRef,useCallback,useMemo,useContext,createContext,Fragment}=React;
${processed}
try{const _r=ReactDOM.createRoot(document.getElementById('root'));_r.render(<App />);}
catch(e){document.getElementById('root').innerHTML='<div style="color:red;padding:20px;font-family:monospace;white-space:pre-wrap">Erro: '+e.message+'\\n\\nCertifique-se de ter um componente chamado App</div>';}
</script>
</body></html>`;
  }, [jsx, css]);

  const buildPythonDocument = useCallback(() => {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const content = codeRunning ? '<span class="info">⟳ Executando...</span>'
      : (!codeOutput && !codeError) ? '<span class="info">Clique em ▶ Executar para rodar o código Python</span>'
      : (codeError ? `<span class="err">${esc(codeError)}</span>\n` : "") + (codeOutput ? `<span class="ok">$ python3 script.py</span>\n${esc(codeOutput)}` : "");
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;background:#0f172a;color:#e2e8f0;font-family:'Consolas','Courier New',monospace;}#output{padding:20px;white-space:pre-wrap;font-size:13px;line-height:1.6;min-height:100vh;}.info{color:#60a5fa;}.ok{color:#4ade80;font-size:11px;}.err{color:#f87171;}</style></head><body><div id="output">${content}</div></body></html>`;
  }, [codeOutput, codeError, codeRunning]);

  const buildDocument = useCallback(() => {
    if (mode === "react") return buildReactDocument();
    if (mode === "python") return buildPythonDocument();
    if (hasCompleteDocument(html)) {
      let doc = extractCompleteDocument(html);
      if (!doc.toLowerCase().includes("<meta charset")) {
        const m = doc.match(/<head[^>]*>/i);
        if (m) doc = doc.replace(m[0], `${m[0]}\n<meta charset="UTF-8">`);
      }
      return doc;
    }
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>${css}</style></head><body>${html}<script>${js}<\/script></body></html>`;
  }, [html, css, js, mode, hasCompleteDocument, extractCompleteDocument, buildReactDocument, buildPythonDocument]);

  // ── Preview update ────────────────────────────────────────────────────────────

  const updatePreview = useCallback(() => {
    const doc = buildDocument();
    if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current);
    const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    prevBlobUrl.current = blobUrl;
    if (iframeRef.current) iframeRef.current.src = blobUrl;
    if (mobileIframeRef.current) mobileIframeRef.current.src = blobUrl;
  }, [buildDocument]);

  useEffect(() => { if (autoRun) updatePreview(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!autoRun) return;
    const t = setTimeout(updatePreview, 500);
    return () => clearTimeout(t);
  }, [html, css, js, jsx, python, mode, autoRun, updatePreview]);

  useEffect(() => {
    if (mobileView === "preview") { setTimeout(updatePreview, 50); }
  }, [mobileView]);

  // ── Clipboard / file ops ──────────────────────────────────────────────────────

  const handleHtmlPaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData("text");
    const detected = detectMode(pasted);
    if (detected === "react") {
      e.preventDefault(); setMode("react"); setJsx(pasted); setActiveTab("jsx");
      toast({ title: "React/JSX detectado", description: "Modo React ativado." });
      return;
    }
    if (detected === "python") {
      e.preventDefault(); setMode("python"); setPython(pasted); setActiveTab("python");
      toast({ title: "Python detectado", description: "Modo Python ativado." });
      return;
    }
    if (hasCompleteDocument(pasted)) {
      e.preventDefault();
      setHtml(extractCompleteDocument(pasted)); setCss(""); setJs("");
      toast({ title: "Documento completo detectado" });
    }
  }, [hasCompleteDocument, extractCompleteDocument, toast]);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (!content) return;
      const base = file.name.replace(/\.[^.]+$/, "") || "Importado";
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "py") { setMode("python"); setPython(content); setTitle(base); setActiveTab("python"); }
      else if (ext === "jsx" || ext === "tsx") { setMode("react"); setJsx(content); setTitle(base); setActiveTab("jsx"); }
      else if (hasCompleteDocument(content)) { setMode("html"); setHtml(extractCompleteDocument(content)); setCss(""); setJs(""); setTitle(base); setActiveTab("html"); }
      else { setMode("html"); setHtml(content); setTitle(base); setActiveTab("html"); }
      toast({ title: "Arquivo importado!", description: file.name });
    };
    reader.readAsText(file);
    e.target.value = "";
  }, [hasCompleteDocument, extractCompleteDocument, toast]);

  const loadSnippet = (snippet: Snippet) => {
    setTitle(snippet.title);
    let m = (snippet.mode as PlaygroundMode) || "html";
    if (m === "html" && snippet.html) { const d = detectMode(snippet.html); if (d) m = d; }
    setMode(m);
    if (m === "react") { setJsx(snippet.html); setActiveTab("jsx"); }
    else if (m === "python") { setPython(snippet.html); setActiveTab("python"); }
    else if (hasCompleteDocument(snippet.html)) { setHtml(extractCompleteDocument(snippet.html)); setCss(""); setJs(""); setActiveTab("html"); }
    else { setHtml(snippet.html); setCss(snippet.css); setJs(snippet.js); setActiveTab("html"); }
    setSavedDialogOpen(false);
    toast({ title: "Carregado!", description: snippet.title });
  };

  const handleDownload = () => {
    const [content, ext, mime] = mode === "python" ? [python, "py", "text/plain"]
      : mode === "react" ? [jsx, "jsx", "text/plain"]
      : [buildDocument(), "html", "text/html"];
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${title || "playground"}.${ext}`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Baixado!", description: `.${ext}` });
  };

  const handleFullScreen = () => {
    const blob = new Blob([buildDocument()], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const switchMode = (m: PlaygroundMode) => {
    setMode(m);
    if (m === "react") setActiveTab("jsx");
    else if (m === "python") setActiveTab("python");
    else setActiveTab("html");
  };

  const getEditorValue = () => {
    if (activeTab === "jsx") return jsx;
    if (activeTab === "python") return python;
    if (activeTab === "html") return html;
    if (activeTab === "css") return css;
    return js;
  };

  const setEditorValue = (v: string) => {
    if (activeTab === "jsx") setJsx(v);
    else if (activeTab === "python") setPython(v);
    else if (activeTab === "html") setHtml(v);
    else if (activeTab === "css") setCss(v);
    else setJs(v);
  };

  const getTabIcon = (tab: ActiveTab) => {
    if (tab === "html") return <FileCode className="w-3.5 h-3.5" />;
    if (tab === "css") return <Paintbrush className="w-3.5 h-3.5" />;
    if (tab === "jsx") return <Atom className="w-3.5 h-3.5 text-blue-400" />;
    if (tab === "python") return <Terminal className="w-3.5 h-3.5 text-yellow-400" />;
    return <Braces className="w-3.5 h-3.5" />;
  };

  const currentValue = getEditorValue();
  const filteredSnippets = snippetsQuery.data?.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()));

  // ── Python output panel ───────────────────────────────────────────────────────

  const PythonOutput = () => (
    <div className="absolute inset-0 bg-[#0f172a] text-[#e2e8f0] font-mono text-[13px] leading-relaxed overflow-auto p-4">
      {!codeOutput && !codeError && !codeRunning && (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500 select-none">
          <Terminal className="w-10 h-10 opacity-30" />
          <span className="text-sm">Cole seu código Python e clique em <strong className="text-yellow-400">Executar</strong></span>
        </div>
      )}
      {codeRunning && <div className="flex items-center gap-2 text-blue-400"><Loader2 className="w-4 h-4 animate-spin" /><span>Executando...</span></div>}
      {!codeRunning && codeError && <pre className="text-red-400 whitespace-pre-wrap break-words">{codeError}</pre>}
      {!codeRunning && codeOutput && <pre className="whitespace-pre-wrap break-words text-green-300">{codeOutput}</pre>}
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-background" data-testid="playground-container">
      {/* Header */}
      <header className="flex items-center justify-between gap-2 px-2 sm:px-3 py-2 border-b bg-card/50 backdrop-blur-sm shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <Link href="/">
            <Button size="icon" variant="ghost" className="h-7 w-7" title="Voltar">
              <Code2 className="w-4 h-4" />
            </Button>
          </Link>
          {/* Mode selector */}
          <div className="flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
            <Button size="sm" variant={mode === "html" ? "default" : "ghost"} className="h-6 px-2 text-[11px] gap-1" onClick={() => switchMode("html")}>
              <Globe className="w-3 h-3" /> HTML
            </Button>
            <Button size="sm" variant={mode === "react" ? "default" : "ghost"} className="h-6 px-2 text-[11px] gap-1" onClick={() => switchMode("react")}>
              <Atom className="w-3 h-3 text-blue-400" /> React
            </Button>
            <Button size="sm" variant={mode === "python" ? "default" : "ghost"} className="h-6 px-2 text-[11px] gap-1" onClick={() => switchMode("python")}>
              <Terminal className="w-3 h-3 text-yellow-400" /> Python
            </Button>
          </div>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-xs w-24 sm:w-32 bg-transparent border-transparent focus:border-border h-7"
            placeholder="Nome do projeto..."
          />
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {/* Mobile view toggle */}
          <div className="flex items-center gap-0.5 sm:hidden">
            <Button size="icon" variant={mobileView === "editor" ? "default" : "ghost"} onClick={() => setMobileView("editor")} className="h-7 w-7"><CodeXml className="w-4 h-4" /></Button>
            <Button size="icon" variant={mobileView === "preview" ? "default" : "ghost"} onClick={() => { setMobileView("preview"); updatePreview(); }} className="h-7 w-7"><Eye className="w-4 h-4" /></Button>
          </div>

          {/* Run button */}
          {mode === "python" ? (
            <Button variant="default" size="sm" onClick={runPython} disabled={codeRunning} className="text-xs gap-1 h-7">
              {codeRunning ? <><Loader2 className="w-3 h-3 animate-spin" /> Rodando...</> : <><Play className="w-3 h-3" /> Executar</>}
            </Button>
          ) : (
            <>
              <Button variant={autoRun ? "default" : "outline"} size="sm" onClick={() => setAutoRun(!autoRun)} className="text-xs gap-1 hidden sm:inline-flex h-7">
                <Eye className="w-3 h-3" /> Auto
              </Button>
              {!autoRun && (
                <Button variant="default" size="sm" onClick={updatePreview} className="text-xs gap-1 h-7">
                  <Play className="w-3 h-3" /> Executar
                </Button>
              )}
            </>
          )}

          <div className="h-4 w-px bg-border hidden sm:block" />

          <input ref={htmlFileInputRef} type="file" accept=".html,.htm,.py,.jsx,.tsx,.txt" className="hidden" onChange={handleFileImport} />
          <Button size="icon" variant="ghost" onClick={() => htmlFileInputRef.current?.click()} className="h-7 w-7" title="Importar arquivo"><Upload className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" onClick={handleFullScreen} className="h-7 w-7" title="Tela cheia"><Maximize className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(buildDocument()); toast({ title: "Copiado!" }); }} className="h-7 w-7"><Copy className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" onClick={handleDownload} className="h-7 w-7"><Download className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" onClick={() => saveSnippetMutation.mutate()} disabled={saveSnippetMutation.isPending} className="h-7 w-7" title="Salvar no banco"><Save className="w-4 h-4" /></Button>

          {/* Load snippets dialog */}
          <Dialog open={savedDialogOpen} onOpenChange={(open) => { setSavedDialogOpen(open); if (!open) { setRenamingId(null); setSearchQuery(""); } }}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Meus códigos salvos"><FolderOpen className="w-4 h-4" /></Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Meus Códigos Salvos</DialogTitle>
              </DialogHeader>
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar por nome..." className="pl-8 text-sm" />
              </div>
              <div className="max-h-96 overflow-y-auto space-y-1.5">
                {snippetsQuery.isLoading && <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>}
                {filteredSnippets?.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">{searchQuery ? "Nenhum resultado." : "Nenhum código salvo ainda."}</p>}
                {filteredSnippets?.map((snippet) => (
                  <div key={snippet.id}
                    className="flex items-center justify-between gap-2 p-3 rounded-md bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                    onClick={() => renamingId !== snippet.id && loadSnippet(snippet)}
                  >
                    <div className="min-w-0 flex-1">
                      {renamingId === snippet.id ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="text-sm h-7" autoFocus
                            onKeyDown={(e) => { if (e.key === "Enter") renameSnippetMutation.mutate({ id: snippet.id, newTitle: renameValue }); if (e.key === "Escape") setRenamingId(null); }} />
                          <Button size="icon" variant="ghost" onClick={() => renameSnippetMutation.mutate({ id: snippet.id, newTitle: renameValue })} className="h-7 w-7"><Check className="w-3.5 h-3.5 text-emerald-500" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => setRenamingId(null)} className="h-7 w-7"><X className="w-3.5 h-3.5" /></Button>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm font-medium truncate">{snippet.title}</p>
                          <p className="text-xs text-muted-foreground">{snippet.mode} · {snippet.html.length} chars</p>
                        </>
                      )}
                    </div>
                    {renamingId !== snippet.id && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setRenamingId(snippet.id); setRenameValue(snippet.title); }} className="h-7 w-7"><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); deleteSnippetMutation.mutate(snippet.id); }} className="h-7 w-7"><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          <div className="h-4 w-px bg-border" />
          <Button size="icon" variant="ghost" onClick={() => { if (mode === "react") setJsx(DEFAULT_JSX); else if (mode === "python") setPython(DEFAULT_PYTHON); else { setHtml(DEFAULT_HTML); setCss(DEFAULT_CSS); setJs(DEFAULT_JS); } }} className="h-7 w-7" title="Resetar"><RotateCcw className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" onClick={() => { if (mode === "react") setJsx(""); else if (mode === "python") setPython(""); else { setHtml(""); setCss(""); setJs(""); } setTitle("Sem título"); }} className="h-7 w-7" title="Limpar"><Trash2 className="w-4 h-4" /></Button>
        </div>
      </header>

      {/* ── Desktop layout ── */}
      <div className="hidden sm:flex flex-1 overflow-hidden">
        {/* Editor panel */}
        {!editorCollapsed && (
          <div className="flex flex-col w-1/2 border-r shrink-0">
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b bg-muted/30 shrink-0">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)}>
                <TabsList>
                  {mode === "html" && <>
                    <TabsTrigger value="html" className="text-xs gap-1 px-2.5">{getTabIcon("html")} HTML</TabsTrigger>
                    <TabsTrigger value="css" className="text-xs gap-1 px-2.5">{getTabIcon("css")} CSS</TabsTrigger>
                    <TabsTrigger value="js" className="text-xs gap-1 px-2.5">{getTabIcon("js")} JS</TabsTrigger>
                  </>}
                  {mode === "react" && <>
                    <TabsTrigger value="jsx" className="text-xs gap-1 px-2.5">{getTabIcon("jsx")} JSX</TabsTrigger>
                    <TabsTrigger value="css" className="text-xs gap-1 px-2.5">{getTabIcon("css")} CSS</TabsTrigger>
                  </>}
                  {mode === "python" && <TabsTrigger value="python" className="text-xs gap-1 px-2.5">{getTabIcon("python")} Python</TabsTrigger>}
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-2 pr-1">
                {mode === "react" && <span className="text-[10px] text-blue-400">React 18 + Babel</span>}
                {mode === "python" && <span className="text-[10px] text-yellow-400">Python 3 (servidor)</span>}
                <span className="text-[10px] text-muted-foreground tabular-nums">{currentValue.split("\n").length} linhas</span>
                <Button size="icon" variant="ghost" onClick={() => setEditorCollapsed(true)} className="h-7 w-7" title="Minimizar"><PanelLeftClose className="w-4 h-4" /></Button>
              </div>
            </div>
            <div className="flex-1 relative overflow-hidden">
              <div className="absolute inset-0 flex">
                <div className="w-10 shrink-0 bg-muted/20 border-r flex flex-col items-end py-2 pr-2 overflow-hidden select-none pointer-events-none">
                  {currentValue.split("\n").map((_: string, i: number) => (
                    <span key={i} className="text-[10px] leading-[1.625rem] text-muted-foreground/50 tabular-nums">{i + 1}</span>
                  ))}
                </div>
                <textarea
                  value={currentValue}
                  onChange={(e) => setEditorValue(e.target.value)}
                  onPaste={activeTab === "html" ? handleHtmlPaste : undefined}
                  className="flex-1 resize-none bg-transparent font-mono text-sm leading-[1.625rem] p-2 focus:outline-none text-foreground"
                  spellCheck={false}
                  style={{ tabSize: 2 }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Preview panel */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 shrink-0">
            {editorCollapsed && (
              <Button size="icon" variant="ghost" onClick={() => setEditorCollapsed(false)} className="h-7 w-7"><PanelLeftOpen className="w-4 h-4" /></Button>
            )}
            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Resultado</span>
            {autoRun && <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />ao vivo</span>}
          </div>
          <div className="flex-1 relative min-h-0">
            {mode === "python" ? <PythonOutput /> : (
              <iframe ref={iframeRef} title="Resultado" sandbox="allow-scripts allow-modals allow-forms allow-popups"
                className="absolute inset-0 w-full h-full border-0 bg-neutral-50 dark:bg-neutral-900" />
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile layout ── */}
      <div className="flex sm:hidden flex-col flex-1 overflow-hidden">
        {mobileView === "editor" && (
          <div className="flex flex-col flex-1">
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b bg-muted/30 shrink-0">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)}>
                <TabsList>
                  {mode === "html" && <>
                    <TabsTrigger value="html" className="text-xs gap-1 px-3">{getTabIcon("html")} HTML</TabsTrigger>
                    <TabsTrigger value="css" className="text-xs gap-1 px-3">{getTabIcon("css")} CSS</TabsTrigger>
                    <TabsTrigger value="js" className="text-xs gap-1 px-3">{getTabIcon("js")} JS</TabsTrigger>
                  </>}
                  {mode === "react" && <>
                    <TabsTrigger value="jsx" className="text-xs gap-1 px-3">{getTabIcon("jsx")} JSX</TabsTrigger>
                    <TabsTrigger value="css" className="text-xs gap-1 px-3">{getTabIcon("css")} CSS</TabsTrigger>
                  </>}
                  {mode === "python" && <TabsTrigger value="python" className="text-xs gap-1 px-3">{getTabIcon("python")} Python</TabsTrigger>}
                </TabsList>
              </Tabs>
            </div>
            <div className="flex-1 relative overflow-hidden">
              <textarea value={currentValue} onChange={(e) => setEditorValue(e.target.value)}
                onPaste={activeTab === "html" ? handleHtmlPaste : undefined}
                className="absolute inset-0 w-full h-full resize-none bg-transparent font-mono text-sm leading-relaxed p-3 focus:outline-none text-foreground"
                spellCheck={false} style={{ tabSize: 2 }} />
            </div>
          </div>
        )}
        {mobileView === "editor" && mode === "python" && (
          <div className="px-3 py-2 border-b bg-muted/30 shrink-0">
            <Button variant="default" size="sm" onClick={() => { runPython(); setMobileView("preview"); }} disabled={codeRunning} className="text-xs gap-1 w-full">
              {codeRunning ? <><Loader2 className="w-3 h-3 animate-spin" /> Rodando...</> : <><Play className="w-3 h-3" /> Executar Python</>}
            </Button>
          </div>
        )}
        {mobileView === "preview" && (
          <div className="flex flex-col flex-1 relative">
            <div className="flex-1 relative min-h-0">
              {mode === "python" ? <PythonOutput /> : (
                <iframe ref={mobileIframeRef} title="Resultado" sandbox="allow-scripts allow-modals allow-forms allow-popups"
                  className="absolute inset-0 w-full h-full border-0 bg-white dark:bg-neutral-900" />
              )}
            </div>
            <div className="absolute bottom-4 right-4 flex items-center gap-2 z-10">
              <Button size="icon" variant="default" className="rounded-full shadow-lg" onClick={handleFullScreen}><Maximize className="w-4 h-4" /></Button>
              <Button size="icon" variant="default" className="rounded-full shadow-lg" onClick={() => setMobileView("editor")}><CodeXml className="w-4 h-4" /></Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
