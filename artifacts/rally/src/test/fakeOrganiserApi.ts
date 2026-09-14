/**
 * An in-memory stand-in for the organiser API, for rally's render tests.
 *
 * Swapped in for `@/lib/api` with vi.mock. It JOURNALS every call, because the
 * claims these tests make are mostly absences ("did not save", "did not
 * publish"), and an absence is only worth something beside a record of what
 * actually was requested. It also keeps the page's real state, so a test can
 * assert what the server now holds rather than what the screen says.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface FakeSlot {
  id: string;
  slotType: string;
  customLabel: string | null;
  slotDate: string | null;
  slotTime: string | null;
  trustedHelpersOnly: boolean;
  isClaimed: boolean;
  [field: string]: unknown;
}

export interface FakePage {
  id: string;
  slug: string;
  recipientName: string;
  status: string;
  slots: FakeSlot[];
}

export interface Call {
  method: string;
  path: string;
  body: any;
}

function freshPage(overrides: Partial<FakePage> = {}): FakePage {
  return {
    id: "page-1",
    slug: "xK9mR2pQ4w",
    recipientName: "Nadia",
    status: "draft",
    slots: [],
    ...overrides,
  };
}

export const server = {
  page: freshPage(),
  calls: [] as Call[],
  nextId: 1,
};

export function resetServer(overrides: Partial<FakePage> = {}) {
  server.page = freshPage(overrides);
  server.calls = [];
  server.nextId = 1;
}

/** Every request that created a task. */
export const slotPosts = () =>
  server.calls.filter(
    (c) => c.method === "POST" && /^\/organiser\/pages\/[^/]+\/slots$/.test(c.path),
  );

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const body = typeof options.body === "string" ? JSON.parse(options.body) : undefined;
  server.calls.push({ method, path, body });

  // Never synchronous: a real request resolves on a later tick, and the
  // in-flight window is exactly where double-writes live.
  await new Promise((r) => setTimeout(r, 5));

  const { page } = server;

  if (method === "GET" && path === `/organiser/pages/${page.id}`) {
    return JSON.parse(JSON.stringify(page)) as T;
  }

  if (method === "POST" && path === `/organiser/pages/${page.id}/slots`) {
    const row: FakeSlot = { id: `slot-${server.nextId++}`, isClaimed: false, ...body };
    page.slots.push(row);
    return { id: row.id } as T;
  }

  if (method === "POST" && /^\/organiser\/pages\/[^/]+\/slots\/[^/]+\/invites$/.test(path)) {
    return {} as T;
  }

  const del = path.match(/^\/organiser\/slots\/(.+)$/);
  if (method === "DELETE" && del) {
    page.slots = page.slots.filter((s) => s.id !== del[1]);
    return undefined as T;
  }

  throw new ApiError(404, `fake server has no route for ${method} ${path}`);
}
