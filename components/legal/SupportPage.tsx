/**
 * Support — public page at /support.
 *
 * Confirm the support contact (currently support@spartboard.app) and any
 * District-specific help channel before publishing.
 */
import React from 'react';
import { LegalPageLayout, LegalH2, LegalP, LegalList } from './LegalPageLayout';

const SUPPORT_EMAIL = 'support@spartboard.app';

export const SupportPage: React.FC = () => (
  <LegalPageLayout title="Support" lastUpdated="May 29, 2026">
    <LegalP>
      Need help with SpartBoard? We&rsquo;re here for Orono Public Schools staff
      and students.
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
      SpartBoard accounts are tied to your Orono Public Schools Google account.
      For password resets, account access, or device questions, contact your
      school&rsquo;s technology support. For data-privacy requests, see our{' '}
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
