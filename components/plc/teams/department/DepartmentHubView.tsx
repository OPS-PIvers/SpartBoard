// Department Hub (TEAMS_REDESIGN T23, T24): hero, next meeting with its agenda, open decisions and items, docs, materials.

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  FileText,
  Pin,
  Scale,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import {
  INPUT,
  META,
  PAGE,
  RowList,
  Section,
  SectionHead,
  TextLink,
} from '@/components/plc/redesignMockup/ui';
import {
  DocEmbed,
  HeroHead,
} from '@/components/plc/redesignMockup/DepartmentHubMock';
import { AgendaRow } from '@/components/plc/teams/notes/NoteBlockViews';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

export interface HubHero {
  title: string;
  meta: string;
  pinned: boolean;
  /** Google Doc link for "Open in Docs". */
  docUrl?: string;
  onOpenNote?: () => void;
  body: React.ReactNode;
}

export interface HubNextMeeting {
  title: string;
  dateLabel: string;
  agenda: { id: string; text: string; who: string; onRemove?: () => void }[];
  onOpenNote: () => void;
  onAddAgenda?: (text: string) => Promise<void> | void;
}

export interface HubRowModel {
  key: string;
  title: string;
  meta: string;
  onOpen?: () => void;
}

export interface HubActionItemModel extends HubRowModel {
  done: boolean;
  onToggle?: () => void;
}

export interface HubMaterial extends HubRowModel {
  icon: LucideIcon;
  onCopy?: () => void;
}

export interface HubDocRow extends HubRowModel {
  date: string;
}

export interface DepartmentHubViewProps {
  isLead: boolean;
  cards: {
    hero: boolean;
    nextMeeting: boolean;
    openDecisions: boolean;
    openItems: boolean;
    recentDocs: boolean;
    newMaterials: boolean;
  };
  hero: HubHero | null;
  onChangeHero?: () => void;
  nextMeeting: HubNextMeeting | null;
  decisions: HubRowModel[];
  items: HubActionItemModel[];
  recentDocs: HubDocRow[];
  materials: HubMaterial[];
  onOpenNotes: () => void;
  onOpenResources: () => void;
  onNewMeetingNote?: () => void;
}

/** A row that opens its item; hairline list, no box. */
const LinkRow: React.FC<{
  icon?: LucideIcon;
  title: string;
  meta?: string;
  trailing?: React.ReactNode;
  onOpen?: () => void;
  tourProps?: Record<string, string>;
}> = ({ icon: Icon, title, meta, trailing, onOpen, tourProps }) => {
  const body = (
    <>
      {Icon && (
        <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm text-slate-800">
          {title}
        </span>
        {meta && (
          <span className={`${META} mt-0.5 block truncate`}>{meta}</span>
        )}
      </span>
    </>
  );
  return (
    <li className="flex items-center gap-3 py-2.5">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          {...tourProps}
          className="flex min-w-0 flex-1 items-center gap-3 rounded text-left hover:text-brand-blue-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
        >
          {body}
        </button>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">{body}</span>
      )}
      {trailing}
    </li>
  );
};

const HubActionItem: React.FC<{ item: HubActionItemModel }> = ({ item }) => (
  <li className="flex items-center gap-3 py-2.5">
    <button
      type="button"
      role="checkbox"
      aria-checked={item.done}
      aria-label={item.title}
      disabled={!item.onToggle}
      {...tourFieldAttr(
        'teams.department.item-check',
        'teams-department',
        item.key
      )}
      onClick={item.onToggle}
      className={`shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:cursor-default ${
        item.done
          ? 'text-emerald-500'
          : 'text-slate-300 enabled:hover:text-emerald-500'
      }`}
    >
      {item.done ? (
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Circle className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
    <button
      type="button"
      onClick={item.onOpen}
      disabled={!item.onOpen}
      {...tourFieldAttr(
        'teams.department.item-open',
        'teams-department',
        item.key
      )}
      className="min-w-0 flex-1 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 enabled:hover:text-brand-blue-primary"
    >
      <span
        className={`block break-words text-sm ${item.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}
      >
        {item.title}
      </span>
      <span className={`${META} mt-0.5 block truncate`}>{item.meta}</span>
    </button>
  </li>
);

const AgendaAdd: React.FC<{
  onAdd: (text: string) => Promise<void> | void;
}> = ({ onAdd }) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const label = t('teams.hub.addAgenda', {
    defaultValue: 'Add an agenda item',
  });
  const submit = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      await onAdd(value);
      setText('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="mt-2 flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input
        type="text"
        value={text}
        maxLength={500}
        onChange={(e) => setText(e.target.value)}
        placeholder={label}
        aria-label={label}
        {...tourAttr('teams.department.agenda-text')}
        className={`${INPUT} min-w-0 flex-1 py-1.5`}
      />
      <Button
        variant="secondary"
        size="sm"
        type="submit"
        disabled={busy}
        {...tourAttr('teams.department.agenda-add')}
      >
        {t('teams.hub.add', { defaultValue: 'Add' })}
      </Button>
    </form>
  );
};

export const DepartmentHubView: React.FC<DepartmentHubViewProps> = ({
  isLead,
  cards,
  hero,
  onChangeHero,
  nextMeeting,
  decisions,
  items,
  recentDocs,
  materials,
  onOpenNotes,
  onOpenResources,
  onNewMeetingNote,
}) => {
  const { t } = useTranslation();
  const showMeeting = cards.nextMeeting;
  const showOpen = cards.openDecisions || cards.openItems;
  const showDocs = cards.recentDocs;
  const showMaterials = cards.newMaterials;
  const pair = (a: boolean, b: boolean) =>
    `grid grid-cols-1 gap-x-10 gap-y-8 ${a && b ? 'lg:grid-cols-2' : ''}`;
  const showHero = cards.hero && !!hero;
  const meetingFirst = !showHero;
  const docsFirst = !showHero && !(showMeeting || showOpen);

  return (
    <div className={PAGE}>
      {showHero && hero && (
        <Section
          first
          label={
            hero.pinned
              ? t('teams.hub.pinnedDoc', { defaultValue: 'Pinned doc' })
              : hero.title
          }
        >
          <HeroHead
            title={hero.title}
            isLead={isLead}
            onChange={onChangeHero}
            meta={
              <>
                {hero.meta}
                {hero.pinned && (
                  <>
                    {' ·'}
                    <Pin className="h-3 w-3" aria-hidden="true" />
                    {t('teams.hub.pinned', { defaultValue: 'Pinned' })}
                  </>
                )}
              </>
            }
            actions={
              hero.docUrl ? (
                <a
                  href={hero.docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  {...tourAttr('teams.department.open-hero-doc')}
                  className="flex items-center justify-center gap-2 rounded-lg bg-slate-200 px-3 py-1.5 text-xxs font-black uppercase tracking-widest text-slate-600 transition hover:bg-slate-300"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('plcDashboard.notes.googleDoc.open', {
                    defaultValue: 'Open in Docs',
                  })}
                </a>
              ) : hero.onOpenNote ? (
                <TextLink
                  onClick={hero.onOpenNote}
                  {...tourAttr('teams.hero.open-note')}
                >
                  {t('teams.hub.openNote', { defaultValue: 'Open note' })}
                </TextLink>
              ) : null
            }
          />
          <DocEmbed>{hero.body}</DocEmbed>
        </Section>
      )}

      {(showMeeting || showOpen) && (
        <Section
          first={meetingFirst}
          label={t('teams.hub.meetingSection', {
            defaultValue: 'Next meeting and open items',
          })}
        >
          <div className={pair(showMeeting, showOpen)}>
            {showMeeting && (
              <div className="min-w-0">
                <SectionHead
                  title={t('teams.hub.departmentMeeting', {
                    defaultValue: 'Department meeting',
                  })}
                  meta={nextMeeting?.dateLabel}
                >
                  {nextMeeting && (
                    <TextLink
                      onClick={nextMeeting.onOpenNote}
                      {...tourAttr('teams.department.open-meeting-note')}
                    >
                      {t('teams.hub.openNote', { defaultValue: 'Open note' })}
                    </TextLink>
                  )}
                </SectionHead>
                {nextMeeting ? (
                  <>
                    <p className="mb-1 text-xs font-semibold text-slate-600">
                      {t('teams.hub.agenda', { defaultValue: 'Agenda' })}
                    </p>
                    {nextMeeting.agenda.length > 0 && (
                      <RowList
                        label={t('teams.hub.agenda', {
                          defaultValue: 'Agenda',
                        })}
                      >
                        {nextMeeting.agenda.map((a) => (
                          <AgendaRow
                            key={a.id}
                            text={a.text}
                            who={a.who}
                            anchorKey={a.id}
                            onRemove={a.onRemove}
                          />
                        ))}
                      </RowList>
                    )}
                    {nextMeeting.onAddAgenda && (
                      <AgendaAdd onAdd={nextMeeting.onAddAgenda} />
                    )}
                  </>
                ) : (
                  onNewMeetingNote && (
                    <TextLink
                      onClick={onNewMeetingNote}
                      {...tourAttr('teams.department.new-meeting-note')}
                    >
                      {t('plcDashboard.notes.meeting.newMeetingNote', {
                        defaultValue: 'New meeting note',
                      })}
                    </TextLink>
                  )
                )}
              </div>
            )}
            {showOpen && (
              <div className="min-w-0">
                <SectionHead
                  title={t('teams.hub.openDecisions', {
                    defaultValue: 'Open decisions and action items',
                  })}
                />
                <RowList>
                  {cards.openDecisions &&
                    decisions.map((d) => (
                      <LinkRow
                        key={d.key}
                        icon={Scale}
                        title={d.title}
                        meta={d.meta}
                        onOpen={d.onOpen}
                        tourProps={tourFieldAttr(
                          'teams.department.decision-open',
                          'teams-department',
                          d.key
                        )}
                      />
                    ))}
                  {cards.openItems &&
                    items.map((item) => (
                      <HubActionItem key={item.key} item={item} />
                    ))}
                </RowList>
              </div>
            )}
          </div>
        </Section>
      )}

      {(showDocs || showMaterials) && (
        <Section
          first={docsFirst}
          label={t('teams.hub.docsSection', {
            defaultValue: 'Docs and materials',
          })}
        >
          <div className={pair(showDocs, showMaterials)}>
            {showDocs && (
              <div className="min-w-0">
                <SectionHead
                  title={t('teams.hub.recentDocs', {
                    defaultValue: 'Recently updated docs',
                  })}
                >
                  <TextLink
                    onClick={onOpenNotes}
                    {...tourAttr('teams.department.all-notes')}
                  >
                    {t('plcDashboard.tabs.docs', {
                      defaultValue: 'Notes & Docs',
                    })}
                  </TextLink>
                </SectionHead>
                <RowList>
                  {recentDocs.map((d) => (
                    <LinkRow
                      key={d.key}
                      icon={FileText}
                      title={d.title}
                      meta={d.meta}
                      onOpen={d.onOpen}
                      tourProps={tourFieldAttr(
                        'teams.department.doc-open',
                        'teams-department',
                        d.key
                      )}
                      trailing={<span className={META}>{d.date}</span>}
                    />
                  ))}
                </RowList>
              </div>
            )}
            {showMaterials && (
              <div className="min-w-0">
                <SectionHead
                  title={t('teams.hub.newMaterials', {
                    defaultValue: 'Newly shared materials',
                  })}
                >
                  <TextLink
                    onClick={onOpenResources}
                    {...tourAttr('teams.department.all-resources')}
                  >
                    {t('plcDashboard.tabs.resources', {
                      defaultValue: 'Resources',
                    })}
                  </TextLink>
                </SectionHead>
                <RowList>
                  {materials.map((m) => (
                    <LinkRow
                      key={m.key}
                      icon={m.icon}
                      title={m.title}
                      meta={m.meta}
                      onOpen={m.onOpen}
                      tourProps={tourFieldAttr(
                        'teams.department.material-open',
                        'teams-department',
                        m.key
                      )}
                      trailing={
                        m.onCopy ? (
                          <TextLink
                            onClick={m.onCopy}
                            {...tourFieldAttr(
                              'teams.department.material-copy',
                              'teams-department',
                              m.key
                            )}
                          >
                            {t('teams.hub.copy', {
                              defaultValue: 'Copy to my library',
                            })}
                          </TextLink>
                        ) : undefined
                      }
                    />
                  ))}
                </RowList>
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
};
