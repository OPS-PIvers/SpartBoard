// Mentoring Program Hub (T34): hero, then the program cards in two columns.

import React from 'react';
import { PAGE, Section } from '@/components/plc/redesignMockup/ui';

export interface ProgramHubViewProps {
  hero: React.ReactNode | null;
  /** Main column cards, in layout order. */
  main: React.ReactNode[];
  /** Side column cards, in layout order. */
  side: React.ReactNode[];
}

const Column: React.FC<{ cards: React.ReactNode[] }> = ({ cards }) => (
  <div className="flex min-w-0 flex-col gap-8">
    {cards.map((card, i) => (
      <div key={i} className="min-w-0 empty:hidden">
        {card}
      </div>
    ))}
  </div>
);

export const ProgramHubView: React.FC<ProgramHubViewProps> = ({
  hero,
  main,
  side,
}) => (
  <div className={PAGE}>
    {hero}
    {(main.length > 0 || side.length > 0) && (
      <Section label="Program" first={!hero}>
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Column cards={main} />
          <Column cards={side} />
        </div>
      </Section>
    )}
  </div>
);
