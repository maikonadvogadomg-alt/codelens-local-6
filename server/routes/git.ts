/**
 * Histórico (Git) do projeto — ver versões antigas, procurar texto em todas
 * as versões, ver/restaurar um arquivo como era e baixar uma versão inteira.
 * Usa o programa "git" instalado no computador (sem shell: argumentos
 * separados, nada é interpretado pelo terminal).
 */
import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
import { execFile, spawn } from "child_process";
import multer from "multer";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import { dbSaveFile } from "../lib/persistFiles.js";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 1024 } });

const SEM_GIT = "O programa Git não está instalado neste computador. No Prompt de Comando, rode: winget install Git.Git — depois feche e abra o CodeLens de novo.";
const HASH = /^[0-9a-fA-F]{4,40}$/;

function git(cwd: string, args: string[], maxBuffer = 64 * 1024 * 1024): Promise<string> {
  return new Promise((ok, falha) => {
    execFile("git", ["-c", "core.quotepath=off", "-c", "i18n.logOutputEncoding=utf-8", ...args], { cwd, maxBuffer, windowsHide: true, encoding: "utf8" }, (err, stdout, stderr) => {
      if (err) {
        const e = err as NodeJS.ErrnoException & { code?: string | number };
        if (e.code === "ENOENT") return falha(Object.assign(new Error(SEM_GIT), { status: 503 }));
        return falha(Object.assign(new Error((stderr || e.message || "erro no git").toString().trim()), { status: 400 }));
      }
      ok(stdout);
    });
  });
}

async function pastaDoProjeto(projectId: string): Promise<{ id: number; dir: string } | null> {
  const id = parseInt(projectId, 10);
  if (isNaN(id)) return null;
  const [p] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  return p ? { id: p.id, dir: p.storagePath } : null;
}

function caminhoSeguro(p: unknown): string | null {
  if (typeof p !== "string" || !p || p.length > 500) return null;
  const n = p.replace(/\\/g, "/").replace(/^\/+/, "");
  if (n.split("/").some((x) => x === ".." ) || path.isAbsolute(n)) return null;
  return n;
}

function erro(res: Response, e: unknown) {
  const err = e as Error & { status?: number };
  res.status(err.status || 500).json({ error: err.message || String(e) });
}

async function ehRepo(dir: string): Promise<boolean> {
  try { return (await git(dir, ["rev-parse", "--is-inside-work-tree"])).trim() === "true"; } catch (e) { if ((e as Error).message === SEM_GIT) throw e; return false; }
}

const FMT = "%x1e%H%x1f%h%x1f%aI%x1f%an%x1f%s%x1f%D";
function lerCommits(txt: string) {
  return txt.split("\x1e").map((b) => b.trim()).filter(Boolean).map((b) => {
    const [linha, ...resto] = b.split("\n");
    const [hash, curto, data, autor, assunto, refs] = linha.split("\x1f");
    const stat = resto.join(" ");
    const arquivos = Number((/(\d+) files? changed/.exec(stat) || [])[1] || 0);
    const mais = Number((/(\d+) insertions?/.exec(stat) || [])[1] || 0);
    const menos = Number((/(\d+) deletions?/.exec(stat) || [])[1] || 0);
    return { hash, curto, data, autor, assunto, refs: refs || "", arquivos, mais, menos };
  }).filter((c) => c.hash && HASH.test(c.hash));
}

// ── situação ──────────────────────────────────────────────────────────────────
router.get("/projects/:projectId/git/info", async (req, res) => {
  try {
    const p = await pastaDoProjeto(req.params.projectId); if (!p) { res.status(404).json({ error: "Projeto não encontrado" }); return; }
    let versao = "";
    try { versao = (await git(p.dir, ["--version"])).trim(); } catch (e) { if ((e as Error).message === SEM_GIT) { res.json({ git: false, repo: false, mensagem: SEM_GIT }); return; } }
    const repo = await ehRepo(p.dir);
    if (!repo) { res.json({ git: true, versao, repo: false }); return; }
    const total = Number((await git(p.dir, ["rev-list", "--all", "--count"]).catch(() => "0")).trim()) || 0;
    const ramo = (await git(p.dir, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => "")).trim();
    const mudados = (await git(p.dir, ["status", "--porcelain"]).catch(() => "")).split("\n").filter(Boolean).length;
    res.json({ git: true, versao, repo: true, total, ramo, mudados });
  } catch (e) { erro(res, e); }
});

// ── lista de versões ─────────────────────────────────────────────────────────
router.get("/projects/:projectId/git/log", async (req, res) => {
  try {
    const p = await pastaDoProjeto(req.params.projectId); if (!p) { res.status(404).json({ error: "Projeto não encontrado" }); return; }
    const limite = Math.min(5000, Math.max(1, Number(req.query.limite) || 1000));
    const txt = await git(p.dir, ["log", "--all", "--date-order", "-n", String(limite), "--format=" + FMT, "--shortstat"]);
    res.json({ commits: lerCommits(txt) });
  } catch (e) { erro(res, e); }
});

// ── procurar um texto em todas as versões ─────────────────────────────────────
router.get("/projects/:projectId/git/procurar", async (req, res) => {
  try {
    const p = await pastaDoProjeto(req.params.projectId); if (!p) { res.status(404).json({ error: "Projeto não encontrado" }); return; }
    const q = String(req.query.q || ""); if (!q || q.length > 200) { res.status(400).json({ error: "Escreva o texto a procurar (até 200 letras)." }); return; }
    // versões em que o texto entrou ou saiu
    const commits = lerCommits(await git(p.dir, ["log", "--all", "--date-order", "-S", q, "--format=" + FMT, "--shortstat"]));
    // em cada uma, quais arquivos têm o texto
    const resultado = [];
    for (const c of commits.slice(0, 80)) {
      let arquivos: string[] = [];
      try { arquivos = (await git(p.dir, ["grep", "-I", "-l", "-F", "-i", "-e", q, c.hash])).split("\n").filter(Boolean).map((l) => l.slice(c.hash.length + 1)); } catch { arquivos = []; }
      resultado.push({ ...c, comTexto: arquivos.slice(0, 200), textoSaiu: arquivos.length === 0 });
    }
    res.json({ q, commits: resultado, total: commits.length });
  } catch (e) { erro(res, e); }
});

// ── o que mudou numa versão ──────────────────────────────────────────────────
router.get("/projects/:projectId/git/mudancas", async (req, res) => {
  try {
    const p = await pastaDoProjeto(req.params.projectId); if (!p) { res.status(404).json({ error: "Projeto não encontrado" }); return; }
    const h = String(req.query.hash || ""); if (!HASH.test(h)) { res.status(400).json({ error: "Versão inválida" }); return; }
    const txt = await git(p.dir, ["show", "--name-status", "--format=", "-M", h]);
    const mudancas = txt.split("\n").filter(Boolean).map((l) => { const [st, ...ps] = l.split("\t"); return { status: st[0], caminho: ps[ps.length - 1], antes: ps.length > 1 ? ps[0] : undefined }; });
    res.json({ mudancas });
  } catch (e) { erro(res, e); }
});

// ── todos os arquivos de uma versão ──────────────────────────────────────────
router.get("/projects/:projectId/git/arquivos", async (req, res) => {
  try {
    const p = await pastaDoProjeto(req.params.projectId); if (!p) { res.status(404).json({ error: "Projeto não encontrado" }); return; }
    const h = String(req.query.hash || ""); if (!HASH.test(h)) { res.status(400).json({ error: "Versão inválida" }); return; }
    res.json({ arquivos: (await git(p.dir, ["ls-tree", "-r", "--name-only", h])).split("\n").filter(Boolean) });
  } catch (e) { erro(res, e); }
});

// ── um arquivo como era numa versão ──────────────────────────────────────────
router.get("/projects/:projectId/git/ver", async (req, res) => {
  try {
    const p = await pastaDoProjeto(req.params.projectId); if (!p) { res.status(404).json({ error: "Projeto não encontrado" }); return; }
    const h = String(req.query.hash || ""), c = caminhoSeguro(req.query.caminho); if (!HASH.test(h) || !c) { res.status(400).json({ error: "Versão ou arquivo inválido" }); return; }
    const conteudo = await git(p.dir, ["show", `${h}:${c}`]);
    res.json({ conteudo, binario: conteudo.includes("\u0000") });
  } catch (e) { erro(res, e); }
});

// ── diferenças de um arquivo nessa versão (em relação à anterior) ────────────
router.get("/projects/:projectId/git/diferencas", async (req, res) => {
  try {
    const p = await pastaDoProjeto(req.params.projectId); if (!p) { res.status(404).json({ error: "Projeto não encontrado" }); return; }
    const h = String(req.query.hash || ""), c = caminhoSeguro(req.query.caminho); if (!HASH.test(h)) { res.status(400).json({ error: "Versão inválida" }); return; }
    const args = ["show", "--format=", "--no-color", h]; if (c) args.push("--", c);
    res.json({ diff: await git(p.dir, args) });
  } catch (e) { erro(res, e); }
});

// ── restaurar um arquivo daquela versão ──────────────────────────────────────
router.post("/projects/:projectId/git/restaurar", async (req, res) => {
  try {
    const p = await pastaDoProjeto(req.params.projectId); if (!p) { res.status(404).json({ error: "Projeto não encontrado" }); return; }
    const h = String(req.body?.hash || ""), c = caminhoSeguro(req.body?.caminho), modo = req.body?.modo === "substituir" ? "substituir" : "copia";
    if (!HASH.test(h) || !c) { res.status(400).json({ error: "Versão ou arquivo inválido" }); return; }
    const conteudo = await git(p.dir, ["show", `${h}:${c}`]);
    let destino = c;
    if (modo === "copia") { const ext = path.posix.extname(c); destino = (ext ? c.slice(0, -ext.length) : c) + ".versao-" + h.slice(0, 7) + ext; }
    const cheio = path.resolve(p.dir, destino); if (!cheio.startsWith(path.resolve(p.dir))) { res.status(400).json({ error: "Destino inválido" }); return; }
    await fs.mkdir(path.dirname(cheio), { recursive: true });
    await fs.writeFile(cheio, conteudo, "utf-8");
    try { await dbSaveFile(p.id, destino, conteudo); } catch { /* o arquivo já está no disco */ }
    res.json({ ok: true, destino });
  } catch (e) { erro(res, e); }
});

// ── baixar uma versão inteira em .zip ────────────────────────────────────────
router.get("/projects/:projectId/git/zip", async (req, res) => {
  try {
    const p = await pastaDoProjeto(req.params.projectId); if (!p) { res.status(404).json({ error: "Projeto não encontrado" }); return; }
    const h = String(req.query.hash || ""); if (!HASH.test(h)) { res.status(400).json({ error: "Versão inválida" }); return; }
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="versao-${h.slice(0, 7)}.zip"`);
    const pr = spawn("git", ["archive", "--format=zip", h], { cwd: p.dir, windowsHide: true });
    pr.on("error", (e) => { if (!res.headersSent) erro(res, e); else res.end(); });
    pr.stdout.pipe(res);
  } catch (e) { erro(res, e); }
});

// ── relatório de todo o histórico ────────────────────────────────────────────
router.get("/projects/:projectId/git/relatorio", async (req, res) => {
  try {
    const p = await pastaDoProjeto(req.params.projectId); if (!p) { res.status(404).json({ error: "Projeto não encontrado" }); return; }
    const txt = await git(p.dir, ["log", "--all", "--date-order", "--date=format:%d/%m/%Y %H:%M", "--format=========================================%nVersão %h  |  %ad  |  %an%n%s%n", "--stat=160"]);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="relatorio-historico.txt"');
    res.send("RELATÓRIO DO HISTÓRICO DO PROJETO\nGerado em " + new Date().toLocaleString("pt-BR") + "\n\n" + txt);
  } catch (e) { erro(res, e); }
});

// ── trazer o histórico de um arquivo .bundle (feito com "git bundle create") ─
router.post("/projects/:projectId/git/importar-bundle", upload.single("file"), async (req, res) => {
  const tmp = path.join(os.tmpdir(), "codelens-" + randomUUID() + ".bundle");
  try {
    const p = await pastaDoProjeto(req.params.projectId); if (!p) { res.status(404).json({ error: "Projeto não encontrado" }); return; }
    if (!req.file) { res.status(400).json({ error: "Escolha o arquivo .bundle" }); return; }
    await fs.writeFile(tmp, req.file.buffer);
    if (!(await ehRepo(p.dir))) await git(p.dir, ["init"]);
    await git(p.dir, ["bundle", "verify", tmp]).catch((e) => { throw Object.assign(new Error("Este arquivo não é um histórico válido (.bundle): " + (e as Error).message), { status: 400 }); });
    // traz todas as versões para "importado/…", sem mexer nos arquivos atuais
    await git(p.dir, ["fetch", "--no-tags", tmp, "+refs/*:refs/importado/*"]);
    const total = Number((await git(p.dir, ["rev-list", "--all", "--count"])).trim()) || 0;
    res.json({ ok: true, total });
  } catch (e) { erro(res, e); }
  finally { fs.unlink(tmp).catch(() => {}); }
});

export default router;
