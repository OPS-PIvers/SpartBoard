// The open meeting note: sections from its body, live Data and Decision blocks, action items, recording (T11 to T14).

import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import type {
  LearningTarget,
  Plc,
  PlcAssessmentAggregate,
  PlcCommonAssessment,
  PlcMember,
  PlcNote,
  PlcNoteBlock,
  PlcNoteDecisionBlock,
  PlcRecording,
} from '@/types';
import { IconButton } from '@/components/common/IconButton';
import { useClickOutside } from '@/hooks/useClickOutside';
import {
  MENU_ITEM,
  MENU_PANEL,
  TextLink,
} from '@/components/plc/redesignMockup/ui';
import { NotesMarkdown } from '@/components/plc/bodies/notesMarkdown';
import { PlcNoteRichEditor } from '@/components/plc/bodies/PlcNoteRichEditor';
import type { UpdateNotePatch, UpdateNoteOptions } from '@/hooks/usePlcNotes';
import type { PlcNoteGoogleDocContent } from '@/hooks/usePlcNoteGoogleDoc';
import {
  noteHeadings,
  replaceSectionContent,
  splitNoteSections,
} from '@/utils/noteSections';
import {
  actionItemsSectionOf,
  latestAssessmentWithResults,
} from '@/utils/meetingNoteBuild';
import type { MeetingNoteTemplateSection } from '@/utils/meetingNoteTemplate';
import { newBlockId } from '@/utils/plcNoteBlocks';
import {
  applyDraftToActionItems,
  applyDraftToBody,
  type MeetingNotesApplyMode,
} from '@/utils/plcMeetingNotes';
import {
  AgendaRow,
  DataBlockView,
  DecisionBlockView,
  QuietSelect,
  type SelectGroup,
} from './NoteBlockViews';
import { MeetingNoteArticle, type ArticleSection } from './NotesDocsView';
import { TeamActionItemList } from './TeamActionItemList';
import { useNoteDraft } from './useNoteDraft';
import { dataBlockModel, decisionLinkModel } from './useTeamNotes';
import {
  formatDayDate,
  formatShortDate,
  formatTime,
  fromDateInput,
  toDateInput,
} from './noteFormat';
import { buildItemAnalysis } from '@/utils/plcDataOverview';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

export interface NoteEditorPaneProps {
  plc: Plc;
  note: PlcNote;
  uid: string;
  canEdit: boolean;
  collab: boolean;
  richEditor: boolean;
  members: PlcMember[];
  template: MeetingNoteTemplateSection[];
  assessments: PlcCommonAssessment[];
  aggregates: PlcAssessmentAggregate[];
  targets: LearningTarget[];
  updateNote: (
    id: string,
    patch: UpdateNotePatch,
    options?: UpdateNoteOptions
  ) => Promise<void>;
  onDelete: () => void;
  onOpenInDocs?: (content: PlcNoteGoogleDocContent) => void;
  onOpenData?: () => void;
  /** Recording slots, present when meeting recording is on. */
  recordControl?: (onStart: () => void) => React.ReactNode;
  recordings?: (
    onApply: (
      recording: PlcRecording,
      mode: MeetingNotesApplyMode,
      owners: Record<string, string | null>
    ) => Promise<void>,
    editable: boolean,
    title: string
  ) => React.ReactNode;
}

/** Decision text saves after typing pauses, not per keystroke. */
const DecisionEditor: React.FC<{
  block: PlcNoteDecisionBlock;
  canEdit: boolean;
  linkGroups: SelectGroup[];
  link: ReturnType<typeof decisionLinkModel>;
  onOpenLink?: () => void;
  onChange: (patch: Partial<PlcNoteDecisionBlock>) => void;
  onRemove: () => void;
}> = ({ block, canEdit, linkGroups, link, onOpenLink, onChange, onRemove }) => {
  const { t } = useTranslation();
  const [text, setText] = useState(block.text);
  const [seen, setSeen] = useState(block.text);
  const [typing, setTyping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (block.text !== seen) {
    setSeen(block.text);
    if (!typing) setText(block.text);
  }
  const linkValue = block.link
    ? block.link.kind === 'target'
      ? `t:${block.link.targetId}`
      : `q:${block.link.assessmentId}:${block.link.questionId}`
    : '';
  const dateLabel =
    block.status === 'decided'
      ? formatShortDate(block.decidedAt ?? block.createdAt)
      : t('teams.notes.decision.open', { defaultValue: 'Open' });
  const revisitLabel =
    block.revisitAt != null
      ? t('teams.notes.decision.revisit', {
          defaultValue: 'Revisit {{date}}',
          date: formatShortDate(block.revisitAt),
        })
      : null;
  return (
    <DecisionBlockView
      text={text}
      dateLabel={dateLabel}
      anchorKey={block.id}
      linkLabel={link?.label ?? null}
      linkDetail={link?.detail ?? null}
      onOpenLink={link?.assessmentId ? onOpenLink : undefined}
      revisitLabel={revisitLabel}
      edit={
        canEdit
          ? {
              onText: (next) => {
                setText(next);
                setTyping(true);
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => {
                  timer.current = null;
                  setTyping(false);
                  onChange({ text: next });
                }, 600);
              },
              statusAction:
                block.status === 'open'
                  ? {
                      label: t('teams.notes.decision.markDecided', {
                        defaultValue: 'Mark decided',
                      }),
                      run: () =>
                        onChange({ status: 'decided', decidedAt: Date.now() }),
                    }
                  : {
                      label: t('teams.notes.decision.reopen', {
                        defaultValue: 'Reopen',
                      }),
                      run: () => onChange({ status: 'open', decidedAt: null }),
                    },
              linkPicker: (
                <QuietSelect
                  tourProps={tourFieldAttr(
                    'teams.note-block.link-picker',
                    'teams-notes',
                    block.id
                  )}
                  label={t('teams.notes.decision.link', {
                    defaultValue: 'Link a question or target',
                  })}
                  noneLabel={t('teams.notes.decision.link', {
                    defaultValue: 'Link a question or target',
                  })}
                  value={linkValue}
                  groups={linkGroups}
                  onChange={(v) => {
                    if (!v) return onChange({ link: null });
                    const [kind, a, b] = v.split(':');
                    onChange({
                      link:
                        kind === 't'
                          ? { kind: 'target', targetId: a }
                          : {
                              kind: 'question',
                              assessmentId: a,
                              questionId: b,
                            },
                    });
                  }}
                />
              ),
              revisitAt: toDateInput(block.revisitAt),
              onRevisit: (v) => onChange({ revisitAt: fromDateInput(v) }),
              onRemove,
            }
          : undefined
      }
    />
  );
};

export const AddBlockMenu: React.FC<{
  onAdd: (kind: 'data' | 'decision' | 'actionItems') => void;
  showData: boolean;
}> = ({ onAdd, showData }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  const items: { kind: 'data' | 'decision' | 'actionItems'; label: string }[] =
    [
      ...(showData
        ? [
            {
              kind: 'data' as const,
              label: t('teams.notes.block.data', { defaultValue: 'Data' }),
            },
          ]
        : []),
      {
        kind: 'decision',
        label: t('teams.notes.block.decision', { defaultValue: 'Decision' }),
      },
      {
        kind: 'actionItems',
        label: t('teams.notes.block.actionItems', {
          defaultValue: 'Action items',
        }),
      },
    ];
  return (
    <div ref={ref} className="relative mt-4 inline-block">
      <TextLink
        quiet
        icon={Plus}
        aria-haspopup="menu"
        aria-expanded={open}
        {...tourAttr('teams.notes.add-block')}
        onClick={() => setOpen((v) => !v)}
      >
        {t('teams.notes.addBlock', { defaultValue: 'Add block' })}
      </TextLink>
      {open && (
        <div
          role="menu"
          className={`absolute left-0 top-full z-20 mt-1 w-44 ${MENU_PANEL}`}
        >
          {items.map((item) => (
            <button
              key={item.kind}
              type="button"
              role="menuitem"
              {...tourFieldAttr(
                'teams.notes.add-block-item',
                'teams-notes',
                item.kind
              )}
              className={MENU_ITEM}
              onClick={() => {
                setOpen(false);
                onAdd(item.kind);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const OptionsMenu: React.FC<{
  items: {
    key: string;
    label: string;
    icon: React.ReactNode;
    run: () => void;
  }[];
}> = ({ items }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  if (items.length === 0) return null;
  return (
    <div ref={ref} className="relative">
      <IconButton
        icon={<MoreHorizontal className="h-4 w-4" />}
        label={t('teams.notes.options', { defaultValue: 'Note options' })}
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        {...tourAttr('teams.notes.options')}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <div
          role="menu"
          className={`absolute right-0 top-full z-20 mt-1 w-48 ${MENU_PANEL}`}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              {...(item.key === 'delete'
                ? tourAttr('teams.notes.delete-note')
                : item.key === 'docs'
                  ? tourAttr('teams.notes.open-in-docs')
                  : {})}
              className={MENU_ITEM}
              onClick={() => {
                setOpen(false);
                item.run();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const NoteEditorPane: React.FC<NoteEditorPaneProps> = ({
  plc,
  note,
  uid,
  canEdit,
  collab,
  richEditor,
  members,
  template,
  assessments,
  aggregates,
  targets,
  updateNote,
  onDelete,
  onOpenInDocs,
  onOpenData,
  recordControl,
  recordings,
}) => {
  const { t } = useTranslation();
  const draft = useNoteDraft({
    plcId: plc.id,
    note,
    uid,
    canEdit,
    collab,
    updateNote,
  });
  const editable = canEdit && draft.ready;
  const [focused, setFocused] = useState<number | null>(null);

  const sections = useMemo(() => splitNoteSections(draft.body), [draft.body]);
  const headings = useMemo(() => noteHeadings(draft.body), [draft.body]);
  const actionSection = actionItemsSectionOf(template, headings);

  const assessmentsWithResults = useMemo(
    () =>
      assessments.filter((a) =>
        aggregates.some((g) => g.assessmentId === a.id)
      ),
    [assessments, aggregates]
  );
  const linkGroups = useMemo<SelectGroup[]>(() => {
    const groups: SelectGroup[] = assessmentsWithResults.map((a) => {
      const agg = aggregates.find((g) => g.assessmentId === a.id);
      const qs = agg ? buildItemAnalysis(agg).questions : [];
      return {
        label: a.title,
        options: [...qs]
          .sort((x, y) => x.number - y.number)
          .map((q) => ({
            value: `q:${a.id}:${q.questionId}`,
            label: `Q${q.number} ${q.text}`,
          })),
      };
    });
    const live = targets.filter((x) => !x.archived);
    if (live.length) {
      groups.push({
        label: t('teams.notes.targets', { defaultValue: 'Learning targets' }),
        options: live.map((x) => ({
          value: `t:${x.id}`,
          label: x.code ? `${x.code} ${x.label}` : x.label,
        })),
      });
    }
    return groups.filter((g) => g.options.length > 0);
  }, [assessmentsWithResults, aggregates, targets, t]);

  const memberName = (id: string) =>
    members.find((m) => m.uid === id)?.displayName ?? '';

  const patchBlock = (id: string, patch: Partial<PlcNoteBlock>) =>
    draft.updateBlocks((blocks) =>
      blocks.map((b) =>
        b.id === id ? ({ ...b, ...patch } as PlcNoteBlock) : b
      )
    );
  const removeBlock = (id: string) =>
    draft.updateBlocks((blocks) => blocks.filter((b) => b.id !== id));

  const renderBlock = (block: PlcNoteBlock): React.ReactNode => {
    if (block.kind === 'data') {
      const model = dataBlockModel(block, aggregates, assessments);
      return (
        <DataBlockView
          key={block.id}
          {...model}
          anchorKey={block.id}
          onOpenData={onOpenData}
          picker={
            editable ? (
              <QuietSelect
                tourProps={tourFieldAttr(
                  'teams.note-block.assessment-picker',
                  'teams-notes',
                  block.id
                )}
                label={t('teams.notes.data.assessment', {
                  defaultValue: 'Assessment',
                })}
                value={block.assessmentId ?? ''}
                noneLabel={
                  block.assessmentId
                    ? undefined
                    : t('teams.notes.data.assessment', {
                        defaultValue: 'Assessment',
                      })
                }
                groups={[
                  {
                    label: '',
                    options: assessmentsWithResults.map((a) => ({
                      value: a.id,
                      label: a.title,
                    })),
                  },
                ]}
                onChange={(v) =>
                  patchBlock(block.id, { assessmentId: v || null })
                }
              />
            ) : undefined
          }
          onRemove={editable ? () => removeBlock(block.id) : undefined}
        />
      );
    }
    if (block.kind === 'decision') {
      if (!editable && !block.text.trim()) return null;
      return (
        <DecisionEditor
          key={block.id}
          block={block}
          canEdit={editable}
          linkGroups={linkGroups}
          link={decisionLinkModel(block, aggregates, assessments, targets, t)}
          onOpenLink={onOpenData}
          onChange={(patch) => patchBlock(block.id, patch)}
          onRemove={() => removeBlock(block.id)}
        />
      );
    }
    return null;
  };

  const agendaFor = (blocks: PlcNoteBlock[]) => {
    const agenda = blocks.filter((b) => b.kind === 'agenda');
    if (!agenda.length) return null;
    return (
      <ul key="agenda" className="divide-y divide-slate-100">
        {agenda.map((b) => (
          <AgendaRow
            key={b.id}
            text={b.kind === 'agenda' ? b.text : ''}
            who={memberName(b.createdBy)}
            anchorKey={b.id}
            onRemove={editable ? () => removeBlock(b.id) : undefined}
          />
        ))}
      </ul>
    );
  };

  const actionList = (
    <TeamActionItemList
      key="actions"
      items={draft.actionItems}
      members={members}
      canEdit={editable}
      currentUid={uid}
      onChange={draft.setActionItems}
    />
  );

  const headingSet = new Set(headings);
  const orphanBlocks = draft.blocks.filter(
    (b) => b.section && !headingSet.has(b.section)
  );
  const lastHeading = headings[headings.length - 1] ?? null;

  const articleSections: ArticleSection[] = [];
  sections.forEach((section, index) => {
    const isPreamble = section.heading === null;
    if (isPreamble && headings.length > 0 && !section.content.trim()) return;
    const own = draft.blocks.filter((b) =>
      isPreamble ? b.section === '' : b.section === section.heading
    );
    const extras: React.ReactNode[] = [];
    const agenda = agendaFor(own);
    if (agenda) extras.push(agenda);
    own.forEach((b) => {
      const node = renderBlock(b);
      if (node) extras.push(node);
    });
    if (section.heading === lastHeading) {
      orphanBlocks.forEach((b) => {
        const node = renderBlock(b);
        if (node) extras.push(node);
      });
    }
    if (section.heading !== null && section.heading === actionSection) {
      extras.push(actionList);
    }
    const hasBlocks = extras.length > 0;
    const content = editable ? (
      <div onFocusCapture={() => setFocused(index)}>
        {richEditor ? (
          <PlcNoteRichEditor
            value={section.content}
            onChange={(next) =>
              draft.setBody(replaceSectionContent(draft.body, index, next))
            }
            readOnly={false}
            showToolbar={focused === index}
          />
        ) : (
          <textarea
            value={section.content}
            onChange={(e) =>
              draft.setBody(
                replaceSectionContent(draft.body, index, e.target.value)
              )
            }
            rows={1}
            {...tourFieldAttr(
              'teams.notes.section-body',
              'teams-notes',
              String(index)
            )}
            placeholder={
              hasBlocks || section.heading === null
                ? undefined
                : t('plcDashboard.notes.bodyPlaceholder', {
                    defaultValue: 'Write your notes… (markdown supported)',
                  })
            }
            aria-label={section.heading ?? note.title}
            className="block w-full resize-none border-0 bg-transparent p-0 text-sm leading-relaxed text-slate-700 [field-sizing:content] placeholder:text-slate-300 focus:outline-none focus:ring-0"
          />
        )}
      </div>
    ) : section.content.trim() ? (
      <div className="text-sm leading-relaxed text-slate-700">
        <NotesMarkdown body={section.content} />
      </div>
    ) : null;
    articleSections.push({
      key: `${index}-${section.heading ?? ''}`,
      heading: section.heading,
      content,
      extras,
    });
  });

  const addBlock = (kind: 'data' | 'decision' | 'actionItems') => {
    const target =
      (focused !== null ? sections[focused]?.heading : null) ??
      headings.filter((h) => h !== actionSection).pop() ??
      '';
    if (kind === 'actionItems') {
      if (!actionSection && headings.indexOf('Action items') === -1) {
        const heading = t('plcDashboard.notes.actionItems.title', {
          defaultValue: 'Action items',
        });
        draft.setBody(`${draft.body.replace(/\n*$/, '\n\n')}## ${heading}\n`);
      }
      return;
    }
    const base = {
      id: newBlockId(),
      section: target,
      createdBy: uid,
      createdAt: Date.now(),
    };
    draft.updateBlocks((blocks) => [
      ...blocks,
      kind === 'data'
        ? {
            ...base,
            kind: 'data',
            assessmentId: latestAssessmentWithResults(aggregates, assessments),
          }
        : {
            ...base,
            kind: 'decision',
            text: '',
            status: 'open',
            decidedAt: null,
            revisitAt: null,
            link: null,
          },
    ]);
  };

  const handleApply = (
    recording: PlcRecording,
    mode: MeetingNotesApplyMode,
    owners: Record<string, string | null>
  ): Promise<void> => {
    const rec = recording.draft;
    if (!rec || !editable)
      return Promise.reject(new Error('Note is not editable.'));
    draft.setBody(applyDraftToBody(draft.body, rec.markdown, mode));
    draft.setActionItems(
      // eslint-disable-next-line react-hooks/purity -- runs when the teacher applies a recording, not during render
      applyDraftToActionItems(draft.actionItems, rec, owners, uid, Date.now())
    );
    return Promise.resolve();
  };

  const when = note.meetingAt ?? note.createdAt;
  const attendees = members
    .filter((m) => m.role !== 'viewer')
    .map((m) => m.displayName)
    .filter(Boolean)
    .join(', ');
  const meta =
    note.kind === 'meeting' && when
      ? [formatDayDate(when), formatTime(when), attendees]
          .filter(Boolean)
          .join(' · ')
      : note.lastEditedAt
        ? t('plcDashboard.notes.lastEdited', {
            defaultValue: 'Last edited {{when}}',
            when: `${formatShortDate(note.lastEditedAt)} ${formatTime(note.lastEditedAt)}`,
          })
        : null;

  const titleNode = editable ? (
    <input
      type="text"
      value={draft.title}
      onChange={(e) => draft.setTitle(e.target.value)}
      {...tourAttr('teams.notes.title')}
      placeholder={t('plcDashboard.notes.titlePlaceholder', {
        defaultValue: 'Note title',
      })}
      aria-label={t('plcDashboard.notes.titlePlaceholder', {
        defaultValue: 'Note title',
      })}
      className="w-full border-0 bg-transparent p-0 text-2xl font-extrabold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-0"
    />
  ) : (
    <h2 className="text-2xl font-extrabold text-slate-800">
      {draft.title ||
        t('plcDashboard.notes.untitled', { defaultValue: 'Untitled' })}
    </h2>
  );

  const options = [
    ...(onOpenInDocs && canEdit
      ? [
          {
            key: 'docs',
            label: t('plcDashboard.notes.googleDoc.open', {
              defaultValue: 'Open in Docs',
            }),
            icon: (
              <ExternalLink
                className="h-4 w-4 text-slate-400"
                aria-hidden="true"
              />
            ),
            run: () =>
              onOpenInDocs({
                title: draft.title,
                body: draft.body,
                actionItems: draft.actionItems,
              }),
          },
        ]
      : []),
    ...(canEdit
      ? [
          {
            key: 'delete',
            label: t('plcDashboard.notes.deleteNote', {
              defaultValue: 'Delete note',
            }),
            icon: (
              <Trash2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
            ),
            run: onDelete,
          },
        ]
      : []),
  ];

  const footer = (
    <>
      {!actionSection &&
        (draft.actionItems.length > 0 || editable) &&
        note.kind === 'meeting' && (
          <section>
            <h3 className="mb-2 mt-7 text-base font-bold text-slate-800">
              {t('plcDashboard.notes.actionItems.title', {
                defaultValue: 'Action items',
              })}
            </h3>
            {actionList}
          </section>
        )}
      {editable && (
        <AddBlockMenu
          onAdd={addBlock}
          showData={assessmentsWithResults.length > 0}
        />
      )}
      {recordings?.(handleApply, editable, draft.title)}
    </>
  );

  return (
    <MeetingNoteArticle
      title={titleNode}
      actions={
        <>
          {recordControl?.(() => draft.setKind('meeting'))}
          <OptionsMenu items={options} />
        </>
      }
      meta={meta}
      sections={articleSections}
      footer={footer}
    />
  );
};
