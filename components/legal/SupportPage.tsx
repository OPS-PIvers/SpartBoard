/**
 * Support — public page at /support.
 */
import React from 'react';
import { LegalPageLayout, LegalH2, LegalP, LegalList } from './LegalPageLayout';

const SUPPORT_EMAIL = 'spartboard@orono.k12.mn.us';

export const SupportPage: React.FC = () => (
  <LegalPageLayout title="Support" lastUpdated="June 22, 2026">
    <LegalP>
      Need help with SpartBoard? We&rsquo;re here for everyone who uses it —
      Orono Public Schools staff and students, as well as educators using a
      free, self-serve account.
    </LegalP>

    <LegalH2>Contact us</LegalH2>
    <LegalP>
      Email{' '}
      <a
        className="text-blue-700 underline hover:text-blue-900"
        href={`mailto:${SUPPORT_EMAIL}`}
      >
        {SUPPORT_EMAIL}
      </a>{' '}
      and we&rsquo;ll get back to you as soon as we can during the school week.
    </LegalP>

    <LegalH2>What to include</LegalH2>
    <LegalP>To help us resolve your issue quickly, please include:</LegalP>
    <LegalList
      items={[
        'A description of what you were trying to do and what happened.',
        'The widget, page, or feature involved.',
        'Your browser and device (for example, Chrome on a Chromebook).',
        'A screenshot, if the issue is visual.',
      ]}
    />

    <LegalH2>Account and access</LegalH2>
    <LegalP>
      SpartBoard accounts are tied to a Google account. For Orono Public Schools
      staff and students, your account is your District Google account; for
      password resets, account access, or device questions, contact your
      school&rsquo;s technology support. If you use a free, self-serve account,
      sign in with your own Google account, and manage password and access
      questions through Google directly. For data-privacy requests, see our{' '}
      <a
        className="text-blue-700 underline hover:text-blue-900"
        href="/privacy"
      >
        Privacy Policy
      </a>
      .
    </LegalP>

    <LegalH2>Policies</LegalH2>
    <LegalP>
      Review our{' '}
      <a className="text-blue-700 underline hover:text-blue-900" href="/terms">
        Terms of Service
      </a>{' '}
      and{' '}
      <a
        className="text-blue-700 underline hover:text-blue-900"
        href="/privacy"
      >
        Privacy Policy
      </a>
      .
    </LegalP>
  </LegalPageLayout>
);

export default SupportPage;
