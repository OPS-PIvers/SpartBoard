// `doc` hero and the `newestDoc` default (T5, T6): the pinned Google Doc, else the most recently updated one.

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlcDocs } from '@/hooks/usePlcDocs';
import { HeroHead } from '@/components/plc/redesignMockup/DepartmentHubMock';
import { DocHeroEmbed } from '@/components/plc/teams/department/DocHeroEmbed';
import { formatShortDate } from '@/components/plc/teams/notes/noteFormat';
import type { TeamHeroProps } from '@/components/plc/teams/types';
import { pickHeroDoc } from './heroDoc';

export const TeamDocHero: React.FC<TeamHeroProps> = ({
  plc,
  heroRef,
  pinnedBy,
  isLead,
  onChangeHero,
}) => {
  const { t } = useTranslation();
  const { docs } = usePlcDocs(plc.id);
  const docId = heroRef?.kind === 'doc' ? heroRef.docId : null;
  const doc = useMemo(() => pickHeroDoc(docs, docId), [docs, docId]);
  if (!doc) return null;
  const meta = t('teams.notes.docMeta', {
    defaultValue: 'Google Doc · updated {{date}} by {{name}}',
    date: formatShortDate(doc.updatedAt),
    name: doc.createdByName,
  });
  return (
    <>
      <HeroHead
        title={doc.title}
        isLead={isLead}
        onChange={onChangeHero}
        meta={
          pinnedBy && doc.id === docId
            ? `${meta} · ${t('plcDataOverview.pinnedBy', {
                name: pinnedBy.name,
                defaultValue: 'Pinned by {{name}}',
              })}`
            : meta
        }
      />
      <div className="mt-4">
        <DocHeroEmbed url={doc.url} title={doc.title} />
      </div>
    </>
  );
};
