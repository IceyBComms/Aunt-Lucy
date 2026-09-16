import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { applyBodyParsers, createErrorHandler, logSafePath } from "./lib/requestHygiene";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          // Query string dropped AND credential path segments redacted — see
          // logSafePath in lib/requestHygiene.ts.
          url: logSafePath(req.originalUrl ?? req.url),
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

// Stripe verifies its webhooks against the byte-exact request body, so this one
// path is parsed as a raw Buffer. It must be registered before express.json():
// body-parser marks the request as parsed, and json() then skips it. Every other
// route is unaffected.
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));

// JSON + urlencoded, then an empty request becomes `{}` rather than undefined
// (Express 5). See lib/requestHygiene.ts for the invite-claim crash this fixes.
applyBodyParsers(app);

app.use("/api", router);

app.use(createErrorHandler(logger));

export default app;
