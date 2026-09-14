/**
 * The claim every invite send starts with — read as SQL, with no database.
 *
 * Two callers share it (lib/queuedInviteSender.ts): the cron, for every page,
 * and — Kate's ruling, 14 Sep 2026 — the publish route, for the one page it
 * just made live. So the claim has two jobs, and each is tested beside its
 * control:
 *   1. It never claims a draft's invites — for EITHER caller. A publish must
 *      not become a way round "nothing leaves a draft".
 *   2. A publish claims ONLY its own page. Without the page filter, publishing
 *      page A would send every due invite on every live page.
 *
 * Building a query and reading `.toSQL()` never opens a connection. The URL
 * below points nowhere on purpose, and is set BEFORE the import so the real
 * .env can never be the one in use.
 */
import { beforeAll, describe, expect, it } from "vitest";

let claimQueuedInvites: typeof import("./inviteClaimQuery").claimQueuedInvites;

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://nobody:nothing@127.0.0.1:1/none";
  ({ claimQueuedInvites } = await import("./inviteClaimQuery"));
});

const now = new Date("2026-09-14T09:00:00Z");
const PAGE_FILTER = '"helper_invites"."page_id" = $';
const LIVE_OR_CLOSED = /"support_pages"\."status" in \(\$\d+, \$\d+\)/;

describe("the cron's claim — every page", () => {
  it("claims queued, due invites — the positive control", () => {
    const { sql, params } = claimQueuedInvites({ now, limit: 100 }).toSQL();
    expect(sql).toMatch(/^update "helper_invites" set "status" = \$1/);
    expect(params.slice(0, 3)).toEqual(["sending", "queued", now.toISOString()]);
    expect(sql).toContain('inner join "support_pages" on "helper_invites"."page_id" = "support_pages"."id"');
    expect(params).toContain(100);
  });

  it("only on pages that are live or closed — never a draft's", () => {
    const { sql, params } = claimQueuedInvites({ now, limit: 100 }).toSQL();
    expect(sql).toMatch(LIVE_OR_CLOSED);
    expect(params).toEqual(expect.arrayContaining(["active", "closed"]));
    expect(params).not.toContain("draft");
  });

  it("is not narrowed to one page", () => {
    const { sql } = claimQueuedInvites({ now, limit: 100 }).toSQL();
    expect(sql).not.toContain(PAGE_FILTER);
  });
});

describe("the publish claim — the one page that just went live", () => {
  it("is narrowed to that page, and to nothing else", () => {
    const { sql, params } = claimQueuedInvites({ now, limit: 100, pageId: "page-A" }).toSQL();
    expect(sql).toContain(PAGE_FILTER);
    expect(params).toContain("page-A");
  });

  it("still refuses a draft — publishing is not a way round the guard", () => {
    const { sql, params } = claimQueuedInvites({ now, limit: 100, pageId: "page-A" }).toSQL();
    expect(sql).toMatch(LIVE_OR_CLOSED);
    expect(params).toEqual(expect.arrayContaining(["active", "closed"]));
    expect(sql).toContain('"helper_invites"."status" = $');
    expect(sql).toContain('"helper_invites"."scheduled_for" <= $');
  });
});
