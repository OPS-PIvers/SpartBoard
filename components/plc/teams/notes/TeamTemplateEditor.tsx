// Lead or co-lead edits the team's own meeting-note template (TEAMS_REDESIGN T12).

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type { Plc } from '@/types';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import { useDashboard } from '@/context/useDashboard';
import { INPUT, META, TextLink } from '@/components/plc/redesignMockup/ui';
import {
  serializeMeetingNoteTemplate,
  type MeetingNoteBlockKind,
  type MeetingNoteTemplateSection,
} from '@/utils/meetingNoteTemplate';
import { saveTeamMeetingNoteTemplate } from '@/utils/plcNoteWrites';
import { logError } from '@/utils/logError';
import type { TeamMeetingTemplate } from './useTeamNotes';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

const MAX_SECTIONS = 20;

export const TeamTemplateEditor: React.FC<{
  plc: Plc;
  current: TeamMeetingTemplate;
  onClose: () => void;
}> = ({ plc, current, onClose }) => {
  const { t } = useTranslation();
  const { addToast } = useDashboard();
  const [sections, setSections] = useState<MeetingNoteTemplateSection[]>(
    current.sections
  );
  const [saving, setSaving] = useState(false);

  const kinds: { value: MeetingNoteBlockKind; label: string }[] = [
    {
      value: 'text',
      label: t('teams.template.kind.text', { defaultValue: 'Text' }),
    },
    {
      value: 'data',
      label: t('teams.template.kind.data', { defaultValue: 'Data' }),
    },
    {
      value: 'decision',
      label: t('teams.template.kind.decision', { defaultValue: 'Decision' }),
    },
    {
      value: 'actionItems',
      label: t('teams.template.kind.actionItems', {
        defaultValue: 'Action items',
      }),
    },
  ];

  const run = async (markdown: string | null) => {
    setSaving(true);
    try {
      await saveTeamMeetingNoteTemplate(plc, markdown);
      onClose();
    } catch (err) {
      logError('TeamTemplateEditor.save', err, { plcId: plc.id });
      addToast(
        t('plcDashboard.notes.saveFailed', {
          defaultValue: "Couldn't save your changes. Please try again.",
        }),
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const update = (i: number, patch: Partial<MeetingNoteTemplateSection>) =>
    setSections((list) =>
      list.map((s, j) => (j === i ? { ...s, ...patch } : s))
    );

  const title = t('teams.notes.template', {
    defaultValue: 'Meeting-note template',
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      maxWidth="max-w-xl"
      footer={
        <div className="flex w-full items-center gap-2">
          {current.source === 'team' && (
            <TextLink
              quiet
              disabled={saving}
              {...tourAttr('teams.template.restore')}
              onClick={() => void run(null)}
            >
              {t('teams.template.restore', { defaultValue: 'Restore default' })}
            </TextLink>
          )}
          <span className="flex-1" />
          <Button
            variant="secondary"
            size="sm"
            {...tourAttr('teams.template.cancel')}
            onClick={onClose}
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            size="sm"
            isLoading={saving}
            disabled={saving}
            {...tourAttr('teams.template.save')}
            onClick={() =>
              void run(
                serializeMeetingNoteTemplate({
                  preamble: current.parsed.preamble,
                  sections,
                })
              )
            }
          >
            {t('common.save', { defaultValue: 'Save' })}
          </Button>
        </div>
      }
    >
      {sections.length === 0 ? (
        <p className={META}>
          {t('teams.template.none', { defaultValue: 'None' })}
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 border-y border-slate-200">
          {sections.map((s, i) => (
            <li key={i} className="flex items-center gap-2 py-2">
              <input
                type="text"
                value={s.heading}
                maxLength={200}
                onChange={(e) => update(i, { heading: e.target.value })}
                {...tourFieldAttr(
                  'teams.template.heading',
                  'teams-template',
                  String(i)
                )}
                aria-label={t('teams.template.heading', {
                  defaultValue: 'Section heading',
                })}
                className={`${INPUT} min-w-0 flex-1 py-1.5`}
              />
              <select
                value={s.kind}
                onChange={(e) =>
                  update(i, { kind: e.target.value as MeetingNoteBlockKind })
                }
                aria-label={t('teams.template.kind.label', {
                  defaultValue: 'Block kind',
                })}
                {...tourFieldAttr(
                  'teams.template.kind',
                  'teams-template',
                  String(i)
                )}
                className={`${INPUT} py-1.5`}
              >
                {kinds.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              <IconButton
                icon={<Trash2 className="h-3.5 w-3.5" />}
                label={t('teams.template.remove', {
                  defaultValue: 'Remove section',
                })}
                size="sm"
                variant="danger"
                {...tourFieldAttr(
                  'teams.template.remove',
                  'teams-template',
                  String(i)
                )}
                onClick={() =>
                  setSections((list) => list.filter((_, j) => j !== i))
                }
              />
            </li>
          ))}
        </ul>
      )}
      {sections.length < MAX_SECTIONS && (
        <TextLink
          icon={Plus}
          className="mt-2"
          {...tourAttr('teams.template.add')}
          onClick={() =>
            setSections((list) => [
              ...list,
              { heading: '', kind: 'text', body: '' },
            ])
          }
        >
          {t('teams.template.add', { defaultValue: 'Add section' })}
        </TextLink>
      )}
    </Modal>
  );
};
