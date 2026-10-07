// Neutral stand-in for a page, card or hero no slice has registered yet.

import React from 'react';
import { PAGE, Section, SectionHead } from '@/components/plc/redesignMockup/ui';

export const TeamCardPlaceholder: React.FC<{ label: string }> = ({ label }) => (
  <div data-team-placeholder>
    <SectionHead title={label} />
    <div className="h-24 rounded-lg bg-slate-50" aria-hidden="true" />
  </div>
);

export const TeamPagePlaceholder: React.FC<{ label: string }> = ({ label }) => (
  <div className={PAGE}>
    <Section first label={label}>
      <TeamCardPlaceholder label={label} />
    </Section>
  </div>
);
