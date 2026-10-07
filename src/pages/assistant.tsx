import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquare, Settings, Send, Trash2, ArrowLeft, Eye, EyeOff, Loader2,
  StopCircle, RotateCcw, Check, ClipboardCopy, Save, Key, X,
  Download, Upload, Globe, Mic, MicOff,
} from "lucide-react";
import { Link } from "wouter";

// ─── Provider auto-detection ──────────────────────────────────────────────────

const AUTO_DETECT: [string, string, string, string][] = [
  ["gsk_", "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile", "Groq"],
  ["sk-or-", "https://openrouter.ai/api/v1", "openai/gpt-4o-mini", "OpenRouter"],
  ["pplx-", "https://api.perplexity.ai", "sonar-pro", "Perplexity"],
  ["AIza", "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.0-flash", "Google Gemini"],
  ["xai-", "https://api.x.ai/v1", "grok-2-latest", "xAI/Grok"],
  ["sk-ant-", "https://api.anthropic.com/v1", "claude-3-5-haiku-20241022", "Anthropic"],
  ["sk-", "https://api.openai.com/v1", "gpt-4o-mini", "OpenAI"],
];

function detectProvider(key: string): { url: string; model: string; name: string } | null {
  const k = (key || "").trim();
  for (const [prefix, url, model, name] of AUTO_DETECT) {
    if (k.startsWith(prefix)) return { url, model, name };
  }
  return null;
}

interface SavedKey { id: string; label: string; key: string; url: string; model: string; provider: string; }

// ─── Code block ───────────────────────────────────────────────────────────────

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-border bg-zinc-950">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800 text-zinc-400 text-[10px] font-mono">
        <span>{lang || "code"}</span>
        <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="flex items-center gap-1 hover:text-white transition-colors">
          {copied ? <><Check className="w-3 h-3 text-emerald-400" /> Copiado!</> : <><ClipboardCopy className="w-3 h-3" /> Copiar</>}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-xs leading-relaxed text-zinc-100 font-mono whitespace-pre-wrap"><code>{code}</code></pre>
    </div>
  );
}

function RenderContent({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <div>
      {parts.map((part, i) => {
        const m = part.match(/^```(\w*)\n?([\s\S]*?)```$/);
        if (m) return <CodeBlock key={i} lang={m[1]} code={m[2].trimEnd()} />;
        const urlRe = /(https?:\/\/[^\s<>"']+)/g;
        const textParts = part.split(urlRe);
        if (!part.trim()) return null;
        return (
          <p key={i} className="text-xs leading-relaxed whitespace-pre-wrap my-1">
            {textParts.map((tp, j) => urlRe.test(tp) ? (
              <a key={j} href={tp} target="_blank" rel="noopener noreferrer"
                className="text-blue-400 hover:underline break-all">{tp}</a>
            ) : <span key={j}>{tp}</span>)}
          </p>
        );
      })}
    </div>
  );
}

// ─── Voice recognition ────────────────────────────────────────────────────────

function startVoiceRecognition(opts: {
  onResult: (text: string) => void;
  onListening: (v: boolean) => void;
  onError: (msg: string) => void;
}): (() => void) {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) { opts.onError("Use Chrome ou Edge para ditar por voz."); return () => {}; }
  const rec = new SR();
  rec.lang = "pt-BR"; rec.continuous = false; rec.interimResults = false;
  let captured = false;
  rec.onresult = (e: any) => {
    if (captured) return;
    const t = e.results[e.results.length - 1]?.[0]?.transcript?.trim();
    if (t) { captured = true; opts.onResult(t); }
  };
  rec.onerror = (e: any) => {
    if (e.error === "not-allowed") opts.onError("Microfone bloqueado. Permita no navegador.");
    opts.onListening(false);
  };
  rec.onend = () => opts.onListening(false);
  rec.start();
  opts.onListening(true);
  return () => { try { rec.stop(); } catch {} };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Assistant() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("code_api_key") || "");
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem("code_api_url") || "https://api.groq.com/openai/v1");
  const [apiModel, setApiModel] = useState(() => localStorage.getItem("code_api_model") || "llama-3.3-70b-versatile");
  const [showKey, setShowKey] = useState(false);
  const [showConfig, setShowConfig] = useState(() => !localStorage.getItem("code_api_key"));
  const [showSavedKeys, setShowSavedKeys] = useState(false);
  const [savedKeys, setSavedKeys] = useState<SavedKey[]>(() => {
    try { return JSON.parse(localStorage.getItem("code_saved_keys") || "[]"); } catch { return []; }
  });
  const [keyLabel, setKeyLabel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [citations, setCitations] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>(() => {
    try { return JSON.parse(localStorage.getItem("code_chat_history") || "[]"); } catch { return []; }
  });
  const abortRef = useRef<AbortController | null>(null);
  const stopVoiceRef = useRef<(() => void) | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const apiBase = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  useEffect(() => { if (apiKey) localStorage.setItem("code_api_key", apiKey); }, [apiKey]);
  useEffect(() => { if (apiUrl) localStorage.setItem("code_api_url", apiUrl); }, [apiUrl]);
  useEffect(() => { if (apiModel) localStorage.setItem("code_api_model", apiModel); }, [apiModel]);
  useEffect(() => { localStorage.setItem("code_saved_keys", JSON.stringify(savedKeys)); }, [savedKeys]);
  useEffect(() => { localStorage.setItem("code_chat_history", JSON.stringify(history)); }, [history]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [history, result]);

  // Auto-detect provider from key
  useEffect(() => {
    if (!apiKey) return;
    const clean = apiKey.trim().split(/[\r\n]+/)[0] || "";
    const d = detectProvider(clean);
    if (d) { setApiUrl(d.url); setApiModel(d.model); }
  }, [apiKey]);

  const applyKey = (k: string) => {
    setApiKey(k);
    const d = detectProvider(k);
    if (d) { setApiUrl(d.url); setApiModel(d.model); }
  };

  const saveCurrentKey = () => {
    if (!apiKey.trim() || savedKeys.some(sk => sk.key === apiKey.trim())) return;
    const d = detectProvider(apiKey);
    const label = keyLabel.trim() || d?.name || `Chave ${savedKeys.length + 1}`;
    setSavedKeys(prev => [...prev, { id: Date.now().toString(), label, key: apiKey.trim(), url: apiUrl, model: apiModel, provider: d?.name || "Custom" }]);
    setKeyLabel("");
    toast({ title: "Chave salva!", description: `"${label}" adicionada.` });
  };

  const sendMessage = useCallback(async () => {
    if (!prompt.trim() || isProcessing) return;
    if (isListening) { stopVoiceRef.current?.(); setIsListening(false); }

    const userMsg = prompt.trim();
    setPrompt("");
    const newHistory = [...history, { role: "user" as const, content: userMsg }];
    setHistory(newHistory);
    setIsProcessing(true); setResult(""); setCitations([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch(`${apiBase}/api/code-assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          history: newHistory.slice(0, -1),
          apiKey: apiKey.trim(),
          apiUrl: apiUrl.trim().replace(/\/$/, ""),
          apiModel: apiModel.trim(),
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: `Erro ${resp.status}` }));
        throw new Error(err.error || `Erro ${resp.status}`);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("Sem resposta do servidor.");

      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.error) throw new Error(parsed.error);
            const delta = parsed.text || "";
            if (delta) { fullText += delta; setResult(fullText); }
            if (parsed.citations) setCitations(parsed.citations);
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }

      if (fullText.trim()) setHistory(prev => [...prev, { role: "assistant", content: fullText }]);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      const msg = err.message || "Erro desconhecido";
      toast({ title: "Erro", description: msg.slice(0, 300), variant: "destructive" });
      setHistory(prev => [...prev, { role: "assistant", content: `Erro: ${msg}` }]);
    } finally {
      setIsProcessing(false); abortRef.current = null; setResult("");
    }
  }, [prompt, apiKey, apiUrl, apiModel, history, isProcessing, isListening, apiBase, toast]);

  const toggleVoice = () => {
    if (isListening) { stopVoiceRef.current?.(); setIsListening(false); return; }
    const stop = startVoiceRecognition({
      onResult: (text) => setPrompt(prev => prev ? `${prev.trimEnd()} ${text} ` : `${text} `),
      onListening: setIsListening,
      onError: (msg) => toast({ title: msg, variant: "destructive" }),
    });
    stopVoiceRef.current = stop;
  };

  const exportConversation = () => {
    if (!history.length) return;
    const lines = ["=== CONVERSA — Assistente Livre ===", `Data: ${new Date().toLocaleString("pt-BR")}`, ""];
    history.forEach(m => { lines.push(`[${m.role === "user" ? "VOCÊ" : "IA"}]`); lines.push(m.content); lines.push(""); });
    if (citations.length) { lines.push("=== FONTES ==="); citations.forEach((u, i) => lines.push(`[${i + 1}] ${u}`)); }
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `conversa-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exportado!", description: "Conversa salva como .txt" });
  };

  const clearHistory = () => {
    setHistory([]); setResult(""); setCitations([]);
    localStorage.removeItem("code_chat_history");
    toast({ title: "Conversa limpa" });
  };

  const activeProvider = detectProvider(apiKey);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="px-3 py-2 border-b bg-card shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/">
              <Button size="icon" variant="ghost" className="h-7 w-7">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <MessageSquare className="w-4 h-4 text-emerald-500 shrink-0" />
            <h1 className="text-sm font-semibold truncate">Assistente Livre</h1>
            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full truncate">
              {activeProvider ? activeProvider.name : "Sem chave"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={exportConversation} disabled={!history.length} title="Exportar conversa">
              <Download className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => importRef.current?.click()} title="Importar arquivo">
              <Upload className="w-3.5 h-3.5" />
            </Button>
            <input ref={importRef} type="file" accept=".txt,.md,.csv,.json" className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  const text = ev.target?.result as string;
                  if (text) { setPrompt(prev => prev ? `${prev}\n\n${text}` : text); toast({ title: "Arquivo importado!", description: file.name }); }
                };
                reader.readAsText(file);
                e.target.value = "";
              }}
            />
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => { setShowConfig(!showConfig); setShowSavedKeys(false); }}>
              <Settings className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => { setShowSavedKeys(!showSavedKeys); setShowConfig(false); }} title="Chaves salvas">
              <Key className="w-3.5 h-3.5" />
              {savedKeys.length > 0 && <span className="text-[10px]">{savedKeys.length}</span>}
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={clearHistory} title="Limpar conversa">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Saved keys panel */}
      {showSavedKeys && (
        <div className="border-b bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Chaves Salvas</h3>
            <span className="text-[10px] text-muted-foreground">{savedKeys.length} chave{savedKeys.length !== 1 ? "s" : ""}</span>
          </div>
          {savedKeys.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-2 text-center">Nenhuma chave salva. Abra Configurações, cole uma chave e clique em Salvar.</p>
          ) : (
            <div className="space-y-1.5">
              {savedKeys.map(sk => (
                <div key={sk.id} className={`flex items-center gap-2 p-2 rounded-md border text-xs ${sk.key === apiKey ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-700" : "bg-card hover:bg-muted/50"}`}>
                  <button onClick={() => { setApiKey(sk.key); setApiUrl(sk.url); setApiModel(sk.model); setShowSavedKeys(false); }} className="flex-1 text-left min-w-0">
                    <div className="font-medium truncate">{sk.label}</div>
                    <div className="text-[10px] text-muted-foreground">{sk.provider} · {sk.key.slice(0, 8)}...{sk.key.slice(-4)}</div>
                  </button>
                  {sk.key === apiKey && <span className="text-[9px] text-emerald-600 font-bold shrink-0">ATIVA</span>}
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-red-400" onClick={() => setSavedKeys(prev => prev.filter(k => k.id !== sk.id))}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Config panel */}
      {showConfig && (
        <div className="border-b bg-muted/30 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Configurar API</h3>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">{apiKey ? "Sua chave ativa" : "Sem chave — cole a sua"}</span>
          </div>
          {!apiKey && (
            <p className="text-[11px] text-muted-foreground bg-blue-50 dark:bg-blue-950 px-2 py-1.5 rounded border border-blue-200 dark:border-blue-800">
              Sem chave configurada. Cole sua chave abaixo (Groq, Gemini, OpenRouter…) para o assistente funcionar.
            </p>
          )}
          <div className="grid gap-2">
            <div>
              <Label className="text-[11px] text-muted-foreground">Chave de API (cole Groq, Gemini, OpenAI, Perplexity, xAI, OpenRouter...)</Label>
              <div className="flex gap-1">
                <Input type={showKey ? "text" : "password"} value={apiKey} onChange={e => applyKey(e.target.value.trim())}
                  placeholder="gsk_..., AIza..., sk-..., pplx-..., xai-..., sk-or-..." className="h-8 text-xs font-mono" />
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setShowKey(!showKey)}>
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
            {apiKey && (
              <div className="flex gap-1 items-end">
                <div className="flex-1">
                  <Label className="text-[10px] text-muted-foreground">Nome para salvar (opcional)</Label>
                  <Input value={keyLabel} onChange={e => setKeyLabel(e.target.value)} placeholder={activeProvider?.name || "Minha chave"} className="h-7 text-[11px]" />
                </div>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-[10px] px-2 shrink-0" onClick={saveCurrentKey}>
                  <Save className="w-3 h-3" /> Salvar chave
                </Button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px] text-muted-foreground">URL da API (auto-detectada)</Label>
                <Input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://api.groq.com/openai/v1" className="h-7 text-[10px] font-mono" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Modelo (auto-detectado)</Label>
                <Input value={apiModel} onChange={e => setApiModel(e.target.value)} placeholder="llama-3.3-70b-versatile" className="h-7 text-[10px] font-mono" />
              </div>
            </div>
          </div>
          {apiKey && activeProvider && (
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
              ✓ {activeProvider.name} · {apiModel}
            </div>
          )}
        </div>
      )}

      {/* Chat */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {history.length === 0 && !result && (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-12">
            <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-medium mb-1">Assistente Livre</p>
            <p className="text-xs max-w-md">Cole sua chave e converse livremente — código, pesquisa, análise de texto, qualquer assunto.</p>
            <p className="text-[10px] mt-2 text-muted-foreground/60">Usa apenas sua chave · Roda no seu PC</p>
            <div className="flex flex-wrap gap-2 justify-center mt-3 text-[10px] text-muted-foreground/70">
              {["Groq (gsk_...)", "Perplexity (pplx-...)", "Gemini (AIza...)", "OpenAI (sk-...)", "xAI (xai-...)", "OpenRouter (sk-or-...)"].map(p => (
                <span key={p} className="border rounded px-2 py-0.5">{p}</span>
              ))}
            </div>
            {savedKeys.length > 0 && (
              <Button size="sm" variant="outline" className="mt-3 text-xs gap-1" onClick={() => setShowSavedKeys(true)}>
                <Key className="w-3 h-3" /> {savedKeys.length} chave{savedKeys.length !== 1 ? "s" : ""} salva{savedKeys.length !== 1 ? "s" : ""}
              </Button>
            )}
          </div>
        )}

        {history.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "user" ? (
              <div className="max-w-[85%] rounded-lg px-3 py-2 bg-emerald-600 text-white">
                <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">{msg.content}</pre>
              </div>
            ) : (
              <div className="max-w-[95%] w-full group/msg relative">
                <div className="absolute -right-1 -top-1 opacity-0 group-hover/msg:opacity-100 transition-opacity z-10">
                  <button onClick={() => navigator.clipboard.writeText(msg.content)}
                    className="p-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground">
                    <ClipboardCopy className="w-3 h-3" />
                  </button>
                </div>
                <RenderContent text={i === history.length - 1 && result ? result : msg.content} />
              </div>
            )}
          </div>
        ))}

        {isProcessing && !result && (
          <div className="flex justify-start">
            <div className="bg-muted border rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processando...
            </div>
          </div>
        )}
        {isProcessing && result && (
          <div className="flex justify-start w-full">
            <div className="max-w-[95%] w-full"><RenderContent text={result} /></div>
          </div>
        )}

        {citations.length > 0 && !isProcessing && (
          <div className="mt-2 pt-3 border-t border-blue-200 dark:border-blue-800">
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1.5 flex items-center gap-1">
              <Globe className="w-3 h-3" /> Fontes ({citations.length})
            </p>
            <ol className="space-y-1">
              {citations.map((url, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-[10px] text-blue-500 font-bold mt-0.5 shrink-0">[{idx + 1}]</span>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline break-all">{url}</a>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="border-t bg-card p-2 shrink-0">
        <div className="flex gap-1.5">
          <Textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Escreva sua mensagem — código, perguntas, análise, qualquer assunto..."
            className="min-h-[80px] max-h-[40vh] text-sm resize-none flex-1"
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!isProcessing) sendMessage(); } }}
          />
          <div className="flex flex-col gap-1">
            {isProcessing ? (
              <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => { abortRef.current?.abort(); }}>
                <StopCircle className="w-4 h-4" />
              </Button>
            ) : (
              <Button size="icon" className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700" onClick={sendMessage} disabled={!prompt.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            )}
            <Button size="icon" variant={isListening ? "destructive" : "ghost"} className={`h-8 w-8 ${isListening ? "animate-pulse" : ""}`}
              onClick={toggleVoice} title={isListening ? "Parar ditado" : "Ditar por voz"}>
              {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" title="Desfazer última"
              onClick={() => setHistory(prev => prev.length >= 2 ? prev.slice(0, -2) : [])}>
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between mt-1 px-1">
          <span className="text-[9px] text-muted-foreground">
            {apiKey ? `${activeProvider?.name || "API"} · ${apiModel}` : "Sem chave — configure sua chave acima"}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-emerald-600 dark:text-emerald-400">{history.filter(m => m.role === "user").length} msg</span>
            {history.length > 0 && <button onClick={clearHistory} className="text-[9px] text-red-400 hover:text-red-600">Limpar</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
