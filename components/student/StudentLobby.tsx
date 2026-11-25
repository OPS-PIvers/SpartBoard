import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StudentPinJoinCard } from './StudentPinJoinCard';

interface StudentLobbyProps {
  onJoin: (code: string, pin: string) => void;
  isLoading: boolean;
  error?: string | null;
  /** Teacher preview: the same card, inert, under the preview banner. */
  preview?: boolean;
}

const urlCode = (): string =>
  typeof window === 'undefined'
    ? ''
    : (new URLSearchParams(window.location.search).get('code') ?? '');

/** The live session join card at /join. */
export const StudentLobby: React.FC<StudentLobbyProps> = ({
  onJoin,
  isLoading,
  error = null,
  preview = false,
}) => {
  const { t } = useTranslation();
  const [code, setCode] = useState(urlCode);
  const [pin, setPin] = useState('');
  return (
    <StudentPinJoinCard
      preview={preview}
      title={t('studentJoin.liveTitle')}
      intro={t('studentJoin.liveIntro')}
      code={{
        value: code,
        onChange: setCode,
        placeholder: t('studentJoin.roomCode'),
      }}
      pin={pin}
      onPinChange={setPin}
      onSubmit={() => onJoin(code, pin)}
      busy={isLoading}
      error={error}
    />
  );
};
