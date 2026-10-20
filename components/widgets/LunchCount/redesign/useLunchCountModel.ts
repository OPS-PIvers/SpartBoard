import { useState, useMemo, useCallback, useLayoutEffect, useRef } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useSubShareHost } from '@/context/SubShareHostContextValue';
import type {
  WidgetData,
  LunchCountConfig,
  LunchCountGlobalConfig,
} from '@/types';
import { useRosterGroupsGate } from '@/hooks/useRosterGroupsGate';
import { rosterGroupMemberIds } from '@/utils/rosterGroups';
import { logError } from '@/utils/logError';
import { toLunchCountSchoolSite } from '@/config/buildings';
import type { LunchInfo } from '../MissingInfoModal';
import { useNutrislice } from '../useNutrislice';
import { useMultiDrag } from '../useMultiDrag';
import {
  formatGradeLabel,
  formatLunchTime,
  formatTeacherName,
  getCentralTimestamp,
} from './lunchCountFormat';

export interface LunchStudent {
  id: string;
  name: string;
}

export type LunchZoneId = 'hot' | 'bento' | 'home';

// The legacy face's state and handlers (../Widget.tsx), unchanged, for the redesigned face.
export function useLunchCountModel(widget: WidgetData) {
  const { updateWidget, addToast, rosters, activeRosterId, activeDashboard } =
    useDashboard();
  const { user, featurePermissions, selectedBuildings } = useAuth();
  const subShareHost = useSubShareHost();
  const reportName = subShareHost
    ? (subShareHost.teacherName ?? 'Staff')
    : (user?.displayName ?? 'Staff');
  const config = widget.config as LunchCountConfig;
  const {
    cachedMenu = null,
    assignments = {},
    roster = [],
    rosterMode = 'class',
    schoolSite: savedSchoolSite = 'schumann-elementary',
    lunchTimeHour: savedLunchTimeHour = '',
    lunchTimeMinute: savedLunchTimeMinute = '',
    gradeLevel: savedGradeLevel = '',
    rosterPoolGroupId = null,
  } = config;
  const [pickedInfo, setPickedInfo] = useState<LunchInfo | null>(null);
  const lunchTimeHour = pickedInfo?.hour ?? savedLunchTimeHour;
  const lunchTimeMinute = pickedInfo?.minute ?? savedLunchTimeMinute;
  const gradeLevel = pickedInfo?.grade ?? savedGradeLevel;
  const schoolSite = pickedInfo?.schoolSite ?? savedSchoolSite;
  const askSchool =
    !subShareHost &&
    !selectedBuildings.some((id) => toLunchCountSchoolSite(id) !== null);
  const [isMissingInfoOpen, setIsMissingInfoOpen] = useState(false);
  const needsTime = !formatLunchTime(lunchTimeHour, lunchTimeMinute);
  const needsGrade = !formatGradeLabel(gradeLevel);
  const rosterGroupsEnabled = useRosterGroupsGate();

  const lunchGlobalConfig = useMemo((): LunchCountGlobalConfig => {
    const perm = featurePermissions.find((p) => p.widgetType === 'lunchCount');
    return perm?.config ?? {};
  }, [featurePermissions]);

  const { isSyncing, fetchNutrislice } = useNutrislice({
    widgetId: widget.id,
    config,
    updateWidget,
    addToast,
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allRosterStudents = useMemo((): LunchStudent[] => {
    if (rosterMode === 'custom') {
      return roster.map((name) => ({ id: name, name }));
    }
    const currentRoster =
      rosters.find((r) => r.id === activeRosterId) ?? rosters[0];
    return (
      currentRoster?.students.map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
      })) ?? []
    );
  }, [rosterMode, roster, rosters, activeRosterId]);

  const activeRoster = useMemo(() => {
    const currentRoster =
      rosterMode === 'custom'
        ? undefined
        : (rosters.find((r) => r.id === activeRosterId) ?? rosters[0]);
    const inPool = rosterGroupMemberIds(
      currentRoster,
      rosterPoolGroupId,
      rosterGroupsEnabled
    );
    return inPool
      ? allRosterStudents.filter((s) => inPool.has(s.id))
      : allRosterStudents;
  }, [
    allRosterStudents,
    rosterMode,
    rosters,
    activeRosterId,
    rosterPoolGroupId,
    rosterGroupsEnabled,
  ]);

  const groupedStudents = useMemo(() => {
    const hot: LunchStudent[] = [];
    const bento: LunchStudent[] = [];
    const home: LunchStudent[] = [];
    const unassigned: LunchStudent[] = [];

    activeRoster.forEach((student) => {
      const assignment = assignments[student.id] ?? assignments[student.name];
      if (assignment === 'hot') hot.push(student);
      else if (assignment === 'bento') bento.push(student);
      else if (assignment === 'home') home.push(student);
      else unassigned.push(student);
    });

    return { hot, bento, home, unassigned };
  }, [activeRoster, assignments]);

  const stats = useMemo(() => {
    const hotLunch = groupedStudents.hot.length;
    const bentoBox = groupedStudents.bento.length;
    const homeLunch = groupedStudents.home.length;
    const remaining = groupedStudents.unassigned.length;
    const total = hotLunch + bentoBox + homeLunch + remaining;
    return { total, hotLunch, bentoBox, homeLunch, remaining };
  }, [groupedStudents]);

  // Counted over the whole class, never the pool, so the cafeteria is never under-reported.
  const reportStats = useMemo(() => {
    let hotLunch = 0;
    let bentoBox = 0;
    let homeLunch = 0;
    let remaining = 0;
    for (const student of allRosterStudents) {
      const assignment = assignments[student.id] ?? assignments[student.name];
      if (assignment === 'hot') hotLunch++;
      else if (assignment === 'bento') bentoBox++;
      else if (assignment === 'home') homeLunch++;
      else remaining++;
    }
    return {
      total: hotLunch + bentoBox + homeLunch + remaining,
      hotLunch,
      bentoBox,
      homeLunch,
      remaining,
    };
  }, [allRosterStudents, assignments]);

  const hiddenRemaining = reportStats.remaining - stats.remaining;

  const handleSelectPoolGroup = useCallback(
    (groupId: string | null) => {
      updateWidget(widget.id, {
        config: { ...config, rosterPoolGroupId: groupId },
      });
    },
    [widget.id, config, updateWidget]
  );

  // Several drops can land before a re-render, so each builds on the last write.
  const assignmentsRef = useRef(assignments);
  useLayoutEffect(() => {
    assignmentsRef.current = assignments;
  }, [assignments]);

  const updateAssignment = useCallback(
    (student: string, type: LunchZoneId | null) => {
      const newAssignments = { ...assignmentsRef.current };
      const legacyName = activeRoster.find((s) => s.id === student)?.name;
      if (legacyName) delete newAssignments[legacyName];
      if (type === null) {
        delete newAssignments[student];
      } else {
        newAssignments[student] = type;
      }
      assignmentsRef.current = newAssignments;
      updateWidget(widget.id, { config: { assignments: newAssignments } });
    },
    [widget.id, updateWidget, activeRoster]
  );

  const handleDrop = useCallback(
    (student: string, zone: string | null) => {
      const current = assignmentsRef.current;
      const legacyName = activeRoster.find((s) => s.id === student)?.name;
      const isCurrentlyAssigned =
        !!current[student] || (!!legacyName && !!current[legacyName]);

      if (zone === 'hot' || zone === 'bento' || zone === 'home') {
        updateAssignment(student, zone);
      } else if (isCurrentlyAssigned) {
        updateAssignment(student, null);
      }
    },
    [activeRoster, updateAssignment]
  );

  const handleTap = useCallback(
    (student: string) => {
      const current = assignmentsRef.current;
      const legacyName = activeRoster.find((s) => s.id === student)?.name;
      if (current[student] || (legacyName && current[legacyName])) {
        updateAssignment(student, null);
      }
    },
    [activeRoster, updateAssignment]
  );

  const { drags, handlers: dragHandlers } = useMultiDrag(handleDrop, handleTap);

  const handleSubmitReport = async (notes: string, extraPizza?: number) => {
    const { submissionUrl, schumannSheetId, intermediateSheetId } =
      lunchGlobalConfig;

    if (!submissionUrl) {
      addToast(
        'No submission URL configured. Contact your administrator.',
        'error'
      );
      return;
    }

    const sheetId =
      schoolSite === 'orono-intermediate-school'
        ? intermediateSheetId
        : schumannSheetId;

    if (!sheetId) {
      addToast(
        'No Google Sheet ID configured for this school site. Contact your administrator.',
        'error'
      );
      return;
    }

    const teacherName = formatTeacherName(reportName);
    const gradeLabel = formatGradeLabel(gradeLevel);
    const lunchTime = formatLunchTime(lunchTimeHour, lunchTimeMinute);
    const timestamp = getCentralTimestamp();
    const label = `${lunchTime || '??:??'} - ${gradeLabel || 'Grade ?'} - ${teacherName}`;
    const isIntermediate = schoolSite === 'orono-intermediate-school';

    setIsSubmitting(true);
    try {
      const payload = {
        timestamp,
        label,
        hotLunch: reportStats.hotLunch,
        bentoBox: reportStats.bentoBox,
        extraPizza: isIntermediate ? (extraPizza ?? 0) : 0,
        notes,
        spreadsheetId: sheetId,
      };

      const response = await fetch(submissionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Submission failed with status ${response.status}`);
      }

      const result = await response.text();
      if (result.startsWith('Error')) {
        throw new Error(result);
      }

      addToast('Lunch report submitted successfully!', 'success');
      setIsModalOpen(false);
    } catch (err) {
      logError('LunchCountWidget.handleSubmitReport', err, {
        widgetId: widget.id,
      });
      addToast(
        err instanceof Error
          ? err.message
          : 'Failed to submit report. Check your connection and try again.',
        'error'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenReport = () => {
    if (needsTime || needsGrade) {
      setIsMissingInfoOpen(true);
      return;
    }
    setIsModalOpen(true);
  };

  const handleSaveMissingInfo = (info: LunchInfo) => {
    if (subShareHost) setPickedInfo(info);
    updateWidget(widget.id, {
      config: {
        ...config,
        lunchTimeHour: info.hour,
        lunchTimeMinute: info.minute,
        gradeLevel: info.grade,
        ...(info.schoolSite !== savedSchoolSite
          ? {
              schoolSite: info.schoolSite,
              cachedMenu: null,
              lastSyncDate: null,
            }
          : {}),
      },
    });
    setIsMissingInfoOpen(false);
    setIsModalOpen(true);
  };

  const handleReset = () =>
    updateWidget(widget.id, { config: { ...config, assignments: {} } });

  const lunchTime = formatLunchTime(lunchTimeHour, lunchTimeMinute);
  const reportData = {
    date: new Date().toLocaleDateString(),
    staffName: formatTeacherName(reportName),
    hotLunch: reportStats.hotLunch,
    bentoBox: reportStats.bentoBox,
    hotLunchName: cachedMenu?.hotLunch?.name ?? 'Hot Lunch',
    bentoBoxName: cachedMenu?.bentoBox?.name ?? 'Bento Box',
    schoolSite,
    lunchTime,
    gradeLabel: formatGradeLabel(gradeLevel),
    submissionLabel: [
      lunchTime,
      formatGradeLabel(gradeLevel),
      formatTeacherName(reportName),
    ]
      .filter(Boolean)
      .join(' - '),
  };

  return {
    config,
    cachedMenu,
    rosterMode,
    rosters,
    activeDashboard,
    schoolSite,
    lunchTimeHour,
    lunchTimeMinute,
    gradeLevel,
    askSchool,
    needsTime,
    needsGrade,
    rosterGroupsEnabled,
    rosterPoolGroupId,
    isSyncing,
    fetchNutrislice,
    allRosterStudents,
    groupedStudents,
    stats,
    reportStats,
    hiddenRemaining,
    handleSelectPoolGroup,
    drags,
    dragHandlers,
    handleSubmitReport,
    handleOpenReport,
    handleSaveMissingInfo,
    handleReset,
    isModalOpen,
    setIsModalOpen,
    isMissingInfoOpen,
    setIsMissingInfoOpen,
    isSubmitting,
    reportData,
  };
}

export type LunchCountModel = ReturnType<typeof useLunchCountModel>;
