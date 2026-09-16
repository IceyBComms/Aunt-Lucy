/**
 * Two app-wide guards, kept out of app.ts so tests can build an app with the
 * SAME wiring rather than a copy of it (app.ts imports every route, and so the
 * database).
 *
 * 1. ensureRequestBody — an empty request arrives as an empty object.
 *
 *    Express 5's body parsers leave `req.body` UNDEFINED when nothing was sent.
 *    Every handler in this server was written as if it were `{}`. The trusted
 *    invite's "Yes, I'll help with this" button sends its claim with no body, so
 *    `const { showName } = req.body` threw and every invited helper got
 *    "Something went wrong." from 22 July to 16 September 2026. Fixing it here
 *    fixes the whole class at once rather than one handler at a time.
 *
 * 2. logSafePath — no access token reaches the logs.
 *
 *    Several routes carry their credential IN THE PATH (an invite link, a
 *    manage link, a gift redemption link…). Both the request logger and the
 *    error handler logged the path with only the query string removed, so every
 *    request to one of those routes — not only the failing ones — wrote a
 *    working credential to Railway. The segment is replaced with ":redacted".
 *
 *    SECRET_PATH_PARAMS is the list of path parameters that are credentials.
 *    lib/requestHygiene.test.ts reads every route file and fails if a route uses
 *    one of those parameter names in a path this function does not redact — so a
 *    new token route cannot quietly start logging its token. A route that adds a
 *    NEW credential parameter name must add it to the list.
 */
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";

export function ensureRequestBody(req: Request, _res: Response, next: NextFunction): void {
  if (req.body === undefined) req.body = {};
  next();
}

/**
 * The body parsers, in order, as app.ts uses them. Stripe's raw parser is not
 * here — it has to be registered on its own path first (see app.ts).
 */
export function applyBodyParsers(app: Express): void {
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  // After BOTH parsers: either one leaves the body undefined when the request
  // isn't its content type, so only after the last of them is "still undefined"
  // known to mean "nothing was sent".
  app.use(ensureRequestBody);
}

/**
 * Path parameters that are, by themselves, enough to see or act on something.
 * `slug` is here because a support page's slug is its unguessable front-door
 * token (CLAUDE.md, privacy requirement 1).
 *
 * Not listed, but still redacted by its rule below: /unsubscribe/:contactId,
 * which acts on that id alone. `contactId` can't go in this list because the
 * same name under /manage/:token/contacts/:contactId is an ordinary id behind
 * the manage token.
 */
export const SECRET_PATH_PARAMS = [
  "token",
  "redemptionToken",
  "signingToken",
  "organiserToken",
  "secret",
  "slug",
] as const;

/**
 * Each rule matches the path up to and including the secret segment. Anchored
 * on the prefix so an organiser's `/organiser/pages/:pageId` (an id behind a
 * session, not a credential) is left readable for diagnosis.
 */
const REDACTIONS: RegExp[] = [
  /^(\/api)?(\/invite\/)[^/]+/,
  /^(\/api)?(\/manage\/)[^/]+/,
  /^(\/api)?(\/slots\/(?:release|reschedule|note)\/)[^/]+/,
  /^(\/api)?(\/gifts\/)[^/]+/,
  /^(\/api)?(\/sign\/)[^/]+/,
  /^(\/api)?(\/card\/)[^/]+/,
  /^(\/api)?(\/calendar\/)[^/]+/,
  /^(\/api)?(\/welcome\/)[^/]+/,
  /^(\/api)?(\/admin\/stats\/)[^/]+/,
  /^(\/api)?(\/pages\/)[^/]+/,
  /^(\/api)?(\/unsubscribe\/)[^/]+/,
];

export function logSafePath(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  let path = url.split("?")[0];
  for (const rule of REDACTIONS) {
    path = path.replace(rule, (_m, api: string | undefined, prefix: string) => `${api ?? ""}${prefix}:redacted`);
  }
  return path;
}

interface ErrorLogger {
  error: (obj: object, msg: string) => void;
}

/**
 * Centralised error handler. Without this, unhandled errors thrown in any route
 * or middleware are logged only minimally, making production 500s hard to
 * diagnose. Log the full error (message + stack) and return a generic 500. Must
 * be registered last and keep all four parameters so Express treats it as
 * error-handling middleware.
 */
export function createErrorHandler(log: ErrorLogger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    log.error(
      {
        err:
          err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack }
            : err,
        method: req.method,
        // originalUrl, not url: inside a mounted router `url` is rewritten
        // relative to the mount point, and the redaction rules are anchored.
        url: logSafePath(req.originalUrl ?? req.url),
      },
      "Unhandled request error",
    );

    if (res.headersSent) {
      return;
    }
    res.status(500).json({ error: "Something went wrong." });
  };
}
