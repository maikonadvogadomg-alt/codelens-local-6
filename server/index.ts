import app from "./app";
import { logger } from "./lib/logger";

// Antes: sem PORT ele "desligava sozinho". Agora usa 8080 se ninguém disser outra.
const port = Number(process.env["PORT"] || 8080);

const server = app.listen(port, () => {
  logger.info({ port }, "Servidor ligado");
  console.log(`\n  ✅ CodeLens ligado em  http://localhost:${port}\n  (deixe esta janela aberta; para desligar, feche-a ou aperte Ctrl+C)\n`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n  ⚠ A porta ${port} já está em uso. Talvez o CodeLens já esteja aberto em http://localhost:${port}\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
