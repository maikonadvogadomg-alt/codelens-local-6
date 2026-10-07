// Usado pelo app pronto para Windows (Abrir-CodeLens.bat):
// liga o servidor com o Node que vem junto, espera ficar pronto e abre o navegador.
import { spawn } from "child_process";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const PORT = Number(process.env.PORT || 8080);
const URL_APP = `http://localhost:${PORT}`;

const tsx = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const server = spawn(process.execPath, [tsx, path.join("server", "index.ts")], {
  stdio: "inherit",
  env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" },
});
server.on("close", (code) => process.exit(code ?? 0));

const start = Date.now();
const tick = () => {
  http.get(`${URL_APP}/api/healthz`, (r) => {
    r.resume();
    console.log(`\n  🌐 Abrindo ${URL_APP} — se não abrir sozinho, digite esse endereço no navegador.\n`);
    if (!process.env.NO_BROWSER) {
      const c = process.platform === "win32" ? ["cmd", ["/c", "start", "", URL_APP]] : ["xdg-open", [URL_APP]];
      try { spawn(c[0], c[1], { stdio: "ignore", detached: true }).unref(); } catch {}
    }
  }).on("error", () => (Date.now() - start > 90000 ? console.log("\n  ⚠ Demorou demais para ligar. Veja a mensagem vermelha acima.\n") : setTimeout(tick, 700)));
};
tick();
