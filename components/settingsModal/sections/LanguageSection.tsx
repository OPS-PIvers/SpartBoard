/**
 * LanguageSection — display-language picker. Account-wide (setLanguage), hence
 * the "All boards" scope chip.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { SettingsSectionHeader } from '../SettingsSectionHeader';

export const LanguageSection: React.FC = () => {
  const { t } = useTranslation();
  const { setLanguage, language } = useAuth();
  const { addToast } = useDashboard();

  const handleLanguageChange = (code: string) => {
    void setLanguage(code);
    addToast(t('toasts.settingsSaved'), 'success');
  };

  return (
    <div className="p-5">
      <SettingsSectionHeader
        icon={<Globe className="w-4 h-4" />}
        title={t('sidebar.settings.language', { defaultValue: 'Language' })}
        description={t('sidebar.settings.languageDescription', {
          defaultValue:
            'Choose your preferred display language for the entire board.',
        })}
        scopeLabel={t('settings.scopeAllBoards', {
          defaultValue: 'All boards',
        })}
      />

      <div className="grid grid-cols-2 gap-2.5">
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isActive = language === lang.code;
          return (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={`relative flex flex-col items-center justify-center p-3.5 rounded-xl border-2 transition-all ${
                isActive
                  ? 'bg-brand-blue-primary border-brand-blue-primary text-white shadow-lg shadow-brand-blue-primary/20'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-brand-blue-light hover:shadow-sm'
              }`}
            >
              <span className="text-xs font-bold tracking-wide">
                {lang.nativeLabel}
              </span>
              <span
                className={`text-xxs font-medium mt-0.5 ${
                  isActive ? 'text-white/60' : 'text-slate-400'
                }`}
              >
                {lang.label}
              </span>
              {isActive && (
                <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-white/80" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
