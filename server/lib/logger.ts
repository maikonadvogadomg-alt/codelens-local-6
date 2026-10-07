import pino from "pino";

import { createRequire } from "module";

let hasPretty = false;
try { createRequire(import.meta.url).resolve("pino-pretty"); hasPretty = true; } catch {}
const isProduction = process.env.NODE_ENV === "production" || !hasPretty;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "warn",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
