import pino from "pino";

const isDevelopment = process.env.NODE_ENV === "development";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  // pino-pretty is a dev-only dependency and runs as a worker-thread transport.
  // Enable it only when NODE_ENV is explicitly "development"; default to plain
  // JSON logging everywhere else so production never depends on it (an unset
  // NODE_ENV must not pull in pino-pretty).
  ...(isDevelopment
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : {}),
});
