import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, projectsTable, settingsTable } from "@workspace/db";
import { CreateGithubRepoBody } from "@workspace/api-zod";
import { isBinaryFile } from "../lib/storage.js";
import { Octokit } from "@octokit/rest";
import path from "path";
import fs from "fs/promises";

const router: IRouter = Router();

interface FileToCommit {
  path: string;
  content: string;
  encoding: "utf-8" | "base64";
}

async function collectAllFiles(dir: string, prefix: string, files: FileToCommit[]): Promise<void> {
  const entries = await fs.readdir(dir);
  for (const entry of entries) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const fullPath = path.join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      await collectAllFiles(fullPath, rel, files);
    } else {
      const binary = isBinaryFile(entry);
      if (binary) {
        const buf = await fs.readFile(fullPath);
        files.push({ path: rel, content: buf.toString("base64"), encoding: "base64" });
      } else {
        try {
          const buf = await fs.readFile(fullPath);
          files.push({ path: rel, content: buf.toString("utf-8"), encoding: "utf-8" });
        } catch {
          const buf = await fs.readFile(fullPath);
          files.push({ path: rel, content: buf.toString("base64"), encoding: "base64" });
        }
      }
    }
  }
}

router.post("/github/create-repo", async (req, res): Promise<void> => {
  const parsed = CreateGithubRepoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { projectId, repoName, description, isPrivate } = parsed.data;

  const id = parseInt(projectId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid project ID" });
    return;
  }

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const settingsRows = await db.select().from(settingsTable).limit(1);
  const settings = settingsRows[0];

  if (!settings?.githubToken) {
    res.status(400).json({ error: "GitHub token not configured. Please go to Settings." });
    return;
  }

  const octokit = new Octokit({ auth: settings.githubToken });

  try {
    // Verify token first
    let user: { login: string };
    try {
      const { data } = await octokit.rest.users.getAuthenticated();
      user = data;
    } catch (authErr: any) {
      const status = authErr?.status ?? 0;
      if (status === 401 || status === 403) {
        res.status(400).json({ error: "Token GitHub inválido ou sem permissão. Verifique o token em Configurações." });
      } else {
        res.status(400).json({ error: "Não foi possível autenticar no GitHub. Verifique sua conexão e o token." });
      }
      return;
    }

    let repo: { html_url: string; full_name: string };
    try {
      const { data } = await octokit.rest.repos.createForAuthenticatedUser({
        name: repoName,
        description: description ?? undefined,
        private: isPrivate,
        auto_init: false,
      });
      repo = data;
    } catch (createErr: any) {
      const status = createErr?.status ?? 0;
      if (status === 422) {
        res.status(400).json({ error: `Repositório "${repoName}" já existe na conta ${user.login}. Escolha outro nome.` });
      } else {
        res.status(400).json({ error: createErr?.message ?? "Falha ao criar repositório no GitHub." });
      }
      return;
    }

    const files: FileToCommit[] = [];
    await collectAllFiles(project.storagePath, "", files);

    if (files.length === 0) {
      res.status(400).json({ error: "No files found in project" });
      return;
    }

    const treeItems = await Promise.all(
      files.map(async (f) => {
        const { data: blob } = await octokit.rest.git.createBlob({
          owner: user.login,
          repo: repoName,
          content: f.content,
          encoding: f.encoding,
        });
        return {
          path: f.path,
          mode: "100644" as const,
          type: "blob" as const,
          sha: blob.sha,
        };
      })
    );

    const { data: tree } = await octokit.rest.git.createTree({
      owner: user.login,
      repo: repoName,
      tree: treeItems,
    });

    const { data: commit } = await octokit.rest.git.createCommit({
      owner: user.login,
      repo: repoName,
      message: `Initial commit from CodeLens - ${project.name}`,
      tree: tree.sha,
      parents: [],
    });

    await octokit.rest.git.createRef({
      owner: user.login,
      repo: repoName,
      ref: "refs/heads/main",
      sha: commit.sha,
    });

    res.json({
      repoUrl: repo.html_url,
      repoName: repo.full_name,
      filesCommitted: files.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "GitHub API error";
    req.log.error({ err }, "GitHub repo creation failed");
    res.status(400).json({ error: message });
    return;
  }
});


// ════════════════════════════════════════════════════════════════════════════
// Conta do GitHub salva (como no SK): token guardado uma vez, nome na tela,
// lista dos repositórios, importar e ENVIAR para um repositório que já existe.
// ════════════════════════════════════════════════════════════════════════════
async function tokenSalvo(): Promise<string | null> {
  const [row] = await db.select().from(settingsTable).limit(1);
  return row?.githubToken?.trim() || null;
}
async function contaDe(token: string) {
  const { data } = await new Octokit({ auth: token }).rest.users.getAuthenticated();
  return { conectado: true, login: data.login, nome: data.name || data.login, avatar: data.avatar_url };
}

router.get("/github/conta", async (_req, res): Promise<void> => {
  const t = await tokenSalvo();
  if (!t) { res.json({ conectado: false }); return; }
  try { res.json(await contaDe(t)); }
  catch (e: any) { res.json({ conectado: false, erro: e?.status === 401 ? "O token salvo venceu ou foi apagado no GitHub. Cole um novo." : "Não consegui falar com o GitHub (sem internet?)." }); }
});

router.post("/github/token", async (req, res): Promise<void> => {
  const token = String(req.body?.token || "").trim();
  if (!token) { res.status(400).json({ error: "Cole o token." }); return; }
  let conta;
  try { conta = await contaDe(token); }
  catch (e: any) { res.status(400).json({ error: e?.status === 401 ? "Token recusado pelo GitHub. Confira se copiou inteiro." : "Não consegui falar com o GitHub." }); return; }
  const [row] = await db.select().from(settingsTable).limit(1);
  if (row) await db.update(settingsTable).set({ githubToken: token, updatedAt: new Date() }).where(eq(settingsTable.id, row.id));
  else await db.insert(settingsTable).values({ githubToken: token });
  res.json(conta);
});

router.delete("/github/token", async (_req, res): Promise<void> => {
  const [row] = await db.select().from(settingsTable).limit(1);
  if (row) await db.update(settingsTable).set({ githubToken: null, updatedAt: new Date() }).where(eq(settingsTable.id, row.id));
  res.json({ conectado: false });
});

router.get("/github/repos", async (_req, res): Promise<void> => {
  const t = await tokenSalvo(); if (!t) { res.status(400).json({ error: "Conecte sua conta do GitHub primeiro." }); return; }
  try {
    const octokit = new Octokit({ auth: t });
    const lista = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, { per_page: 100, sort: "updated" });
    res.json({ repos: lista.slice(0, 1000).map((r) => ({ nome: r.full_name, privado: r.private, atualizado: r.updated_at, ramo: r.default_branch, tamanhoKb: r.size, descricao: r.description || "" })) });
  } catch (e: any) { res.status(400).json({ error: e?.message || "Falha ao listar repositórios" }); }
});

router.post("/github/enviar", async (req, res): Promise<void> => {
  const t = await tokenSalvo(); if (!t) { res.status(400).json({ error: "Conecte sua conta do GitHub primeiro." }); return; }
  const id = parseInt(String(req.body?.projectId), 10), alvo = String(req.body?.repo || "");
  const mensagem = String(req.body?.mensagem || "").trim() || "Atualização pelo CodeLens " + new Date().toLocaleString("pt-BR");
  const m = /^([\w.-]+)\/([\w.-]+)$/.exec(alvo);
  if (isNaN(id) || !m) { res.status(400).json({ error: "Escolha o projeto e o repositório." }); return; }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Projeto não encontrado" }); return; }
  const [, owner, repo] = m, octokit = new Octokit({ auth: t });
  try {
    const { data: info } = await octokit.rest.repos.get({ owner, repo });
    const ramo = String(req.body?.ramo || "").trim() || info.default_branch || "main";
    const pai = async () => { try { const { data } = await octokit.rest.git.getRef({ owner, repo, ref: "heads/" + ramo }); return data.object.sha; } catch (e: any) { if (e?.status === 404 || e?.status === 409) return null; throw e; } };
    let parent = await pai();
    if (!parent) {
      // repositório vazio: o GitHub exige um primeiro arquivo antes de aceitar o envio
      await octokit.rest.repos.createOrUpdateFileContents({ owner, repo, path: "README.md", message: "Início", content: Buffer.from("# " + repo + "\n").toString("base64"), branch: ramo });
      parent = await pai();
    }
    const files: FileToCommit[] = []; await collectAllFiles(project.storagePath, "", files);
    const grandes = files.filter((f) => Buffer.byteLength(f.content, f.encoding === "base64" ? "base64" : "utf8") > 50 * 1024 * 1024).map((f) => f.path);
    const enviar = files.filter((f) => !grandes.includes(f.path));
    if (!enviar.length) { res.status(400).json({ error: "O projeto está vazio." }); return; }
    const itens: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [];
    for (let i = 0; i < enviar.length; i += 8) {
      const lote = await Promise.all(enviar.slice(i, i + 8).map(async (f) => { const { data } = await octokit.rest.git.createBlob({ owner, repo, content: f.content, encoding: f.encoding }); return { path: f.path, mode: "100644" as const, type: "blob" as const, sha: data.sha }; }));
      itens.push(...lote);
    }
    const { data: tree } = await octokit.rest.git.createTree({ owner, repo, tree: itens });
    const { data: commit } = await octokit.rest.git.createCommit({ owner, repo, message: mensagem, tree: tree.sha, parents: parent ? [parent] : [] });
    if (parent) await octokit.rest.git.updateRef({ owner, repo, ref: "heads/" + ramo, sha: commit.sha });
    else await octokit.rest.git.createRef({ owner, repo, ref: "refs/heads/" + ramo, sha: commit.sha });
    res.json({ ok: true, arquivos: itens.length, ignorados: grandes, url: `https://github.com/${owner}/${repo}/tree/${ramo}`, commit: commit.sha.slice(0, 7) });
  } catch (e: any) {
    const st = e?.status;
    res.status(400).json({ error: st === 404 ? "Repositório não encontrado ou o token não tem acesso a ele." : st === 403 ? "O token não tem permissão de escrita (marque \"repo\" ao criar o token)." : (e?.message || "Falha ao enviar") });
  }
});

export default router;
