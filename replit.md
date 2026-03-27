# Workspace

## Overview

**Rally** — a community crisis support coordination app. Helps friends and family coordinate practical support for someone going through a crisis (meals, school pickups, errands etc.). One person creates a support page with help slots, shares a single link, and helpers claim slots with no login or account required.

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React 19 + Vite + Tailwind CSS v4
- **Routing**: Wouter
- **Data fetching**: TanStack React Query
- **Forms**: React Hook Form + Zod resolver
- **Animations**: Framer Motion
- **Date formatting**: date-fns
- **Fonts**: Lora (serif headings), Plus Jakarta Sans (body) via Google Fonts

## Brand Design

- **Background**: `#FAF7F2` (warm off-white) → HSL `40 33% 96%`
- **Primary**: `#2D6A4F` (deep sage green) → HSL `153 40% 30%`
- **Accent**: `#E76F51` (warm terracotta, CTAs) → HSL `12 76% 61%`
- **Text**: `#2C2C2C` (near black) → HSL `0 0% 17%`
- **Muted**: `#8B7E74` (warm grey) → HSL `26 11% 50%`
- **Surface**: white cards with soft shadows, rounded corners (`--radius: 1rem`)
- **Tone**: Warm, human, calm — used during life's hardest moments

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   └── rally/              # React + Vite frontend (Rally app, served at /)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
│   └── src/seed.ts         # Database seed script
├── pnpm-workspace.yaml     # pnpm workspace
├── tsconfig.base.json      # Shared TS options
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Database Schema

### `support_pages` table
- `id` (uuid, PK), `slug` (unique — used in URL)
- `organiser_id` (nullable for now — auth not yet built)
- `recipient_name`, `recipient_contact` (private), `situation_description`, `location`
- `status` enum: `draft | pending_approval | active | closed`
- `privacy` enum: `open | pin_protected`
- `pin` (plain text for MVP — hash in future), `approval_token`
- `created_at`, `closed_at`

### `slots` table
- `id` (uuid, PK), `page_id` (FK → support_pages, cascade delete)
- `slot_type` enum: `meal | school_pickup | errand | dog_walking | shopping | visit | other`
- `custom_label` (for "other" type), `slot_date`, `slot_time`, `notes`
- `is_claimed`, `claimed_by_name`, `claimed_by_contact` (private, never shown publicly), `claimed_note`
- `reminder_sent`, `created_at`

## API Endpoints

- `GET /api/pages/:slug?pin=XXXX` — fetch support page + slots
  - 401 if PIN-protected and no/wrong PIN
  - 404 if not found or closed
- `POST /api/slots/:slotId/claim` — claim a slot `{ firstName, contact, note? }`
  - 409 if already claimed
  - 404 if slot doesn't exist
- `GET /api/healthz` — health check

## Frontend Routes (Rally app)

- `/` → Home (redirects to `/s/test-page` in development)
- `/s/:slug` → Public support page (helper experience)
  - Loads page data, shows open/claimed slots
  - PIN entry screen if page is `pin_protected`
  - Warm 404 if not found
  - Claim dialog overlay (no login required)

## Test Data

Seed script: `pnpm --filter @workspace/scripts run seed`

- `/s/test-page` — Active page for "Sarah" in Fitzroy, Melbourne. Mix of open and claimed slots (Jess claimed a meal, Marcus claimed a meal).
- `/s/pin-test-page` — PIN-protected page for "Alex" (PIN: 1234). Two open slots.

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — only emit `.d.ts` files during typecheck
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/rally` (`@workspace/rally`)

React + Vite web app. Currently only the helper (public visitor) experience is built. No authentication required for helpers.

- Entry: `src/main.tsx`
- App: `src/App.tsx` — React Query, Wouter router
- Pages: `src/pages/SupportPage.tsx`, `src/pages/Home.tsx`
- Components: `src/components/SlotCard.tsx`, `src/components/ClaimDialog.tsx`
- Custom hook: `src/hooks/use-rally.ts`
- Styles: `src/index.css` — Tailwind v4 + Rally brand colors + Google Fonts

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for validation and `@workspace/db` for persistence.

- Routes: `health.ts`, `pages.ts` (GET /pages/:slug), `slots.ts` (POST /slots/:id/claim)
- Depends on: `@workspace/db`, `@workspace/api-zod`

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.

- Schema: `support_pages` and `slots` tables (see above)
- Push schema: `pnpm --filter @workspace/db run push`

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and Orval config. Run codegen:
`pnpm --filter @workspace/api-spec run codegen`

### `scripts` (`@workspace/scripts`)

Utility scripts. Run seed: `pnpm --filter @workspace/scripts run seed`

## What's Built vs. Planned

### ✅ Built (Task #1)
- Helper experience (Flow 3): Support page + slot claiming
- Database schema (support_pages, slots)
- API endpoints for reading pages and claiming slots
- Seed data for development testing
- PIN-protected page support
- Warm 404 page

### 🔜 Coming Next
- Organiser flow: Create page (Flow 1)
- Third-party setup flow: Create on behalf of someone (Flow 2)
- Authentication: Magic link email sign-in (Resend)
- Dashboard: Organiser page management
- Email notifications: Confirmation, reminders, thank-you
- Homepage and privacy policy
