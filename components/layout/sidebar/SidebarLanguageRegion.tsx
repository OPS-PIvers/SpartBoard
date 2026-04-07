import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { SUPPORTED_LANGUAGES } from '@/i18n';

interface SidebarLanguageRegionProps {
  isVisible: boolean;
}

export const SidebarLanguageRegion: React.FC<SidebarLanguageRegionProps> = ({
  isVisible,
}) => {
  const { t, i18n } = useTranslation();
  const { addToast } = useDashboard();

  const handleLanguageChange = (code: string) => {
    void i18n.changeLanguage(code);
    addToast(t('toasts.settingsSaved'), 'success');
  };

  return (
    <div
      className={`absolute inset-0 flex flex-col transition-all duration-300 ease-in-out ${
        isVisible
          ? 'translate-x-0 opacity-100 visible'
          : 'translate-x-full opacity-0 invisible'
      }`}
    >
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-5 space-y-6">
          {/* Language Section */}
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                <Globe className="w-4 h-4 text-violet-500" />
              </div>
              <h2 className="text-sm font-bold text-slate-800">
                {t('sidebar.settings.language', {
                  defaultValue: 'Language',
                })}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-2 mb-4 leading-relaxed">
              {t('sidebar.settings.languageDescription', {
                defaultValue:
                  'Choose your preferred display language for the entire board.',
              })}
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              {SUPPORTED_LANGUAGES.map((lang) => {
                const isActive = i18n.language === lang.code;
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
        </div>
      </div>
    </div>
  );
};
