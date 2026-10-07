/**
 * Leitor de .tar, .tar.gz e .tgz sem bibliotecas (os "exports" antigos da Replit).
 * Devolve só arquivos comuns; pastas, atalhos e links são ignorados.
 */
import zlib from "zlib";

export type EntradaTar = { nome: string; dados: Buffer };

function oct(b: Buffer, ini: number, tam: number): number {
  const s = b.toString("latin1", ini, ini + tam).replace(/\0.*$/s, "").trim();
  return s ? parseInt(s, 8) || 0 : 0;
}
function texto(b: Buffer, ini: number, tam: number): string {
  const f = b.indexOf(0, ini); return b.toString("utf8", ini, f >= 0 && f < ini + tam ? f : ini + tam);
}
export function ehTarOuGz(nome: string, buf: Buffer): boolean {
  if (/\.(tar|tgz|tar\.gz)$/i.test(nome)) return true;
  if (buf[0] === 0x1f && buf[1] === 0x8b) return true;
  return buf.length > 262 && buf.toString("latin1", 257, 262) === "ustar";
}
export function lerTar(entrada: Buffer): EntradaTar[] {
  const b = entrada[0] === 0x1f && entrada[1] === 0x8b ? zlib.gunzipSync(entrada, { maxOutputLength: 4 * 1024 * 1024 * 1024 }) : entrada;
  const out: EntradaTar[] = [];
  let p = 0, nomeLongo: string | null = null, pax: Record<string, string> = {};
  while (p + 512 <= b.length) {
    const cab = b.subarray(p, p + 512);
    if (cab.every((x) => x === 0)) break;
    let nome = texto(cab, 0, 100);
    const tam = oct(cab, 124, 12), tipo = String.fromCharCode(cab[156] || 48);
    const prefixo = cab.toString("latin1", 257, 262) === "ustar" ? texto(cab, 345, 155) : "";
    if (prefixo) nome = prefixo + "/" + nome;
    const ini = p + 512, fim = ini + tam;
    p = ini + Math.ceil(tam / 512) * 512;
    if (tipo === "L") { nomeLongo = texto(b, ini, tam); continue; }
    if (tipo === "x" || tipo === "g") {
      // registros "TAMANHO chave=valor\n" — o tamanho é em bytes, então lê em bytes
      const corpo = b.subarray(ini, fim); let i = 0; const loc: Record<string, string> = {};
      while (i < corpo.length) { const sp = corpo.indexOf(0x20, i); if (sp < 0) break; const n = parseInt(corpo.toString("latin1", i, sp), 10); if (!n) break; const reg = corpo.toString("utf8", sp + 1, i + n - 1); const eqi = reg.indexOf("="); if (eqi > 0) loc[reg.slice(0, eqi)] = reg.slice(eqi + 1); i += n; }
      if (tipo === "x") pax = loc; continue;
    }
    if (nomeLongo) { nome = nomeLongo; nomeLongo = null; }
    if (pax.path) nome = pax.path; pax = {};
    if (tipo !== "0" && tipo !== "\0" && tipo !== "7") continue; // só arquivos comuns
    nome = nome.replace(/^\.\//, "");
    if (!nome || nome.endsWith("/")) continue;
    out.push({ nome, dados: Buffer.from(b.subarray(ini, Math.min(fim, b.length))) });
  }
  return out;
}
