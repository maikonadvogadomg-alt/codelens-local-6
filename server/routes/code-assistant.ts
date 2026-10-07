import { Router, type IRouter } from "express";

const router: IRouter = Router();

/**
 * POST /api/code-assistant
 * Streaming endpoint for the free chat assistant.
 * Uses the client's own API key / URL / model.
 * Falls back to Replit Gemini if no key is provided.
 */
router.post("/code-assistant", async (req, res): Promise<void> => {
  const { message, history = [], apiKey, apiUrl, apiModel } = req.body as {
    message: string;
    history: Array<{ role: "user" | "assistant"; content: string }>;
    apiKey?: string;
    apiUrl?: string;
    apiModel?: string;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: "Mensagem vazia" });
    return;
  }

  const messages = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: message.trim() },
  ];

  // ── Set up SSE ──────────────────────────────────────────────────────────────
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendChunk = (text: string) => {
    res.write(`data: ${JSON.stringify({ text })}\n\n`);
  };
  const sendError = (msg: string) => {
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  };
  const sendDone = () => {
    res.write("data: [DONE]\n\n");
    res.end();
  };

  // ── No user key → try Replit Gemini (non-streaming, then fake stream) ───────
  if (!apiKey?.trim()) {
    const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    const geminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

    if (!baseUrl || !geminiKey) {
      sendError("Configure sua chave de API em Configurações, ou abra o assistente e adicione sua própria chave.");
      return;
    }

    try {
      const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${geminiKey}`,
        },
        body: JSON.stringify({ model: "gemini-2.0-flash", messages }),
      });

      if (!resp.ok) {
        const err = await resp.text();
        sendError(`Gemini: ${err.slice(0, 300)}`);
        return;
      }

      const data = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      sendChunk(text);
      sendDone();
    } catch (e: unknown) {
      sendError((e instanceof Error ? e.message : "Erro desconhecido").slice(0, 300));
    }
    return;
  }

  // ── User key → streaming from their provider ────────────────────────────────
  const effectiveUrl = (apiUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const effectiveModel = apiModel || "gpt-4o-mini";

  try {
    const upstream = await fetch(`${effectiveUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({ model: effectiveModel, messages, stream: true, max_tokens: 8000 }),
    });

    if (!upstream.ok) {
      const err = await upstream.text();
      sendError(`Erro ${upstream.status}: ${err.slice(0, 300)}`);
      return;
    }

    if (!upstream.body) {
      sendError("Sem corpo na resposta da API.");
      return;
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Handle client disconnect
    req.on("close", () => {
      reader.cancel();
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") {
          sendDone();
          return;
        }
        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
            citations?: string[];
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) sendChunk(delta);
          if (parsed.citations) {
            res.write(`data: ${JSON.stringify({ citations: parsed.citations })}\n\n`);
          }
        } catch {
          // skip malformed JSON
        }
      }
    }

    sendDone();
  } catch (e: unknown) {
    if (!(e instanceof Error) || e.message !== "canceled") {
      sendError((e instanceof Error ? e.message : "Erro desconhecido").slice(0, 300));
    }
  }
});

export default router;
