/**
 * Voz neural da Microsoft (a mesma do Edge), grátis, precisa de internet.
 * Padrão: voz Francisco, velocidade 1,15, tom 5% mais grave — dá para trocar no .env:
 *   TTS_VOZ=pt-BR-FranciscoNeural   (ou pt-BR-FranciscaNeural, pt-BR-AntonioNeural…)
 *   TTS_VELOCIDADE=1.15
 *   TTS_TOM=-5%
 * Lê o texto INTEIRO: textos longos são lidos em pedaços e juntados num áudio só.
 * 1º tenta pelo Node (pacote msedge-tts); 2º pelo Python (python -m edge_tts).
 */
import os from "os";
import path from "path";
import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";

const VOZ = () => process.env.TTS_VOZ || "pt-BR-FranciscoNeural";
const VELOCIDADE = () => Number(process.env.TTS_VELOCIDADE || "1.15") || 1.15;
const TOM = () => process.env.TTS_TOM || "-5%";

/** Divide em pedaços de até ~1500 letras, sem cortar frase no meio. */
export function pedacos(texto: string, max = 1500): string[] {
  const out: string[] = [];
  let atual = "";
  const frases = texto.match(/[^.!?;:\n]+[.!?;:]*\s*|\n+/g) || [texto];
  for (const f of frases) {
    if ((atual + f).length > max && atual.trim()) { out.push(atual.trim()); atual = ""; }
    if (f.length > max) { for (let i = 0; i < f.length; i += max) out.push(f.slice(i, i + max).trim()); continue; }
    atual += f;
  }
  if (atual.trim()) out.push(atual.trim());
  return out.filter(Boolean);
}

async function umPedacoNode(texto: string, voz: string): Promise<Buffer> {
  const mod: any = await import("msedge-tts");
  const tts = new mod.MsEdgeTTS();
  await tts.setMetadata(voz, mod.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  let out: any;
  try { out = tts.toStream(texto, { rate: VELOCIDADE(), pitch: TOM() }); }
  catch { out = tts.toStream(texto); }
  if (out && typeof out.then === "function") out = await out;
  const stream: NodeJS.ReadableStream = out && out.audioStream ? out.audioStream : out;
  const buf = await new Promise<Buffer>((resolve, reject) => {
    const parts: Buffer[] = [];
    const timer = setTimeout(() => reject(new Error("tempo esgotado")), 60000);
    stream.on("data", (c: Buffer) => parts.push(Buffer.from(c)));
    stream.on("end", () => { clearTimeout(timer); resolve(Buffer.concat(parts)); });
    stream.on("close", () => { clearTimeout(timer); resolve(Buffer.concat(parts)); });
    stream.on("error", (e: Error) => { clearTimeout(timer); reject(e); });
  });
  try { tts.close?.(); } catch {}
  if (buf.length < 100) throw new Error("áudio vazio");
  return buf;
}

async function umPedacoPython(texto: string, voz: string): Promise<Buffer> {
  const stamp = Date.now() + "_" + Math.random().toString(36).slice(2);
  const txtFile = path.join(os.tmpdir(), `tts_in_${stamp}.txt`);
  const mp3File = path.join(os.tmpdir(), `tts_out_${stamp}.mp3`);
  const rate = Math.round((VELOCIDADE() - 1) * 100);
  try {
    await fs.writeFile(txtFile, texto, "utf8");
    const py = process.platform === "win32" ? "python" : "python3";
    await promisify(execFile)(py, ["-m", "edge_tts", "--file", txtFile, "--voice", voz, `--rate=${rate >= 0 ? "+" : ""}${rate}%`, "--pitch=-5Hz", "--write-media", mp3File], { timeout: 60000 });
    return await fs.readFile(mp3File);
  } finally {
    fs.unlink(txtFile).catch(() => {});
    fs.unlink(mp3File).catch(() => {});
  }
}

export let ultimoErroTts = "";

export async function edgeTts(text: string, voice?: string): Promise<Buffer | null> {
  const voz = voice || VOZ();
  const partes = pedacos(text);
  if (!partes.length) return null;
  const audios: Buffer[] = [];
  for (const p of partes) {
    try { audios.push(await umPedacoNode(p, voz)); continue; }
    catch (e: any) { ultimoErroTts = "Node: " + (e?.message || e); }
    try { audios.push(await umPedacoPython(p, voz)); }
    catch (e: any) { ultimoErroTts += " | Python: " + (e?.message || e); return audios.length ? Buffer.concat(audios) : null; }
  }
  return Buffer.concat(audios);
}
