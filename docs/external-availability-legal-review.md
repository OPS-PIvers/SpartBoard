# External-Availability Legal Review — DRAFT eligibility copy (W10)

_Created: 2026-06-22. Owner: Paul Ivers (spartboard@orono.k12.mn.us)._
_Status: **DRAFT — pending district counsel sign-off on the operator model.**_

This is the review packet for the DRAFTED eligibility/availability changes to
the public legal pages (`/privacy`, `/terms`) that work item **W10** introduced
ahead of the wide-distribution External flip. See
[`docs/wide-distro-plan.md`](./wide-distro-plan.md) lines 23–26 and 139–141, and
its "Open questions → Operator model" section.

> **Do not publish these changes yet.** The eligibility language is drafted but
> the legal **operator model** (who operates SpartBoard for non-Orono users; the
> DPA / FERPA "school official" framing per consuming district) is an OPEN
> question that must be resolved by the District's data-privacy officer /
> counsel first. Nothing here asserts a final legal position on that model.

## Why this exists

The public legal pages are prerendered to static HTML at build time
(`scripts/prerender-legal.tsx` → `dist/{privacy,terms,support}/index.html`) so
Google's OAuth verification crawlers and human reviewers see real content. The
prior copy said SpartBoard is "provided only to members of the District's
domain" / "provided to staff and students of Orono Public Schools." Before the
GCP OAuth consent screen flips from Internal to External (wide-distro Phase 4),
that District-members-only language must change to reflect open self-serve
external availability: **any educator with a Google account may create a
free-tier account.**

## Source of truth (where the copy lives)

The prerender consumes React components — edit these, never the generated HTML:

- `components/legal/PrivacyPolicyPage.tsx` → `/privacy`
- `components/legal/TermsOfServicePage.tsx` → `/terms`
- `components/legal/LegalPageLayout.tsx` (shared shell — **not** changed by W10)
- `scripts/prerender-legal.tsx` (build-time prerender — **not** changed by W10)

`SupportPage.tsx` was **not** touched (no eligibility language there).

All W10 edits are tagged with the searchable marker `DRAFT_EXTERNAL_ELIGIBILITY`
and a visible in-page amber "DRAFT — pending district counsel sign-off on
operator model" banner at the top of each page.

## Exactly what changed

### `components/legal/PrivacyPolicyPage.tsx`

1. **File header comment** — added a `DRAFT — EXTERNAL ELIGIBILITY` block
   explaining the W10 intent, the open operator-model question, and that the
   Google Limited Use disclosure must stay intact.
2. **`DraftEligibilityBanner` component** — new in-page amber banner
   (`role="note"`) rendered at the top of the page so the DRAFT status is
   unmissable to any reviewer or in case of accidental publish.
3. **Intro paragraph** — rewritten from "SpartBoard is provided only to members
   of the District's Google Workspace for Education domain" to: any educator
   with a Google account may create a free account; Orono operates it and also
   makes it available to its own staff and students; data practices apply to all
   users, with some sections noting added protections for Orono staff/students.
   The "operated by Orono Public Schools" framing is left in place **as the open
   operator-model question** for counsel to confirm or revise.
4. **"Student data, FERPA, and children's privacy" section** — left
   substantively as Orono-only (it is accurate for the District) but **scoped**
   with a lead-in ("For students of Orono Public Schools, …") and removed the
   stray "within the District" qualifier on the use limitation so it reads
   correctly for all students. A `DRAFT_EXTERNAL_ELIGIBILITY` comment flags that
   FERPA/COPPA framing for an external educator's students depends on the
   unresolved operator model and must NOT be broadened until counsel decides.

**Intentionally NOT changed in PrivacyPolicyPage:** the entire "Google services
and third parties" section, including the **Google API Services User Data Policy
/ Limited Use disclosure** (required for OAuth verification regardless of
audience); the contact address (`spartboard@orono.k12.mn.us`); data
retention/security, access/correction/deletion, and changes sections; the
`Last updated` date.

### `components/legal/TermsOfServicePage.tsx`

1. **File header comment** — same `DRAFT — EXTERNAL ELIGIBILITY` block.
2. **`DraftEligibilityBanner` component** — same in-page amber DRAFT banner.
3. **Intro paragraph** — left operative wording intact but flagged with a
   `DRAFT_EXTERNAL_ELIGIBILITY` comment noting the "operated by Orono Public
   Schools" framing is the open operator-model question.
4. **"Eligibility and accounts" section** — rewritten from "provided to staff
   and students of Orono Public Schools who sign in with a District-issued
   Google account" to: available to educators who sign in with a Google account;
   any educator may create a free account for that account type's features;
   additional features for Orono staff/students and for organizations that have
   arranged broader access; institution acceptable-use policies apply where used
   through a school/district; Orono users remain subject to District policy.

**Intentionally NOT changed in TermsOfServicePage:** acceptable use, content and
ownership, third-party services, service availability, limitation of liability,
termination, governing law (Minnesota), and changes sections; the contact
address; the `Last updated` date.

## The OPEN operator-model question (must resolve before publish)

From `docs/wide-distro-plan.md` (Open questions): **who operates SpartBoard for
non-Orono users?** Each consuming district will want its own DPA; the FERPA
"school official" framing works district-by-district. The DRAFT copy
deliberately:

- keeps "operated by Orono Public Schools" as the placeholder operator framing
  (counsel may decide Orono is the operator/processor, that an external educator
  is the controller for their own classroom, or that a different entity
  operates the external/free tier);
- does **not** extend the FERPA/COPPA "education records" + school-consent
  framing to external students;
- does **not** describe any DPA mechanism for external districts.

Counsel + the District data-privacy officer must sign off on the operator model
and confirm/replace the bracketed framing before these pages go live.

## Steps to finalize and re-prerender

1. **Resolve the operator model with district counsel** and capture the decision
   (controller/processor roles for the free/external tier; per-district DPA
   mechanism; how FERPA/COPPA apply to external students).
2. **Update the copy** in `PrivacyPolicyPage.tsx` and `TermsOfServicePage.tsx`
   to reflect counsel's decision. Find every spot with the searchable marker
   `DRAFT_EXTERNAL_ELIGIBILITY`.
3. **Remove the DRAFT scaffolding:** delete the `DraftEligibilityBanner`
   component and its render in each page, the `DRAFT — EXTERNAL ELIGIBILITY`
   header blocks, and the inline `DRAFT_EXTERNAL_ELIGIBILITY` comments.
4. **Verify the Google Limited Use disclosure is still intact** in the Privacy
   "Google services and third parties" section (required for OAuth verification).
5. **Bump the `lastUpdated` date** on both pages to the publish date.
6. **Re-prerender:** run the production build so the static HTML regenerates from
   the updated components (`vite build` → `vite build --ssr scripts/prerender-legal.tsx`
   → `node dist-ssr/prerender-legal.js`; this is the `build` script in
   `package.json`). Confirm `dist/privacy/index.html` and `dist/terms/index.html`
   contain the finalized copy and no longer contain the DRAFT banner text.
7. **Deploy** and confirm `/privacy` and `/terms` serve the finalized content to
   signed-out visitors (these are anonymous, no-provider routes).

## Follow-up: `/support` also still says "Orono only" (out of W10 scope)

`components/legal/SupportPage.tsx` was **deliberately NOT edited** — W10 and the
wide-distro plan (Phase 4 §1) name only `/privacy` and `/terms`. But a reviewer
should know `/support` still contains Orono-only availability framing that will
also need revisiting before the External flip:

- _"We're here for Orono Public Schools staff and students."_ (intro)
- _"SpartBoard accounts are tied to your Orono Public Schools Google account.
  For password resets, account access, or device questions, contact your
  school's technology support."_ ("Account and access")

This is support-routing copy rather than a legal eligibility statement, so it is
lower-risk to leave temporarily, but it should be broadened (and a self-serve /
free-tier support path described) when the eligibility copy is finalized. Track
as a small follow-up, not part of W10.

## Scope / safety notes

- These are **signed-out public-content** pages on anonymous, no-provider routes.
  They are static React with no auth/tier branching, so the edits have **zero
  effect on Orono app behavior** for internal/org users.
- The prerender was **not** re-run as part of W10 (per task constraints); the
  deployed static HTML still shows the old copy until step 6 above is performed.
- No contact info, no governing-law/venue, and no unrelated sections were
  changed.
