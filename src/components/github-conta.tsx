import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock, Globe, LogOut, Upload, Plus } from "lucide-react";

/** Conta do GitHub salva: token uma vez, nome na tela, lista de repositórios. */

export type Conta = { conectado: boolean; login?: string; nome?: string; avatar?: string; erro?: string };
export type Repo = { nome: string; privado: boolean; atualizado: string; ramo: string; tamanhoKb: number; descricao: string };

const base = () => (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(base() + "/api" + url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || "Erro " + r.status);
  return j as T;
}

export function useContaGithub() {
  const [conta, setConta] = useState<Conta | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const c = await api<Conta>("/github/conta"); setConta(c);
      if (c.conectado) setRepos((await api<{ repos: Repo[] }>("/github/repos")).repos); else setRepos([]);
    } catch (e) { setConta({ conectado: false, erro: (e as Error).message }); }
    finally { setCarregando(false); }
  }, []);
  return { conta, repos, carregando, carregar, setConta };
}

/** Cartão da conta: conectar com token (fica salvo) ou mostrar quem está conectado. */
export function CartaoConta({ conta, carregando, onMudou }: { conta: Conta | null; carregando: boolean; onMudou: () => void }) {
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    setSalvando(true);
    try { const c = await api<Conta>("/github/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }); setToken(""); toast({ title: "GitHub conectado", description: "Conta: " + c.login + ". O token ficou salvo neste computador." }); onMudou(); }
    catch (e) { toast({ title: "GitHub", description: (e as Error).message, variant: "destructive" }); }
    finally { setSalvando(false); }
  };
  const sair = async () => { if (!window.confirm("Desconectar a conta do GitHub deste computador?")) return; await api("/github/token", { method: "DELETE" }).catch(() => {}); onMudou(); };

  if (carregando && !conta) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Conferindo a conta do GitHub…</div>;
  if (conta?.conectado) return (
    <div className="flex items-center gap-3 rounded border border-border p-2">
      {conta.avatar && <img src={conta.avatar} alt="" className="w-9 h-9 rounded-full" />}
      <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{conta.nome}</div><div className="text-xs text-muted-foreground truncate">@{conta.login} · token salvo neste computador</div></div>
      <Button size="sm" variant="ghost" onClick={sair} title="Desconectar"><LogOut className="w-4 h-4" /></Button>
    </div>
  );
  return (
    <div className="flex flex-col gap-2 rounded border border-border p-3">
      {conta?.erro && <p className="text-xs text-amber-500">{conta.erro}</p>}
      <p className="text-sm">Conecte sua conta uma vez. O token fica salvo neste computador e aparece a lista dos seus repositórios.</p>
      <p className="text-xs text-muted-foreground">Criar o token: <a className="underline" href="https://github.com/settings/tokens/new?scopes=repo&description=CodeLens" target="_blank" rel="noreferrer">github.com/settings/tokens/new</a> → marque <b>repo</b> → “Generate token” → copie.</p>
      <div className="flex gap-2"><Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_… ou github_pat_…" autoComplete="off" /><Button onClick={salvar} disabled={!token.trim() || salvando}>{salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Conectar"}</Button></div>
    </div>
  );
}

/** Lista dos repositórios com filtro. */
export function ListaRepos({ repos, acao, rotuloAcao, ocupado, selecionado }: { repos: Repo[]; acao: (r: Repo) => void; rotuloAcao: string; ocupado?: string | null; selecionado?: string | null }) {
  const [filtro, setFiltro] = useState("");
  const vis = useMemo(() => repos.filter((r) => r.nome.toLowerCase().includes(filtro.toLowerCase())), [repos, filtro]);
  return (
    <div className="flex flex-col gap-2 min-h-0">
      <Input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder={`Procurar entre ${repos.length} repositórios`} />
      <div className="flex flex-col gap-1 overflow-auto max-h-[45vh] pr-1">
        {vis.map((r) => (
          <div key={r.nome} className={"flex items-center gap-2 rounded border px-2 py-1.5 " + (selecionado === r.nome ? "border-primary" : "border-border/60")}>
            {r.privado ? <Lock className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /> : <Globe className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
            <div className="flex-1 min-w-0"><div className="text-sm truncate">{r.nome}</div><div className="text-[11px] text-muted-foreground truncate">{new Date(r.atualizado).toLocaleDateString("pt-BR")} · {r.ramo}{r.descricao ? " · " + r.descricao : ""}</div></div>
            <Button size="sm" variant={selecionado === r.nome ? "default" : "outline"} className="h-7 shrink-0" disabled={!!ocupado} onClick={() => acao(r)}>{ocupado === r.nome ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : rotuloAcao}</Button>
          </div>
        ))}
        {!vis.length && <p className="text-sm text-muted-foreground">Nenhum repositório.</p>}
      </div>
    </div>
  );
}

/** Dentro do projeto: enviar para um repositório que já existe (ou criar um novo). */
export function GithubEnviarModal({ open, onOpenChange, projectId, onCriarNovo }: { open: boolean; onOpenChange: (v: boolean) => void; projectId: string | number; onCriarNovo: () => void }) {
  const { toast } = useToast();
  const { conta, repos, carregando, carregar } = useContaGithub();
  const [alvo, setAlvo] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<{ url: string; arquivos: number; ignorados: string[]; commit: string } | null>(null);
  useEffect(() => { if (open) { setFeito(null); carregar(); } }, [open, carregar]);
  const enviar = async () => {
    if (!alvo) return;
    if (!window.confirm(`Enviar o projeto para "${alvo}"?\n\nO repositório vai ficar IGUAL ao projeto (arquivos que não existem aqui saem da versão nova). As versões antigas continuam no histórico do GitHub.`)) return;
    setEnviando(true);
    try { setFeito(await api("/github/enviar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, repo: alvo, mensagem }) })); }
    catch (e) { toast({ title: "Enviar ao GitHub", description: (e as Error).message, variant: "destructive" }); }
    finally { setEnviando(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[96vw] max-h-[90vh] flex flex-col gap-3">
        <DialogHeader><DialogTitle>Enviar ao GitHub</DialogTitle></DialogHeader>
        <CartaoConta conta={conta} carregando={carregando} onMudou={carregar} />
        {feito && (
          <div className="rounded border border-green-600/50 bg-green-600/10 p-3 text-sm flex flex-col gap-1">
            <b>Enviado: {feito.arquivos} arquivo(s), versão {feito.commit}.</b>
            {feito.ignorados.length > 0 && <span className="text-amber-500 text-xs">Ficaram de fora por passar de 50 MB: {feito.ignorados.join(", ")}</span>}
            <a className="underline text-xs break-all" href={feito.url} target="_blank" rel="noreferrer">{feito.url}</a>
          </div>
        )}
        {conta?.conectado && !feito && (
          <>
            <ListaRepos repos={repos} acao={(r) => setAlvo(r.nome)} rotuloAcao="Escolher" selecionado={alvo} />
            <Input value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="O que mudou (opcional)" />
            <div className="flex flex-wrap gap-2 justify-end">
              <Button variant="outline" onClick={() => { onOpenChange(false); onCriarNovo(); }}><Plus className="w-4 h-4 mr-1" /> Criar repositório novo</Button>
              <Button onClick={enviar} disabled={!alvo || enviando}>{enviando ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Enviando…</> : <><Upload className="w-4 h-4 mr-1" /> Enviar para {alvo || "…"}</>}</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

