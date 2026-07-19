# CLAUDE.md — Aunt Lucy Project Brief

> Read this file at the start of every session. It contains everything you need to understand what Aunt Lucy is, why it exists, how it makes money, and what to build next. Do not ask questions already answered here.

---

## What Aunt Lucy Is

**One-line summary:** Aunt Lucy is a private support registry that turns vague offers of help into meals, errands, visits and real-world support when families need it most.

**Core mechanic:** An organiser creates a support page in under three minutes, shares one link, and helpers can claim slots — no app download, no account needed for helpers. Ever.

**The emotional truth:** When something big happens, people say "let me know if you need anything" — but the person who needs help is too exhausted, overwhelmed or uncomfortable to ask. Aunt Lucy removes that friction entirely.

**The product today:** A working MVP lives at https://auntlucy.replit.app — magic-link auth for organisers, a 3-step page creation wizard, PIN-protected pages, and a helper claim flow. Built with React + Express + PostgreSQL, all TypeScript, organised as a pnpm monorepo. The OpenAPI spec lives in `lib/api-spec/openapi.yaml`. Orval generates typed React Query hooks and Zod schemas from that spec automatically.

---

## The Three-Stage Product Roadmap

Do not mix these stages. Build Stage 1 completely before touching Stage 2.

### Stage 1 — Now (current sprint)
**Event support coordination.** One-off support pages for acute life moments.

Use cases:
- New baby / postpartum (primary commercial focus)
- Surgery or illness recovery
- Diagnosis support (e.g. cancer)
- Bereavement
- Hospital stay

The organiser sets up the page. Helpers claim slots. Done.

### Stage 2 — Months 4–6
**Ongoing carer circle.** Same database architecture as Stage 1, but the page has no end date and includes a one-tap "I need help this week" button for the carer.

Use cases:
- Dementia carer support (e.g. adult children helping a parent care for a spouse)
- Chronic illness long-term coordination
- Disability support within a trusted network

Key difference from Stage 1: any trusted family member can *add* tasks (not just the organiser), and the carer themselves has an ultra-simple one-tap interface — they never manage the page.

### Stage 3 — Months 7–12
**Institutional / aged care.** The facility mentions Aunt Lucy to families; families self-serve. B2B conversations begin here.

Use cases:
- Aged care resident visit coordination (staggered visits, lift sharing, laundry reminders)
- Hospital discharge support
- NDIS coordination
- Workplace parental leave benefit

---

## The Commercial Model

**Golden rule: the person who needs help never pays. The person who wants to give pays.**

### Free forever
- Creating a support page is always free
- This is non-negotiable — it is core to the brand and the ethics of the product

### Paid — Stage 2 feature, not Stage 1
**The Gift Page ($39–$59 AUD)**
A friend, family member or baby shower host buys a premium support registry as a gift. They pay; the recipient gets the full-featured page. This is a gifting transaction, not a software subscription. It should feel like buying someone a present, not signing up for SaaS.

**What free vs paid looks like:**

| Feature | Free (self-serve) | Gift Page (paid) |
|---|---|---|
| Who creates it | Anyone | A friend or host on behalf of someone |
| Page duration | 4 weeks | 8 weeks |
| Templates | Basic | Occasion-specific, warm copy |
| Reminder emails to helpers | No | Yes — automated |
| Thank-you messages | No | Yes — personalised, scheduled |
| "Gifted by" note | No | Yes — feels like a present |
| Dietary / preferences field | No | Yes |

**Workplace / Partner ($199–$299 AUD per employee) — Stage 3**
Employers buy Aunt Lucy for employees going on parental leave. Doulas, maternity photographers and childbirth educators bundle it with their services. The professional or employer pays; the family benefits.

**B2B Institutional Licence ($1,500–$15,000 AUD/year) — Stage 3**
Hospitals, aged care providers, NDIS coordinators and community health organisations. Approached only after real usage data and case studies exist from Stages 1 and 2.

---

## The Homepage and Tone Strategy

**Do not add category selection to the homepage.** The homepage is warm and universal. The current headline — "When someone needs help, make it easy to give it" — is correct. Do not change it.

Tone is set during page creation, not before it. In Step 1 of the wizard ("About the support page"), there is a quiet radio button field:

> **What's the occasion?**
> ○ New baby or pregnancy  ○ Illness or recovery  ○ Loss or bereavement  ○ Ongoing support  ○ Something else

This field:
- Sets the tone for template suggestions ("Congratulations!" vs "We're thinking of you")
- Is completely invisible to helpers — it only affects the organiser experience
- Never affects pricing or access
- Does not appear on the homepage

---

## The Permissions Model

This is the architecture for Stage 2 but should be designed into the database now so it does not require a rebuild later.

Four roles on every support page:

| Role | Who | What they can do |
|---|---|---|
| **Owner** | The adult child or friend who sets up the page | Everything — create, edit, delete, invite, see private notes |
| **Contributor** | A trusted family member | Add tasks, claim slots, edit their own tasks only — cannot invite/remove people or see private notes |
| **Helper** | Grandson, neighbour, colleague | Claim and unclaim slots only — no account needed, identified by their invite link |
| **Carer** | The person being supported (e.g. Mum) | One-tap "I need help" button and mark tasks done — cannot change anything else |

**Database table to add (Stage 2 prep):**
```
page_members
  page_id       → which page
  user_id       → which person (null for helpers — they don't have accounts)
  role          → 'owner' | 'contributor' | 'helper' | 'carer'
  invite_token  → the unique link they used to join
  joined_at     → timestamp
```

The existing `pages` and `slots` tables do not need to change. This table sits on top and controls access. Every Express route checks this table before doing anything — like a bouncer at the door.

---

## Privacy Requirements (Non-Negotiable)

**1. Random URL tokens — fix this in Stage 1 if not already done.**
Support page URLs must use a long random token, not sequential IDs. Sequential IDs like `/page/123` can be guessed. The URL should look like `/s/xK9mR2pQ4w` — impossible to guess. This is a security requirement, not a nice-to-have.

**2. Page visibility toggle (Stage 2).**
The owner can toggle whether helper names are shown or hidden on claimed slots. Some families do not want siblings knowing who has or hasn't visited. Options: "Show who's helping" vs "Show slots as claimed only."

**3. PIN protection.**
Already built — maintain and improve this.

**4. No sensitive medical data.**
The product intentionally avoids storing clinical or medical information. The "situation" field is free text and deliberately vague. Do not add fields that would make this a medical record.

---

## Current Build Status (as of July 2026)

**Confirmed built:**
- Magic-link authentication for organisers (email → sign-in link, no password)
- 3-step page creation wizard (About → Add slots → Done)
- PIN-protected pages
- Multiple task/slot categories (meals, school pickups, grocery runs, dog walking, visits, errands)
- Basic landing page with correct positioning

**Suspected incomplete or missing — verify and fix in order:**
1. Email delivery — magic links and notifications may not actually send in production (check for a real email provider like Resend.com — if it's using a test/fake service, fix this first, nothing else works without it)
2. Mobile responsiveness — most helpers will click the link on their phone, this must be excellent
3. Organiser dashboard — "see all my pages" view may be incomplete
4. Helper claim flow end-to-end — verify a helper can claim a slot from a phone without an account
5. Random URL tokens for security (see Privacy above)
6. Email notifications when a slot is claimed
7. Reminder emails to helpers before their slot

---

## Stage 1 Sprint Priorities (Do These in Order)

1. **Audit** — read the full codebase and produce a gap analysis against the "suspected missing" list above
2. **Email delivery** — get a real email provider working (Resend.com recommended — generous free tier, simple API, excellent for transactional email)
3. **Mobile** — test the full helper flow on a real phone and fix anything broken
4. **Security** — confirm page URLs use random tokens, not sequential IDs
5. **Organiser dashboard** — a simple list of pages the organiser has created
6. **Claim notifications** — email to organiser when someone claims a slot
7. **Helper reminders** — email to helper 24 hours before their claimed slot
8. **Occasion selector** — add the quiet radio button to Step 1 of the wizard (see Tone Strategy above)
9. **Templates** — pre-populated slot suggestions based on occasion type

**Do not build:** payment flows, the gift model, the ongoing carer circle, the permissions system, or any B2B features until all of the above are solid.

---

## Go-to-Market — Stage 1

**Primary positioning:**
> Aunt Lucy for New Parents: the baby shower support registry for the help new parents actually need.

**Secondary positioning (broader):**
> Aunt Lucy helps families coordinate practical support during life's overwhelming moments.

**Who pays:** Baby shower hosts, close friends, and family members — not the person who needs help.

**First distribution channels:**
- Facebook groups (new parents, local community, mums groups)
- Warm personal introductions from the founder
- Doulas, maternity photographers, childbirth educators (referral partners)
- A simple "apply for our pilot" form for healthcare organisations

**First success metric:** 50 real support pages created by real people who were not asked by the founder.

---

## Australian Context

This product is built for Australia. Use Australian English throughout — "mum" not "mom", "neighbour" not "neighbor", "organisation" not "organization", "colour" not "color". Copy, templates, email subject lines and UI labels should all reflect Australian language and context. References to school pickup (not school run), GP (not physician), and similar local language matter.

---

## Tech Stack Reference

- **Frontend:** React with TypeScript
- **Backend:** Express with TypeScript
- **Database:** PostgreSQL
- **API layer:** OpenAPI spec in `lib/api-spec/openapi.yaml` — Orval generates typed React Query hooks and Zod schemas automatically. Always update the spec first, then regenerate — never edit generated files directly.
- **Package manager:** pnpm monorepo
- **Auth:** Magic-link (passwordless) — organisers only. Helpers never authenticate.
- **Hosting:** Currently Replit — migrating to a proper host (Vercel for frontend, Railway or Fly.io for backend) is a future task, not urgent

---

## What Aunt Lucy Is Not

- Not a care provider or clinical tool
- Not a meal delivery service
- Not a group chat or social network
- Not a generic sign-up sheet (SignUpGenius is the thing to be better than)
- Not a product that makes people feel needy, helpless or exposed
- Not trying to replace WhatsApp — trying to do the one specific thing WhatsApp cannot: give everyone a shared visual picture of who is helping when, with no coordination required

---

## Brand and Tone

Warm. Practical. Human. Never clinical. Never corporate. Never transactional.

The product should make people feel like they have a capable, kind friend who has quietly sorted everything out. The name "Aunt Lucy" should feel like exactly that — a reliable, practical aunt who just gets things done without any fuss.

Helpers should feel like they're doing something genuinely useful, not filling out a form.
Organisers should feel relieved, not burdened.
The person being supported should feel loved, not needy.

---

*This file is the source of truth for every Claude Code session on Aunt Lucy. If anything here conflicts with code comments or other documentation, this file takes precedence. Update it when strategic decisions change.*

---

## Strategic update — July 2026

### Commercial focus locked in

The platform is built generically but marketed exclusively to the **post-birth moment** for the first six months. All marketing, copy and product decisions should reflect this focus unless explicitly told otherwise.

Two revenue tracks run in parallel:

**Track 1 — Consumer gifting**
Friends or family buy an Aunt Lucy page as a baby shower gift. Price point ~$79 AUD. Builds brand virally and slowly.

**Track 2 — Corporate gifting (HR)**
HR managers buy Aunt Lucy pages as a parental leave gift for employees going on leave. Price points:
- Individual gift: $79 AUD per employee
- Team package: $59 AUD per employee, minimum 5, maximum 20
- Annual subscription: requires a call (20+ employees)

Corporate gifting is the priority revenue channel because it involves a single decision-maker with a budget and a clear problem to solve.

---

### The gifting flow (Flow A — celebratory)

This is the primary commercial flow. It works as follows:

1. **Buyer purchases** — friend at baby shower or HR manager buys a gift page
2. **Buyer optionally personalises** — adds recipient name, a message, chooses delivery date
3. **Team signs (corporate track)** — HR shares a signing link with colleagues who add messages before delivery day
4. **Recipient receives the gift** — a beautiful digital unwrapping experience (see below)
5. **Recipient activates when ready** — they control everything; nothing goes live until they do
6. **Organiser runs the page** — could be the recipient or a trusted person they nominate

**Key privacy principle:** The recipient always holds the key. Nothing is visible to helpers until the recipient activates.

A crisis/emergency flow (Flow B) also exists conceptually but is **not being built yet**. It will be free when it launches. Do not reference it in any consumer or HR-facing copy.

---

### The gift experience feature (priority build)

This is the hero feature that makes Aunt Lucy feel like a gift rather than a transaction. It consists of four components:

**1. The signing page** (`/gift/[giftId]/sign`)
- HR shares this link with colleagues before delivery day
- Colleagues add name + short message (max 150 chars) + optional emoji/avatar
- No account or login required for signers
- Closes automatically on the delivery date
- Shows a running count of messages added ("12 people have signed so far")

**2. The gift experience page** (`/gift/[giftId]`)
- The "unwrapping" moment — the hero experience
- Full screen, mobile-first, scrollable
- Sequence: recipient's name → organisation message → colleagues' messages revealed as they scroll → warm explanation of what Aunt Lucy is → activation button at the bottom
- Unique unguessable token URL (same pattern as support page slugs)
- Tone: warm, unhurried, human — like a beautiful digital card, not a SaaS onboarding flow
- Activation button language: "Activate whenever you're ready — your village will be waiting"

**3. Reminder email**
- Sent via Resend if recipient hasn't activated by their due date (or 14 days after purchase if no due date provided)
- Subject: "Whenever you're ready, your village is waiting"
- Warm, brief, zero pressure
- Single send only — no repeated nudging
- Contains their gift experience page link

**4. Database additions required**

New `gifts` table:
- `gift_id` (unguessable token)
- `recipient_name`
- `recipient_email`
- `due_date` (optional)
- `organisation_message`
- `delivery_date`
- `activated_at` (null until recipient activates)
- `purchased_by` (organiser/HR email)

New `gift_messages` table:
- `gift_id` (foreign key)
- `signer_name`
- `message`
- `created_at`

**Build priority order:**
1. Database schema
2. Gift experience page
3. Signing page
4. Reminder email

---

### Future feature — digital contributions (do not build yet)

The platform will eventually allow helpers who are remote or unable to help physically to contribute digitally — UberEats credit, supermarket gift cards, or a cash contribution toward a support fund.

**Do not build any UI or payment logic for this yet.**

However, please ensure all data models and database schema decisions do not preclude adding a contributions layer later. Specifically:
- The helper/slot model should allow for a "digital contribution" slot type in future
- The gifts table should allow for a `contributions_enabled` boolean field to be added later
- No payment intermediary logic should be baked into the current architecture in a way that would conflict with Stripe integration later

---

### Homepage architecture

**auntlucy.com.au** — Consumer homepage. Baby shower gift framing. Emotional, warm, gifting focus. Primary CTA: "Gift an Aunt Lucy page"

**auntlucy.com.au/for-employers** — HR landing page. Business case, stats, pricing, invoice billing. Primary CTA: "Gift it to your team" or "Book a chat" for annual subscription tier.

**auntlucy.com.au/gift/[giftId]** — Gift experience page. Recipients land here from their gift email.

**auntlucy.com.au/gift/[giftId]/sign** — Signing page. Colleagues land here from HR's shared link.

**auntlucy.com.au/activate** — Where recipients go after the gift experience page to set up their support page.

A quiet "For employers" link lives in the nav or footer of the consumer homepage — present but not competing.

---

### What Aunt Lucy is not

- Not a care provider
- Not a clinical tool
- Not a replacement for professional mental health support
- Not a meal delivery service
- Not a babysitting agency

It is a coordination platform for existing trusted networks.

---

### Tone and brand principles

Warm, practical, human. Never clinical. Never corporate. Never transactional.

The language should never make recipients feel needy, helpless or exposed.

Helpers should always feel like they're doing something meaningful, not completing a task.

The gifting moment should feel considered and personal — like something a thoughtful friend designed, not something HR generated.

---

### GST

Aunt Lucy is registered for GST in Australia (ABN required on all invoices and receipts).

**GST handling by context:**

**All prices are GST-inclusive, in every context — consumer and corporate alike.**
The Stripe payment links charge the inclusive amount, and `lib/gst.ts` derives the
ex-GST and GST components from that single figure. Quoting an ex-GST price anywhere
would advertise one number and charge another.

**Consumer purchases (baby shower / individual gifting)**
Display prices GST-inclusive. Example: "$59" means $53.64 + $5.36 GST. No separate GST line needed at browse/marketing stage. GST must be itemised on the receipt/confirmation email.

**Corporate/HR purchases**
Display prices GST-inclusive too, noted as "GST included". Example: "$79" means $71.82 + $7.18 GST. GST must be itemised on the tax invoice, alongside the ABN — that is how HR claims it back. Do NOT display "$79 + GST": the payment link charges $79 total, so an ex-GST display would quote $86.90 and charge $79.

> Changed July 2026 (Item 2). This section previously required corporate prices to
> display ex-GST with "plus GST" noted. That contradicted the Stripe payment links,
> which charge the GST-inclusive amount, and contradicted `lib/gst.ts`, which treats
> every stored `amountCents` as GST-inclusive. Inclusive display everywhere is the
> ruling; HR still gets the GST itemised on the tax invoice.

**Annual subscription (HR)**
Invoice billing. All invoices must include:
- Aunt Lucy's ABN
- GST amount as a separate line item
- Total inc. GST
- Invoice number and date

**Receipts and confirmations**
All automated purchase confirmation emails (consumer and corporate) must itemise:
- Price ex-GST
- GST amount (10%)
- Total inc. GST

**Checkout and payment**
When Stripe or equivalent payment processing is integrated, ensure GST is calculated and recorded correctly against each transaction. Do not hardcode tax rates — use a TAX_RATE environment variable set to 0.10 so it can be updated if legislation changes.

**Nothing should go live with pricing that does not correctly handle GST.**
