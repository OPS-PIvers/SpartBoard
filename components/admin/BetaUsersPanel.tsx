import React from 'react';
import {
  FeaturePermission,
  WidgetType,
  InternalToolType,
  ToolMetadata,
} from '@/types';
import { Plus, Trash2 } from 'lucide-react';

interface BetaUsersPanelProps {
  tool: ToolMetadata;
  permission: FeaturePermission;
  updatePermission: (
    widgetType: WidgetType | InternalToolType,
    updates: Partial<FeaturePermission>
  ) => void;
  showMessage: (type: 'success' | 'error', text: string) => void;
  variant?: 'card' | 'expanded';
}

export const BetaUsersPanel: React.FC<BetaUsersPanelProps> = ({
  tool,
  permission,
  updatePermission,
  showMessage,
  variant = 'card',
}) => {
  const addBetaUser = (
    widgetType: WidgetType | InternalToolType,
    email: string
  ) => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return;

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      showMessage('error', 'Please enter a valid email address.');
      return;
    }

    if (!permission.betaUsers.includes(trimmedEmail)) {
      updatePermission(widgetType, {
        betaUsers: [...permission.betaUsers, trimmedEmail],
      });
    }
  };

  const removeBetaUser = (
    widgetType: WidgetType | InternalToolType,
    email: string
  ) => {
    updatePermission(widgetType, {
      betaUsers: permission.betaUsers.filter((e) => e !== email),
    });
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
        {permission.betaUsers.map((email) => (
          <div key={email} className={itemClass}>
            <span className="text-sm text-slate-700">{email}</span>
            <button
              onClick={() => removeBetaUser(tool.type, email)}
              className="text-red-600 hover:bg-red-100 p-1 rounded transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}

        <div className="flex gap-2">
          <input
            type="email"
            placeholder="user@example.com"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                addBetaUser(tool.type, (e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).value = '';
              }
            }}
          />
          <button
            onClick={(e) => {
              const input = e.currentTarget
                .previousElementSibling as HTMLInputElement;
              addBetaUser(tool.type, input.value);
              input.value = '';
            }}
            className="px-3 py-2 bg-brand-blue-primary text-white rounded-lg hover:bg-brand-blue-dark transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
