import { useTranslation } from 'react-i18next';
import type { RosterGroup, Student } from '@/types';
import { printGroupSchedule } from '@/utils/groupSchedulePrint';
import { groupSymbolMarkup } from '@/components/groupReminders/groupSymbolMarkup';
import { logError } from '@/utils/logError';

/** Opens the printable weekly schedule; returns an error message when printing fails. */
export const useGroupSchedulePrint = () => {
  const { t } = useTranslation();
  return (rosterName: string, groups: RosterGroup[], students: Student[]) => {
    try {
      printGroupSchedule({
        rosterName,
        groups,
        students,
        symbolSvg: (g) => groupSymbolMarkup(g.symbol),
        labels: {
          title: t('groupReminders.printTitle', {
            defaultValue: 'Group schedule',
          }),
          printed: t('groupReminders.printed', { defaultValue: 'Printed' }),
          everyTwoWeeks: t('groupReminders.everyTwoWeeksCap', {
            defaultValue: 'Every 2 weeks',
          }),
          weeksOf: t('groupReminders.weeksOf', { defaultValue: 'weeks of' }),
          noGroups: t('groupReminders.printNoGroups', {
            defaultValue: 'No groups',
          }),
        },
      });
      return null;
    } catch (err) {
      logError('useGroupSchedulePrint', err);
      return err instanceof Error ? err.message : String(err);
    }
  };
};
