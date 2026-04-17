import React from 'react';
import { GraduationCap, Bell, UserRound, Utensils } from 'lucide-react';
import type { StudentPageConfig } from '../types';
import {
  Card,
  Field,
  Input,
  Toggle,
  ViewHeader,
} from '../components/primitives';

interface Props {
  config: StudentPageConfig;
  onUpdate: (patch: Partial<StudentPageConfig>) => void;
  orgName: string;
}

const ACCENT_PRESETS = [
  '#2d3f89',
  '#ad2122',
  '#0f766e',
  '#7c3aed',
  '#b45309',
  '#be185d',
];

export const StudentPageView: React.FC<Props> = ({
  config,
  onUpdate,
  orgName,
}) => {
  return (
    <div>
      <ViewHeader
        title="Student page"
        blurb="What students see when they sign in. Changes apply immediately to all student accounts in this organization."
      />
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">
        {/* Preview */}
        <Card className="p-6">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Preview
          </div>
          <div
            className="rounded-2xl overflow-hidden border border-slate-200"
            style={{ backgroundColor: '#f8fafc' }}
          >
            <div
              className="px-6 py-8 text-white"
              style={{ background: config.accentColor }}
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <GraduationCap size={20} />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide opacity-80">
                    {orgName}
                  </div>
                  <h3 className="text-xl font-bold">{config.heroText}</h3>
                </div>
              </div>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-white border border-slate-200 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Your classes
                </div>
                <div className="mt-2 space-y-2">
                  {['Math - Grade 5', 'Science - Grade 5', 'ELA - Grade 5'].map(
                    (c) => (
                      <div
                        key={c}
                        className="text-sm text-slate-800 border border-slate-100 rounded-lg px-3 py-2"
                      >
                        {c}
                      </div>
                    )
                  )}
                </div>
              </div>
              <div className="space-y-3">
                {config.showAnnouncements && (
                  <div className="rounded-xl bg-white border border-slate-200 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Bell size={14} style={{ color: config.accentColor }} />
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Announcements
                      </div>
                    </div>
                    <div className="text-sm text-slate-700">
                      Picture day is Friday — smile big!
                    </div>
                  </div>
                )}
                {config.showTeacherDirectory && (
                  <div className="rounded-xl bg-white border border-slate-200 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <UserRound
                        size={14}
                        style={{ color: config.accentColor }}
                      />
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Teachers
                      </div>
                    </div>
                    <div className="text-sm text-slate-700">
                      Find your teacher&apos;s contact info.
                    </div>
                  </div>
                )}
                {config.showLunchMenu && (
                  <div className="rounded-xl bg-white border border-slate-200 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Utensils
                        size={14}
                        style={{ color: config.accentColor }}
                      />
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Lunch today
                      </div>
                    </div>
                    <div className="text-sm text-slate-700">
                      Chicken sandwich, carrots, apple.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Settings */}
        <Card className="p-6 space-y-5 h-fit">
          <Field label="Hero heading">
            <Input
              value={config.heroText}
              onChange={(e) => onUpdate({ heroText: e.target.value })}
            />
          </Field>

          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Sections
            </div>
            <SettingRow
              label="Show announcements"
              description="Latest announcements from teachers and admins."
              checked={config.showAnnouncements}
              onChange={(v) => onUpdate({ showAnnouncements: v })}
            />
            <SettingRow
              label="Show teacher directory"
              description="Students can look up teacher contact info."
              checked={config.showTeacherDirectory}
              onChange={(v) => onUpdate({ showTeacherDirectory: v })}
            />
            <SettingRow
              label="Show lunch menu"
              description="Daily lunch menu, synced from your district feed."
              checked={config.showLunchMenu}
              onChange={(v) => onUpdate({ showLunchMenu: v })}
            />
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Accent color
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {ACCENT_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Set accent ${c}`}
                  onClick={() => onUpdate({ accentColor: c })}
                  className={`h-8 w-8 rounded-full border-2 transition ${
                    config.accentColor === c
                      ? 'border-slate-900 scale-110'
                      : 'border-white shadow-sm'
                  }`}
                  style={{ background: c }}
                />
              ))}
              <input
                type="color"
                value={config.accentColor}
                onChange={(e) => onUpdate({ accentColor: e.target.value })}
                className="h-8 w-12 rounded-lg border border-slate-300 bg-white cursor-pointer"
                aria-label="Custom accent color"
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

const SettingRow: React.FC<{
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, description, checked, onChange }) => (
  <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
    <div className="min-w-0">
      <div className="text-sm font-semibold text-slate-800">{label}</div>
      <div className="text-xs text-slate-500 mt-0.5">{description}</div>
    </div>
    <Toggle checked={checked} onChange={onChange} ariaLabel={label} />
  </div>
);
