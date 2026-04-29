import {
  SoundboardConfig,
  StationsConfig,
  WidgetData,
  WidgetType,
  SpecialistScheduleConfig,
  GraphicOrganizerConfig,
  RevealGridConfig,
  QRConfig,
  BloomsTaxonomyConfig,
  BloomsDetailConfig,
  NeedDoPutThenConfig,
} from '@/types';
import { STICKY_NOTE_COLORS } from './colors';
import {
  DEFAULT_NEED_ITEMS,
  DEFAULT_PUT_ITEMS,
  DEFAULT_DO_ITEMS,
  DEFAULT_THEN_ITEMS,
} from '@/components/widgets/NeedDoPutThen/constants';

export const WIDGET_DEFAULTS: Record<WidgetType, Partial<WidgetData>> = {
  url: {
    w: 320,
    h: 280,
    config: {
      urls: [],
    } satisfies import('@/types').UrlWidgetConfig,
  },
  soundboard: {
    w: 320,
    h: 280,
    config: {
      selectedSoundIds: [],
      activeSoundIds: [],
    } satisfies SoundboardConfig,
  },
  clock: { w: 280, h: 140, config: { format24: true, showSeconds: true } },
  'time-tool': {
    w: 420,
    h: 400,
    config: {
      mode: 'timer',
      visualType: 'digital',
      duration: 600,
      elapsedTime: 600,
      isRunning: false,
      selectedSound: 'Gong',
    },
  },
  traffic: { w: 120, h: 320, config: {} },
  text: {
    w: 400,
    h: 300,
    config: {
      content: '',
      bgColor: STICKY_NOTE_COLORS.yellow,
      fontSize: 18,
    },
  },
  checklist: {
    w: 280,
    h: 300,
    config: {
      items: [],
      mode: 'manual',
      firstNames: '',
      lastNames: '',
      completedNames: [],
      scaleMultiplier: 1,
    },
  },
  random: {
    w: 300,
    h: 320,
    config: {
      firstNames: '',
      lastNames: '',
      mode: 'single',
      rosterMode: 'class',
    },
  },
  dice: { w: 240, h: 240, config: { count: 1 } },
  sound: {
    w: 300,
    h: 300,
    config: { sensitivity: 1, visual: 'thermometer' },
  },
  drawing: { w: 400, h: 350, config: { paths: [] } },
  qr: { w: 200, h: 250, config: { showUrl: false } satisfies QRConfig },
  embed: { w: 480, h: 350, config: { url: '' } },
  poll: {
    w: 300,
    h: 250,
    config: {
      question: 'Vote now!',
      options: [
        { id: 'opt-1', label: 'Option A', votes: 0 },
        { id: 'opt-2', label: 'Option B', votes: 0 },
      ],
    },
  },
  'activity-wall': {
    w: 520,
    h: 420,
    config: {
      activities: [],
      activeActivityId: null,
      cardColor: '#ffffff',
      cardOpacity: 1,
    },
  },
  webcam: {
    w: 400,
    h: 300,
    config: {
      zoomLevel: 1,
      isMirrored: true,
    },
  },
  scoreboard: {
    w: 320,
    h: 200,
    config: { scoreA: 0, scoreB: 0, teamA: 'Team 1', teamB: 'Team 2' },
  },
  expectations: {
    w: 320,
    h: 350,
    config: { voiceLevel: null, workMode: null, interactionMode: null },
  },
  weather: {
    w: 250,
    h: 280,
    config: { temp: 72, condition: 'sunny', isAuto: true },
  },
  schedule: {
    w: 300,
    h: 350,
    config: {
      items: [
        { time: '08:00', task: 'Morning Meeting' },
        { time: '09:00', task: 'Math' },
      ],
      cardColor: '#ffffff',
      cardOpacity: 1,
    },
  },
  calendar: {
    w: 300,
    h: 350,
    config: {
      events: [],
      isBuildingSyncEnabled: true,
      daysVisible: 5,
    },
  },
  lunchCount: {
    w: 600,
    h: 400,
    config: {
      schoolSite: 'schumann-elementary',
      isManualMode: false,
      manualHotLunch: '',
      manualBentoBox: '',
      roster: [],
      assignments: {},
      recipient: '',
      rosterMode: 'class',
      cardColor: '#ffffff',
      cardOpacity: 1,
    },
  },
  classes: {
    w: 280,
    h: 360,
    config: {},
  },
  instructionalRoutines: {
    w: 400,
    h: 480,
    config: {
      selectedRoutineId: null,
      customSteps: [],
      favorites: [],
      scaleMultiplier: 1,
    },
  },
  miniApp: {
    w: 500,
    h: 600,
    config: {
      activeApp: null,
    },
  },
  materials: {
    w: 340,
    h: 340,
    config: { selectedItems: [], activeItems: [] },
  },
  stickers: {
    w: 600,
    h: 500,
    config: { uploadedUrls: [], cardColor: '#ffffff', cardOpacity: 1 },
  },
  sticker: {
    w: 200,
    h: 200,
    config: { url: '', rotation: 0, size: 150 },
  },
  'seating-chart': {
    w: 900,
    h: 650,
    config: {
      furniture: [],
      assignments: {},
      gridSize: 20,
      rosterMode: 'class',
      template: 'freeform',
      templateColumns: 6,
    },
  },
  catalyst: {
    w: 450,
    h: 600,
    config: {},
  },
  'catalyst-instruction': {
    w: 280,
    h: 350,
    config: { routineId: '', stepIndex: 0 },
  },
  'catalyst-visual': {
    w: 600,
    h: 400,
    config: { routineId: '', stepIndex: 0 },
  },
  smartNotebook: {
    w: 600,
    h: 500,
    config: { activeNotebookId: null, cardColor: '#ffffff', cardOpacity: 1 },
  },
  recessGear: {
    w: 250,
    h: 280,
    config: { linkedWeatherWidgetId: null, useFeelsLike: true },
  },
  pdf: {
    w: 600,
    h: 750,
    config: { activePdfId: null, activePdfUrl: null, activePdfName: null },
  },
  quiz: {
    w: 620,
    h: 560,
    config: {
      view: 'manager',
      managerTab: 'library',
      selectedQuizId: null,
      selectedQuizTitle: null,
      activeAssignmentId: null,
      activeLiveSessionCode: null,
      resultsSessionId: null,
      plcMode: false,
      plcSheetUrl: '',
      teacherName: '',
      periodName: '',
      plcMemberEmails: [],
    },
  },
  'talking-tool': {
    w: 500,
    h: 450,
    config: { cardColor: '#ffffff', cardOpacity: 1 },
  },
  breathing: {
    w: 400,
    h: 400,
    config: {
      pattern: '4-4-4-4',
      visual: 'circle',
      color: '#3b82f6',
      cardColor: '#ffffff',
      cardOpacity: 1,
    },
  },
  mathTools: {
    w: 420,
    h: 500,
    config: { cardColor: '#ffffff', cardOpacity: 1 },
  },
  mathTool: {
    w: 480,
    h: 200,
    config: {
      toolType: 'ruler-in',
      pixelsPerInch: 96,
      rulerUnits: 'both',
    },
  },
  nextUp: {
    w: 350,
    h: 500,
    config: {
      activeDriveFileId: null,
      sessionName: null,
      isActive: false,
      createdAt: 0,
      lastUpdated: 0,
      displayCount: 3,
      styling: {
        fontFamily: 'lexend',
        themeColor: '#2d3f89',
        animation: 'slide',
      },
    },
  },
  countdown: {
    w: 300,
    h: 250,
    get config() {
      const startDate = new Date();
      const eventDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      return {
        title: 'Special Event',
        startDate: startDate.toISOString(),
        eventDate: eventDate.toISOString(),
        includeWeekends: true,
        countToday: true,
        viewMode: 'number',
        cardColor: '#ffffff',
        cardOpacity: 1,
      } satisfies import('@/types').CountdownConfig;
    },
  },
  onboarding: {
    w: 380,
    h: 440,
    config: {
      completedTasks: [],
    },
  },
  music: {
    w: 340,
    h: 120,
    config: {
      stationId: '',
      syncWithTimeTool: false,
    },
  },
  'car-rider-pro': {
    w: 450,
    h: 600,
    config: {},
  },
  'first-5': {
    w: 450,
    h: 600,
    config: {},
  },
  'specialist-schedule': {
    w: 300,
    h: 400,
    config: {
      cycleDays: [],
      cardColor: '#ffffff',
      cardOpacity: 1,
      specialistClass: '',
    } as SpecialistScheduleConfig,
  },
  'graphic-organizer': {
    w: 800,
    h: 600,
    config: {
      templateType: 'frayer',
      nodes: {},
      cardColor: '#ffffff',
      cardOpacity: 1,
    } as GraphicOrganizerConfig,
  },
  'reveal-grid': {
    w: 600,
    h: 400,
    config: {
      columns: 3,
      cards: [
        {
          id: '1',
          frontContent: 'Question 1',
          backContent: 'Answer 1',
          isRevealed: false,
        },
        {
          id: '2',
          frontContent: 'Question 2',
          backContent: 'Answer 2',
          isRevealed: false,
        },
        {
          id: '3',
          frontContent: 'Question 3',
          backContent: 'Answer 3',
          isRevealed: false,
        },
      ],
      revealMode: 'flip',
    } as RevealGridConfig,
  },
  numberLine: {
    w: 700,
    h: 200,
    config: {
      min: 0,
      max: 10,
      step: 1,
      displayMode: 'integers',
      markers: [],
      jumps: [],
      showArrows: true,
      cardColor: '#ffffff',
      cardOpacity: 1,
    },
  },
  'concept-web': {
    w: 800,
    h: 600,
    config: {
      nodes: [],
      edges: [],
      cardColor: '#ffffff',
      cardOpacity: 1,
    },
  },
  'syntax-framer': {
    w: 500,
    h: 150,
    config: {
      mode: 'text',
      tokens: [],
      fontSize: 8,
      alignment: 'center',
    },
  },
  'hotspot-image': {
    w: 500,
    h: 400,
    config: {
      baseImageUrl: '',
      hotspots: [],
      popoverTheme: 'light',
    },
  },
  'starter-pack': {
    w: 600,
    h: 500,
    config: {},
  },
  'video-activity': {
    w: 640,
    h: 560,
    config: {
      view: 'manager',
      selectedActivityId: null,
      selectedActivityTitle: null,
      resultsSessionId: null,
      autoPlay: false,
      requireCorrectAnswer: true,
      allowSkipping: false,
    },
  },
  'guided-learning': {
    w: 720,
    h: 520,
    config: {
      view: 'library',
      playerSetId: null,
      resultsSessionId: null,
    },
  },
  'custom-widget': {
    w: 400,
    h: 300,
    config: {
      customWidgetId: '',
    },
  },
  'work-symbols': {
    w: 300,
    h: 300,
    config: {
      selectedSymbolId: null,
    },
  },
  'blooms-taxonomy': {
    w: 450,
    h: 550,
    config: {} satisfies BloomsTaxonomyConfig,
  },
  'blooms-detail': {
    w: 450,
    h: 300,
    config: {
      parentWidgetId: '',
      level: 'remember',
    } satisfies BloomsDetailConfig,
  },
  'need-do-put-then': {
    w: 340,
    h: 320,
    config: {
      needItems: DEFAULT_NEED_ITEMS,
      doItems: DEFAULT_DO_ITEMS,
      putItems: DEFAULT_PUT_ITEMS,
      thenItems: DEFAULT_THEN_ITEMS,
    } satisfies NeedDoPutThenConfig,
  },
  stations: {
    w: 600,
    h: 420,
    config: {
      stations: [],
      assignments: {},
      rosterMode: 'class',
    } satisfies StationsConfig,
  },
};
