/**
 * Terms of Service — public page at /terms.
 *
 * ⚠️ A final attorney pass remains advisable before relying on this in
 * production, but the copy below reflects the operator model DECIDED by the
 * owner on 2026-06-22 (see docs/external-availability-legal-review.md):
 * Orono Public Schools operates SpartBoard; external (non-Orono) free-tier
 * users are self-serve and act as their own data controller, responsible for
 * their own use and for not entering student PII without their own legal basis.
 * Orono does not act as a data processor or "school official" for external
 * users and offers no DPA at the free tier.
 */
import React from 'react';
import { LegalPageLayout, LegalH2, LegalP, LegalList } from './LegalPageLayout';

const TERMS_CONTACT = 'spartboard@orono.k12.mn.us';

export const TermsOfServicePage: React.FC = () => (
  <LegalPageLayout title="Terms of Service" lastUpdated="June 22, 2026">
    <LegalP>
      These Terms of Service (&ldquo;Terms&rdquo;) govern your use of
      SpartBoard, a classroom-management tool operated by Orono Public Schools
      (&ldquo;the District&rdquo;). By accessing or using SpartBoard, you agree
      to these Terms. If you do not agree, do not use the service.
    </LegalP>

    <LegalH2>Eligibility and accounts</LegalH2>
    <LegalP>
      SpartBoard is available to educators who sign in with a Google account.
      Any educator with a Google account may create a free account to use the
      features available at the free tier; additional features are available to
      Orono Public Schools staff and students and to organizations that have
      arranged broader access with the District. You are responsible for
      activity that occurs under your account and for keeping your credentials
      secure. If you use SpartBoard through a school or district, your use is
      also subject to that institution&rsquo;s acceptable-use and technology
      policies; Orono Public Schools staff and students remain subject to the
      District&rsquo;s policies.
    </LegalP>

    <LegalH2>Free-tier and external users</LegalH2>
    <LegalP>
      If you are not a member of Orono Public Schools, your use of the free tier
      is self-serve, and you act as the data controller for the information you
      put into the service. Orono Public Schools operates the platform but does
      not act as your data processor or as a &ldquo;school official&rdquo; for
      your institution, and it does not enter into a data-processing agreement
      with you or your school at the free tier. You are solely responsible for
      your use of SpartBoard, including obtaining any consent your own laws and
      policies require and not entering student personal information unless you
      have your own legal basis to do so. Some features, including those that
      connect a Google account (such as Drive, Sheets, Calendar, and Classroom),
      are not available at the free tier.
    </LegalP>

    <LegalH2>Acceptable use</LegalH2>
    <LegalList
      items={[
        'Use SpartBoard only for legitimate educational purposes.',
        'Do not upload unlawful, harmful, or infringing content, or content that violates the privacy or rights of others.',
        'Do not attempt to disrupt, reverse-engineer, gain unauthorized access to, or misuse the service or its data.',
        'Do not use SpartBoard to collect or share personal information beyond what a classroom activity requires.',
      ]}
    />

    <LegalH2>Content and ownership</LegalH2>
    <LegalP>
      Content created by teachers and students through SpartBoard belongs to its
      authors and the District as applicable, and remains subject to applicable
      law and, for Orono Public Schools users, to District policy. The
      SpartBoard software, name, and branding remain the property of the
      District and its licensors. You may use the service only as permitted by
      these Terms.
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
      Access to SpartBoard may be suspended or terminated if these Terms are
      violated. For Orono Public Schools users, access may also be suspended or
      terminated if District policy is violated or when a user is no longer
      affiliated with the District.
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
