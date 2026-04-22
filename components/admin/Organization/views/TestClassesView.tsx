import React, { useMemo, useState } from 'react';
import { FlaskConical, Plus, Users, Mail } from 'lucide-react';
import { useDialog } from '@/context/useDialog';
import type { TestClassRecord } from '@/hooks/useTestClasses';
import {
  Badge,
  Btn,
  EmptyState,
  Field,
  Input,
  RowMenu,
  Textarea,
  ViewHeader,
  LocalModal,
} from '../components/primitives';

interface Props {
  testClasses: TestClassRecord[];
  onAdd: (input: {
    classId?: string;
    title: string;
    subject?: string;
    memberEmails: string;
  }) => void;
  onUpdate: (
    id: string,
    patch: { title?: string; subject?: string; memberEmails?: string }
  ) => void;
  onRemove: (id: string) => void;
}

export const TestClassesView: React.FC<Props> = ({
  testClasses,
  onAdd,
  onUpdate,
  onRemove,
}) => {
  const { showConfirm } = useDialog();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<TestClassRecord | null>(null);

  const totalMembers = useMemo(
    () => testClasses.reduce((a, c) => a + c.memberEmails.length, 0),
    [testClasses]
  );

  const handleDelete = async (cls: TestClassRecord) => {
    const confirmed = await showConfirm(
      `Delete test class "${cls.title}"? Any students signed in via this class will lose access.`,
      {
        title: 'Delete Test Class',
        variant: 'danger',
        confirmLabel: 'Delete',
      }
    );
    if (confirmed) onRemove(cls.id);
  };

  return (
    <div>
      <ViewHeader
        title="Test classes"
        blurb="Admin-managed mock classes for PII-free student SSO testing. Listed students can sign in via /join without going through ClassLink, and teachers see these classes with a TEST badge in their sidebar."
        actions={
          <Btn
            variant="primary"
            icon={<Plus size={14} />}
            onClick={() => setShowAdd(true)}
          >
            New test class
          </Btn>
        }
      />

      {testClasses.length === 0 ? (
        <EmptyState
          icon={<FlaskConical size={26} />}
          title="No test classes yet"
          message="Create a test class with a few member emails to enable PII-free student SSO testing without ClassLink."
          cta={
            <Btn
              variant="primary"
              icon={<Plus size={14} />}
              onClick={() => setShowAdd(true)}
            >
              New test class
            </Btn>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <Stat
              icon={<FlaskConical size={14} />}
              label="Test classes"
              value={testClasses.length.toString()}
            />
            <Stat
              icon={<Users size={14} />}
              label="Total member emails"
              value={totalMembers.toString()}
            />
            <Stat
              icon={<Mail size={14} />}
              label="Bypass path"
              value={
                <span className="text-sm font-mono text-slate-700">/join</span>
              }
            />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_2px_rgba(29,42,93,.06),0_1px_3px_rgba(29,42,93,.08)] overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-[2fr_1fr_0.7fr_auto] gap-4 px-5 py-3 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <div>Class</div>
                  <div>Subject</div>
                  <div className="text-right">Members</div>
                  <div />
                </div>
                {testClasses.map((cls) => (
                  <div
                    key={cls.id}
                    className="grid grid-cols-[2fr_1fr_0.7fr_auto] items-center gap-4 px-5 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors min-w-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                        <FlaskConical size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-800 truncate">
                          {cls.title}
                        </div>
                        <div className="text-xs font-mono text-slate-500 truncate">
                          {cls.id}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-slate-700 truncate">
                      {cls.subject ?? <span className="text-slate-400">—</span>}
                    </div>
                    <div className="text-right">
                      <Badge color="amber">
                        {cls.memberEmails.length} email
                        {cls.memberEmails.length === 1 ? '' : 's'}
                      </Badge>
                    </div>
                    <RowMenu
                      items={[
                        {
                          label: 'Edit',
                          onClick: () => setEditing(cls),
                        },
                        {
                          label: 'Delete',
                          onClick: () => void handleDelete(cls),
                          danger: true,
                        },
                      ]}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {showAdd && (
        <TestClassModal
          mode="add"
          onClose={() => setShowAdd(false)}
          onSubmit={(input) => {
            onAdd(input);
            setShowAdd(false);
          }}
        />
      )}
      {editing && (
        <TestClassModal
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={(input) => {
            onUpdate(editing.id, {
              title: input.title,
              subject: input.subject,
              memberEmails: input.memberEmails,
            });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
};

const Stat: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}> = ({ icon, label, value }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-[0_1px_2px_rgba(29,42,93,.06)]">
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      <span className="text-slate-400">{icon}</span>
      {label}
    </div>
    <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
  </div>
);

interface ModalProps {
  mode: 'add' | 'edit';
  initial?: TestClassRecord;
  onClose: () => void;
  onSubmit: (input: {
    classId?: string;
    title: string;
    subject?: string;
    memberEmails: string;
  }) => void;
}

const TestClassModal: React.FC<ModalProps> = ({
  mode,
  initial,
  onClose,
  onSubmit,
}) => {
  const [classId, setClassId] = useState(initial?.id ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [emails, setEmails] = useState(initial?.memberEmails.join('\n') ?? '');

  const titleValid = title.trim().length > 0;
  const emailsValid = emails.split(/[,\n]+/).some((e) => e.trim().length > 0);
  const canSubmit = titleValid && emailsValid;

  return (
    <LocalModal
      isOpen
      onClose={onClose}
      title={mode === 'add' ? 'New test class' : 'Edit test class'}
      icon={<FlaskConical size={18} />}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            variant="primary"
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                classId:
                  mode === 'add' ? classId.trim() || undefined : undefined,
                title: title.trim(),
                subject: subject.trim() || undefined,
                memberEmails: emails,
              })
            }
          >
            {mode === 'add' ? 'Create' : 'Save'}
          </Btn>
        </>
      }
    >
      <div className="space-y-4">
        {mode === 'add' && (
          <Field
            label="Class ID"
            hint="Optional. Leave blank to auto-generate from the title. Used as the Firestore doc ID and in student PINs."
            htmlFor="test-class-id"
          >
            <Input
              id="test-class-id"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              placeholder="mock-period-1"
            />
          </Field>
        )}
        <Field label="Title" required htmlFor="test-class-title">
          <Input
            id="test-class-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Mock Period 1 (QA)"
            autoFocus
          />
        </Field>
        <Field label="Subject" htmlFor="test-class-subject">
          <Input
            id="test-class-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Math"
          />
        </Field>
        <Field
          label="Member emails"
          required
          hint="One per line or comma-separated. Emails are lowercased and deduplicated on save."
          htmlFor="test-class-emails"
        >
          <Textarea
            id="test-class-emails"
            rows={6}
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder={'student1@school.org\nstudent2@school.org'}
          />
        </Field>
      </div>
    </LocalModal>
  );
};
