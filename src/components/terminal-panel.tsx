import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Terminal, Loader2, X, ChevronRight, Trash2, Copy, Check,
  Mic, MicOff, Download, Sparkles, Zap, RefreshCw, FolderTree,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Voice hook ────────────────────────────────────────────────────────────────
function useVoice(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  const toggle = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const rec = new SR();
    rec.lang = "pt-BR"; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e: any) => { const t = e.results[0][0].transcript; onResult(t); };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start(); recRef.current = rec; setListening(true);
  }, [listening, onResult]);

  return { listening, toggle };
}

// ─── Missing package detection ─────────────────────────────────────────────────
const CLI_TO_PACKAGE: Record<string, string> = {
  tsx: "tsx", "ts-node": "ts-node", vite: "vite", "react-scripts": "react-scripts",
  next: "next", tsc: "typescript", eslint: "eslint", prettier: "prettier",
  jest: "jest", vitest: "vitest", esbuild: "esbuild", rollup: "rollup",
  webpack: "webpack", nodemon: "nodemon", concurrently: "concurrently",
  "cross-env": "cross-env",
};

function detectMissingPackage(text: string): string | null {
  const shellNotFound = text.match(/(?:sh|bash|zsh):\s*\d*:?\s*([^\s:]+):\s*(?:not found|command not found)/);
  if (shellNotFound && CLI_TO_PACKAGE[shellNotFound[1]]) return "__install_deps__";
  const cannotFind = text.match(/Cannot find module ['"](@?[a-zA-Z0-9._/-]+)['"]/);
  if (cannotFind) {
    const mod = cannotFind[1];
    if (!mod.startsWith(".") && !mod.startsWith("/"))
      return mod.split("/").slice(0, mod.startsWith("@") ? 2 : 1).join("/");
  }
  const npmMissing = text.match(/npm ERR! missing: ([a-zA-Z0-9@._/-]+)@/);
  if (npmMissing) return npmMissing[1].split("/").slice(0, npmMissing[1].startsWith("@") ? 2 : 1).join("/");
  const cannotFindPkg = text.match(/Cannot find package ['"](@?[a-zA-Z0-9._/-]+)['"]/);
  if (cannotFindPkg) { const mod = cannotFindPkg[1]; if (!mod.startsWith(".") && !mod.startsWith("/")) return mod; }
  return null;
}

// ─── Quick action buttons ──────────────────────────────────────────────────────
interface QuickAction {
  label: string;
  cmd: string;
  color: string;
  icon?: React.ReactNode;
  group: "install" | "run" | "file" | "git";
}

const QUICK_ACTIONS: QuickAction[] = [
  // install
  { label: "npm install", cmd: "npm install", color: "text-green-400 border-green-500/30 bg-green-500/10 hover:bg-green-500/20", group: "install" },
  { label: "npm ci", cmd: "npm ci", color: "text-green-300 border-green-500/20 bg-green-500/5 hover:bg-green-500/15", group: "install" },
  // run
  { label: "npm start", cmd: "npm start", color: "text-blue-400 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20", group: "run" },
  { label: "npm run dev", cmd: "npm run dev", color: "text-blue-300 border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/15", group: "run" },
  { label: "node server.js", cmd: "node server.js", color: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20", group: "run" },
  { label: "node index.js", cmd: "node index.js", color: "text-cyan-300 border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/15", group: "run" },
  // file
  { label: "ls -la", cmd: "ls -la", color: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20", group: "file" },
  { label: "cat package.json", cmd: "cat package.json", color: "text-yellow-300 border-yellow-500/20 bg-yellow-500/5 hover:bg-yellow-500/15", group: "file" },
  // git
  { label: "git init", cmd: "git init", color: "text-orange-400 border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20", group: "git" },
  { label: "git status", cmd: "git status", color: "text-orange-300 border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/15", group: "git" },
  { label: "git add . && git commit -m 'update'", cmd: "git add . && git commit -m 'update'", color: "text-orange-200 border-orange-400/20 bg-orange-500/5 hover:bg-orange-500/15", group: "git" },
];

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface OutputChunk { type: "stdout" | "stderr"; text: string; }
export interface TerminalEntry {
  id: number;
  command: string;
  chunks: OutputChunk[];
  running: boolean;
  exitCode: number | null;
  durationMs: number;
  missingPackage?: string | null;
}

interface TerminalPanelProps {
  projectId: string;
  projectName?: string;
  onClose?: () => void;
  pendingCommand?: { cmd: string; id: number } | null;
  onEntriesChange?: (entries: TerminalEntry[]) => void;
  onServerDetected?: (port: number) => void;
  onCommandDone?: () => void;
  /** Called when the AI should be notified (optional) */
  onAskAi?: (text: string) => void;
}

function getBase() { return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, ""); }

// ─── Colored output line ───────────────────────────────────────────────────────
function ChunkLine({ type, text, exitCode }: { type: "stdout" | "stderr"; text: string; exitCode: number | null }) {
  if (type === "stdout") return <span className="text-[#c9d1d9]">{text}</span>;
  const isNpmWarn = /npm warn/i.test(text);
  const isNpmErr = /npm err!/i.test(text);
  const failed = exitCode !== null && exitCode !== 0;
  if (failed || isNpmErr) return <span style={{ color: "#f85149" }}>{text}</span>;
  if (isNpmWarn) return <span className="text-yellow-400/80">{text}</span>;
  return <span style={{ color: "#6e7681" }}>{text}</span>;
}

// ─── Entry display ─────────────────────────────────────────────────────────────
function EntryView({ entry, onInstall, onCopy, copiedId }: {
  entry: TerminalEntry; onInstall: (cmd: string) => void;
  onCopy: (entry: TerminalEntry) => void; copiedId: number | null;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="text-green-400 shrink-0">$</span>
        <span className="text-[#e6edf3] flex-1 break-all font-mono">{entry.command}</span>
        <button className="shrink-0 text-[#8b949e] hover:text-[#e6edf3] transition-colors" onClick={() => onCopy(entry)} title="Copiar saída">
          {copiedId === entry.id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
        </button>
        {entry.running ? (
          <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />rodando
          </span>
        ) : (
          <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full",
            entry.exitCode === 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400")}>
            {entry.exitCode === 0 ? "✓ OK" : `exit ${entry.exitCode}`}
          </span>
        )}
        {!entry.running && entry.durationMs > 0 && (
          <span className="text-[#8b949e] text-[9px] shrink-0">
            {entry.durationMs >= 60000 ? `${Math.round(entry.durationMs / 1000)}s`
              : entry.durationMs >= 1000 ? `${(entry.durationMs / 1000).toFixed(1)}s`
              : `${entry.durationMs}ms`}
          </span>
        )}
      </div>

      {entry.chunks.length > 0 && (
        <pre className="text-[11px] whitespace-pre-wrap break-words pl-4 leading-relaxed">
          {entry.chunks.map((chunk, i) => (
            <ChunkLine key={i} type={chunk.type} text={chunk.text} exitCode={entry.exitCode} />
          ))}
          {entry.running && <span className="inline-block w-2 h-3 bg-green-400 animate-pulse ml-0.5 align-middle" />}
        </pre>
      )}

      {/* Missing package suggestion */}
      {!entry.running && entry.missingPackage && (
        entry.missingPackage === "__install_deps__" ? (
          <div className="flex items-center gap-2 mt-1 ml-4 p-2 rounded bg-yellow-400/10 border border-yellow-400/30">
            <Download className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
            <span className="text-[11px] text-yellow-300 flex-1">
              Dependências não instaladas. Rode <code className="font-bold">npm install</code> primeiro.
            </span>
            <button onClick={() => onInstall("npm install")}
              className="text-[10px] font-semibold px-2 py-1 rounded bg-yellow-400/20 hover:bg-yellow-400/30 text-yellow-300 border border-yellow-400/30 transition-colors shrink-0">
              npm install
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-1 ml-4 p-2 rounded bg-yellow-400/10 border border-yellow-400/30">
            <Download className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
            <span className="text-[11px] text-yellow-300 flex-1">
              Pacote <code className="font-bold">{entry.missingPackage}</code> não encontrado.
            </span>
            <button onClick={() => onInstall(`npm install ${entry.missingPackage}`)}
              className="text-[10px] font-semibold px-2 py-1 rounded bg-yellow-400/20 hover:bg-yellow-400/30 text-yellow-300 border border-yellow-400/30 transition-colors shrink-0">
              instalar
            </button>
          </div>
        )
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export function TerminalPanel({
  projectId, projectName, onClose, pendingCommand, onEntriesChange,
  onServerDetected, onCommandDone, onAskAi,
}: TerminalPanelProps) {
  const [entries, setEntries] = useState<TerminalEntry[]>([]);
  const [input, setInput] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [lastPendingId, setLastPendingId] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [activeGroup, setActiveGroup] = useState<QuickAction["group"]>("run");

  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const entryCounter = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const { listening, toggle: toggleVoice } = useVoice((text) => {
    setInput((prev) => (prev ? prev + " " + text : text));
    setTimeout(() => inputRef.current?.focus(), 50);
  });

  // Auto-scroll
  useEffect(() => { const el = outputRef.current; if (el) el.scrollTop = el.scrollHeight; }, [entries]);
  useEffect(() => { onEntriesChange?.(entries); }, [entries, onEntriesChange]);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

  const commandHistory = entries.map((e) => e.command);

  // ── Run a real shell command (streaming SSE) ──────────────────────────────
  const runCommand = useCallback(async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed || isRunning) return;

    setInput(""); setHistoryIndex(-1); setIsRunning(true);
    const id = ++entryCounter.current;

    const newEntry: TerminalEntry = { id, command: trimmed, chunks: [], running: true, exitCode: null, durationMs: 0, missingPackage: null };
    setEntries((prev) => [...prev, newEntry]);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch(`${getBase()}/api/projects/${projectId}/exec-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: trimmed }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "Erro desconhecido");
        setEntries((prev) => prev.map((e) => e.id === id
          ? { ...e, running: false, exitCode: 1, chunks: [{ type: "stderr", text: `Erro: ${errText}` }], durationMs: 0 }
          : e));
        setIsRunning(false); return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "stdout") {
              setEntries((prev) => prev.map((e) => e.id === id
                ? { ...e, chunks: [...e.chunks, { type: "stdout", text: event.data }] } : e));
            } else if (event.type === "stderr") {
              setEntries((prev) => prev.map((e) => e.id === id
                ? { ...e, chunks: [...e.chunks, { type: "stderr", text: event.data }] } : e));
            } else if (event.type === "server_detected") {
              const port: number = event.port;
              setEntries((prev) => prev.map((e) => e.id === id
                ? { ...e, chunks: [...e.chunks, { type: "stdout", text: `\n🌐 Servidor na porta ${port} — preview conectado!\n` }] } : e));
              onServerDetected?.(port);
            } else if (event.type === "server_stopped") {
              const exitCode: number = event.exitCode ?? 0;
              const durationMs: number = event.durationMs ?? 0;
              setEntries((prev) => prev.map((e) => e.id === id
                ? { ...e, running: false, exitCode, durationMs, chunks: [...e.chunks, { type: "stderr", text: "\n[servidor encerrado]\n" }] } : e));
            } else if (event.type === "exit") {
              const exitCode: number = event.exitCode ?? 1;
              const durationMs: number = event.durationMs ?? 0;
              setEntries((prev) => prev.map((e) => {
                if (e.id !== id) return e;
                const allText = e.chunks.map(c => c.text).join("");
                const missingPackage = exitCode !== 0 ? detectMissingPackage(allText) : null;
                return { ...e, running: false, exitCode, durationMs, missingPackage };
              }));
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setEntries((prev) => prev.map((e) => e.id === id
        ? { ...e, running: false, exitCode: 1, chunks: [...e.chunks, { type: "stderr", text: `\nErro de conexão: ${err.message}` }], durationMs: 0 }
        : e));
    } finally {
      setIsRunning(false);
      abortRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 50);
      // Refresh file tree after every command — catches created files, npm install output, etc.
      onCommandDone?.();
    }
  }, [projectId, isRunning, onCommandDone, onServerDetected]);

  // Auto-run pending command (from AI panel or packages panel)
  useEffect(() => {
    if (pendingCommand && pendingCommand.id !== lastPendingId) {
      setLastPendingId(pendingCommand.id);
      runCommand(pendingCommand.cmd);
    }
  }, [pendingCommand, runCommand, lastPendingId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      runCommand(input);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
      setHistoryIndex(newIndex);
      setInput(commandHistory[commandHistory.length - 1 - newIndex] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const newIndex = Math.max(historyIndex - 1, -1);
      setHistoryIndex(newIndex);
      setInput(newIndex === -1 ? "" : (commandHistory[commandHistory.length - 1 - newIndex] ?? ""));
    } else if (e.key === "c" && e.ctrlKey) {
      if (isRunning && abortRef.current) {
        abortRef.current.abort();
        setEntries((prev) => prev.map((e) => e.running
          ? { ...e, running: false, exitCode: 130, chunks: [...e.chunks, { type: "stderr", text: "\n^C interrompido" }] } : e));
        setIsRunning(false);
      }
    }
  };

  const copyOutput = (entry: TerminalEntry) => {
    const text = entry.chunks.map(c => c.text).join("");
    navigator.clipboard.writeText(text).then(() => { setCopiedId(entry.id); setTimeout(() => setCopiedId(null), 1500); });
  };

  const filteredActions = QUICK_ACTIONS.filter(a => a.group === activeGroup);
  const lastOutput = entries.length > 0
    ? `Comando: ${entries[entries.length - 1].command}\nSaída: ${entries[entries.length - 1].chunks.map(c => c.text).join("").slice(0, 400)}`
    : "";

  return (
    <div className="flex flex-col h-full font-mono text-xs" style={{ background: "#0d1117", color: "#e6edf3" }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        className="h-9 shrink-0 flex items-center px-3 gap-2"
        style={{ background: "#161b22", borderBottom: "1px solid #30363d" }}
      >
        <Terminal className="w-3.5 h-3.5 shrink-0" style={{ color: "#3fb950" }} />
        <span className="text-xs font-bold uppercase tracking-wider flex-1" style={{ color: "#8b949e" }}>
          Terminal
          {projectName && (
            <span className="ml-2 font-normal normal-case tracking-normal" style={{ color: "#3fb950" }}>
              ~ {projectName}
            </span>
          )}
        </span>

        {/* AI context badge */}
        {entries.length > 0 && (
          <span
            className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(229,9,20,0.12)", color: "#E50914", border: "1px solid rgba(229,9,20,0.25)" }}
            title="A IA vê o histórico do terminal automaticamente"
          >
            <Sparkles className="w-2.5 h-2.5" />
            IA conectada
          </span>
        )}

        {isRunning && (
          <span className="text-[10px] flex items-center gap-1" style={{ color: "#d29922" }}>
            <Loader2 className="w-3 h-3 animate-spin" />rodando…
          </span>
        )}

        {/* Refresh tree button */}
        <button
          onClick={() => onCommandDone?.()}
          className="p-1 rounded transition-colors"
          style={{ color: "#8b949e" }}
          title="Atualizar árvore de arquivos"
        >
          <FolderTree className="w-3.5 h-3.5" />
        </button>

        {/* Ask AI about last output */}
        {onAskAi && entries.length > 0 && (
          <button
            onClick={() => onAskAi(lastOutput)}
            className="p-1 rounded transition-colors"
            style={{ color: "#E50914" }}
            title="Perguntar à IA sobre a saída do terminal"
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={() => setEntries([])}
          className="p-1 rounded transition-colors"
          style={{ color: "#8b949e" }}
          title="Limpar terminal"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded transition-colors" style={{ color: "#8b949e" }}>
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ── Quick action buttons ─────────────────────────────────────────── */}
      {showQuickActions && (
        <div style={{ background: "#0d1117", borderBottom: "1px solid #21262d" }}>
          {/* Group tabs */}
          <div className="flex items-center gap-0.5 px-2 pt-1.5">
            {(["run", "install", "file", "git"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                className="px-2.5 py-0.5 rounded-t text-[10px] font-semibold uppercase tracking-wider transition-colors"
                style={activeGroup === g
                  ? { background: "#161b22", color: "#3fb950", borderBottom: "2px solid #3fb950" }
                  : { color: "#8b949e" }
                }
              >
                {g === "run" ? "▶ Rodar" : g === "install" ? "↓ Instalar" : g === "file" ? "📁 Arquivos" : "🔀 Git"}
              </button>
            ))}
            <span className="flex-1" />
            <button
              onClick={() => setShowQuickActions(false)}
              className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
              style={{ color: "#8b949e" }}
              title="Ocultar ações rápidas"
            >
              ×
            </button>
          </div>
          {/* Buttons row */}
          <div className="flex flex-wrap gap-1.5 px-2 pb-2 pt-1">
            {filteredActions.map((action) => (
              <button
                key={action.cmd}
                onClick={() => runCommand(action.cmd)}
                disabled={isRunning}
                className={cn(
                  "text-[10px] font-mono px-2.5 py-1 rounded border transition-all whitespace-nowrap",
                  action.color,
                  isRunning && "opacity-40 cursor-not-allowed"
                )}
                title={action.cmd}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Collapsed quick actions toggle */}
      {!showQuickActions && (
        <button
          onClick={() => setShowQuickActions(true)}
          className="flex items-center gap-1.5 px-3 py-1 text-[10px] border-b w-full text-left transition-colors hover:opacity-80"
          style={{ background: "#0d1117", borderColor: "#21262d", color: "#3fb950" }}
        >
          <Zap className="w-3 h-3" />
          Mostrar ações rápidas
        </button>
      )}

      {/* ── Output area ──────────────────────────────────────────────────── */}
      <div ref={outputRef} className="flex-1 overflow-auto p-3 space-y-4">
        {entries.length === 0 && (
          <div className="space-y-1" style={{ color: "#8b949e" }}>
            <p className="text-[11px]">
              Terminal real — shell <code className="text-green-400">sh</code> rodando no diretório do projeto.
            </p>
            <p className="text-[10px] opacity-60">↑ ↓ histórico · Ctrl+C cancelar · clique nos botões acima para ações rápidas</p>
            <p className="text-[10px] opacity-60" style={{ color: "#E50914" }}>
              ◆ A IA pode sugerir comandos que aparecem como botões nas respostas.
            </p>
          </div>
        )}
        {entries.map((entry) => (
          <EntryView key={entry.id} entry={entry} onInstall={runCommand} onCopy={copyOutput} copiedId={copiedId} />
        ))}
      </div>

      {/* ── Input ────────────────────────────────────────────────────────── */}
      <div
        className="shrink-0 flex items-center px-3 py-3 gap-2"
        style={{ borderTop: "1px solid #30363d", background: "#0d1117" }}
      >
        <span className="shrink-0 font-bold" style={{ color: "#3fb950" }}>$</span>
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isRunning
            ? "aguarde… (Ctrl+C para cancelar)"
            : "npm install · node server.js · ls -la · git status…"}
          className="flex-1 bg-transparent outline-none text-sm font-mono"
          style={{
            color: "#e6edf3",
            caretColor: "#3fb950",
          }}
          disabled={isRunning}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
        />
        {/* Mic */}
        <button
          type="button"
          onClick={toggleVoice}
          disabled={isRunning}
          className={cn(
            "shrink-0 p-1.5 rounded transition-colors",
            listening ? "animate-pulse" : "",
            isRunning && "opacity-30"
          )}
          style={listening ? { color: "#f85149", background: "rgba(248,81,73,0.15)" } : { color: "#8b949e" }}
          title={listening ? "Parar gravação" : "Falar comando (pt-BR)"}
        >
          {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>
        {/* Run */}
        <button
          type="button"
          onClick={() => runCommand(input)}
          disabled={isRunning || !input.trim()}
          className="shrink-0 p-1.5 rounded transition-colors disabled:opacity-30"
          style={{ color: "#3fb950", background: "rgba(63,185,80,0.1)" }}
          title="Executar (Enter)"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
