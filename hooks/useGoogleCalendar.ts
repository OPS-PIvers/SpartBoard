import { useMemo } from 'react';
import { useAuth } from '../context/useAuth';
import { GoogleCalendarService } from '../utils/googleCalendarService';

export const useGoogleCalendar = () => {
  const { googleAccessToken, refreshGoogleToken } = useAuth();

  const calendarService = useMemo(() => {
    if (!googleAccessToken) return null;
    return new GoogleCalendarService(googleAccessToken);
  }, [googleAccessToken]);

  return {
    calendarService,
    isConnected: !!googleAccessToken,
    refreshGoogleToken,
  };
};
