import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, snippetsTable } from "@workspace/db";

const router: IRouter = Router();

// List all snippets (most recent first)
router.get("/snippets", async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(snippetsTable).orderBy(desc(snippetsTable.createdAt));
    res.json(rows.map((r) => ({ ...r, id: String(r.id) })));
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar snippets" });
  }
});

// Create snippet
router.post("/snippets", async (req, res): Promise<void> => {
  try {
    const { title = "Sem título", html = "", css = "", js = "", mode = "html" } = req.body;
    const [row] = await db
      .insert(snippetsTable)
      .values({ title, html, css, js, mode })
      .returning();
    res.json({ ...row, id: String(row.id) });
  } catch (err) {
    res.status(500).json({ error: "Erro ao salvar snippet" });
  }
});

// Rename snippet
router.patch("/snippets/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { title } = req.body;
    if (!title?.trim()) {
      res.status(400).json({ error: "Título não pode ser vazio" });
      return;
    }
    const [row] = await db
      .update(snippetsTable)
      .set({ title: title.trim() })
      .where(eq(snippetsTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Snippet não encontrado" });
      return;
    }
    res.json({ ...row, id: String(row.id) });
  } catch (err) {
    res.status(500).json({ error: "Erro ao renomear snippet" });
  }
});

// Delete snippet
router.delete("/snippets/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.delete(snippetsTable).where(eq(snippetsTable.id, id));
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: "Erro ao excluir snippet" });
  }
});

export default router;
