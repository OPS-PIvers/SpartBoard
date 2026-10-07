// Mentoring workspace (T31, T33): required tasks, check-ins, action items and working docs for one pair.

import React, { useId, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Eye,
  FileText,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { DataTable } from '@/components/plc/redesignMockup/charts/DataTable';
import {
  INPUT,
  META,
  RowList,
  Section,
  SectionHead,
  StatusLabel,
  TextLink,
  type StatusTone,
} from '@/components/plc/redesignMockup/ui';

export interface WorkspaceTaskRow {
  id: string;
  title: string;
  due: string;
  submits: string;
  tone: StatusTone;
  status: string;
  submitted: boolean;
  hasDoc: boolean;
  canSubmit: boolean;
}

export interface WorkspaceActionRow {
  id: string;
  title: string;
  meta: string;
  done: boolean;
}

export interface WorkspaceViewProps {
  title: string;
  /** Facilitators get a link back to the Workspaces list. */
  onBack?: () => void;
  /** Mentor and mentee edit; facilitators view. */
  canEdit: boolean;
  tasks: WorkspaceTaskRow[];
  checkIns: { id: string; title: string; meta: string }[];
  actionItems: WorkspaceActionRow[];
  docs: { id: string; title: string }[];
  people: { uid: string; name: string }[];
  busyTaskId?: string | null;
  onOpenTaskDoc?: (taskId: string) => void;
  onSubmitTask?: (taskId: string) => void;
  onViewSubmission?: (taskId: string) => void;
  onNewCheckIn?: () => void;
  onOpenCheckIn?: (id: string) => void;
  onToggleActionItem?: (id: string) => void;
  onAddActionItem?: (input: {
    text: string;
    assigneeUid: string | null;
    dueDate: string;
  }) => void;
  onOpenDoc?: (id: string) => void;
  onAddDoc?: () => void;
}

const DOC_ICON = <FileText className="h-3.5 w-3.5" aria-hidden="true" />;

const taskActions = (
  t: WorkspaceTaskRow,
  p: WorkspaceViewProps
): React.ReactNode => {
  if (t.submitted) {
    return (
      <Button
        key="a"
        variant="ghost"
        size="sm"
        onClick={() => p.onViewSubmission?.(t.id)}
      >
        View
      </Button>
    );
  }
  const openDoc = t.hasDoc ? (
    <Button
      variant="secondary"
      size="sm"
      icon={DOC_ICON}
      onClick={() => p.onOpenTaskDoc?.(t.id)}
    >
      Open doc
    </Button>
  ) : null;
  if (!t.canSubmit || !p.canEdit) return openDoc;
  return (
    <span key="a" className="inline-flex gap-2">
      {openDoc}
      <Button
        size="sm"
        disabled={p.busyTaskId === t.id}
        onClick={() => p.onSubmitTask?.(t.id)}
      >
        Submit
      </Button>
    </span>
  );
};

const AddActionItem: React.FC<{
  people: WorkspaceViewProps['people'];
  onAdd: NonNullable<WorkspaceViewProps['onAddActionItem']>;
}> = ({ people, onAdd }) => {
  const id = useId();
  const [text, setText] = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const add = () => {
    if (!text.trim()) return;
    onAdd({ text: text.trim(), assigneeUid: assignee || null, dueDate: due });
    setText('');
    setDue('');
  };
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <input
        id={`${id}-text`}
        aria-label="Action items"
        className={`${INPUT} min-w-0 flex-1 py-1.5`}
        value={text}
        maxLength={500}
        onChange={(e) => setText(e.target.value)}
      />
      <select
        aria-label="Assignee"
        className={`${INPUT} py-1.5`}
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
      >
        <option value="">Unassigned</option>
        {people.map((p) => (
          <option key={p.uid} value={p.uid}>
            {p.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        aria-label="Due date"
        className={`${INPUT} py-1.5`}
        value={due}
        onChange={(e) => setDue(e.target.value)}
      />
      <Button type="submit" size="sm" variant="secondary" disabled={!text}>
        Add
      </Button>
    </form>
  );
};

export const WorkspaceView: React.FC<WorkspaceViewProps> = (props) => {
  const {
    title,
    onBack,
    canEdit,
    tasks,
    checkIns,
    actionItems,
    docs,
    people,
    onNewCheckIn,
    onOpenCheckIn,
    onToggleActionItem,
    onAddActionItem,
    onOpenDoc,
    onAddDoc,
  } = props;
  const [adding, setAdding] = useState(false);
  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-16">
      <Section first label="Workspace">
        {onBack && (
          <TextLink quiet icon={ArrowLeft} className="mb-2" onClick={onBack}>
            Workspaces
          </TextLink>
        )}
        <h2 className="text-xl font-extrabold text-slate-800">{title}</h2>
        <p className={`${META} mt-1 flex items-center gap-1.5`}>
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          Program facilitators can view this workspace.
        </p>
      </Section>
      {tasks.length > 0 && (
        <Section label="Required tasks">
          <SectionHead title="Required tasks" />
          <DataTable
            head={['Task', 'Due', 'Submits', 'Status', '']}
            align={['left', 'left', 'left', 'left', 'right']}
            rows={tasks.map((t) => [
              <span key="t" className="font-semibold">
                {t.title}
              </span>,
              t.due,
              t.submits,
              <StatusLabel key="s" tone={t.tone}>
                {t.status}
              </StatusLabel>,
              taskActions(t, props),
            ])}
          />
        </Section>
      )}
      <Section label="Check-ins and docs">
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
          <div className="min-w-0">
            <SectionHead title="Check-ins">
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onNewCheckIn}
                  icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  New check-in
                </Button>
              )}
            </SectionHead>
            <RowList>
              {checkIns.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onOpenCheckIn?.(c.id)}
                    className="flex w-full items-center gap-3 rounded py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
                  >
                    <FileText
                      className="h-4 w-4 shrink-0 text-slate-400"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-800">
                        {c.title}
                      </span>
                      {c.meta && (
                        <span className={`${META} mt-0.5 block truncate`}>
                          {c.meta}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </RowList>
          </div>
          <div className="min-w-0">
            <SectionHead title="Action items">
              {canEdit && onAddActionItem && !adding && (
                <TextLink icon={Plus} onClick={() => setAdding(true)}>
                  Add
                </TextLink>
              )}
            </SectionHead>
            <RowList>
              {actionItems.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={a.done}
                    aria-label={a.title}
                    disabled={!canEdit}
                    onClick={() => onToggleActionItem?.(a.id)}
                    className={`shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${
                      a.done
                        ? 'text-emerald-500'
                        : 'text-slate-300 enabled:hover:text-emerald-500'
                    }`}
                  >
                    {a.done ? (
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Circle className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm ${a.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}
                    >
                      {a.title}
                    </p>
                    {a.meta && (
                      <p className={`${META} mt-0.5 truncate`}>{a.meta}</p>
                    )}
                  </div>
                </li>
              ))}
            </RowList>
            {adding && onAddActionItem && (
              <AddActionItem people={people} onAdd={onAddActionItem} />
            )}
            <div className="mt-8">
              <SectionHead title="Working docs">
                {canEdit && (
                  <TextLink icon={Plus} onClick={onAddDoc}>
                    Add a doc
                  </TextLink>
                )}
              </SectionHead>
              <RowList>
                {docs.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => onOpenDoc?.(d.id)}
                      className="flex w-full items-center gap-3 rounded py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
                    >
                      <FileText
                        className="h-4 w-4 shrink-0 text-slate-400"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                        {d.title}
                      </span>
                      <span className={META}>Google Doc</span>
                    </button>
                  </li>
                ))}
              </RowList>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
};
