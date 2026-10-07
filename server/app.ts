import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ extended: true, limit: "500mb" }));

app.use("/api", router);
// Endereço /api que não existe: responde em JSON (antes voltava "metade de um HTML")
app.use("/api", (req, res) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} /api${req.path}` });
});

// A tela já montada (npm run build) fica em  dist/  e é servida aqui mesmo,
// no mesmo endereço do servidor — assim não precisa de "carteiro".
const frontendDist = path.resolve(import.meta.dirname, "..", "dist");

if (fs.existsSync(path.join(frontendDist, "index.html"))) {
  app.use(express.static(frontendDist, { index: false }));
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.type("html").send(
      '<meta charset="utf-8"><body style="font-family:sans-serif;background:#141414;color:#eee;padding:24px">' +
        "<h2>O servidor está ligado ✅</h2><p>Mas a tela ainda não foi montada. " +
        "Feche e abra de novo pelo <b>iniciar.bat</b> (ele monta sozinho), ou rode <code>npm run build</code>.</p></body>",
    );
  });
}

export default app;
