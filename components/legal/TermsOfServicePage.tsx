/**
 * Terms of Service — public page at /terms.
 *
 * ⚠️ LEGAL REVIEW REQUIRED before relying on this in production. Honest DRAFT
 * for Orono Public Schools as the operator. District counsel must confirm:
 *   - governing law / venue (drafted as Minnesota)
 *   - the liability / disclaimer posture for a public-school-operated tool
 *   - the effective date (set to publish date below)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DRAFT — EXTERNAL ELIGIBILITY (work item W10, wide-distro plan Phase 4 §1)
 * ───────────────────────────────────────────────────────────────────────────
 * The eligibility / availability language below has been DRAFTED to reflect
 * open, self-serve external availability (any educator with a Google account
 * may create a free-tier account) ahead of flipping the GCP OAuth consent
 * screen to External. It is NOT finalized.
 *
 * OPEN QUESTION (district counsel must resolve before publish): the OPERATOR
 * MODEL — who legally operates SpartBoard for non-Orono users, and the
 * corresponding DPA / FERPA "school official" framing per consuming district.
 * Do NOT assert a final legal position on the operator model here until counsel
 * signs off. See docs/external-availability-legal-review.md and
 * docs/wide-distro-plan.md (Open Questions → "Operator model").
 *
 * Search for `DRAFT_EXTERNAL_ELIGIBILITY` to find every spot touched by W10.
 * ───────────────────────────────────────────────────────────────────────────
 */
import React from 'react';
import { LegalPageLayout, LegalH2, LegalP, LegalList } from './LegalPageLayout';

const TERMS_CONTACT = 'spartboard@orono.k12.mn.us';

/**
 * DRAFT_EXTERNAL_ELIGIBILITY — pending district counsel sign-off on operator model.
 *
 * Visible, unmissable in-page banner so any reviewer (or accidental publish)
 * sees that the eligibility language is not final. REMOVE this banner — and the
 * inline DRAFT notes in the intro + "Eligibility and accounts" section — once
 * counsel has signed off on the operator model and the copy is finalized.
 */
const DraftEligibilityBanner: React.FC = () => (
  <div
    role="note"
    className="mb-8 rounded-md border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900"
  >
    <strong className="font-semibold">
      DRAFT — pending district counsel sign-off on operator model.
    </strong>{' '}
    The eligibility and availability language on this page has been drafted for
    open external availability but is not yet final. The legal operator model
    for non-Orono users is under review.
  </div>
);

export const TermsOfServicePage: React.FC = () => (
  <LegalPageLayout title="Terms of Service" lastUpdated="May 29, 2026">
    {/* DRAFT_EXTERNAL_ELIGIBILITY — remove banner once operator model is finalized (W10). */}
    <DraftEligibilityBanner />

    {/*
      DRAFT_EXTERNAL_ELIGIBILITY (W10): intro broadened to cover any user, not
      only the District. The operator framing ("operated by Orono Public
      Schools") is the OPEN operator-model question — counsel must confirm or
      revise before publish.
    */}
    <LegalP>
      These Terms of Service (&ldquo;Terms&rdquo;) govern your use of
      SpartBoard, a classroom-management tool operated by Orono Public Schools
      (&ldquo;the District&rdquo;). By accessing or using SpartBoard, you agree
      to these Terms. If you do not agree, do not use the service.
    </LegalP>

    <LegalH2>Eligibility and accounts</LegalH2>
    {/*
      DRAFT_EXTERNAL_ELIGIBILITY (W10): rewritten from "provided to staff and
      students of Orono Public Schools who sign in with a District-issued Google
      account" to open self-serve external availability. Pending counsel sign-off
      on the operator model.
    */}
    <LegalP>
      SpartBoard is available to educators who sign in with a Google account.
      Any educator with a Google account may create a free account to use the
      features available to that account type; additional features are available
      to Orono Public Schools staff and students and to organizations that have
      arranged broader access with the District. You are responsible for
      activity that occurs under your account and for keeping your credentials
      secure. If you use SpartBoard through a school or district, your use is
      also subject to that institution&rsquo;s acceptable-use and technology
      policies; Orono Public Schools staff and students remain subject to the
      District&rsquo;s policies.
    </LegalP>

    <LegalH2>Acceptable use</LegalH2>
    <LegalList
      items={[
        'Use SpartBoard only for legitimate educational purposes within the District.',
        'Do not upload unlawful, harmful, or infringing content, or content that violates the privacy or rights of others.',
        'Do not attempt to disrupt, reverse-engineer, gain unauthorized access to, or misuse the service or its data.',
        'Do not use SpartBoard to collect or share personal information beyond what a classroom activity requires.',
      ]}
    />

    <LegalH2>Content and ownership</LegalH2>
    <LegalP>
      Content created by teachers and students through SpartBoard belongs to its
      authors and the District as applicable, and remains subject to District
      policy and applicable law. The SpartBoard software, name, and branding
      remain the property of the District and its licensors. You may use the
      service only as permitted by these Terms.
    </LegalP>

    <LegalH2>Third-party services</LegalH2>
    <LegalP>
      SpartBoard relies on Google services (including Google Sign-In, Firebase,
      Drive, Calendar, Classroom, and Gemini). Your use of those services is
      also subject to Google&rsquo;s applicable terms. SpartBoard is not
      responsible for third-party services outside its control.
    </LegalP>

    <LegalH2>Service availability</LegalH2>
    <LegalP>
      SpartBoard is provided on an &ldquo;as is&rdquo; and &ldquo;as
      available&rdquo; basis. The District does not warrant that the service
      will be uninterrupted, error-free, or that data will never be lost, and
      may modify, suspend, or discontinue features at any time.
    </LegalP>

    <LegalH2>Limitation of liability</LegalH2>
    <LegalP>
      To the fullest extent permitted by law, the District is not liable for
      indirect, incidental, or consequential damages arising from your use of
      SpartBoard. Nothing in these Terms limits any rights or remedies that
      cannot be limited under applicable law.
    </LegalP>

    <LegalH2>Termination</LegalH2>
    <LegalP>
      Access to SpartBoard may be suspended or terminated if these Terms or
      District policy are violated, or when a user is no longer affiliated with
      the District.
    </LegalP>

    <LegalH2>Governing law</LegalH2>
    <LegalP>
      These Terms are governed by the laws of the State of Minnesota, without
      regard to its conflict-of-laws rules.
    </LegalP>

    <LegalH2>Changes</LegalH2>
    <LegalP>
      We may update these Terms from time to time. Material changes will be
      reflected by updating the &ldquo;Last updated&rdquo; date above. Continued
      use after a change constitutes acceptance of the updated Terms.
    </LegalP>

    <LegalH2>Contact</LegalH2>
    <LegalP>
      Questions about these Terms can be directed to{' '}
      <a
        className="text-blue-700 underline hover:text-blue-900"
        href={`mailto:${TERMS_CONTACT}`}
      >
        {TERMS_CONTACT}
      </a>
      .
    </LegalP>
  </LegalPageLayout>
);

export default TermsOfServicePage;
