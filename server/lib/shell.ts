/**
 * Terminal que funciona no Windows, no Linux, no Mac e no Termux.
 * Antes o código só chamava "sh", que não existe no Windows.
 */
import { spawn, execSync, type SpawnOptions } from "child_process";

export const IS_WIN = process.platform === "win32";

/** Roda um comando de texto no terminal do sistema (cmd no Windows, sh nos outros). */
export function spawnShell(command: string, opts: SpawnOptions) {
  if (IS_WIN) {
    return spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `"${command}"`], {
      ...opts,
      windowsVerbatimArguments: true,
      windowsHide: true,
    });
  }
  return spawn("sh", ["-c", command], opts);
}

/** Acha a pasta de um programa (npm, node…). */
export function whichDir(cmd: string): string | null {
  try {
    const out = execSync(IS_WIN ? `where ${cmd}` : `which ${cmd} 2>/dev/null`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const first = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    return first || null;
  } catch {
    return null;
  }
}

/** Encerra um processo e os filhos dele. */
export function killTree(pid: number | undefined, signal: NodeJS.Signals = "SIGTERM") {
  if (!pid) return;
  if (IS_WIN) {
    try { execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" }); } catch {}
    return;
  }
  try { process.kill(-pid, signal); } catch {
    try { process.kill(pid, signal); } catch {}
  }
}

/** Libera uma porta presa (só Linux/Mac; no Windows é ignorado). */
export function freePort(port: number) {
  if (IS_WIN) return;
  try { execSync(`fuser -k ${port}/tcp 2>/dev/null`, { timeout: 2000 }); } catch {}
}
