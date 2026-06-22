/**
 * Privacy Policy — public page at /privacy.
 *
 * ⚠️ LEGAL REVIEW REQUIRED before relying on this in production. This is an
 * honest DRAFT grounded in how SpartBoard actually handles data, written for
 * Orono Public Schools as the operator. The district's data-privacy officer /
 * counsel must review and confirm the bracketed/uncertain specifics:
 *   - data retention periods (kept general here — confirm against district policy)
 *   - the exact Google Workspace for Education / DPA references
 *   - the effective date (set to publish date below)
 * Google's OAuth consent + Marketplace listing require this URL to be public.
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
 * The Google API Services User Data Policy / Limited Use disclosure (in the
 * "Google services and third parties" section) is INTENTIONALLY left intact and
 * must remain — it is required for OAuth verification regardless of audience.
 *
 * Search for `DRAFT_EXTERNAL_ELIGIBILITY` to find every spot touched by W10.
 * ───────────────────────────────────────────────────────────────────────────
 */
import React from 'react';
import { LegalPageLayout, LegalH2, LegalP, LegalList } from './LegalPageLayout';

const PRIVACY_CONTACT = 'spartboard@orono.k12.mn.us';

/**
 * DRAFT_EXTERNAL_ELIGIBILITY — pending district counsel sign-off on operator model.
 *
 * Visible, unmissable in-page banner so any reviewer (or accidental publish)
 * sees that the eligibility language is not final. REMOVE this banner — and the
 * inline DRAFT note in the intro — once counsel has signed off on the operator
 * model and the copy is finalized.
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

export const PrivacyPolicyPage: React.FC = () => (
  <LegalPageLayout title="Privacy Policy" lastUpdated="May 29, 2026">
    {/* DRAFT_EXTERNAL_ELIGIBILITY — remove banner once operator model is finalized (W10). */}
    <DraftEligibilityBanner />

    {/*
      DRAFT_EXTERNAL_ELIGIBILITY (W10): intro rewritten from "provided only to
      members of the District's domain" to open self-serve external availability.
      The operator framing ("operated by Orono Public Schools") is the OPEN
      operator-model question — counsel must confirm or revise before publish.
    */}
    <LegalP>
      SpartBoard is a classroom-management tool that any educator with a Google
      account may use to create a free account. SpartBoard is operated by Orono
      Public Schools (&ldquo;the District,&rdquo; &ldquo;we,&rdquo;
      &ldquo;us&rdquo;), which also makes it available to its own staff and
      students. This policy explains what information SpartBoard collects, how
      it is used, and the choices available to you. The data practices described
      below apply to all users; some sections note where additional protections
      apply specifically to Orono Public Schools staff and students.
    </LegalP>

    <LegalH2>Information we collect</LegalH2>
    <LegalList
      items={[
        <>
          <strong>Account identity.</strong> When a teacher or staff member
          signs in with their District Google account, we receive their name,
          email address, and Google account identifier from Google Sign-In to
          authenticate them and associate their saved content.
        </>,
        <>
          <strong>Content you create.</strong> Dashboards, widgets, quizzes,
          activities, rosters, and similar materials teachers create are stored
          to provide the service.
        </>,
        <>
          <strong>Student activity.</strong> When students join an activity
          (quiz, video activity, and similar), SpartBoard records their
          responses and progress so teachers can review them. By design, student
          responses are keyed by a non-identifying pseudonym; student names and
          class PINs are kept in the teacher&rsquo;s Google Drive, not in
          SpartBoard&rsquo;s database.
        </>,
        <>
          <strong>Operational data.</strong> Basic technical and usage
          information (for example, error logs and feature usage) needed to keep
          the service running and secure.
        </>,
      ]}
    />

    <LegalH2>How we use information</LegalH2>
    <LegalList
      items={[
        'To provide and maintain SpartBoard for District classrooms.',
        'To save and sync teacher content across sessions and devices.',
        'To let teachers run activities and review student work and grades.',
        'To secure the service, troubleshoot problems, and improve features.',
      ]}
    />
    <LegalP>
      We do not sell personal information, and we do not use student information
      for advertising or to build advertising profiles.
    </LegalP>

    <LegalH2>Google services and third parties</LegalH2>
    <LegalP>
      SpartBoard runs on Google infrastructure and integrates with Google
      services under the District&rsquo;s Google Workspace for Education
      agreement, including:
    </LegalP>
    <LegalList
      items={[
        'Google Sign-In and Firebase (Authentication, Firestore, Storage) for sign-in and data storage.',
        'Google Drive, Calendar, and Sheets, when a teacher chooses to connect them.',
        'Google Classroom add-on APIs, when SpartBoard is launched from a Classroom assignment, to validate the launch and return grades to the gradebook.',
        'Google Gemini, for optional AI-assisted features such as OCR and content generation. Content sent to these features is not used to train Google’s general models under the applicable Workspace terms.',
      ]}
    />
    <LegalP>
      These providers process data on the District&rsquo;s behalf subject to
      Google&rsquo;s Workspace for Education terms and data-protection
      commitments.
    </LegalP>
    <LegalP>
      SpartBoard&rsquo;s use and transfer of information received from Google
      APIs adheres to the{' '}
      <a
        className="text-blue-700 underline hover:text-blue-900"
        href="https://developers.google.com/terms/api-services-user-data-policy"
        target="_blank"
        rel="noopener noreferrer"
      >
        Google API Services User Data Policy
      </a>
      , including the Limited Use requirements. In particular, data obtained
      through Google APIs (such as Drive, Sheets, Calendar, or Classroom) is
      used only to provide the user-facing features described above, is never
      sold, never used for advertising, and is never transferred to third
      parties except as needed to provide those features, for security purposes,
      or as required by law. We do not use Google user data to train generalized
      artificial-intelligence or machine-learning models.
    </LegalP>

    <LegalH2>Student data, FERPA, and children&rsquo;s privacy</LegalH2>
    {/*
      DRAFT_EXTERNAL_ELIGIBILITY (W10): this section is currently written ONLY
      for Orono Public Schools students and is left substantively unchanged
      because it is accurate for the District. How FERPA "education records",
      the "school official" framing, and COPPA consent apply to students of an
      EXTERNAL educator's classroom depends entirely on the unresolved operator
      model. Do NOT broaden this language to external students until district
      counsel resolves the operator model. See
      docs/external-availability-legal-review.md.
    */}
    <LegalP>
      For students of Orono Public Schools, student information in SpartBoard
      constitutes &ldquo;education records&rdquo; under the Family Educational
      Rights and Privacy Act (FERPA) and remains under the control of Orono
      Public Schools. The District operates SpartBoard as part of its
      educational program. For students under 13, the school provides consent
      for the use of this educational tool consistent with the Children&rsquo;s
      Online Privacy Protection Act (COPPA). Student data is used only for
      educational purposes and is never sold or used for advertising.
    </LegalP>

    <LegalH2>Data retention and security</LegalH2>
    <LegalP>
      Information is retained for as long as needed to provide the service and
      in accordance with the District&rsquo;s records-retention practices, after
      which it is deleted or de-identified. Access is restricted to the
      authenticated account that owns the content, enforced by Google
      authentication and database security rules, and credentials such as
      connected-account tokens are encrypted at rest.
    </LegalP>

    <LegalH2>Access, correction, and deletion</LegalH2>
    <LegalP>
      Parents and eligible students may request to review or correct a
      student&rsquo;s education records, and District staff may request deletion
      of content, by contacting the District. Requests involving student
      education records are handled through the District&rsquo;s established
      FERPA procedures.
    </LegalP>

    <LegalH2>Changes to this policy</LegalH2>
    <LegalP>
      We may update this policy from time to time. Material changes will be
      reflected by updating the &ldquo;Last updated&rdquo; date above.
    </LegalP>

    <LegalH2>Contact</LegalH2>
    <LegalP>
      Questions about this policy or about student data can be directed to{' '}
      <a
        className="text-blue-700 underline hover:text-blue-900"
        href={`mailto:${PRIVACY_CONTACT}`}
      >
        {PRIVACY_CONTACT}
      </a>
      .
    </LegalP>
  </LegalPageLayout>
);

export default PrivacyPolicyPage;
