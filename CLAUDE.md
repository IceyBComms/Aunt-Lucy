# CLAUDE.md — Aunt Lucy Project Brief

> Read this file at the start of every session. It contains everything you need to understand what Aunt Lucy is, why it exists, how it makes money, and what to build next. Do not ask questions already answered here.

---

## Changelog — read this first

This file was substantially updated in July 2026 following an extended design session. If you've read an older version of this file, or code comments reference concepts not in this version, **this file wins.**

**Superseded / replaced:**
- Role model changed from Owner/Contributor/Helper/Carer (with a `page_members` table) to **Setup / Activator / Helper**, plus a first-class **admin** role with access tied to how it was created. See "The three roles" and "The admin role" below. The `page_members` table concept is retired — see "Data model implications."
- CTA language changed from "Gift an Aunt Lucy page" to **"Gift Aunt Lucy"** — the product is a character who takes care of things, not a page you're gifting.
- Activation copy changed from "your village will be waiting" to **"Ready when you are"** — "village" tested as too American for an Australian audience.
- Pricing structure finalised (see "Pricing" below) — supersedes both the $39–$59 figures and the $79/$59-team/"call" structure previously in this file.
- GST display rule simplified: **all prices are now GST-inclusive everywhere** (consumer and HR both). The old ex-GST-for-HR rule is retired.
- Hosting has moved off Replit: **Vercel (frontend) → Railway (backend) → Neon (Postgres) → Resend (email)**, domain via VentraIP DNS. Update anywhere this file still says Replit.

**New since the last version — not in the old file at all:**
- The author-vs-steer task model (Aunt Lucy + setup person author; recipient only ever steers, never required to)
- The link-is-not-the-lock access model (task sensitivity levels + a small trusted-contact list, not per-page roles)
- Trickle vs "ask everyone" pacing for how needs reach helpers
- Presence-vs-names visibility split for helpers
- The crisis-admin "born restrained" model and the transparency-plus-reversibility approach to impersonation (design-only, not being built yet — see "Parked, deliberately")

**Still accurate, carried forward unchanged:** GST itemisation requirements (receipts/invoices), Australian English requirement, "what Aunt Lucy is not," core brand tone, OpenAPI/Orval workflow.

A full narrative version of the design thinking behind these decisions lives in `aunt-lucy-design-overview.md` (not in the repo — ask Kate if you need the reasoning, not just the conclusion).

---

## What Aunt Lucy Is

**One-line summary:** Aunt Lucy is a private support registry that turns vague offers of help into meals, errands, visits and real-world support when families need it most.

**The feeling it must produce:** relief — the sense that someone is quietly taking care of everything. Test every screen against this: *does this feel like relief, or does it feel like homework?*

**Core mechanic:** An organiser creates a support page in minutes, shares one link, and helpers can claim slots — no app download, no account needed for helpers. Ever. Zero friction for helpers is the central differentiator and non-negotiable.

**The emotional truth:** When something big happens, people say "let me know if you need anything" — but the person who needs help is too exhausted, overwhelmed or uncomfortable to ask. Aunt Lucy removes that friction entirely, and removes it from *both* sides: the recipient never has to ask, and helpers never have to guess what's needed.

**Brand promise:** You're not gifting someone a tool to organise their own help — that's more work for someone already drowning. You're gifting them **Aunt Lucy**, someone who shows up and handles the logistics so they don't have to.

**Production stack:** Vercel (frontend) → Railway (Express backend) → Neon (PostgreSQL) → Resend (transactional email, `noreply@auntlucy.com.au`), domain via VentraIP DNS. React + Express, all TypeScript, pnpm monorepo (`artifacts/rally` = frontend, `artifacts/api-server` = backend). OpenAPI spec in `lib/api-spec/openapi.yaml`; Orval generates typed React Query hooks and Zod schemas — always update the spec first, then regenerate, never edit generated files directly.

---

## The three roles — the architectural spine

**Separate the roles, not the people.** Any human can wear any hat; a single person can wear all three.

- **Setup** — whoever preps the page (adds tasks, gathers contacts)
- **Activator** — whoever flips it live
- **Helper** — whoever claims a task

For a new-baby page, one calm parent usually wears Setup and Activator well in advance. For a future crisis use case, a close friend does Setup and Activation on the fly and the recipient may never touch config at all. Build these as separable hats — never hardcode an assumption that recipient = setup = activator — because that assumption is exactly what would force a rebuild later.

**Self-purchase** (someone buys Aunt Lucy for themselves) collapses buyer + Setup + Activator into one person and makes the keepsake/reveal step optional. It's not a special case requiring new logic — it's proof the roles-not-people model is right.

---

## The admin role

An **admin** is a person other than the recipient who's authorised to run the page on their behalf (e.g. a sister). This is a first-class role, not an afterthought — it recurs throughout the access model, the emergency contact flow, and task authoring.

**Two ways an admin comes to exist, with different starting trust:**

- **Invited** — the recipient (while lucid and consenting) adds them, or hands the whole page over. Born **full-access**, because the actual owner consented.
- **Self-started / crisis** *(design only — not being built yet, see "Parked, deliberately")* — someone stands up a page for a recipient who can't act or consent yet. Born **restrained**: can coordinate practical help (meals, lifts, childcare) immediately, but cannot expose private data or headline the recipient's identity until the recipient (or a verified close person) confirms.

**Reclaim:** the page always belongs to the recipient, even if they didn't create it. They can take it over or shut it down, always, unconditionally — but this is the *second* safety layer, not the first. Restraint-at-birth is what makes any future crisis-admin feature defensible; reclaim is what makes it respectful.

---

## The recipient's journey — relief at the centre

1. **Receives a keepsake** — "someone's got you." No tasks, no dashboard, nothing live yet.
2. **Opens it, already set up** — warm, mostly-right, pre-built. Never a blank page.
3. **Reviews, not builds** — one-tap approve or tweak (see "Author vs steer" below). This is the single highest-stakes screen in the product for the relief-vs-homework test.
4. **"Ready when you are"** — one button, activates now or schedules for later. The only *required* action in the whole recipient journey. Also carries the "let my sister run this" hand-off control.
5. **Page goes live** — Aunt Lucy runs the logistics; the recipient watches help arrive rather than managing a roster.

---

## Task authoring — author vs steer

The relief doesn't come from "pre-built" on its own — it comes from **the recipient never having to make decisions while depleted.** A wrongly pre-built page just swaps "decide what to ask for" for "decide what to correct," which is still a decision.

- **Authoring** (writing tasks) is lifted off the recipient entirely. Sources: **Aunt Lucy's occasion-aware pre-fill** (specific to the moment, not generic boilerplate — this is the product's edge) and the **setup/admin person**, who often knows the real specifics.
- **Steering** (one-tap keep / kill / quiet-approve) stays available to the recipient, always optional, never required.
- **Helpers proposing their own tasks** is a good future idea, deliberately not in scope for launch — it adds a decision to the recipient's plate that the rest of this model is designed to avoid.

---

## Access model — the link is not the lock

One link for everyone, always. The link is just the front door; access control lives in **what Aunt Lucy shows each person once they're inside**, not in who has the URL.

- Every task carries a **sensitivity level**: `anyone` (e.g. drop off a meal) or `trusted_only` (e.g. mind the baby, collect the kids). Default is `anyone`.
- The recipient (or admin) names a **small handful of trusted contacts** — this is tagging a few people, not ranking an entire contact list. Trust is the light exception added on top of a safe default, never a full sort.
- A neighbour and a close friend can open the identical link and see completely different sets of tasks.

**This replaces the old `page_members` per-page-role table concept.** Access is task-sensitivity + contact-trust-tag, not a role assigned per page.

---

## How needs reach people

Aunt Lucy does the asking — the recipient is never the one reaching out.

- **Trickle (default)** — asks go out in gentle waves, a few people/tasks at a time, so it feels like a thoughtful person coordinating rather than a mass "help wanted" blast. Avoids both the scramble (everything claimed in minutes) and the graveyard (forgotten link, nobody sees it).
- **Ask everyone (break-glass)** — a one-tap override for urgent needs. Warmth is the default; urgency is one tap away.

**Fuel for both:** a contact list with a light trust tag. This single piece underpins tiered access, trickle, the emergency-add flow, and ambient presence — treat it as foundational, not a minor feature.

**Contacts** are gathered as name + phone number (SMS reaches people; email risks the spam folder). Typing is the default entry method ("who are your people?" — a handful of names, not an address book). An optional import-from-phone-contacts path lands in a staging list the person ticks from — never poured straight into the trickle. *(Note: for v1 launch, typing-only is sufficient; import/staging can be deferred — see the build table.)*

**Emergency add** uses the same list and same trickle engine, just started thin: add a few key people fast (name + number, tagging optional), Aunt Lucy pings just them, add more if the need continues.

**The first message to a new helper** must read like a personal note from a friend, not software — name the mutual connection, explain gently, state "no pressure" outright. Aunt Lucy drafts it; a human reviews and sends (this also keeps it clear of Australia's Spam Act, since a reviewed personal message isn't bulk marketing). In the emergency-add path only, a pre-approved default message may fire immediately without review — speed matters more than polish in that moment.

---

## Opting out and claiming

- **Opting out is one tap** — no guilt, no account required, no confirmation dialog.
- **Claiming a specific task is the point** — helpers see only tasks they're eligible for (per the sensitivity model above) and claim what suits them. Ignoring a task is itself a silent, costless opt-out.
- Principle: **every "no" should be invisible and costless.** Never surface who declined or ignored anything.

---

## Helper visibility — presence vs names

Two different things, deliberately not conflated:

- **Ambient presence is always on** — e.g. "3 people are helping this week," slots visibly filling. Carries almost all of the warmth. No names required, no privacy cost.
- **Named attribution to other helpers is a per-person choice at the moment of claiming** — "show your name, or keep it just between you and [recipient]?" One tap, nudge warmly toward showing, never impose, never surprise someone after the fact.
- **The recipient always sees who claimed what**, regardless of the helper's visibility choice to others — this is the healing "look who showed up" payoff and is safe because the recipient is who the helper is there for.

---

## Privacy Requirements (Non-Negotiable)

**1. Unguessable random tokens — never sequential IDs.**
Support page and gift links must use a long random token, not sequential IDs. Sequential IDs like `/page/123` can be guessed. Support page URLs should look like `/s/xK9mR2pQ4w`, and a gift is reached only via its `redemption_token` — the internal gift id is never exposed in a URL. This is a security requirement, not a nice-to-have.

**2. No sensitive medical data.**
The product intentionally avoids storing clinical or medical information. The "situation" field is free text and deliberately vague. Do not add fields that would make this a medical record.

**3. PIN protection.**
Already built for protected support pages — maintain and improve this.

**4. Helper-name visibility is opt-in.**
A helper chooses at the moment of claiming whether their name is shown to other helpers. Never assume it, never default it on, and never surface it retrospectively. The recipient always sees who claimed what regardless — see "Helper visibility — presence vs names" above.

---

## Parked, deliberately — do not build yet

These were designed in depth (so the architecture doesn't get built into a corner) but are explicitly **not** in scope for the current build:

- **The crisis path in full** (self-started admin pages for someone who can't consent) — free when it launches, never marketed, a quiet homepage link only.
- **Impersonation/transparency-reversibility machinery** — only needed once the crisis path exists. The model, if/when built: no identity verification (it would kill the frictionless promise); instead, the recipient is told a page exists as early as possible and can reverse anything in one tap. Known-person impersonation (a controlling ex, an overbearing relative) is the one case this doesn't fully solve — that's handled by report-and-review, not prevention, and is an honest limitation, not a gap to silently patch over.
- **Helpers proposing their own tasks.**
- **Digital contributions** (UberEats/supermarket gift cards, cash contributions) — validated as a strong idea, parked until post-revenue. Data models should not preclude adding this later (a `contribution` task type and a `contributions_enabled` flag should remain easy to add; don't bake payment-intermediary logic in a way that would conflict with Stripe later).
- **Import-from-phone-contacts / staging list** — type-only contact entry is enough for launch.
- **Full trickle wave-pacing intelligence** — crude pacing (e.g. "trusted list first, then everyone") is enough for launch.
- **Stage 2 (ongoing carer circle) and Stage 3 (aged care / institutional B2B)** — future stages, not current work.

**If a task starts pulling toward any of the above "while you're in there," stop and flag it rather than building it.** This is a recurring risk: this design work is genuinely interesting, which makes it tempting to build ahead of what's needed for revenue.

---

## Pricing (confirmed July 2026 — this supersedes any other figures in this repo)

All prices are **GST-inclusive**, displayed as the total price. This applies to consumer and HR/corporate pricing alike — there is no separate ex-GST display tier.

**Consumer gift (individual):** $59

**HR / corporate gifting:**
- Individual gift — $79 ("One employee. The most thoughtful parental leave send-off you can give.")
- 5-pack — $329 total, $65.80/gift, saves $66 vs buying 5 individually
- 10-pack — $549 total, $54.90/gift, saves $241 vs buying 10 individually
- Annual subscription — "Let's talk" (sales conversation, no listed price; for organisations with regular, ongoing parental leave activity)

**Outstanding task:** Stripe payment links were created against older pricing and need updating to match the figures above before going live. Check this before assuming Stripe and this file agree.

---

## GST

Aunt Lucy is registered for GST in Australia (ABN required on all invoices and receipts).

**Display:** all customer-facing prices (consumer and HR) are shown GST-inclusive, as a single total. No "+ GST" display anywhere.

**Itemisation:** every purchase confirmation email and every invoice must still itemise:
- Price ex-GST
- GST amount (10%)
- Total inc. GST

**Invoices** (annual subscription / any invoiced HR purchase) must include the ABN, GST as a separate line item, total inc. GST, and an invoice number and date.

**Implementation:** do not hardcode the tax rate — use a `TAX_RATE` environment variable set to `0.10` so it can be updated if legislation changes. Nothing goes live with pricing that doesn't correctly compute and itemise GST.

---

## The gifting flow (Flow A — celebratory, the one being built)

1. **Buyer purchases** — friend, or HR manager, buys a gift
2. **Buyer optionally personalises** — recipient name, a message, a delivery date
3. **Team signs (corporate track only)** — HR shares a signing link; colleagues add name + short message (max 150 chars), no account needed, no editing after submission, closes automatically on delivery date
4. **Recipient receives the gift** — the keepsake/reveal moment, not yet live
5. **Recipient reviews and activates when ready** — nothing is visible to helpers until they activate (see "The recipient's journey" above)
6. **The page runs** — recipient, or an admin they've nominated, oversees it; Aunt Lucy does the ongoing coordination

**Key privacy principle, unchanged:** the recipient always holds the key. Nothing goes live until they activate.

A crisis/emergency flow (Flow B) exists conceptually — see "Parked, deliberately." Free when built, never referenced in consumer or HR-facing copy.

---

## The gift experience feature

**1. Signing page** (`/gift/[giftId]/sign`) — HR shares before delivery day. Colleagues add name + message (≤150 chars) + optional emoji/avatar. No account. Closes automatically on delivery date. Shows a running signer count.

**2. Gift experience page** (`/gift/[giftId]`) — the "unwrapping" moment. Full screen, mobile-first, scrollable. Sequence: recipient's name → organisation message → colleagues' messages revealed while scrolling → warm explanation of what Aunt Lucy is → activation button. Unguessable token URL. Tone: like a beautiful digital card, not SaaS onboarding.

**Activation button copy:** "Ready when you are" (not "your village will be waiting" — see Changelog).

**3. Reminder email** — sent via Resend if not activated by due date (or 14 days post-purchase if no due date given). Subject: "Ready when you are." Warm, brief, zero pressure, single send only.

**4. Database** — `gifts` and `gift_messages` tables exist (see repo). `gift_signings` also exists per memory of recent build status — confirm current schema against `lib/api-spec/openapi.yaml` rather than assuming from this file.

---

## Homepage architecture

- **auntlucy.com.au** — consumer homepage. Baby shower gift framing, warm, emotional. Primary CTA: **"Gift Aunt Lucy"** (not "Gift an Aunt Lucy page" — see Changelog).
- **auntlucy.com.au/employers** — HR landing page. Business case, stats, pricing (see Pricing above), invoice billing for the annual tier.
- **auntlucy.com.au/gift/[giftId]** — gift experience / unwrapping page.
- **auntlucy.com.au/gift/[giftId]/sign** — colleague signing page.
- **auntlucy.com.au/activate** — where recipients go after the gift experience to review/activate their page.

A quiet "For employers" link lives in the nav or footer of the consumer homepage — present, not competing. **Do not add category/occasion selection to the consumer homepage** — it stays warm and universal; tone is set later, during setup, not before.

---

## Data model implications

- `gifts`, `gift_signings`, `gift_messages` — built, merged, in production (Neon). Treat as current; verify shape against the OpenAPI spec before assuming field names.
- **Retire the `page_members` (Owner/Contributor/Helper/Carer) concept** from any planning — it's superseded by the sensitivity-level + trust-tag model described above. If it exists in code already, it needs reconciling with the new model, not extending.
- New tables implied by the current design (not yet confirmed built — check before assuming): a contacts/trust-tag table per page, and a sensitivity level on tasks/slots. Confirm actual state of the schema before building on top of it.
- Task/slot model should stay flexible enough to add a `contribution` type later without a rebuild (see "Parked, deliberately").

---

## Working mode: how much to check in

Kate works in **Accept Edits** mode, not Auto or Bypass — proceed without asking for routine file edits, tests, builds, git operations, and well-specified implementation work. **Still stop and ask first** for:

- Anything touching Stripe, pricing, payment links, or what happens after a payment succeeds (the fulfilment flow)
- Anything touching task sensitivity levels, the trusted-contact model, or default visibility of helper names
- Anything touching what an admin (especially a future crisis-admin) can see or do
- Any change to when/how outbound SMS or email fires automatically, or to trickle/ask-everyone pacing
- Any schema migration on `gifts`, `gift_signings`, `gift_messages`, contacts, or trust tags — or anything touching production data directly
- Any task that starts pulling in "Parked, deliberately" work not explicitly requested

If a task involves a genuine product judgment call — not just a coding one — pause and flag the options rather than picking one silently.

---

## What Aunt Lucy is not

- Not a care provider or clinical tool
- Not a meal delivery service
- Not a group chat or social network
- Not a generic sign-up sheet (SignUpGenius is the thing to be better than)
- Not a product that makes people feel needy, helpless or exposed
- Not trying to replace WhatsApp — trying to do the one thing WhatsApp can't: give everyone a shared visual picture of who's helping when, with no coordination required
- Not a replacement for professional mental health support

---

## Brand and tone

Warm. Practical. Human. Never clinical. Never corporate. Never transactional.

The product should make people feel like they have a capable, kind friend who has quietly sorted everything out.

- Helpers should feel like they're doing something genuinely useful, not filling out a form.
- Organisers/recipients should feel relieved, not burdened.
- The person being supported should feel loved, not needy.
- The gifting moment should feel considered and personal — like a thoughtful friend designed it, not like HR generated it.

---

## Australian context

Australian English throughout — "mum" not "mom," "neighbour" not "neighbor," "organisation" not "organization," "colour" not "color." Local terms matter: school pickup (not school run), GP (not physician), and similar. Copy, templates, email subject lines and UI labels should all reflect this.

---

## Tech stack reference

- **Frontend:** React with TypeScript, Vercel (auto-deploys from GitHub)
- **Backend:** Express with TypeScript, Railway
- **Database:** PostgreSQL via Drizzle ORM, Neon
- **API layer:** OpenAPI spec in `lib/api-spec/openapi.yaml` — Orval generates typed React Query hooks and Zod schemas. Update the spec first, then regenerate; never hand-edit generated files.
- **Email:** Resend (`noreply@auntlucy.com.au`)
- **Payments:** Stripe, under Icebreaker Communications
- **Package manager:** pnpm monorepo (`artifacts/rally` = frontend, `artifacts/api-server` = backend)
- **Auth:** Magic-link (passwordless) for organisers/admins. Helpers never authenticate.
- **Repo:** github.com/IceyBComms/Aunt-Lucy (public), GitHub username IceyBComms
- **Domain:** VentraIP DNS
- **Workflow:** Claude Code always branches, Kate merges via PR. One contained task at a time, review between stages.

---

*This file is the source of truth for every Claude Code session on Aunt Lucy. If anything here conflicts with code comments or other documentation, this file takes precedence. Update the Changelog section whenever a strategic decision changes — don't just silently edit the sections below it.*
