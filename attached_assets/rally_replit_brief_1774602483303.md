# Rally — Replit Build Brief
*A community crisis support coordination app*

---

## Project Overview

**Rally** is a web app that helps friends and family coordinate practical support for someone going through a crisis — a child in hospital, a serious illness, a bereavement, or any situation where a community wants to help but coordination becomes chaotic.

The core concept: one person creates a support page with help slots (meals, school pickups, errands etc.), shares a single link, and their network claims slots — no app download, no account required for helpers.

---

## Tech Stack (Recommended)

- **Frontend:** React + Tailwind CSS
- **Backend:** Node.js / Express
- **Database:** PostgreSQL (via Supabase — free tier is fine for MVP)
- **Auth:** Supabase Auth (email magic link — no passwords)
- **Email:** Resend or SendGrid (free tier) for notifications and reminders
- **Hosting:** Replit (development) → Vercel or Railway for production

---

## Design Direction

**Tone:** Warm, human, calm. This is used during some of the hardest moments in people's lives. It should feel like a trusted friend — not clinical, not corporate, not cheerful in a hollow way.

**Aesthetic:** Soft and organic. Think warm off-white backgrounds, gentle earth tones, rounded corners, generous whitespace. No harsh blacks, no cold blues, no startup-generic purple gradients.

**Typography:** A warm serif for headings (something like Lora or Playfair Display), clean readable sans-serif for body text (DM Sans or Plus Jakarta Sans). Never Inter or Roboto.

**Colours:**
- Background: `#FAF7F2` (warm off-white)
- Primary: `#2D6A4F` (deep sage green — calm, natural, trustworthy)
- Accent: `#E76F51` (warm terracotta — for CTAs and highlights)
- Text: `#2C2C2C` (near black, not harsh)
- Muted: `#8B7E74` (warm grey for secondary text)
- Surface: `#FFFFFF` with subtle `box-shadow`

**Logo/Name:** "Rally" — the idea of rallying people around someone. Simple wordmark, no complex icon needed at MVP.

---

## User Roles

There are three user types:

1. **Organiser** — creates and manages the support page. Has an account. Can be the person in crisis or a friend acting on their behalf.
2. **Recipient** — the person being supported. May or may not have an account. Must approve the page if someone else created it for them.
3. **Helper** — clicks the shared link, claims a slot. No account required. No app download.

---

## Core User Flows

### Flow 1 — Organiser creates a page for themselves

1. Land on homepage → click "Create a support page"
2. Sign up with email (magic link — no password)
3. Answer simple setup questions:
   - Who is this page for? → "It's for me"
   - First name only (displayed publicly)
   - Brief situation description (optional — prompted to keep vague)
   - Location (suburb/city — for helpers to know if local help is relevant)
4. Add help slots:
   - Slot type (meal, school pickup, errand, dog walking, shopping, company/visit, other)
   - Date and time
   - Any notes (e.g. "vegetarian household", "school is St Kilda Primary, 3:30pm")
   - Repeat option (daily, weekly)
5. Choose privacy setting:
   - Open link (anyone with the link can view and claim)
   - PIN protected (helpers need a simple 4-digit code)
6. Preview page → Publish
7. Share screen — shows the link and suggested message to copy/paste into WhatsApp, text, or email

---

### Flow 2 — Organiser creates a page on behalf of someone else

1. Same start → step 3 changes:
   - Who is this page for? → "It's for someone else"
   - Enter their name and mobile number or email
   - A message is sent to that person: *"[Organiser name] wants to set up a support page for you on Rally. Here's what they're planning. Click here to review and approve it before anything goes live."*
2. Page is created in DRAFT state — not visible to anyone yet
3. Organiser can still set up slots in the meantime
4. Recipient receives notification, reviews the page, can edit the description or remove any detail they're not comfortable with, then approves
5. Only after approval does the page go live and the organiser receive the shareable link

---

### Flow 3 — Helper claims a slot

1. Receives a link (WhatsApp, text, email — doesn't matter)
2. Opens the page — NO login required, NO app download
3. Sees:
   - Brief situation description (first name + optional context)
   - Visual grid/list of slots — clearly showing OPEN vs CLAIMED
4. Clicks an open slot → small overlay appears:
   - Enter first name
   - Enter mobile number (shown only to organiser, never public)
   - Optional note ("I'll drop it off around 6:30pm")
   - Click "I've got this"
5. Slot immediately shows as claimed with their first name
6. Helper receives a confirmation SMS or email
7. Helper receives a reminder the day before

---

### Flow 4 — Organiser manages the page

1. Logs in → sees their dashboard
2. Can see all slots — claimed and unclaimed
3. Can add new slots at any time
4. Can mark a slot as complete
5. Can send a thank you message to all helpers (one click)
6. Can close the page when support period is over
7. All data deleted 90 days after page is closed (shown clearly to users)

---

## Pages / Screens Required

### Public Pages (no login)

**1. Homepage (`/`)**
- Headline: *"When someone needs help, Rally makes it easy to show up."*
- Simple explanation of how it works — 3 steps max
- Two CTAs: "Create a support page" and "See how it works"
- Brief section on privacy and trust
- Footer with privacy policy link and contact

**2. Support Page (`/s/[page-slug]`)**
- Person's first name and situation (if provided)
- Help slots displayed clearly — open slots visually distinct from claimed ones
- Each slot shows: type, date, time, notes, and either "Claimed by [First Name]" or a "I can help with this" button
- PIN entry screen if PIN-protected
- Simple footer: "Powered by Rally — create your own support page"

**3. Claim Slot overlay (on the support page)**
- First name field
- Mobile/email field
- Optional note
- "I've got this" button
- Confirmation message on submit

**4. Approval Page (`/approve/[token]`)**
- For recipients approving a page set up on their behalf
- Shows preview of how the page will look
- Simple edit field for the description
- "Looks good — publish it" button
- "I need to change something" option

---

### Authenticated Pages (organiser only)

**5. Dashboard (`/dashboard`)**
- List of their active support pages
- Quick status: X slots filled, Y still open
- Link to each page

**6. Create Page (`/create`)**
- Multi-step form as described in Flow 1/2 above
- Progress indicator
- Save as draft at any point

**7. Manage Page (`/manage/[page-id]`)**
- Full slot view with claimed/unclaimed status
- Add slot button
- Edit page description
- Privacy settings toggle
- Send thank you button
- Close page button
- Copy shareable link button (prominent)

**8. Auth pages**
- Sign up / Sign in (magic link — just an email field)
- "Check your email" confirmation screen

---

## Database Schema

```
users
  id (uuid, primary key)
  email (string, unique)
  created_at (timestamp)

support_pages
  id (uuid, primary key)
  slug (string, unique — used in the URL)
  organiser_id (uuid, foreign key → users)
  recipient_name (string — first name only)
  recipient_contact (string — mobile or email, private)
  situation_description (text, optional)
  location (string, optional)
  status (enum: draft, pending_approval, active, closed)
  privacy (enum: open, pin_protected)
  pin (string, optional — hashed)
  approval_token (string — for the approval email link)
  created_at (timestamp)
  closed_at (timestamp, nullable)

slots
  id (uuid, primary key)
  page_id (uuid, foreign key → support_pages)
  slot_type (enum: meal, school_pickup, errand, dog_walking, shopping, visit, other)
  custom_label (string, optional — for "other" type)
  slot_date (date)
  slot_time (time, optional)
  notes (text, optional)
  is_claimed (boolean, default false)
  claimed_by_name (string, nullable)
  claimed_by_contact (string, nullable — never shown publicly)
  claimed_note (text, nullable)
  reminder_sent (boolean, default false)
  created_at (timestamp)
```

---

## Email / SMS Notifications Required

1. **Magic link sign in** — "Here's your sign in link for Rally"
2. **Page approval request** — sent to recipient when someone sets up a page on their behalf
3. **Page live confirmation** — sent to organiser when recipient approves
4. **Slot claimed confirmation** — sent to helper immediately after claiming
5. **Slot reminder** — sent to helper 24 hours before their slot
6. **Thank you message** — organiser sends one message, delivered to all helpers

Start with email only. SMS is a nice-to-have for v2.

---

## Privacy & Data Handling

- Helper contact details (mobile/email) are stored but **never shown publicly** — visible only to the organiser
- Helper names are shown publicly on the page as first name only
- Page description should prompt the organiser to keep details vague
- PIN protection option available for sensitive situations
- Pages and all associated data are **automatically deleted 90 days after closing**
- No data is ever sold or shared with third parties
- A plain-English privacy policy page is required at `/privacy`

---

## MVP Scope — What's In and What's Out

### In for MVP
- Full create/manage flow for organisers
- Third-party setup with approval flow
- Helper claiming without login
- Email notifications (magic link, approval, confirmation, reminder, thank you)
- PIN protection option
- Mobile-responsive design (many helpers will open the link on their phone)
- Basic dashboard

### Deliberately Out of MVP (save for v2)
- SMS notifications
- Payment/fundraising integration
- Photo uploads
- Social sharing features
- In-app messaging between helpers
- Recurring pages (for ongoing care situations)
- Multi-language support
- Native mobile app

---

## Important UX Details

- **Mobile first.** Helpers will almost always open the link on their phone. The support page and slot claiming flow must be perfect on mobile.
- **No friction for helpers.** The path from link to claimed slot should take under 30 seconds. No account creation, no app download, no email verification.
- **Warm empty states.** When a page has no slots yet, or all slots are claimed, the messages should be human and warm — not generic placeholder text.
- **Claimed state is satisfying.** When someone claims a slot, the visual confirmation should feel genuinely good — a small moment of "I've done something real to help."
- **The shareable link screen matters.** After publishing, the organiser sees the link prominently with a suggested message pre-written and ready to copy. Make sharing frictionless.

---

## Suggested MVP Pre-written Copy

**Homepage headline:** *"When someone needs help, Rally makes it easy to show up."*

**Sub-headline:** *"Create a simple support page, share one link, and your community can sign up for meals, pickups, and errands — no app, no account, no fuss."*

**Empty slot state:** *"No slots added yet — add the first thing people can help with."*

**All slots claimed state:** *"Everything is covered — what an incredible community."*

**Slot claim confirmation:** *"You've got this. [Name] will be so grateful."*

**Approval request message:** *"[Organiser name] wants to help coordinate support for you during this time. They've set up a Rally page on your behalf — click below to review it and decide if you'd like to share it with your people. Nothing goes live until you say so."*

**Thank you send confirmation:** *"Your thank you has been sent to everyone who showed up. They'll be glad to know it mattered."*

---

## Out of Scope Clarifications

- Rally is **not a medical platform** — no health records, no clinical information, no Medicare integration
- Rally is **not a fundraising platform** — no payments in MVP
- Rally is **not a social network** — no profiles, no followers, no feeds
- Rally is a **coordination tool** — simple, focused, warm

---

## Success Criteria for MVP

The MVP is successful if:
1. An organiser can create and publish a support page in under 3 minutes
2. A helper can claim a slot in under 30 seconds with no account
3. The organiser receives an email notification when a slot is claimed
4. The helper receives a reminder email 24 hours before their slot
5. The third-party setup and approval flow works end to end
6. The app works well on mobile

---

*Build it simple. Build it warm. Build it for the person who's exhausted at 11pm trying to help a friend.*
