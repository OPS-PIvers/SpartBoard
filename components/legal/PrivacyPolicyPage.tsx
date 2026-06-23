/**
 * Privacy Policy — public page at /privacy.
 *
 * ⚠️ A final attorney pass remains advisable before relying on this in
 * production, but the copy below reflects the operator model DECIDED by the
 * owner on 2026-06-22 (see docs/external-availability-legal-review.md):
 *   - Orono Public Schools operates SpartBoard.
 *   - External (non-Orono) free-tier users are self-serve and act as their OWN
 *     data controller; Orono is NOT their data processor and offers no DPA at
 *     the free tier.
 *   - Orono's FERPA / COPPA / student-data framing is scoped to Orono students
 *     ONLY and is not broadened to external students.
 * Google's OAuth consent + Marketplace listing require this URL to be public.
 * The Google API Services User Data Policy / Limited Use disclosure (in the
 * "Google services and third parties" section) must remain intact — it is
 * required for OAuth verification regardless of audience.
 */
import React from 'react';
import { LegalPageLayout, LegalH2, LegalP, LegalList } from './LegalPageLayout';

const PRIVACY_CONTACT = 'spartboard@orono.k12.mn.us';

export const PrivacyPolicyPage: React.FC = () => (
  <LegalPageLayout title="Privacy Policy" lastUpdated="June 22, 2026">
    <LegalP>
      SpartBoard is a classroom-management tool that any educator with a Google
      account may use to create a free account. SpartBoard is operated by Orono
      Public Schools (&ldquo;the District,&rdquo; &ldquo;we,&rdquo;
      &ldquo;us&rdquo;), which also makes it available to its own staff and
      students. This policy explains what information SpartBoard collects, how
      it is used, and the choices available to you. The data practices described
      below apply to all users; some sections note where additional protections
      apply specifically to Orono Public Schools staff and students. If you use
      SpartBoard&rsquo;s free tier outside of Orono Public Schools, you are the
      party responsible for the information you put into the service and for
      complying with the laws that apply to you and your students (see
      &ldquo;Free-tier and external users&rdquo; below).
    </LegalP>

    <LegalH2>Information we collect</LegalH2>
    <LegalList
      items={[
        <>
          <strong>Account identity.</strong> When a teacher or staff member
          signs in with their Google account, we receive their name, email
          address, and Google account identifier from Google Sign-In to
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
        'To provide and maintain SpartBoard for classrooms.',
        'To save and sync teacher content across sessions and devices.',
        'To let teachers run activities and review student work and grades.',
        'To secure the service, troubleshoot problems, and improve features.',
      ]}
    />
    <LegalP>
      We do not sell personal information, and we do not use student information
      for advertising or to build advertising profiles.
    </LegalP>

    <LegalH2>Free-tier and external users</LegalH2>
    <LegalP>
      Any educator with a Google account may create a free SpartBoard account.
      If you are not a member of Orono Public Schools, your use of the free tier
      is self-serve, and you act as the data controller for the information you
      put into the service. Orono Public Schools operates the platform but does
      not act as your data processor or as a &ldquo;school official&rdquo; for
      your institution, and it does not enter into a data-processing agreement
      with you or your school at the free tier. You are responsible for your own
      use of SpartBoard, including obtaining any consent your own laws and
      policies require and not entering student personal information unless you
      have your own legal basis to do so. The Orono-specific protections in the
      &ldquo;Student data, FERPA, and children&rsquo;s privacy&rdquo; section
      below apply to Orono Public Schools students only and do not extend to the
      students of external users.
    </LegalP>

    <LegalH2>Google services and third parties</LegalH2>
    <LegalP>
      SpartBoard runs on Google infrastructure and integrates with Google
      services, including:
    </LegalP>
    <LegalList
      items={[
        'Google Sign-In and Firebase (Authentication, Firestore, Storage) for sign-in and data storage.',
        'Google Drive, Calendar, and Sheets, when a teacher chooses to connect them. These connected-Google-account features are not available at the free tier.',
        'Google Classroom add-on APIs, when SpartBoard is launched from a Classroom assignment, to validate the launch and return grades to the gradebook. These features are not available at the free tier.',
        'Google Gemini, for optional AI-assisted features such as OCR and content generation. Content sent to these features is not used to train Google’s general models under the applicable terms.',
      ]}
    />
    <LegalP>
      For Orono Public Schools, these integrations operate under the
      District&rsquo;s Google Workspace for Education agreement, and these
      providers process data on the District&rsquo;s behalf subject to
      Google&rsquo;s Workspace for Education terms and data-protection
      commitments. For free-tier and external users, your use of any Google
      service is governed by your own agreement with Google rather than the
      District&rsquo;s.
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
      This section applies to Orono Public Schools students ONLY. Do not broaden
      it to external users' students: external free-tier users act as their own
      data controller and are responsible for the FERPA/COPPA obligations that
      apply to them. See docs/external-availability-legal-review.md.
    */}
    <LegalP>
      This section applies to students of Orono Public Schools. For those
      students, student information in SpartBoard constitutes &ldquo;education
      records&rdquo; under the Family Educational Rights and Privacy Act (FERPA)
      and remains under the control of Orono Public Schools. The District
      operates SpartBoard as part of its educational program. For students under
      13, the school provides consent for the use of this educational tool
      consistent with the Children&rsquo;s Online Privacy Protection Act
      (COPPA). Student data is used only for educational purposes and is never
      sold or used for advertising. These protections are specific to Orono
      Public Schools students; external free-tier users are responsible for the
      FERPA, COPPA, and other obligations that apply to their own students.
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
