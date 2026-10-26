// Generated from the widget settings schemas by tests/mcpTourAnchorList.test.ts; rerun it with UPDATE_TOUR_ANCHOR_LIST=1.
export const SETTINGS_FIELD_LIST: Readonly<
  Record<
    string,
    ReadonlyArray<{ anchor: string; label: string; kind?: string }>
  >
> = {
  soundboard: [
    {
      anchor: 'settings.group:soundboard#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:soundboard#selectedSoundIds',
      label: 'Available sounds',
      kind: 'custom',
    },
  ],
  dice: [
    {
      anchor: 'settings.group:dice#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.field:dice#count',
      label: 'Number of dice',
      kind: 'segmented',
    },
    {
      anchor: 'settings.group:dice#display',
      label: 'Display',
    },
    {
      anchor: 'settings.field:dice#diceColor',
      label: 'Die color',
      kind: 'color',
    },
    {
      anchor: 'settings.field:dice#dotColor',
      label: 'Pip color',
      kind: 'color',
    },
  ],
  sound: [
    {
      anchor: 'settings.group:sound#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.field:sound#syncExpectations',
      label: 'Sync with Expectations',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:sound#syncExpectations',
      label: 'Sync with Expectations',
      kind: 'toggle',
    },
    {
      anchor: 'settings.field:sound#noiseFloor',
      label: 'Calibration',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:sound#sensitivity',
      label: 'Sensitivity',
      kind: 'slider',
    },
    {
      anchor: 'settings.field:sound#targetLevel',
      label: 'Target level',
      kind: 'select',
    },
    {
      anchor: 'settings.field:sound#alertDelaySeconds',
      label: 'Alert delay (seconds)',
      kind: 'number',
    },
    {
      anchor: 'settings.toggle:sound#alertSoundEnabled',
      label: 'Play a sound',
      kind: 'toggle',
    },
    {
      anchor: 'settings.field:sound#alertSound',
      label: 'Alert sound',
      kind: 'soundPicker',
    },
    {
      anchor: 'settings.field:sound#quietGoalMinutes',
      label: 'Quiet time goal (minutes)',
      kind: 'number',
    },
    {
      anchor: 'settings.toggle:sound#quietGoalResetOnAlert',
      label: 'Reset progress when Too loud shows',
      kind: 'toggle',
    },
    {
      anchor: 'settings.field:sound#quietGoalTeamId',
      label: 'Add a point when the goal is reached',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:sound#autoTrafficLight',
      label: 'Control Traffic Light automatically',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:sound#autoTrafficLight',
      label: 'Control Traffic Light automatically',
      kind: 'toggle',
    },
    {
      anchor: 'settings.field:sound#trafficLightThreshold',
      label: 'Trigger red light at',
      kind: 'segmented',
    },
    {
      anchor: 'settings.group:sound#display',
      label: 'Display',
    },
    {
      anchor: 'settings.field:sound#visual',
      label: 'Visual mode',
      kind: 'segmented',
    },
  ],
  webcam: [
    {
      anchor: 'settings.group:webcam#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.toggle:webcam#autoSendToNotes',
      label: 'Send OCR text to Notes automatically',
      kind: 'toggle',
    },
  ],
  drawing: [
    {
      anchor: 'settings.group:drawing#display',
      label: 'Display',
    },
    {
      anchor: 'settings.field:drawing#width',
      label: 'Brush thickness',
      kind: 'slider',
    },
    {
      anchor: 'settings.field:drawing#background',
      label: 'Background',
      kind: 'segmented',
    },
    {
      anchor: 'settings.toggle:drawing#shapeFill',
      label: 'Fill shapes',
      kind: 'toggle',
    },
  ],
  text: [
    {
      anchor: 'settings.group:text#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:text#content',
      label: 'Templates',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:text#display',
      label: 'Note',
    },
    {
      anchor: 'settings.field:text#bgColor',
      label: 'Note color',
      kind: 'color',
    },
    {
      anchor: 'settings.field:text#verticalAlign',
      label: 'Vertical alignment',
      kind: 'segmented',
    },
    {
      anchor: 'settings.field:text#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
    {
      anchor: 'settings.field:text#fontColor',
      label: 'Font color',
      kind: 'color',
    },
    {
      anchor: 'settings.field:text#textSizePreset',
      label: 'Text size',
      kind: 'textSizePreset',
    },
  ],
  embed: [
    {
      anchor: 'settings.group:embed#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:embed#mode',
      label: 'Embed Type',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:embed#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.field:embed#refreshInterval',
      label: 'Auto-Refresh',
      kind: 'select',
    },
  ],
  lunchCount: [
    {
      anchor: 'settings.group:lunchCount#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:lunchCount#schoolSite',
      label: 'School Site',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:lunchCount#lunchTimeHour',
      label: 'Lunch Time',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:lunchCount#gradeLevel',
      label: 'Grade Level',
      kind: 'segmented',
    },
    {
      anchor: 'settings.field:lunchCount#manualHotLunch',
      label: 'Hot Lunch Name',
      kind: 'text',
    },
    {
      anchor: 'settings.field:lunchCount#manualBentoBox',
      label: 'Bento Box Name',
      kind: 'text',
    },
    {
      anchor: 'settings.field:lunchCount#roster',
      label: 'Custom Roster',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:lunchCount#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.field:lunchCount#rosterMode',
      label: 'Roster Selection',
      kind: 'rosterPicker',
    },
    {
      anchor: 'settings.toggle:lunchCount#isManualMode',
      label: 'Manual Mode',
      kind: 'toggle',
    },
    {
      anchor: 'settings.field:lunchCount#cardColor',
      label: 'Card color',
      kind: 'surfaceColor',
    },
  ],
  clock: [
    {
      anchor: 'settings.group:clock#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.toggle:clock#format24',
      label: '24H Format',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:clock#showSeconds',
      label: 'Show Seconds',
      kind: 'toggle',
    },
    {
      anchor: 'settings.group:clock#display',
      label: 'Display',
    },
    {
      anchor: 'settings.field:clock#clockStyle',
      label: 'Display Style',
      kind: 'segmented',
    },
    {
      anchor: 'settings.toggle:clock#glow',
      label: 'Glow',
      kind: 'toggle',
    },
    {
      anchor: 'settings.field:clock#themeColor',
      label: 'Color Palette',
      kind: 'color',
    },
    {
      anchor: 'settings.field:clock#dateColor',
      label: 'Date Color',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:clock#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
  ],
  'time-tool': [
    {
      anchor: 'settings.group:time-tool#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:time-tool#mode',
      label: 'Mode',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:time-tool#selectedSound',
      label: 'Alert Sound',
      kind: 'soundPicker',
    },
    {
      anchor: 'settings.group:time-tool#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.field:time-tool#adjustStepSeconds',
      label: 'Adjust Step (seconds)',
      kind: 'number',
    },
    {
      anchor: 'settings.field:time-tool#timerEndVoiceLevel',
      label: 'Switch to Voice Level when finished',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:time-tool#timerEndTrafficColor',
      label: 'Auto-set Traffic Light',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:time-tool#timerEndTriggerRandom',
      label: 'Auto-Pick Random Student',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:time-tool#timerEndTriggerRandom',
      label: 'Auto-Pick Random Student',
      kind: 'toggle',
    },
    {
      anchor: 'settings.field:time-tool#timerEndTriggerStationsRotate',
      label: 'Auto-rotate stations',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:time-tool#timerEndTriggerStationsRotate',
      label: 'Auto-rotate stations',
      kind: 'toggle',
    },
    {
      anchor: 'settings.field:time-tool#timerEndTriggerNextUp',
      label: 'Auto-Advance NextUp Queue',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:time-tool#timerEndTriggerNextUp',
      label: 'Auto-Advance NextUp Queue',
      kind: 'toggle',
    },
    {
      anchor: 'settings.group:time-tool#display',
      label: 'Display',
    },
    {
      anchor: 'settings.field:time-tool#visualType',
      label: 'Display Style',
      kind: 'segmented',
    },
    {
      anchor: 'settings.field:time-tool#clockStyle',
      label: 'Number Style',
      kind: 'segmented',
    },
    {
      anchor: 'settings.field:time-tool#themeColor',
      label: 'Color Palette',
      kind: 'accentColor',
    },
    {
      anchor: 'settings.toggle:time-tool#glow',
      label: 'Glow',
      kind: 'toggle',
    },
    {
      anchor: 'settings.field:time-tool#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
  ],
  checklist: [
    {
      anchor: 'settings.group:checklist#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:checklist#mode',
      label: 'List source',
      kind: 'segmented',
    },
    {
      anchor: 'settings.field:checklist#items',
      label: 'Tasks',
      kind: 'list',
    },
    {
      anchor: 'settings.field:checklist#rosterMode',
      label: 'Roster source',
      kind: 'rosterPicker',
    },
    {
      anchor: 'settings.field:checklist#firstNames',
      label: 'First names',
      kind: 'textarea',
    },
    {
      anchor: 'settings.field:checklist#lastNames',
      label: 'Last names',
      kind: 'textarea',
    },
    {
      anchor: 'settings.field:checklist#rosterPoolGroupId',
      label: 'Draw from',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:checklist#completedNames',
      label: 'Import tasks',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:checklist#display',
      label: 'Display',
    },
    {
      anchor: 'settings.field:checklist#rowStyle',
      label: 'Task style',
      kind: 'segmented',
    },
    {
      anchor: 'settings.field:checklist#textSizePreset',
      label: 'Text size',
      kind: 'textSizePreset',
    },
    {
      anchor: 'settings.field:checklist#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
    {
      anchor: 'settings.field:checklist#fontColor',
      label: 'Font color',
      kind: 'color',
    },
    {
      anchor: 'settings.field:checklist#cardColor',
      label: 'Card color',
      kind: 'surfaceColor',
    },
  ],
  weather: [
    {
      anchor: 'settings.group:weather#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:weather#isAuto',
      label: 'Weather mode',
      kind: 'segmented',
    },
    {
      anchor: 'settings.field:weather#temp',
      label: 'Temperature (°F)',
      kind: 'slider',
    },
    {
      anchor: 'settings.field:weather#condition',
      label: 'Condition',
      kind: 'segmented',
    },
    {
      anchor: 'settings.field:weather#lastSync',
      label: 'Automatic weather',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:weather#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.field:weather#showFeelsLike',
      label: 'Prioritize feels-like temperature',
      kind: 'custom',
    },
    {
      anchor: 'settings.toggle:weather#hideClothing',
      label: 'Hide clothing recommendations',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:weather#syncBackground',
      label: 'Match the board background to weather',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:weather#detail_feelsLike',
      label: 'Feels like',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:weather#detail_highLow',
      label: 'High and low',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:weather#detail_dewPoint',
      label: 'Dew point',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:weather#detail_humidity',
      label: 'Humidity',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:weather#detail_pressure',
      label: 'Pressure',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:weather#detail_rainDaily',
      label: 'Daily rain',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:weather#detail_rainMonthly',
      label: 'Monthly rain',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:weather#detail_windAvg',
      label: 'Average wind',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:weather#detail_windGust',
      label: 'Wind gust',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:weather#detail_sunrise',
      label: 'Sunrise',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:weather#detail_sunset',
      label: 'Sunset',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:weather#detail_moon',
      label: 'Moon phase',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:weather#detail_uvIndex',
      label: 'UV index',
      kind: 'toggle',
    },
    {
      anchor: 'settings.group:weather#display',
      label: 'Display',
    },
    {
      anchor: 'settings.field:weather#secondaryColor',
      label: 'Secondary text color',
      kind: 'accentColor',
    },
    {
      anchor: 'settings.field:weather#cardColor',
      label: 'Clothing card',
      kind: 'surfaceColor',
    },
    {
      anchor: 'settings.field:weather#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
    {
      anchor: 'settings.field:weather#fontColor',
      label: 'Font color',
      kind: 'color',
    },
  ],
  expectations: [
    {
      anchor: 'settings.group:expectations#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.field:expectations#syncSoundWidget',
      label: 'Sound meter sync',
      kind: 'custom',
    },
  ],
  random: [
    {
      anchor: 'settings.group:random#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:random#rosterMode',
      label: 'Roster source',
      kind: 'rosterPicker',
    },
    {
      anchor: 'settings.field:random#firstNames',
      label: 'First names',
      kind: 'textarea',
    },
    {
      anchor: 'settings.field:random#lastNames',
      label: 'Last names',
      kind: 'textarea',
    },
    {
      anchor: 'settings.field:random#remainingStudents',
      label: 'Custom roster actions',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:random#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.field:random#mode',
      label: 'Operation mode',
      kind: 'segmented',
    },
    {
      anchor: 'settings.toggle:random#soundEnabled',
      label: 'Sound effects',
      kind: 'toggle',
    },
    {
      anchor: 'settings.field:random#autoStartTimer',
      label: 'Start Timer automatically',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:random#autoStartTimer',
      label: 'Start Timer automatically',
      kind: 'toggle',
    },
    {
      anchor: 'settings.field:random#visualStyle',
      label: 'Animation style',
      kind: 'segmented',
    },
    {
      anchor: 'settings.field:random#groupingMode',
      label: 'Group by',
      kind: 'segmented',
    },
    {
      anchor: 'settings.field:random#groupSize',
      label: 'Group size',
      kind: 'slider',
    },
    {
      anchor: 'settings.field:random#numGroups',
      label: 'Number of groups',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:random#numHomeGroups',
      label: 'Number of home groups',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:random#numExpertGroups',
      label: 'Number of expert groups',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:random#lockedRosterGroupIds',
      label: 'Keep groups together',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:random#lastResult',
      label: 'Save as class groups',
      kind: 'custom',
    },
  ],
  url: [
    {
      anchor: 'settings.group:url#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:url#urls',
      label: 'Links',
      kind: 'list',
    },
  ],
  qr: [
    {
      anchor: 'settings.group:qr#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:qr#url',
      label: 'Destination URL',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:qr#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.field:qr#syncWithTextWidget',
      label: 'Link repeater',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:qr#display',
      label: 'Display',
    },
    {
      anchor: 'settings.toggle:qr#showUrl',
      label: 'Show URL',
      kind: 'toggle',
    },
  ],
  scoreboard: [
    {
      anchor: 'settings.group:scoreboard#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:scoreboard#teams',
      label: 'Teams',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:scoreboard#display',
      label: 'Display',
    },
    {
      anchor: 'settings.field:scoreboard#layout',
      label: 'Layout',
      kind: 'segmented',
    },
    {
      anchor: 'settings.toggle:scoreboard#sortByScore',
      label: 'Sort by score',
      kind: 'toggle',
    },
    {
      anchor: 'settings.field:scoreboard#pointValues',
      label: 'Point buttons',
      kind: 'select',
    },
  ],
  calendar: [
    {
      anchor: 'settings.group:calendar#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:calendar#events',
      label: 'Local manual events',
      kind: 'list',
    },
    {
      anchor: 'settings.field:calendar#personalCalendarIds',
      label: 'Personal Google Calendars',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:calendar#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.field:calendar#isBuildingSyncEnabled',
      label: 'Building schedule',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:calendar#display',
      label: 'Display',
    },
    {
      anchor: 'settings.field:calendar#daysVisible',
      label: 'Days to display',
      kind: 'number',
    },
    {
      anchor: 'settings.field:calendar#pastEvents',
      label: 'Past events',
      kind: 'segmented',
    },
    {
      anchor: 'settings.field:calendar#headerColor',
      label: 'Day header color',
      kind: 'color',
    },
    {
      anchor: 'settings.field:calendar#textSizePreset',
      label: 'Text size',
      kind: 'textSizePreset',
    },
    {
      anchor: 'settings.field:calendar#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
    {
      anchor: 'settings.field:calendar#fontColor',
      label: 'Font color',
      kind: 'color',
    },
    {
      anchor: 'settings.field:calendar#cardColor',
      label: 'Card color',
      kind: 'surfaceColor',
    },
  ],
  poll: [
    {
      anchor: 'settings.group:poll#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:poll#questions',
      label: 'Questions',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:poll#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.field:poll#activePollSessionId',
      label: 'Live device voting',
      kind: 'custom',
    },
  ],
  instructionalRoutines: [
    {
      anchor: 'settings.group:instructionalRoutines#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:instructionalRoutines#selectedRoutineId',
      label: 'Routine template',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:instructionalRoutines#customSteps',
      label: 'Steps',
      kind: 'list',
    },
    {
      anchor: 'settings.field:instructionalRoutines#scaleMultiplier',
      label: 'Scale',
      kind: 'slider',
    },
  ],
  flashcards: [
    {
      anchor: 'settings.group:flashcards#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.field:flashcards#presentShowFirst',
      label: 'Show first',
      kind: 'segmented',
    },
    {
      anchor: 'settings.toggle:flashcards#presentShuffle',
      label: 'Shuffle cards',
      kind: 'toggle',
    },
  ],
  'specialist-schedule': [
    {
      anchor: 'settings.group:specialist-schedule#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:specialist-schedule#cycleDays',
      label: 'Rotation schedule',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:specialist-schedule#recurringItems',
      label: 'Recurring schedule',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:specialist-schedule#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
    {
      anchor: 'settings.field:specialist-schedule#fontColor',
      label: 'Font color',
      kind: 'color',
    },
    {
      anchor: 'settings.field:specialist-schedule#textSizePreset',
      label: 'Text size',
      kind: 'textSizePreset',
    },
    {
      anchor: 'settings.field:specialist-schedule#cardColor',
      label: 'Card color',
      kind: 'surfaceColor',
    },
  ],
  'graphic-organizer': [
    {
      anchor: 'settings.group:graphic-organizer#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:graphic-organizer#templateType',
      label: 'Template type',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:graphic-organizer#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
    {
      anchor: 'settings.field:graphic-organizer#cardColor',
      label: 'Card color',
      kind: 'surfaceColor',
    },
  ],
  'reveal-grid': [
    {
      anchor: 'settings.group:reveal-grid#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:reveal-grid#setName',
      label: 'Practice set name',
      kind: 'text',
    },
    {
      anchor: 'settings.field:reveal-grid#cards',
      label: 'Cards',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:reveal-grid#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.toggle:reveal-grid#isMemoryMode',
      label: 'Memory mode',
      kind: 'toggle',
    },
    {
      anchor: 'settings.field:reveal-grid#revealMode',
      label: 'Reveal mode',
      kind: 'segmented',
    },
    {
      anchor: 'settings.group:reveal-grid#display',
      label: 'Display',
    },
    {
      anchor: 'settings.field:reveal-grid#columns',
      label: 'Columns',
      kind: 'segmented',
    },
    {
      anchor: 'settings.field:reveal-grid#defaultCardColor',
      label: 'Default card front color',
      kind: 'color',
    },
    {
      anchor: 'settings.field:reveal-grid#defaultCardBackColor',
      label: 'Default card back color',
      kind: 'color',
    },
    {
      anchor: 'settings.field:reveal-grid#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
  ],
  numberLine: [
    {
      anchor: 'settings.group:numberLine#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:numberLine#min',
      label: 'Minimum value',
      kind: 'number',
    },
    {
      anchor: 'settings.field:numberLine#max',
      label: 'Maximum value',
      kind: 'number',
    },
    {
      anchor: 'settings.field:numberLine#step',
      label: 'Step (interval)',
      kind: 'number',
    },
    {
      anchor: 'settings.field:numberLine#displayMode',
      label: 'Display mode',
      kind: 'segmented',
    },
    {
      anchor: 'settings.field:numberLine#markers',
      label: 'Markers',
      kind: 'list',
    },
    {
      anchor: 'settings.field:numberLine#jumps',
      label: 'Jumps',
      kind: 'list',
    },
    {
      anchor: 'settings.group:numberLine#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.toggle:numberLine#showArrows',
      label: 'Show arrows on ends',
      kind: 'toggle',
    },
    {
      anchor: 'settings.field:numberLine#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
    {
      anchor: 'settings.field:numberLine#fontColor',
      label: 'Font color',
      kind: 'color',
    },
    {
      anchor: 'settings.field:numberLine#cardColor',
      label: 'Card color',
      kind: 'surfaceColor',
    },
  ],
  'syntax-framer': [
    {
      anchor: 'settings.group:syntax-framer#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:syntax-framer#tokens',
      label: 'Content',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:syntax-framer#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.field:syntax-framer#mode',
      label: 'Mode',
      kind: 'segmented',
    },
    {
      anchor: 'settings.field:syntax-framer#alignment',
      label: 'Alignment',
      kind: 'segmented',
    },
  ],
  'hotspot-image': [
    {
      anchor: 'settings.group:hotspot-image#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:hotspot-image#baseImageUrl',
      label: 'Base image',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:hotspot-image#hotspots',
      label: 'Interactive pins',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:hotspot-image#display',
      label: 'Display',
    },
    {
      anchor: 'settings.field:hotspot-image#popoverTheme',
      label: 'Popover theme',
      kind: 'segmented',
    },
  ],
  'concept-web': [
    {
      anchor: 'settings.group:concept-web#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:concept-web#defaultNodeWidth',
      label: 'New node width',
      kind: 'slider',
    },
    {
      anchor: 'settings.field:concept-web#defaultNodeHeight',
      label: 'New node height',
      kind: 'slider',
    },
    {
      anchor: 'settings.field:concept-web#nodes',
      label: 'Canvas actions',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:concept-web#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
    {
      anchor: 'settings.field:concept-web#cardColor',
      label: 'Card color',
      kind: 'surfaceColor',
    },
  ],
  'starter-pack': [
    {
      anchor: 'settings.group:starter-pack#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:starter-pack#packName',
      label: 'Pack name',
      kind: 'custom',
    },
  ],
  'video-activity': [
    {
      anchor: 'settings.group:video-activity#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.toggle:video-activity#autoPlay',
      label: 'Auto-play video',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:video-activity#requireCorrectAnswer',
      label: 'Require correct answers',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:video-activity#allowSkipping',
      label: 'Allow skipping',
      kind: 'toggle',
    },
  ],
  'guided-learning': [
    {
      anchor: 'settings.group:guided-learning#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.field:guided-learning#view',
      label: 'Go to library',
      kind: 'custom',
    },
  ],
  countdown: [
    {
      anchor: 'settings.group:countdown#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:countdown#title',
      label: 'Event title',
      kind: 'text',
    },
    {
      anchor: 'settings.field:countdown#startDate',
      label: 'Start date',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:countdown#eventDate',
      label: 'Event date',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:countdown#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.toggle:countdown#includeWeekends',
      label: 'Include weekends',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:countdown#countToday',
      label: 'Count today',
      kind: 'toggle',
    },
    {
      anchor: 'settings.group:countdown#display',
      label: 'Display',
    },
    {
      anchor: 'settings.field:countdown#viewMode',
      label: 'View mode',
      kind: 'segmented',
    },
    {
      anchor: 'settings.field:countdown#eventColor',
      label: 'Event title color',
      kind: 'color',
    },
    {
      anchor: 'settings.field:countdown#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
    {
      anchor: 'settings.field:countdown#fontColor',
      label: 'Font color',
      kind: 'color',
    },
    {
      anchor: 'settings.field:countdown#cardColor',
      label: 'Card color',
      kind: 'surfaceColor',
    },
  ],
  'work-symbols': [
    {
      anchor: 'settings.group:work-symbols#display',
      label: 'Display',
    },
    {
      anchor: 'settings.field:work-symbols#titlePosition',
      label: 'Title position',
      kind: 'segmented',
    },
    {
      anchor: 'settings.field:work-symbols#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
    {
      anchor: 'settings.field:work-symbols#fontColor',
      label: 'Font color',
      kind: 'color',
    },
    {
      anchor: 'settings.field:work-symbols#textSizePreset',
      label: 'Text size',
      kind: 'textSizePreset',
    },
  ],
  'blooms-taxonomy': [
    {
      anchor: 'settings.group:blooms-taxonomy#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:blooms-taxonomy#enabledCategories',
      label: 'Content categories',
      kind: 'custom',
    },
  ],
  'need-do-put-then': [
    {
      anchor: 'settings.group:need-do-put-then#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:need-do-put-then#needItems',
      label: 'What you need',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:need-do-put-then#doItems',
      label: 'What you do',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:need-do-put-then#putItems',
      label: 'Where it goes',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:need-do-put-then#thenItems',
      label: "What's next",
      kind: 'custom',
    },
    {
      anchor: 'settings.field:need-do-put-then#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
    {
      anchor: 'settings.field:need-do-put-then#fontColor',
      label: 'Font color',
      kind: 'color',
    },
    {
      anchor: 'settings.field:need-do-put-then#textSizePreset',
      label: 'Text size',
      kind: 'textSizePreset',
    },
    {
      anchor: 'settings.field:need-do-put-then#cardColor',
      label: 'Card color',
      kind: 'surfaceColor',
    },
  ],
  stations: [
    {
      anchor: 'settings.group:stations#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:stations#stations',
      label: 'Stations',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:stations#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.field:stations#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
    {
      anchor: 'settings.field:stations#fontColor',
      label: 'Font color',
      kind: 'color',
    },
    {
      anchor: 'settings.field:stations#cardColor',
      label: 'Card color',
      kind: 'surfaceColor',
    },
  ],
  materials: [
    {
      anchor: 'settings.group:materials#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:materials#title',
      label: 'Title',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:materials#selectedItems',
      label: 'Available materials',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:materials#display',
      label: 'Display',
    },
    {
      anchor: 'settings.field:materials#titleFont',
      label: 'Title font',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:materials#titleColor',
      label: 'Title color',
      kind: 'color',
    },
  ],
  'seating-chart': [
    {
      anchor: 'settings.group:seating-chart#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:seating-chart#rosterMode',
      label: 'Roster',
      kind: 'rosterPicker',
    },
    {
      anchor: 'settings.field:seating-chart#names',
      label: 'Custom roster',
      kind: 'textarea',
    },
    {
      anchor: 'settings.field:seating-chart#furniture',
      label: 'Actions',
      kind: 'custom',
    },
  ],
  schedule: [
    {
      anchor: 'settings.group:schedule#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:schedule#schedules',
      label: 'Schedules',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:schedule#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.toggle:schedule#autoProgress',
      label: 'Auto-complete items',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:schedule#autoScroll',
      label: 'Auto-scroll view',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:schedule#expandActiveItem',
      label: 'Expand current event',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:schedule#isBuildingSyncEnabled',
      label: 'Sync building schedule',
      kind: 'toggle',
    },
    {
      anchor: 'settings.group:schedule#display',
      label: 'Display',
    },
    {
      anchor: 'settings.field:schedule#rowStyle',
      label: 'Event style',
      kind: 'segmented',
    },
    {
      anchor: 'settings.field:schedule#textSizePreset',
      label: 'Text size',
      kind: 'textSizePreset',
    },
    {
      anchor: 'settings.field:schedule#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
    {
      anchor: 'settings.field:schedule#fontColor',
      label: 'Font color',
      kind: 'color',
    },
    {
      anchor: 'settings.field:schedule#cardColor',
      label: 'Card color',
      kind: 'surfaceColor',
    },
  ],
  recessGear: [
    {
      anchor: 'settings.group:recessGear#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.field:recessGear#linkedWeatherWidgetId',
      label: 'Source Weather widget',
      kind: 'custom',
    },
    {
      anchor: 'settings.toggle:recessGear#useFeelsLike',
      label: 'Use “Feels Like” temperature',
      kind: 'toggle',
    },
  ],
  pdf: [
    {
      anchor: 'settings.group:pdf#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:pdf#activePdfId',
      label: 'Current document',
      kind: 'custom',
    },
  ],
  quiz: [
    {
      anchor: 'settings.group:quiz#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:quiz#view',
      label: 'Quiz management',
      kind: 'custom',
    },
  ],
  review: [
    {
      anchor: 'settings.group:review#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:review#view',
      label: 'Review management',
      kind: 'custom',
    },
  ],
  breathing: [
    {
      anchor: 'settings.group:breathing#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:breathing#pattern',
      label: 'Pattern',
      kind: 'segmented',
    },
    {
      anchor: 'settings.group:breathing#display',
      label: 'Display',
    },
    {
      anchor: 'settings.field:breathing#visual',
      label: 'Visual style',
      kind: 'segmented',
    },
    {
      anchor: 'settings.field:breathing#color',
      label: 'Color theme',
      kind: 'color',
    },
    {
      anchor: 'settings.field:breathing#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
    {
      anchor: 'settings.field:breathing#fontColor',
      label: 'Font color',
      kind: 'color',
    },
    {
      anchor: 'settings.field:breathing#cardColor',
      label: 'Card color',
      kind: 'surfaceColor',
    },
  ],
  'arts-letters-agenda': [
    {
      anchor: 'settings.group:arts-letters-agenda#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:arts-letters-agenda#version',
      label: 'Version',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:arts-letters-agenda#textSizePreset',
      label: 'Text size',
      kind: 'textSizePreset',
    },
    {
      anchor: 'settings.field:arts-letters-agenda#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
    {
      anchor: 'settings.field:arts-letters-agenda#fontColor',
      label: 'Font color',
      kind: 'color',
    },
    {
      anchor: 'settings.field:arts-letters-agenda#cardColor',
      label: 'Card color',
      kind: 'surfaceColor',
    },
  ],
  mathTools: [
    {
      anchor: 'settings.group:mathTools#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.field:mathTools#dpiCalibration',
      label: 'Palette DPI calibration (px / inch)',
      kind: 'number',
    },
    {
      anchor: 'settings.field:mathTools#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
    {
      anchor: 'settings.field:mathTools#fontColor',
      label: 'Font color',
      kind: 'color',
    },
    {
      anchor: 'settings.field:mathTools#cardColor',
      label: 'Card color',
      kind: 'surfaceColor',
    },
  ],
  mathTool: [
    {
      anchor: 'settings.group:mathTool#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:mathTool#toolType',
      label: 'Tool type',
      kind: 'segmented',
    },
    {
      anchor: 'settings.field:mathTool#numberLineMode',
      label: 'Mode',
      kind: 'segmented',
    },
    {
      anchor: 'settings.field:mathTool#numberLineMin',
      label: 'Minimum',
      kind: 'number',
    },
    {
      anchor: 'settings.field:mathTool#numberLineMax',
      label: 'Maximum',
      kind: 'number',
    },
    {
      anchor: 'settings.field:mathTool#rulerUnits',
      label: 'Units displayed',
      kind: 'segmented',
    },
    {
      anchor: 'settings.group:mathTool#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.field:mathTool#pixelsPerInch',
      label: 'True-scale calibration (px / inch)',
      kind: 'number',
    },
    {
      anchor: 'settings.group:mathTool#display',
      label: 'Display',
    },
    {
      anchor: 'settings.field:mathTool#rotation',
      label: 'Rotation',
      kind: 'slider',
    },
  ],
  nextUp: [
    {
      anchor: 'settings.group:nextUp#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:nextUp#activeDriveFileId',
      label: 'Session status',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:nextUp#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.field:nextUp#autoStartTimer',
      label: 'Auto-start Timer',
      kind: 'toggle',
    },
    {
      anchor: 'settings.toggle:nextUp#autoStartTimer',
      label: 'Auto-start Timer',
      kind: 'toggle',
    },
    {
      anchor: 'settings.field:nextUp#displayCount',
      label: 'Display count',
      kind: 'slider',
    },
    {
      anchor: 'settings.group:nextUp#display',
      label: 'Display',
    },
    {
      anchor: 'settings.field:nextUp#styling',
      label: 'Visual style',
      kind: 'custom',
    },
  ],
  music: [
    {
      anchor: 'settings.group:music#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:music#source',
      label: 'Source',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:music#layout',
      label: 'Layout',
      kind: 'segmented',
    },
    {
      anchor: 'settings.field:music#stationId',
      label: 'Select a station',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:music#personalSpotifyUrl',
      label: 'Personal Spotify',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:music#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.field:music#syncWithTimeTool',
      label: 'Sync with Time Tool',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:music#display',
      label: 'Display',
    },
    {
      anchor: 'settings.field:music#bgColor',
      label: 'Background',
      kind: 'color',
    },
    {
      anchor: 'settings.field:music#textColor',
      label: 'Text color',
      kind: 'color',
    },
  ],
  'car-rider-pro': [
    {
      anchor: 'settings.group:car-rider-pro#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:car-rider-pro#iframeUrl',
      label: 'Centrally managed',
      kind: 'custom',
    },
  ],
  'blending-board': [
    {
      anchor: 'settings.group:blending-board#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:blending-board#managedNotice',
      label: 'Centrally managed',
      kind: 'custom',
    },
  ],
  'first-5': [
    {
      anchor: 'settings.group:first-5#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:first-5#__brand',
      label: 'Automatic content',
      kind: 'custom',
    },
  ],
  'custom-widget': [
    {
      anchor: 'settings.group:custom-widget#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:custom-widget#adminSettings',
      label: 'Configuration',
      kind: 'custom',
    },
  ],
  catalyst: [
    {
      anchor: 'settings.group:catalyst#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:catalyst#managedNotice',
      label: 'Admin managed',
      kind: 'custom',
    },
  ],
  'catalyst-instruction': [],
  'catalyst-visual': [],
  smartNotebook: [
    {
      anchor: 'settings.field:smartNotebook#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
    {
      anchor: 'settings.field:smartNotebook#fontColor',
      label: 'Font color',
      kind: 'color',
    },
    {
      anchor: 'settings.field:smartNotebook#cardColor',
      label: 'Card color',
      kind: 'surfaceColor',
    },
  ],
  miniApp: [
    {
      anchor: 'settings.group:miniApp#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:miniApp#manageNotice',
      label: 'Apps',
      kind: 'custom',
    },
  ],
  traffic: [],
  classes: [],
  routineGuide: [],
  projects: [
    {
      anchor: 'settings.group:projects#behavior',
      label: 'Behavior',
    },
    {
      anchor: 'settings.field:projects#view',
      label: 'Project library',
      kind: 'custom',
    },
    {
      anchor: 'settings.group:projects#display',
      label: 'Display',
    },
    {
      anchor: 'settings.field:projects#cardColor',
      label: 'Group rows',
      kind: 'surfaceColor',
    },
    {
      anchor: 'settings.field:projects#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
  ],
  'activity-wall': [
    {
      anchor: 'settings.group:activity-wall#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:activity-wall#managedNotice',
      label: 'Walls',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:activity-wall#fontFamily',
      label: 'Font',
      kind: 'fontFamily',
    },
    {
      anchor: 'settings.field:activity-wall#fontColor',
      label: 'Font color',
      kind: 'color',
    },
    {
      anchor: 'settings.field:activity-wall#cardColor',
      label: 'Card color',
      kind: 'surfaceColor',
    },
  ],
  'talking-tool': [
    {
      anchor: 'settings.group:talking-tool#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:talking-tool#managedNotice',
      label: 'Global content settings',
      kind: 'custom',
    },
    {
      anchor: 'settings.field:talking-tool#cardColor',
      label: 'Card color',
      kind: 'surfaceColor',
    },
  ],
  stickers: [
    {
      anchor: 'settings.group:stickers#content',
      label: 'Content',
    },
    {
      anchor: 'settings.field:stickers#managedNotice',
      label: 'Sticker book',
      kind: 'custom',
    },
  ],
};
