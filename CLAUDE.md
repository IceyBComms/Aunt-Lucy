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
