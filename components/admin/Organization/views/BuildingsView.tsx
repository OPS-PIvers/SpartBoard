import React, { useState } from 'react';
import { School, Plus } from 'lucide-react';
import type { BuildingRecord, BuildingType } from '../types';
import {
  Avatar,
  Badge,
  Btn,
  EmptyState,
  Field,
  Input,
  RowMenu,
  Segmented,
  Select,
  ViewHeader,
  LocalModal,
} from '../components/primitives';

const TYPE_META: Record<
  BuildingType,
  { color: 'emerald' | 'amber' | 'indigo' | 'slate'; label: string }
> = {
  elementary: { color: 'emerald', label: 'Elementary' },
  middle: { color: 'amber', label: 'Middle' },
  high: { color: 'indigo', label: 'High' },
  other: { color: 'slate', label: 'Other' },
};

interface Props {
  buildings: BuildingRecord[];
  onAdd: (b: Partial<BuildingRecord>) => void;
  onUpdate: (id: string, b: Partial<BuildingRecord>) => void;
  onRemove: (id: string) => void;
}

export const BuildingsView: React.FC<Props> = ({
  buildings,
  onAdd,
  onUpdate,
  onRemove,
}) => {
  const [view, setView] = useState<'list' | 'cards'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div>
      <ViewHeader
        title="Buildings"
        blurb="Schools and sites within your district. Buildings drive user assignments and grade-level filtering."
        actions={
          <>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'list', label: 'List' },
                { value: 'cards', label: 'Cards' },
              ]}
              ariaLabel="View mode"
            />
            <Btn
              variant="primary"
              icon={<Plus size={14} />}
              onClick={() => setShowAdd(true)}
            >
              Add building
            </Btn>
          </>
        }
      />

      {buildings.length === 0 ? (
        <EmptyState
          icon={<School size={26} />}
          title="No buildings yet"
          message="Add your first school or site so you can invite users and assign them."
          cta={
            <Btn
              variant="primary"
              icon={<Plus size={14} />}
              onClick={() => setShowAdd(true)}
            >
              Add building
            </Btn>
          }
        />
      ) : view === 'list' ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_2px_rgba(29,42,93,.06),0_1px_3px_rgba(29,42,93,.08)] overflow-hidden">
          <div className="grid grid-cols-[2fr_1fr_2fr_0.8fr_0.8fr_auto] gap-4 px-5 py-3 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <div>Building</div>
            <div>Type</div>
            <div>Address</div>
            <div>Grades</div>
            <div className="text-right">Users</div>
            <div />
          </div>
          {buildings.map((b) => (
            <div
              key={b.id}
              className="grid grid-cols-[2fr_1fr_2fr_0.8fr_0.8fr_auto] items-center gap-4 px-5 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-brand-blue-lighter text-brand-blue-dark flex items-center justify-center shrink-0">
                  <School size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {b.name}
                  </div>
                  {b.adminEmails.length > 0 && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <div className="flex -space-x-1">
                        {b.adminEmails.slice(0, 3).map((e) => (
                          <Avatar key={e} name={e} size="sm" />
                        ))}
                      </div>
                      {b.adminEmails.length > 3 && (
                        <span className="text-xs text-slate-500 ml-1">
                          +{b.adminEmails.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <Badge color={TYPE_META[b.type].color}>
                  {TYPE_META[b.type].label}
                </Badge>
              </div>
              <div className="text-sm text-slate-600 truncate">{b.address}</div>
              <div>
                <Badge color="slate">{b.grades}</Badge>
              </div>
              <div className="text-right text-sm font-mono text-slate-700">
                {b.users}
              </div>
              <RowMenu
                items={[
                  { label: 'Edit', onClick: () => setEditingId(b.id) },
                  {
                    label: 'Archive',
                    onClick: () => onRemove(b.id),
                    danger: true,
                  },
                ]}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {buildings.map((b) => (
            <div
              key={b.id}
              className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_2px_rgba(29,42,93,.06)] p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="h-10 w-10 rounded-xl bg-brand-blue-lighter text-brand-blue-dark flex items-center justify-center">
                  <School size={18} />
                </div>
                <RowMenu
                  items={[
                    { label: 'Edit', onClick: () => setEditingId(b.id) },
                    {
                      label: 'Archive',
                      onClick: () => onRemove(b.id),
                      danger: true,
                    },
                  ]}
                />
              </div>
              <div className="text-sm font-bold text-slate-900">{b.name}</div>
              <div className="text-xs text-slate-500 mt-0.5">{b.address}</div>
              <div className="flex items-center gap-2 mt-3">
                <Badge color={TYPE_META[b.type].color}>
                  {TYPE_META[b.type].label}
                </Badge>
                <Badge color="slate">{b.grades}</Badge>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  <span className="font-mono text-slate-700">{b.users}</span>{' '}
                  users
                </div>
                <div className="flex -space-x-1">
                  {b.adminEmails.slice(0, 3).map((e) => (
                    <Avatar key={e} name={e} size="sm" />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <BuildingModal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={(b) => {
          onAdd(b);
          setShowAdd(false);
        }}
      />
      <BuildingModal
        isOpen={!!editingId}
        onClose={() => setEditingId(null)}
        existing={buildings.find((b) => b.id === editingId) ?? null}
        onSave={(b) => {
          if (editingId) onUpdate(editingId, b);
          setEditingId(null);
        }}
      />
    </div>
  );
};

interface BuildingModalProps {
  isOpen: boolean;
  onClose: () => void;
  existing?: BuildingRecord | null;
  onSave: (b: Partial<BuildingRecord>) => void;
}

const BuildingModal: React.FC<BuildingModalProps> = (props) => {
  if (!props.isOpen) return null;
  return <BuildingModalInner {...props} key={props.existing?.id ?? 'new'} />;
};

const BuildingModalInner: React.FC<BuildingModalProps> = ({
  isOpen,
  onClose,
  existing,
  onSave,
}) => {
  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<BuildingType>(
    existing?.type ?? 'elementary'
  );
  const [address, setAddress] = useState(existing?.address ?? '');
  const [grades, setGrades] = useState(existing?.grades ?? 'K-5');

  return (
    <LocalModal
      isOpen={isOpen}
      onClose={onClose}
      title={existing ? 'Edit building' : 'Add building'}
      icon={<School size={18} />}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            variant="primary"
            disabled={!name}
            onClick={() =>
              onSave({
                name,
                type,
                address,
                grades,
              })
            }
          >
            {existing ? 'Save changes' : 'Add building'}
          </Btn>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Building name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Orono Middle School"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type">
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as BuildingType)}
            >
              <option value="elementary">Elementary</option>
              <option value="middle">Middle</option>
              <option value="high">High</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field
            label="Grades served"
            hint="Drives grade-level widget filtering"
          >
            <Input
              value={grades}
              onChange={(e) => setGrades(e.target.value)}
              placeholder="K-2"
            />
          </Field>
        </div>
        <Field label="Address">
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="685 Old Crystal Bay Rd N"
          />
        </Field>
      </div>
    </LocalModal>
  );
};
