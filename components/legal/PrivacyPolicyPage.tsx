/**
 * Privacy Policy — public page at /privacy.
 *
 * ⚠️ LEGAL REVIEW REQUIRED before relying on this in production. This is an
 * honest DRAFT grounded in how SpartBoard actually handles data, written for
 * Orono Public Schools as the operator. The district's data-privacy officer /
 * counsel must review and confirm the bracketed/uncertain specifics:
 *   - the official privacy contact (currently support@spartboard.app)
 *   - data retention periods (kept general here — confirm against district policy)
 *   - the exact Google Workspace for Education / DPA references
 *   - the effective date (set to publish date below)
 * Google's OAuth consent + Marketplace listing require this URL to be public.
 */
import React from 'react';
import { LegalPageLayout, LegalH2, LegalP, LegalList } from './LegalPageLayout';

const PRIVACY_CONTACT = 'support@spartboard.app';

export const PrivacyPolicyPage: React.FC = () => (
  <LegalPageLayout title="Privacy Policy" lastUpdated="May 29, 2026">
    <LegalP>
      SpartBoard is a classroom-management tool operated by Orono Public Schools
      (&ldquo;the District,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) for use
      by the District&rsquo;s staff and students. This policy explains what
      information SpartBoard collects, how it is used, and the choices available
      to you. SpartBoard is provided only to members of the District&rsquo;s
      Google Workspace for Education domain.
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

    <LegalH2>Student data, FERPA, and children&rsquo;s privacy</LegalH2>
    <LegalP>
      Student information in SpartBoard constitutes &ldquo;education
      records&rdquo; under the Family Educational Rights and Privacy Act (FERPA)
      and remains under the control of Orono Public Schools. The District
      operates SpartBoard as part of its educational program. For students under
      13, the school provides consent for the use of this educational tool
      consistent with the Children&rsquo;s Online Privacy Protection Act
      (COPPA). Student data is used only for educational purposes within the
      District and is never sold or used for advertising.
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
