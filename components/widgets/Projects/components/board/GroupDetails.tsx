import React, { useState } from 'react';
import { Link2, Paperclip, Users, History } from 'lucide-react';
import type { ProjectStep, ProjectUpload, ProjectWorkLink } from '@/types';
import { useAuth } from '@/context/useAuth';
import {
  formatStudentName,
  useAssignmentPseudonymsMulti,
} from '@/hooks/useAssignmentPseudonyms';
import { useProjectGroupEvents } from '@/hooks/useProjectGroupEvents';
import { sortUploads, uploadArchiveLabel } from '../../projectUploads';
import { describeEvent, relativeTime } from '../../boardHelpers';

interface GroupDetailsProps {
  runId: string;
  groupId: string;
  classId: string;
  memberUids: string[];
  steps: ProjectStep[];
  workLinks: ProjectWorkLink[];
  uploads: ProjectUpload[];
  workLoading: boolean;
}

const TEXT = 'min(13px, 3.8cqmin)';
const SMALL = 'min(11px, 3.2cqmin)';
const ICON = { width: 'min(13px, 3.4cqmin)', height: 'min(13px, 3.4cqmin)' };

const stepTitle = (steps: ProjectStep[], stepId?: string): string | null =>
  stepId ? (steps.find((s) => s.id === stepId)?.title ?? null) : null;

const Section: React.FC<{
  icon: typeof Users;
  label: string;
  children: React.ReactNode;
}> = ({ icon: Icon, label, children }) => (
  <section className="min-w-0">
    <h4
      className="flex items-center font-bold uppercase tracking-wide text-slate-500"
      style={{ gap: 'min(4px, 1cqmin)', fontSize: SMALL }}
    >
      <Icon aria-hidden style={ICON} />
      {label}
    </h4>
    <div style={{ marginTop: 'min(4px, 1cqmin)', fontSize: TEXT }}>
      {children}
    </div>
  </section>
);

const Quiet: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-slate-500">{children}</p>
);

/** D35 — members, work and recent events for one expanded row; listeners live only while it is open. */
export const GroupDetails: React.FC<GroupDetailsProps> = ({
  runId,
  groupId,
  classId,
  memberUids,
  steps,
  workLinks,
  uploads,
  workLoading,
}) => {
  const { orgId } = useAuth();
  const hasSignIn = !classId.startsWith('local:');
  const { byStudentUid } = useAssignmentPseudonymsMulti(
    hasSignIn && memberUids.length > 0 ? runId : null,
    [classId],
    orgId
  );
  const { events, loading: eventsLoading } = useProjectGroupEvents(
    runId,
    groupId
  );
  // Captured once per expand so render stays pure; "2m ago" need not tick.
  const [now] = useState(() => Date.now());

  const nameOf = (uid: string): string | undefined =>
    formatStudentName(byStudentUid.get(uid)) || undefined;
  const names = memberUids.map(nameOf).filter((n): n is string => Boolean(n));
  const namesPending = memberUids.length > 0 && byStudentUid.size === 0;

  return (
    <div
      className="grid rounded-lg bg-white/80 text-slate-700"
      style={{
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 40cqw), 1fr))',
        gap: 'min(12px, 2.4cqmin)',
        padding: 'min(10px, 2cqmin) min(12px, 2.4cqmin)',
      }}
    >
      <Section icon={Users} label="Members">
        {memberUids.length === 0 ? (
          <Quiet>No students have joined.</Quiet>
        ) : namesPending ? (
          <Quiet>Loading names…</Quiet>
        ) : (
          <p className="leading-snug" data-pii="true">
            {names.length > 0
              ? names.join(', ')
              : `${memberUids.length} students`}
          </p>
        )}
      </Section>

      <Section icon={Link2} label="Work">
        {workLoading ? (
          <Quiet>Loading…</Quiet>
        ) : workLinks.length === 0 && uploads.length === 0 ? (
          <Quiet>Nothing shared yet.</Quiet>
        ) : (
          <ul className="space-y-0.5">
            {workLinks.map((link) => {
              const forStep = stepTitle(steps, link.stepId);
              return (
                <li key={link.id} className="flex min-w-0 items-baseline gap-1">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate font-semibold text-brand-blue-primary hover:underline"
                    data-pii="true"
                  >
                    {link.label?.trim() ? link.label : link.url}
                  </a>
                  {forStep && (
                    <span
                      className="shrink-0 text-slate-500"
                      style={{ fontSize: SMALL }}
                    >
                      {forStep}
                    </span>
                  )}
                </li>
              );
            })}
            {sortUploads(uploads).map((upload) => (
              <li key={upload.id} className="flex min-w-0 items-baseline gap-1">
                <Paperclip
                  aria-hidden
                  className="shrink-0 self-center text-slate-400"
                  style={ICON}
                />
                {upload.driveUrl ? (
                  <a
                    href={upload.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate font-semibold text-brand-blue-primary hover:underline"
                    data-pii="true"
                  >
                    {upload.fileName}
                  </a>
                ) : (
                  <span className="truncate font-semibold" data-pii="true">
                    {upload.fileName}
                  </span>
                )}
                <span
                  className="shrink-0 text-slate-500"
                  style={{ fontSize: SMALL }}
                >
                  {uploadArchiveLabel(upload)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={History} label="Recent">
        {eventsLoading ? (
          <Quiet>Loading…</Quiet>
        ) : events.length === 0 ? (
          <Quiet>No activity yet.</Quiet>
        ) : (
          <ul className="space-y-0.5">
            {events.map((event) => (
              <li key={event.id} className="leading-snug">
                {describeEvent(event, steps, nameOf)}
                <span className="text-slate-500" style={{ fontSize: SMALL }}>
                  {' · '}
                  {relativeTime(event.at, now)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
};
