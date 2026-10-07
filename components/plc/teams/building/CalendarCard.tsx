// `calendar` landing card and hero (T28): the Google Calendar embed the lead attaches in team settings.

import React from 'react';
import { CalendarDays, ExternalLink } from 'lucide-react';
import {
  DocEmbed,
  HeroHead,
} from '@/components/plc/redesignMockup/DepartmentHubMock';
import { SectionHead, TextLink } from '@/components/plc/redesignMockup/ui';
import { calendarAgendaUrl, isCalendarEmbedUrl } from '@/utils/teamUpdates';
import type { TeamCardProps, TeamHeroProps } from '../updates/teamContract';

export const GoogleCalendarFrame: React.FC<{ url: string; tall?: boolean }> = ({
  url,
  tall = false,
}) => (
  <DocEmbed>
    <iframe
      src={calendarAgendaUrl(url)}
      title="Google Calendar"
      loading="lazy"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className={`block w-full border-0 ${tall ? 'h-[32rem]' : 'h-96'}`}
    />
  </DocEmbed>
);

const openCalendar = (url: string) =>
  window.open(url, '_blank', 'noopener,noreferrer');

export const CalendarCardView: React.FC<{
  url: string | undefined;
  title?: string;
  /** Fixture stand-in for the iframe in the dev harness. */
  embed?: React.ReactNode;
}> = ({ url, title = 'Calendar', embed }) => {
  if (!isCalendarEmbedUrl(url)) return null;
  return (
    <>
      <SectionHead title={title}>
        <TextLink icon={ExternalLink} onClick={() => openCalendar(url)}>
          Google Calendar
        </TextLink>
      </SectionHead>
      {embed ?? <GoogleCalendarFrame url={url} />}
    </>
  );
};

export const CalendarHeroView: React.FC<{
  url: string | undefined;
  isLead: boolean;
  onChange?: () => void;
  embed?: React.ReactNode;
}> = ({ url, isLead, onChange, embed }) => {
  if (!isCalendarEmbedUrl(url)) return null;
  return (
    <>
      <HeroHead
        title="Calendar"
        isLead={isLead}
        onChange={onChange}
        meta={
          <>
            <CalendarDays className="h-3 w-3" aria-hidden="true" />
            <TextLink icon={ExternalLink} onClick={() => openCalendar(url)}>
              Google Calendar
            </TextLink>
          </>
        }
      />
      {embed ?? <GoogleCalendarFrame url={url} tall />}
    </>
  );
};

export function CalendarHero({ plc, isLead, onChangeHero }: TeamHeroProps) {
  return (
    <CalendarHeroView
      url={plc.calendarEmbedUrl}
      isLead={isLead}
      onChange={onChangeHero}
    />
  );
}

export default function CalendarCard({ plc }: TeamCardProps) {
  return <CalendarCardView url={plc.calendarEmbedUrl} />;
}
