# External-Availability Legal Review — FINAL eligibility copy

_Created: 2026-06-22. Owner: Paul Ivers (spartboard@orono.k12.mn.us)._
_Status: **FINALIZED per owner decision 2026-06-22.** A final attorney pass
remains advisable, but the public copy now reflects the decided operator model._

This is the review packet for the eligibility/availability changes to the public
legal pages (`/privacy`, `/terms`, and `/support`) made ahead of the
wide-distribution External flip. See [`docs/wide-distro-plan.md`](./wide-distro-plan.md)
lines 23–26 and 139–141, and its "Open questions → Operator model" section.

## FINAL decision (operator model)

The operator model — previously the open question — has been **DECIDED by the
owner on 2026-06-22**:

- **Orono Public Schools operates SpartBoard.** Orono is the operator of the
  platform for all users.
- **External (non-Orono) free-tier users are self-serve and act as their OWN
  data controller.** They are responsible for their own use of the service and
  for not entering student personal information without their own legal basis.
- **Orono is NOT a per-district processor / "school official" for external
  users, and there is NO per-district DPA at the free tier.** Orono operates the
  service but does not act as the external user's data processor and offers no
  data-processing agreement at the free tier.
- **Orono's FERPA / COPPA / student-data framing stays scoped to Orono
  users/students ONLY.** It is not broadened to external students.
- **Tiering:** Google-API features that connect a Google account (Drive, Sheets,
  Calendar, Classroom) are not available at the free tier.

This replaces the prior "pending counsel" framing. A final attorney pass is
still advisable, but the copy reflects the decided model and is no longer marked
DRAFT.

## Why this exists

The public legal pages are prerendered to static HTML at build time
(`scripts/prerender-legal.tsx` → `dist/{privacy,terms,support}/index.html`) so
Google's OAuth verification crawlers and human reviewers see real content. The
prior copy said SpartBoard is "provided only to members of the District's
domain" / "provided to staff and students of Orono Public Schools." Before the
GCP OAuth consent screen flips from Internal to External (wide-distro Phase 4),
that District-members-only language had to change to reflect open self-serve
external availability: **any educator with a Google account may create a
free-tier account.**

## Source of truth (where the copy lives)

The prerender consumes React components — edit these, never the generated HTML:

- `components/legal/PrivacyPolicyPage.tsx` → `/privacy`
- `components/legal/TermsOfServicePage.tsx` → `/terms`
- `components/legal/SupportPage.tsx` → `/support`
- `components/legal/LegalPageLayout.tsx` (shared shell — unchanged)
- `scripts/prerender-legal.tsx` (build-time prerender — unchanged)

The DRAFT scaffolding (in-page amber banner component + `DRAFT_EXTERNAL_ELIGIBILITY`
markers + DRAFT header comments) has been **removed** now that the copy is final.

## Exactly what the final copy says

### `components/legal/PrivacyPolicyPage.tsx`

1. **File header comment** — replaced the DRAFT block with a note recording the
   decided operator model and that a final attorney pass is advisable.
2. **DRAFT banner** — removed (component + render).
3. **Intro paragraph** — open self-serve availability; Orono operates the
   service and also makes it available to its own staff/students; adds that
   free-tier/external users are responsible for the information they put in and
   for complying with the laws that apply to them.
4. **New "Free-tier and external users" section** — external free-tier users are
   their own data controller; Orono operates the platform but is not their
   processor or "school official" and offers no DPA at the free tier; the user
   is responsible for their own consent obligations and for not entering student
   PII without their own legal basis; Orono's FERPA/COPPA protections apply to
   Orono students only.
5. **"Google services and third parties"** — Workspace-agreement / "on the
   District's behalf" framing scoped to Orono; free-tier/external Google use
   governed by the user's own Google agreement; Drive/Sheets/Calendar/Classroom
   marked as not available at the free tier. The **Google API Services User Data
   Policy / Limited Use disclosure paragraph is intact and unchanged** (required
   for OAuth verification regardless of audience).
6. **"Student data, FERPA, and children's privacy"** — explicitly scoped to
   Orono Public Schools students; states external free-tier users are
   responsible for the FERPA/COPPA obligations that apply to their own students.
   NOT broadened to external students.

**Intentionally NOT changed in PrivacyPolicyPage:** the Limited Use disclosure
paragraph; the contact address (`spartboard@orono.k12.mn.us`); data
retention/security, access/correction/deletion, and changes sections.

### `components/legal/TermsOfServicePage.tsx`

1. **File header comment** — replaced DRAFT block with the decided operator
   model.
2. **DRAFT banner** — removed (component + render).
3. **Intro paragraph** — unchanged operator framing (Orono operates SpartBoard).
4. **"Eligibility and accounts"** — open self-serve availability; free-tier vs.
   Orono/org tiers.
5. **New "Free-tier and external users" section** — external users are their own
   controller; Orono is not their processor/"school official"; no free-tier DPA;
   user responsible for consent and for not entering student PII without a legal
   basis; connected-Google-account features not available at the free tier.
6. **Acceptable use** — "within the District" qualifier removed from the
   educational-purpose item so it applies to all users.
7. **Content and ownership** — "subject to District policy" scoped to Orono
   users.
8. **Termination** — Terms-violation ground applies to all; District-policy and
   loss-of-affiliation grounds scoped to Orono users.

**Intentionally NOT changed in TermsOfServicePage:** third-party services,
service availability, limitation of liability, governing law (Minnesota), and
changes sections; the contact address.

### `components/legal/SupportPage.tsx`

1. **Intro** — broadened from "We're here for Orono Public Schools staff and
   students" to also cover free, self-serve account users.
2. **"Account and access"** — broadened from "accounts are tied to your Orono
   Public Schools Google account" to cover both Orono District accounts (with
   the District tech-support path retained) and free self-serve accounts (manage
   password/access through Google directly).

**Intentionally NOT changed in SupportPage:** the contact address; "Contact us",
"What to include", and "Policies" sections.

## Verification performed

- No `DRAFT_EXTERNAL_ELIGIBILITY` markers, DRAFT banner component/render, or
  DRAFT header comments remain in any of the three pages.
- The Google API Services User Data Policy / Limited Use disclosure is present
  and unchanged in `PrivacyPolicyPage.tsx`.
- Contact info unchanged (`spartboard@orono.k12.mn.us`) on all pages.
- No "District members only" / Orono-only-eligibility phrasing remains outside
  the intentionally Orono-scoped student-data sections. The two descriptive
  Orono-only phrases in the "Information we collect" and "How we use
  information" sections ("District Google account", "District classrooms") were
  also broadened to "Google account" / "classrooms" so those all-users sections
  read accurately for free-tier/external users.

## Re-prerender / deploy

The prerender was **not** re-run as part of this pass (per task constraints); the
deploy regenerates the static HTML from these components (`build` script in
`package.json`: `vite build` → `vite build --ssr scripts/prerender-legal.tsx` →
`node dist-ssr/prerender-legal.js`). After deploy, confirm `/privacy`, `/terms`,
and `/support` serve the finalized copy to signed-out visitors and no longer
contain the DRAFT banner text.

## Scope / safety notes

- These are **signed-out public-content** pages on anonymous, no-provider routes.
  They are static React with no auth/tier branching, so the edits have **zero
  effect on Orono app behavior** for internal/org users.
- `lastUpdated` bumped to **June 22, 2026** on all three pages.
- No contact info, no governing-law/venue, and no unrelated sections were
  changed.
