import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import pinoHttp from "pino-http";
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Centralised error handler. Without this, unhandled errors thrown in any
// route or middleware are logged only minimally, making production 500s hard to
// diagnose. Log the full error (message + stack) and return a generic 500.
// Must be registered last and keep all four parameters so Express treats it as
// error-handling middleware.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  logger.error(
    {
      err:
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : err,
      method: req.method,
      url: req.url?.split("?")[0],
    },
    "Unhandled request error",
  );

  if (res.headersSent) {
    return;
  }
  res.status(500).json({ error: "Something went wrong." });
});

export default app;
