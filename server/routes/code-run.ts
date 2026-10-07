import { Router, type IRouter } from "express";
import { exec } from "child_process";
import os from "os";
import path from "path";
import fs from "fs/promises";

const router: IRouter = Router();

router.post("/code/run", async (req, res): Promise<void> => {
  const { code, language } = req.body;

  if (typeof code !== "string" || !code.trim()) {
    res.status(400).json({ error: "Código vazio" });
    return;
  }

  if (language !== "python") {
    res.status(400).json({ error: "Apenas Python é suportado por enquanto" });
    return;
  }

  const tmpFile = path.join(os.tmpdir(), `codelens_run_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);

  try {
    await fs.writeFile(tmpFile, code, "utf-8");
  } catch {
    res.status(500).json({ error: "Erro ao criar arquivo temporário" });
    return;
  }

  exec(
    `${process.platform === "win32" ? "python" : "python3"} "${tmpFile}"`,
    { timeout: 15_000, maxBuffer: 1024 * 1024 },
    async (error, stdout, stderr) => {
      await fs.unlink(tmpFile).catch(() => {});
      if (error && error.code === undefined) {
        // Timeout
        res.json({ output: stdout, error: "Tempo limite excedido (15s)" });
        return;
      }
      res.json({ output: stdout, error: stderr });
    }
  );
});

export default router;
