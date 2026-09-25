import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

interface BetaUsersPanelProps {
  betaUsers: string[];
  onChange: (betaUsers: string[]) => void;
  showMessage: (type: 'success' | 'error', text: string) => void;
  variant?: 'card' | 'expanded';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const BetaUsersPanel: React.FC<BetaUsersPanelProps> = ({
  betaUsers,
  onChange,
  showMessage,
  variant = 'card',
}) => {
  const addBetaUser = (email: string) => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return;
    if (!EMAIL_RE.test(trimmedEmail)) {
      showMessage('error', 'Please enter a valid email address.');
      return;
    }
    // Case-insensitive so a legacy mixed-case entry is not added twice.
    if (!betaUsers.some((e) => e.toLowerCase() === trimmedEmail)) {
      onChange([...betaUsers, trimmedEmail]);
    }
  };

  const containerClass = variant === 'card' ? 'mb-3' : 'p-4 bg-blue-50/50';
  const itemClass =
    variant === 'card'
      ? 'flex items-center justify-between p-2 bg-blue-50 rounded-lg'
      : 'flex items-center justify-between p-2 bg-white rounded-lg border border-blue-100';

  return (
    <div className={containerClass}>
      <label className="text-sm font-medium text-slate-700 mb-2 block">
        Beta Users
      </label>
      <div className={`space-y-2 ${variant === 'expanded' ? 'max-w-md' : ''}`}>
        {betaUsers.map((email) => (
          <div key={email} className={itemClass}>
            <span className="text-sm text-slate-700">{email}</span>
            <button
              onClick={() => onChange(betaUsers.filter((e) => e !== email))}
              className="text-red-600 hover:bg-red-100 p-1 rounded transition-colors"
              aria-label={`Remove ${email}`}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}

        <div className="flex gap-2">
          <input
            type="email"
            placeholder="user@example.com"
            aria-label="Add beta user email"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                addBetaUser((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).value = '';
              }
            }}
          />
          <button
            onClick={(e) => {
              const input = e.currentTarget
                .previousElementSibling as HTMLInputElement;
              addBetaUser(input.value);
              input.value = '';
            }}
            className="px-3 py-2 bg-brand-blue-primary text-white rounded-lg hover:bg-brand-blue-dark transition-colors"
            aria-label="Add beta user"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
