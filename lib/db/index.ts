/**
 * Banco de dados local — substitui o "@workspace/db" que ficou preso na Replit.
 *
 * Antes: Postgres na nuvem (Neon), precisava de DATABASE_URL e senha.
 * Agora: PGlite — o mesmo Postgres, só que rodando dentro do próprio Node,
 * guardado na pasta  dados/banco  ao lado do programa. Sem internet, sem senha.
 * O resto do código (drizzle) continua igualzinho.
 */
import path from "path";
import fs from "fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pgTable, serial, text, integer, timestamp, uniqueIndex, customType } from "drizzle-orm/pg-core";

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), "dados"));
const STORAGE_BASE = path.resolve(process.env.STORAGE_PATH ?? path.join(DATA_DIR, "projetos"));
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(STORAGE_BASE, { recursive: true });

/**
 * A pasta de cada projeto é guardada só pelo nome (slug) e montada na hora
 * com a pasta atual. Assim dá para mover a pasta do programa (ou trocar de PC)
 * sem os projetos se perderem.
 */
const projectFolder = customType<{ data: string; driverData: string }>({
  dataType: () => "text",
  toDriver: (v) => path.basename(String(v).replace(/\\/g, "/")),
  fromDriver: (v) => path.join(STORAGE_BASE, path.basename(String(v).replace(/\\/g, "/"))),
});

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  storagePath: projectFolder("storage_path").notNull(),
  fileCount: integer("file_count").notNull().default(0),
  sizeBytes: integer("size_bytes").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const projectFilesTable = pgTable(
  "project_files",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    content: text("content").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("project_files_project_path").on(t.projectId, t.path)],
);

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  aiApiKey: text("ai_api_key"),
  aiBaseUrl: text("ai_base_url"),
  aiModel: text("ai_model"),
  githubToken: text("github_token"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const snippetsTable = pgTable("snippets", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default("Sem título"),
  html: text("html").notNull().default(""),
  css: text("css").notNull().default(""),
  js: text("js").notNull().default(""),
  mode: text("mode").notNull().default("html"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Abre o banco com segurança. Se ele estiver estragado (ex.: o computador
 * desligou ou reiniciou com o app aberto), o banco velho é GUARDADO DE LADO
 * (não apaga nada) e um banco novo é criado — o app volta a funcionar.
 */
const PONTEIRO = path.join(DATA_DIR, "banco-atual.txt");
function pastaDoBanco(): string {
  try { const n = fs.readFileSync(PONTEIRO, "utf8").trim(); if (n && !n.includes("..") && !/[\\/]/.test(n)) return path.join(DATA_DIR, n); } catch {}
  return path.join(DATA_DIR, "banco");
}
async function abrirBancoSeguro(): Promise<{ banco: PGlite; recuperado: boolean }> {
  const dir = pastaDoBanco();
  fs.mkdirSync(dir, { recursive: true });
  let banco: PGlite | null = null;
  try {
    banco = new PGlite(dir);
    await banco.query("select 1");
    return { banco, recuperado: false };
  } catch (e: any) {
    try { await banco?.close(); } catch {}
    const carimbo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const lado = dir + "-com-defeito-" + carimbo;
    let novo = dir;
    try { fs.renameSync(dir, lado); }
    catch { novo = path.join(DATA_DIR, "banco-" + carimbo); } // Windows às vezes não deixa renomear: usa outra pasta
    fs.mkdirSync(novo, { recursive: true });
    try { fs.writeFileSync(PONTEIRO, path.basename(novo), "utf8"); } catch {}
    const aviso = `O banco local estava estragado e foi refeito em ${new Date().toLocaleString("pt-BR")}.\n` +
      `Motivo técnico: ${e?.message || e}\n` +
      `O banco antigo NÃO foi apagado: ${fs.existsSync(lado) ? lado : dir}\n` +
      `Causa mais comum: o computador desligou/reiniciou com o app aberto.\n`;
    try { fs.writeFileSync(path.join(DATA_DIR, "AVISO-banco-recuperado.txt"), aviso, "utf8"); } catch {}
    console.error("\n  ⚠ " + aviso.replace(/\n/g, "\n  ") + "\n");
    return { banco: new PGlite(novo), recuperado: true };
  }
}
const aberto = await abrirBancoSeguro();
// Fecha o banco direito quando a janela preta é fechada (evita estragar de novo)
let fechando = false;
async function fecharBanco(sinal: string) {
  if (fechando) return; fechando = true;
  try { await aberto.banco.close(); } catch {}
  process.exit(sinal === "SIGINT" ? 130 : 0);
}
for (const s of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) { try { process.on(s as NodeJS.Signals, () => { void fecharBanco(s); }); } catch {} }

const client = aberto.banco;

// Cria as tabelas na primeira vez (não apaga nada se já existirem)
await client.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_count INTEGER NOT NULL DEFAULT 0,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS project_files (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    content TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS project_files_project_path ON project_files(project_id, path);
  CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    ai_api_key TEXT,
    ai_base_url TEXT,
    ai_model TEXT,
    github_token TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS snippets (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Sem título',
    html TEXT NOT NULL DEFAULT '',
    css TEXT NOT NULL DEFAULT '',
    js TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL DEFAULT 'html',
    created_at TIMESTAMP NOT NULL DEFAULT now()
  );
`);

export const db = drizzle(client);

// Banco refeito ou vazio: reencontra os projetos pelas pastas em dados/projetos (os arquivos nunca saíram do disco)
async function reencontrarProjetos() {
  const r = await client.query<{ n: number }>("select count(*)::int as n from projects");
  if ((r.rows[0]?.n ?? 0) > 0) return;
  let pastas: string[] = [];
  try { pastas = fs.readdirSync(STORAGE_BASE, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith(".")).map((d) => d.name); } catch { return; }
  for (const slug of pastas) {
    let qtd = 0, tam = 0;
    const anda = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === "node_modules" || e.name === ".git") continue; const f = path.join(d, e.name); if (e.isDirectory()) anda(f); else { qtd++; try { tam += fs.statSync(f).size; } catch {} } } };
    try { anda(path.join(STORAGE_BASE, slug)); } catch {}
    await client.query("insert into projects (slug, name, storage_path, file_count, size_bytes) values ($1, $2, $3, $4, $5)", [slug, slug.replace(/-\d+$/, "").replace(/[-_]+/g, " "), path.join(STORAGE_BASE, slug), qtd, tam]);
  }
  if (pastas.length) console.log(`\n  ↺ ${pastas.length} projeto(s) reencontrado(s) na pasta dados/projetos.\n`);
}
try { await reencontrarProjetos(); } catch (e) { console.error("  (não consegui reencontrar os projetos:", (e as Error).message, ")"); }
export { STORAGE_BASE, DATA_DIR };
