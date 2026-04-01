import {
  SoundboardConfig,
  WidgetData,
  WidgetType,
  SpecialistScheduleConfig,
  GraphicOrganizerConfig,
  RevealGridConfig,
} from '@/types';
import { STICKY_NOTE_COLORS } from './colors';

export const WIDGET_DEFAULTS: Record<WidgetType, Partial<WidgetData>> = {
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
    w: 300,
    h: 250,
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
  drawing: { w: 400, h: 350, config: { mode: 'window', paths: [] } },
  qr: { w: 200, h: 250, config: {} },
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
    },
  },
  classes: {
    w: 600,
    h: 500,
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
      collectResults: false,
      googleSheetId: undefined,
      googleSheetUrl: undefined,
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
    config: { uploadedUrls: [] },
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
    config: { activeNotebookId: null },
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
      selectedQuizId: null,
      selectedQuizTitle: null,
      activeLiveSessionCode: null,
      resultsSessionId: null,
    },
  },
  'talking-tool': {
    w: 500,
    h: 450,
    config: {},
  },
  breathing: {
    w: 400,
    h: 400,
    config: {
      pattern: '4-4-4-4',
      visual: 'circle',
      color: '#3b82f6',
    },
  },
  mathTools: {
    w: 420,
    h: 500,
    config: {},
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
    },
  },
  'concept-web': {
    w: 800,
    h: 600,
    config: {
      nodes: [],
      edges: [],
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
};
