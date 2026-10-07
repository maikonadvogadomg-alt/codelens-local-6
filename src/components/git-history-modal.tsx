import React, { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, FileText, Download, RotateCcw, Copy, GitCommit, Upload, ArrowLeft } from "lucide-react";

/**
 * Histórico (Git): versões antigas do projeto, busca de texto em todas as
 * versões, ver/restaurar um arquivo como era e baixar uma versão em .zip.
 */

type Commit = { hash: string; curto: string; data: string; autor: string; assunto: string; refs: string; arquivos: number; mais: number; menos: number; comTexto?: string[]; textoSaiu?: boolean };
type Mudanca = { status: string; caminho: string; antes?: string };
type Info = { git: boolean; repo: boolean; versao?: string; total?: number; ramo?: string; mudados?: number; mensagem?: string };

const base = () => (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(base() + "/api" + url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || "Erro " + r.status);
  return j as T;
}
const dataBR = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? iso : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
const STATUS: Record<string, string> = { A: "novo", M: "mudou", D: "apagado", R: "renomeado", C: "copiado" };

export function GitHistoryModal({ open, onOpenChange, projectId, onRestored }: { open: boolean; onOpenChange: (v: boolean) => void; projectId: string | number; onRestored?: () => void }) {
  const { toast } = useToast();
  const [info, setInfo] = useState<Info | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState("");
  const [resultado, setResultado] = useState<{ q: string; commits: Commit[]; total: number } | null>(null);
  const [aberto, setAberto] = useState<Commit | null>(null);
  const [mudancas, setMudancas] = useState<Mudanca[]>([]);
  const [visor, setVisor] = useState<{ titulo: string; texto: string; hash: string; caminho: string } | null>(null);
  const pid = String(projectId);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const i = await api<Info>(`/projects/${pid}/git/info`); setInfo(i);
      if (i.repo) setCommits((await api<{ commits: Commit[] }>(`/projects/${pid}/git/log?limite=2000`)).commits);
    } catch (e) { toast({ title: "Histórico", description: (e as Error).message, variant: "destructive" }); }
    finally { setCarregando(false); }
  }, [pid, toast]);

  useEffect(() => { if (open) { setAberto(null); setVisor(null); carregar(); } }, [open, carregar]);

  const procurar = async () => {
    if (!busca.trim()) return; setCarregando(true); setAberto(null); setVisor(null);
    try { setResultado(await api(`/projects/${pid}/git/procurar?q=${encodeURIComponent(busca.trim())}`)); }
    catch (e) { toast({ title: "Busca", description: (e as Error).message, variant: "destructive" }); }
    finally { setCarregando(false); }
  };
  const abrirCommit = async (c: Commit) => {
    setAberto(c); setVisor(null); setMudancas([]);
    try { setMudancas((await api<{ mudancas: Mudanca[] }>(`/projects/${pid}/git/mudancas?hash=${c.hash}`)).mudancas); }
    catch (e) { toast({ title: "Versão", description: (e as Error).message, variant: "destructive" }); }
  };
  const ver = async (hash: string, caminho: string, diff = false) => {
    try {
      if (diff) { const r = await api<{ diff: string }>(`/projects/${pid}/git/diferencas?hash=${hash}&caminho=${encodeURIComponent(caminho)}`); setVisor({ titulo: "O que mudou em " + caminho, texto: r.diff || "(sem diferenças de texto)", hash, caminho }); }
      else { const r = await api<{ conteudo: string; binario: boolean }>(`/projects/${pid}/git/ver?hash=${hash}&caminho=${encodeURIComponent(caminho)}`); setVisor({ titulo: caminho + " — como era na versão " + hash.slice(0, 7), texto: r.binario ? "(arquivo binário — imagem, zip etc.; use “Baixar esta versão”)" : r.conteudo, hash, caminho }); }
    } catch (e) { toast({ title: "Arquivo", description: (e as Error).message, variant: "destructive" }); }
  };
  const restaurar = async (hash: string, caminho: string, modo: "copia" | "substituir") => {
    if (modo === "substituir" && !window.confirm(`Substituir o arquivo atual "${caminho}" pela versão ${hash.slice(0, 7)}?\n\nO atual será perdido. Se tiver dúvida, use "Restaurar como cópia".`)) return;
    try { const r = await api<{ destino: string }>(`/projects/${pid}/git/restaurar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hash, caminho, modo }) }); toast({ title: "Restaurado", description: "Salvo em: " + r.destino }); onRestored?.(); }
    catch (e) { toast({ title: "Restaurar", description: (e as Error).message, variant: "destructive" }); }
  };
  const baixar = (url: string) => { const a = document.createElement("a"); a.href = base() + "/api" + url; a.download = ""; document.body.appendChild(a); a.click(); a.remove(); };
  const importarBundle = async (f: File) => {
    const fd = new FormData(); fd.append("file", f); setCarregando(true);
    try { const r = await api<{ total: number }>(`/projects/${pid}/git/importar-bundle`, { method: "POST", body: fd }); toast({ title: "Histórico trazido", description: r.total + " versões disponíveis." }); await carregar(); }
    catch (e) { toast({ title: "Importar histórico", description: (e as Error).message, variant: "destructive" }); }
    finally { setCarregando(false); }
  };

  const linhaCommit = (c: Commit) => (
    <button key={c.hash} onClick={() => abrirCommit(c)} className="w-full text-left rounded border border-border/60 hover:bg-accent/40 px-3 py-2 flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground font-mono">{dataBR(c.data)} · {c.curto}{c.refs ? " · " + c.refs : ""}</span>
      <span className="text-sm font-medium break-words">{c.assunto || "(sem descrição)"}</span>
      <span className="text-xs text-muted-foreground">{c.arquivos} arquivo(s) · +{c.mais} −{c.menos} · {c.autor}</span>
      {c.comTexto && <span className="text-xs break-all" style={{ color: c.textoSaiu ? "#f59e0b" : "#22c55e" }}>{c.textoSaiu ? "Nesta versão o texto SAIU dos arquivos (a versão anterior ainda tem)." : "Tem o texto em: " + c.comTexto.join(", ")}</span>}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[96vw] h-[90vh] flex flex-col gap-3 overflow-hidden">
        <DialogHeader><DialogTitle>Histórico do projeto (Git)</DialogTitle></DialogHeader>

        {carregando && !info && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Lendo o histórico…</div>}

        {info && !info.git && <div className="text-sm rounded border border-amber-500/40 bg-amber-500/10 p-3">{info.mensagem}</div>}

        {info && info.git && !info.repo && (
          <div className="text-sm rounded border border-border p-3 flex flex-col gap-2">
            <p>Este projeto não tem histórico (a pasta <code>.git</code> não veio junto quando foi importado).</p>
            <p className="text-muted-foreground">No computador onde está a pasta original, abra o Prompt de Comando dentro dela e rode:<br /><code className="break-all">git bundle create "%USERPROFILE%\Desktop\projeto-completo.bundle" --all</code><br />Depois escolha o arquivo gerado aqui:</p>
            <label className="inline-flex"><input type="file" accept=".bundle" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importarBundle(f); e.target.value = ""; }} /><span className="inline-flex items-center gap-2 rounded bg-primary text-primary-foreground px-3 py-2 cursor-pointer"><Upload className="w-4 h-4" /> Trazer histórico (.bundle)</span></label>
          </div>
        )}

        {info?.repo && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{info.total} versões{info.ramo && info.ramo !== "HEAD" ? " · ramo " + info.ramo : ""}{info.mudados ? ` · ${info.mudados} arquivo(s) alterados ainda não salvos no histórico` : ""}</span>
              <Button size="sm" variant="outline" className="h-7" onClick={() => baixar(`/projects/${pid}/git/relatorio`)}><FileText className="w-3.5 h-3.5 mr-1" /> Relatório do histórico (.txt)</Button>
              <label className="inline-flex"><input type="file" accept=".bundle" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importarBundle(f); e.target.value = ""; }} /><span className="inline-flex items-center gap-1 h-7 rounded border border-border px-2 cursor-pointer"><Upload className="w-3.5 h-3.5" /> Trazer outro histórico (.bundle)</span></label>
            </div>
            <div className="flex gap-2">
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") procurar(); }} placeholder='Procurar em todas as versões (ex.: bcdata, tjmg, sucumbência)' />
              <Button onClick={procurar} disabled={carregando}>{carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}</Button>
              {resultado && <Button variant="ghost" onClick={() => { setResultado(null); setBusca(""); }}>Limpar</Button>}
            </div>

            <div className="flex-1 min-h-0 grid gap-3 md:grid-cols-2">
              <div className="min-h-0 overflow-auto flex flex-col gap-1.5 pr-1">
                {resultado && <p className="text-xs text-muted-foreground">“{resultado.q}” entrou ou saiu em {resultado.total} versão(ões){resultado.total > resultado.commits.length ? ` (mostrando ${resultado.commits.length})` : ""}:</p>}
                {(resultado ? resultado.commits : commits).map(linhaCommit)}
                {!carregando && (resultado ? resultado.commits : commits).length === 0 && <p className="text-sm text-muted-foreground">Nada encontrado.</p>}
              </div>

              <div className="min-h-0 overflow-auto flex flex-col gap-2 border-t md:border-t-0 md:border-l border-border md:pl-3 pt-2 md:pt-0">
                {!aberto && !visor && <p className="text-sm text-muted-foreground">Toque numa versão para ver o que mudou, abrir um arquivo como era ou restaurar.</p>}
                {aberto && !visor && (
                  <>
                    <div className="flex flex-wrap items-center gap-2"><GitCommit className="w-4 h-4" /><span className="text-sm font-medium break-words">{aberto.assunto}</span></div>
                    <span className="text-xs text-muted-foreground">{dataBR(aberto.data)} · {aberto.hash}</span>
                    <Button size="sm" variant="outline" className="self-start" onClick={() => baixar(`/projects/${pid}/git/zip?hash=${aberto.hash}`)}><Download className="w-3.5 h-3.5 mr-1" /> Baixar esta versão inteira (.zip)</Button>
                    {(aberto.comTexto?.length ? Array.from(new Set([...aberto.comTexto.map((c) => ({ status: "★", caminho: c })), ...mudancas].map((m) => JSON.stringify(m)))).map((s) => JSON.parse(s) as Mudanca) : mudancas).map((m, i) => (
                      <div key={m.caminho + i} className="rounded border border-border/60 p-2 flex flex-col gap-1">
                        <span className="text-xs break-all"><b>{m.status === "★" ? "tem o texto" : STATUS[m.status] || m.status}</b> · {m.caminho}</span>
                        {m.status !== "D" && (
                          <div className="flex flex-wrap gap-1">
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => ver(aberto.hash, m.caminho)}>Ver como era</Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => ver(aberto.hash, m.caminho, true)}>O que mudou</Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => restaurar(aberto.hash, m.caminho, "copia")}><Copy className="w-3.5 h-3.5 mr-1" />Restaurar como cópia</Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-amber-500" onClick={() => restaurar(aberto.hash, m.caminho, "substituir")}><RotateCcw className="w-3.5 h-3.5 mr-1" />Substituir o atual</Button>
                          </div>
                        )}
                        {m.status === "D" && <span className="text-xs text-muted-foreground">Apagado nesta versão: abra a versão anterior para recuperar.</span>}
                      </div>
                    ))}
                  </>
                )}
                {visor && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setVisor(null)}><ArrowLeft className="w-3.5 h-3.5 mr-1" /> Voltar</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => restaurar(visor.hash, visor.caminho, "copia")}><Copy className="w-3.5 h-3.5 mr-1" />Restaurar como cópia</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => navigator.clipboard?.writeText(visor.texto).then(() => toast({ title: "Copiado" })).catch(() => {})}>Copiar</Button>
                    </div>
                    <span className="text-xs font-medium break-all">{visor.titulo}</span>
                    <pre className="text-xs font-mono whitespace-pre-wrap break-all rounded bg-black/40 p-2 overflow-auto flex-1">{visor.texto}</pre>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
