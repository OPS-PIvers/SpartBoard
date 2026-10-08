import React, { useState } from 'react';
import { Clock, X } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { GRADE_OPTIONS_BY_SITE } from './schema/gradeOptions';
import type { LunchCountSchoolSite } from './schema/gradeOptions';
import { WheelPicker } from './WheelPicker';

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 12 }, (_, i) =>
  String(i * 5).padStart(2, '0')
);
const DEFAULT_HOUR = '11';
const DEFAULT_MINUTE = '00';
const SCHOOL_OPTIONS: { value: LunchCountSchoolSite; label: string }[] = [
  { value: 'schumann-elementary', label: 'Schumann' },
  { value: 'orono-intermediate-school', label: 'Intermediate' },
];

export interface LunchInfo {
  hour: string;
  minute: string;
  grade: string;
  schoolSite: LunchCountSchoolSite;
}

interface MissingInfoModalProps {
  isOpen: boolean;
  needsTime: boolean;
  needsGrade: boolean;
  askSchool: boolean;
  current: LunchInfo;
  onClose: () => void;
  onSave: (info: LunchInfo) => void;
}

const nearestMinute = (minute: string): string => {
  const n = Number(minute);
  if (!minute || !Number.isFinite(n)) return DEFAULT_MINUTE;
  return MINUTES[Math.min(11, Math.max(0, Math.round(n / 5)))];
};

const MissingInfoForm: React.FC<Omit<MissingInfoModalProps, 'isOpen'>> = ({
  needsTime,
  needsGrade,
  askSchool,
  current,
  onClose,
  onSave,
}) => {
  const [hour, setHour] = useState(
    HOURS.includes(current.hour) ? current.hour : DEFAULT_HOUR
  );
  const [minute, setMinute] = useState(nearestMinute(current.minute));
  const [grade, setGrade] = useState(current.grade);
  const [schoolSite, setSchoolSite] = useState(current.schoolSite);
  const [showGradeError, setShowGradeError] = useState(false);
  const gradeOptions = GRADE_OPTIONS_BY_SITE[schoolSite];
  const showGrade = needsGrade || askSchool;
  const info: LunchInfo = {
    hour: needsTime ? hour : current.hour,
    minute: needsTime ? minute : current.minute,
    grade,
    schoolSite,
  };
  const title = `Set your ${[
    askSchool && 'school',
    needsTime && 'lunch time',
    showGrade && 'grade',
  ]
    .filter(Boolean)
    .join(', ')
    .replace(/, ([^,]*)$/, ' and $1')}`;

  const pickSchool = (site: LunchCountSchoolSite) => {
    setSchoolSite(site);
    if (!GRADE_OPTIONS_BY_SITE[site].some((g) => g.value === grade)) {
      setGrade('');
    }
  };

  const handleSave = () => {
    if (!grade) {
      setShowGradeError(true);
      return;
    }
    onSave(info);
  };

  return (
    <div className="bg-white rounded-3xl shadow-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 animate-in zoom-in-95 duration-200 custom-scrollbar">
      <div className="p-5 bg-brand-blue-primary text-white flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/30 rounded-xl">
            <Clock className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3
            id="lunch-missing-info-title"
            className="font-black text-lg tracking-tight"
          >
            {title}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/20 rounded-full transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 space-y-6">
        {askSchool && (
          <div className="space-y-2">
            <span
              id="lunch-missing-school-label"
              className="text-xxs font-black text-slate-500 uppercase tracking-widest"
            >
              School
            </span>
            <div
              role="radiogroup"
              aria-labelledby="lunch-missing-school-label"
              className="flex gap-2"
            >
              {SCHOOL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={schoolSite === option.value}
                  onClick={() => pickSchool(option.value)}
                  className={`flex-1 h-14 rounded-2xl text-lg font-black border transition-colors ${
                    schoolSite === option.value
                      ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-brand-blue-primary'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {needsTime && (
          <div className="space-y-2">
            <span className="text-xxs font-black text-slate-500 uppercase tracking-widest">
              Lunch time
            </span>
            <div className="flex items-center justify-center gap-2">
              <WheelPicker
                label="Hour"
                options={HOURS}
                value={hour}
                onChange={setHour}
              />
              <span
                className="font-black text-slate-700"
                style={{ fontSize: 30 }}
                aria-hidden="true"
              >
                :
              </span>
              <WheelPicker
                label="Minute"
                options={MINUTES}
                value={minute}
                onChange={setMinute}
              />
            </div>
          </div>
        )}

        {showGrade && (
          <div className="space-y-2">
            <span
              id="lunch-missing-grade-label"
              className="text-xxs font-black text-slate-500 uppercase tracking-widest"
            >
              Grade
            </span>
            <div
              role="radiogroup"
              aria-labelledby="lunch-missing-grade-label"
              className="flex gap-2"
            >
              {gradeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={grade === option.value}
                  onClick={() => {
                    setGrade(option.value);
                    setShowGradeError(false);
                  }}
                  className={`flex-1 h-14 rounded-2xl text-lg font-black border transition-colors ${
                    grade === option.value
                      ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-brand-blue-primary'
                  }`}
                >
                  {option.value}
                </button>
              ))}
            </div>
            {showGradeError && (
              <p className="text-sm font-bold text-red-600" role="alert">
                Pick a grade
              </p>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            onClick={onClose}
            variant="secondary"
            className="flex-1 py-4 rounded-2xl font-black uppercase tracking-widest"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="success"
            className="flex-[2] py-4 rounded-2xl font-black uppercase tracking-widest"
          >
            Save and continue
          </Button>
        </div>
      </div>
    </div>
  );
};

export const MissingInfoModal: React.FC<MissingInfoModalProps> = ({
  isOpen,
  onClose,
  ...rest
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    variant="bare"
    maxWidth="max-w-md"
    ariaLabelledby="lunch-missing-info-title"
  >
    {isOpen && <MissingInfoForm onClose={onClose} {...rest} />}
  </Modal>
);
