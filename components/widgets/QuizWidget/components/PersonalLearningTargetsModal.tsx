import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/common/Modal';
import { LearningTargetsManager } from '@/components/plc/settings/LearningTargetsManager';
import { usePersonalLearningTargets } from '@/hooks/useLearningTargets';
import { useStandardsCatalog } from '@/hooks/useStandardsCatalog';

interface PersonalLearningTargetsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Teacher's own target list (`users/{uid}/userProfile/learningTargets`); no mastery cutoffs. */
export const PersonalLearningTargetsModal: React.FC<
  PersonalLearningTargetsModalProps
> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { list, save } = usePersonalLearningTargets();
  const { benchmarks } = useStandardsCatalog();
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('learningTargets.personal.title', {
        defaultValue: 'My learning targets',
      })}
      maxWidth="max-w-2xl"
      contentClassName="px-6 pb-6"
    >
      <p className="mb-4 text-xs text-slate-500 leading-relaxed">
        {t('learningTargets.personal.description', {
          defaultValue:
            'Targets only you can see. Tag quiz questions with them to track mastery across your own assessments.',
        })}
      </p>
      <LearningTargetsManager
        list={list}
        onSave={save}
        canEdit
        showMasteryCutoffs={false}
        standards={benchmarks}
      />
    </Modal>
  );
};
