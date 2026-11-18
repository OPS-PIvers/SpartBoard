import React from 'react';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { Plus, Trash2 } from 'lucide-react';

interface BetaUsersPanelProps {
  betaUsers: string[];
  onChange: (betaUsers: string[]) => void;
  showMessage: (type: 'success' | 'error', text: string) => void;
  variant?: 'card' | 'expanded';
  /** The exclude list reuses this panel with its own words and anchors. */
  kind?: 'beta' | 'excluded';
}

const KIND_TEXT = {
  beta: {
    title: 'Beta Users',
    hint: null,
    noun: 'beta user',
    email: tourAttr('admin.beta.email'),
    add: tourAttr('admin.beta.add'),
    remove: (row: string) => tourFieldAttr('admin.beta.remove', 'admin', row),
  },
  excluded: {
    title: 'Excluded Users',
    hint: 'These people never get this. It overrides every other setting, even for admins.',
    noun: 'excluded user',
    email: tourAttr('admin.excluded.email'),
    add: tourAttr('admin.excluded.add'),
    remove: (row: string) =>
      tourFieldAttr('admin.excluded.remove', 'admin', row),
  },
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const BetaUsersPanel: React.FC<BetaUsersPanelProps> = ({
  betaUsers,
  onChange,
  showMessage,
  variant = 'card',
  kind = 'beta',
}) => {
  const text = KIND_TEXT[kind];
  const addBetaUser = (email: string): boolean => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return true;
    if (!EMAIL_RE.test(trimmedEmail)) {
      showMessage('error', 'Please enter a valid email address.');
      return false;
    }
    // Case-insensitive so a legacy mixed-case entry is not added twice.
    if (!betaUsers.some((e) => e.toLowerCase() === trimmedEmail)) {
      onChange([...betaUsers, trimmedEmail]);
    }
    return true;
  };

  const containerClass = variant === 'card' ? 'mb-3' : 'p-4 bg-blue-50/50';
  const itemClass =
    variant === 'card'
      ? 'flex items-center justify-between p-2 bg-blue-50 rounded-lg'
      : 'flex items-center justify-between p-2 bg-white rounded-lg border border-blue-100';

  return (
    <div className={containerClass}>
      <label className="text-sm font-medium text-slate-700 mb-2 block">
        {text.title}
      </label>
      {text.hint && (
        <p className="text-xs text-slate-500 -mt-1 mb-2">{text.hint}</p>
      )}
      <div className={`space-y-2 ${variant === 'expanded' ? 'max-w-md' : ''}`}>
        {betaUsers.map((email) => (
          <div key={email} className={itemClass}>
            <span className="text-sm text-slate-700">{email}</span>
            <button
              onClick={() => onChange(betaUsers.filter((e) => e !== email))}
              className="text-red-600 hover:bg-red-100 p-1 rounded-sm transition-colors"
              aria-label={`Remove ${email}`}
              {...text.remove(String(betaUsers.indexOf(email)))}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}

        <div className="flex gap-2">
          <input
            type="email"
            placeholder="user@example.com"
            aria-label={`Add ${text.noun} email`}
            {...text.email}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const target = e.target as HTMLInputElement;
                if (addBetaUser(target.value)) target.value = '';
              }
            }}
          />
          <button
            onClick={(e) => {
              const input = e.currentTarget
                .previousElementSibling as HTMLInputElement;
              if (addBetaUser(input.value)) input.value = '';
            }}
            className="px-3 py-2 bg-brand-blue-primary text-white rounded-lg hover:bg-brand-blue-dark transition-colors"
            aria-label={`Add ${text.noun}`}
            {...text.add}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
