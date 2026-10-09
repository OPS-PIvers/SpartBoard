// Generated from the widget settings schemas by tests/mcpTourAnchorList.test.ts; rerun it with UPDATE_TOUR_ANCHOR_LIST=1.
export const SETTINGS_FIELD_LIST: Readonly<
  Record<string, ReadonlyArray<{ anchor: string; label: string }>>
> = {
  "soundboard": [
    {
      "anchor": "settings.group:soundboard#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:soundboard#selectedSoundIds",
      "label": "Available sounds"
    }
  ],
  "dice": [
    {
      "anchor": "settings.group:dice#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.field:dice#count",
      "label": "Number of dice"
    },
    {
      "anchor": "settings.group:dice#display",
      "label": "Display"
    },
    {
      "anchor": "settings.field:dice#diceColor",
      "label": "Die color"
    },
    {
      "anchor": "settings.field:dice#dotColor",
      "label": "Pip color"
    }
  ],
  "sound": [
    {
      "anchor": "settings.group:sound#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.field:sound#syncExpectations",
      "label": "Sync with Expectations"
    },
    {
      "anchor": "settings.toggle:sound#syncExpectations",
      "label": "Sync with Expectations"
    },
    {
      "anchor": "settings.field:sound#sensitivity",
      "label": "Sensitivity"
    },
    {
      "anchor": "settings.field:sound#autoTrafficLight",
      "label": "Control Traffic Light automatically"
    },
    {
      "anchor": "settings.toggle:sound#autoTrafficLight",
      "label": "Control Traffic Light automatically"
    },
    {
      "anchor": "settings.field:sound#trafficLightThreshold",
      "label": "Trigger red light at"
    },
    {
      "anchor": "settings.group:sound#display",
      "label": "Display"
    },
    {
      "anchor": "settings.field:sound#visual",
      "label": "Visual mode"
    }
  ],
  "webcam": [
    {
      "anchor": "settings.group:webcam#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.toggle:webcam#autoSendToNotes",
      "label": "Send OCR text to Notes automatically"
    }
  ],
  "drawing": [
    {
      "anchor": "settings.group:drawing#display",
      "label": "Display"
    },
    {
      "anchor": "settings.field:drawing#width",
      "label": "Brush thickness"
    },
    {
      "anchor": "settings.field:drawing#background",
      "label": "Background"
    },
    {
      "anchor": "settings.toggle:drawing#shapeFill",
      "label": "Fill shapes"
    }
  ],
  "text": [
    {
      "anchor": "settings.group:text#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:text#content",
      "label": "Templates"
    },
    {
      "anchor": "settings.group:text#display",
      "label": "Note"
    },
    {
      "anchor": "settings.field:text#bgColor",
      "label": "Note color"
    },
    {
      "anchor": "settings.field:text#verticalAlign",
      "label": "Vertical alignment"
    }
  ],
  "embed": [
    {
      "anchor": "settings.group:embed#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:embed#mode",
      "label": "Embed Type"
    },
    {
      "anchor": "settings.group:embed#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.field:embed#refreshInterval",
      "label": "Auto-Refresh"
    }
  ],
  "lunchCount": [
    {
      "anchor": "settings.group:lunchCount#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:lunchCount#schoolSite",
      "label": "School Site"
    },
    {
      "anchor": "settings.field:lunchCount#lunchTimeHour",
      "label": "Lunch Time"
    },
    {
      "anchor": "settings.field:lunchCount#gradeLevel",
      "label": "Grade Level"
    },
    {
      "anchor": "settings.field:lunchCount#manualHotLunch",
      "label": "Hot Lunch Name"
    },
    {
      "anchor": "settings.field:lunchCount#manualBentoBox",
      "label": "Bento Box Name"
    },
    {
      "anchor": "settings.field:lunchCount#roster",
      "label": "Custom Roster"
    },
    {
      "anchor": "settings.group:lunchCount#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.field:lunchCount#rosterMode",
      "label": "Roster Selection"
    },
    {
      "anchor": "settings.toggle:lunchCount#isManualMode",
      "label": "Manual Mode"
    }
  ],
  "clock": [
    {
      "anchor": "settings.group:clock#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.toggle:clock#format24",
      "label": "24H Format"
    },
    {
      "anchor": "settings.toggle:clock#showSeconds",
      "label": "Show Seconds"
    },
    {
      "anchor": "settings.group:clock#display",
      "label": "Display"
    },
    {
      "anchor": "settings.field:clock#clockStyle",
      "label": "Display Style"
    },
    {
      "anchor": "settings.toggle:clock#glow",
      "label": "Glow"
    },
    {
      "anchor": "settings.field:clock#themeColor",
      "label": "Color Palette"
    },
    {
      "anchor": "settings.field:clock#dateColor",
      "label": "Date Color"
    }
  ],
  "time-tool": [
    {
      "anchor": "settings.group:time-tool#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:time-tool#mode",
      "label": "Mode"
    },
    {
      "anchor": "settings.field:time-tool#selectedSound",
      "label": "Alert Sound"
    },
    {
      "anchor": "settings.group:time-tool#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.field:time-tool#adjustStepSeconds",
      "label": "Adjust Step (seconds)"
    },
    {
      "anchor": "settings.field:time-tool#timerEndVoiceLevel",
      "label": "Switch to Voice Level when finished"
    },
    {
      "anchor": "settings.field:time-tool#timerEndTrafficColor",
      "label": "Auto-set Traffic Light"
    },
    {
      "anchor": "settings.field:time-tool#timerEndTriggerRandom",
      "label": "Auto-Pick Random Student"
    },
    {
      "anchor": "settings.toggle:time-tool#timerEndTriggerRandom",
      "label": "Auto-Pick Random Student"
    },
    {
      "anchor": "settings.field:time-tool#timerEndTriggerStationsRotate",
      "label": "Auto-rotate stations"
    },
    {
      "anchor": "settings.toggle:time-tool#timerEndTriggerStationsRotate",
      "label": "Auto-rotate stations"
    },
    {
      "anchor": "settings.field:time-tool#timerEndTriggerNextUp",
      "label": "Auto-Advance NextUp Queue"
    },
    {
      "anchor": "settings.toggle:time-tool#timerEndTriggerNextUp",
      "label": "Auto-Advance NextUp Queue"
    },
    {
      "anchor": "settings.group:time-tool#display",
      "label": "Display"
    },
    {
      "anchor": "settings.field:time-tool#visualType",
      "label": "Display Style"
    },
    {
      "anchor": "settings.field:time-tool#clockStyle",
      "label": "Number Style"
    },
    {
      "anchor": "settings.field:time-tool#themeColor",
      "label": "Color Palette"
    },
    {
      "anchor": "settings.toggle:time-tool#glow",
      "label": "Glow"
    }
  ],
  "checklist": [
    {
      "anchor": "settings.group:checklist#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:checklist#mode",
      "label": "List source"
    },
    {
      "anchor": "settings.field:checklist#items",
      "label": "Tasks"
    },
    {
      "anchor": "settings.field:checklist#rosterMode",
      "label": "Roster source"
    },
    {
      "anchor": "settings.field:checklist#firstNames",
      "label": "First names"
    },
    {
      "anchor": "settings.field:checklist#lastNames",
      "label": "Last names"
    },
    {
      "anchor": "settings.field:checklist#rosterPoolGroupId",
      "label": "Draw from"
    },
    {
      "anchor": "settings.field:checklist#completedNames",
      "label": "Import tasks"
    },
    {
      "anchor": "settings.group:checklist#display",
      "label": "Display"
    },
    {
      "anchor": "settings.field:checklist#rowStyle",
      "label": "Task style"
    }
  ],
  "weather": [
    {
      "anchor": "settings.group:weather#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:weather#isAuto",
      "label": "Weather mode"
    },
    {
      "anchor": "settings.field:weather#temp",
      "label": "Temperature (°F)"
    },
    {
      "anchor": "settings.field:weather#condition",
      "label": "Condition"
    },
    {
      "anchor": "settings.field:weather#lastSync",
      "label": "Automatic weather"
    },
    {
      "anchor": "settings.group:weather#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.field:weather#showFeelsLike",
      "label": "Prioritize feels-like temperature"
    },
    {
      "anchor": "settings.toggle:weather#hideClothing",
      "label": "Hide clothing recommendations"
    },
    {
      "anchor": "settings.toggle:weather#syncBackground",
      "label": "Match the board background to weather"
    },
    {
      "anchor": "settings.group:weather#display",
      "label": "Display"
    },
    {
      "anchor": "settings.field:weather#secondaryColor",
      "label": "Secondary text color"
    },
    {
      "anchor": "settings.field:weather#cardColor",
      "label": "Clothing card"
    }
  ],
  "expectations": [
    {
      "anchor": "settings.group:expectations#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.field:expectations#syncSoundWidget",
      "label": "Sound meter sync"
    }
  ],
  "random": [
    {
      "anchor": "settings.group:random#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:random#rosterMode",
      "label": "Roster source"
    },
    {
      "anchor": "settings.field:random#firstNames",
      "label": "First names"
    },
    {
      "anchor": "settings.field:random#lastNames",
      "label": "Last names"
    },
    {
      "anchor": "settings.field:random#remainingStudents",
      "label": "Custom roster actions"
    },
    {
      "anchor": "settings.group:random#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.field:random#mode",
      "label": "Operation mode"
    },
    {
      "anchor": "settings.toggle:random#soundEnabled",
      "label": "Sound effects"
    },
    {
      "anchor": "settings.field:random#autoStartTimer",
      "label": "Start Timer automatically"
    },
    {
      "anchor": "settings.toggle:random#autoStartTimer",
      "label": "Start Timer automatically"
    },
    {
      "anchor": "settings.field:random#visualStyle",
      "label": "Animation style"
    },
    {
      "anchor": "settings.field:random#groupingMode",
      "label": "Group by"
    },
    {
      "anchor": "settings.field:random#groupSize",
      "label": "Group size"
    },
    {
      "anchor": "settings.field:random#numGroups",
      "label": "Number of groups"
    },
    {
      "anchor": "settings.field:random#numHomeGroups",
      "label": "Number of home groups"
    },
    {
      "anchor": "settings.field:random#numExpertGroups",
      "label": "Number of expert groups"
    },
    {
      "anchor": "settings.field:random#lockedRosterGroupIds",
      "label": "Keep groups together"
    },
    {
      "anchor": "settings.field:random#lastResult",
      "label": "Save as class groups"
    }
  ],
  "url": [
    {
      "anchor": "settings.group:url#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:url#urls",
      "label": "Links"
    }
  ],
  "qr": [
    {
      "anchor": "settings.group:qr#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:qr#url",
      "label": "Destination URL"
    },
    {
      "anchor": "settings.group:qr#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.field:qr#syncWithTextWidget",
      "label": "Link repeater"
    },
    {
      "anchor": "settings.group:qr#display",
      "label": "Display"
    },
    {
      "anchor": "settings.toggle:qr#showUrl",
      "label": "Show URL"
    }
  ],
  "scoreboard": [
    {
      "anchor": "settings.group:scoreboard#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:scoreboard#teams",
      "label": "Teams"
    },
    {
      "anchor": "settings.group:scoreboard#display",
      "label": "Display"
    },
    {
      "anchor": "settings.field:scoreboard#layout",
      "label": "Layout"
    }
  ],
  "calendar": [
    {
      "anchor": "settings.group:calendar#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:calendar#events",
      "label": "Local manual events"
    },
    {
      "anchor": "settings.field:calendar#personalCalendarIds",
      "label": "Personal Google Calendars"
    },
    {
      "anchor": "settings.group:calendar#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.field:calendar#isBuildingSyncEnabled",
      "label": "Building schedule"
    },
    {
      "anchor": "settings.group:calendar#display",
      "label": "Display"
    },
    {
      "anchor": "settings.field:calendar#daysVisible",
      "label": "Days to display"
    },
    {
      "anchor": "settings.field:calendar#pastEvents",
      "label": "Past events"
    },
    {
      "anchor": "settings.field:calendar#headerColor",
      "label": "Day header color"
    }
  ],
  "poll": [
    {
      "anchor": "settings.group:poll#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:poll#questions",
      "label": "Questions"
    },
    {
      "anchor": "settings.group:poll#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.field:poll#activePollSessionId",
      "label": "Live device voting"
    }
  ],
  "instructionalRoutines": [
    {
      "anchor": "settings.group:instructionalRoutines#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:instructionalRoutines#selectedRoutineId",
      "label": "Routine template"
    },
    {
      "anchor": "settings.field:instructionalRoutines#customSteps",
      "label": "Steps"
    }
  ],
  "flashcards": [
    {
      "anchor": "settings.group:flashcards#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.field:flashcards#presentShowFirst",
      "label": "Show first"
    },
    {
      "anchor": "settings.toggle:flashcards#presentShuffle",
      "label": "Shuffle cards"
    }
  ],
  "specialist-schedule": [
    {
      "anchor": "settings.group:specialist-schedule#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:specialist-schedule#cycleDays",
      "label": "Rotation schedule"
    },
    {
      "anchor": "settings.field:specialist-schedule#recurringItems",
      "label": "Recurring schedule"
    }
  ],
  "graphic-organizer": [
    {
      "anchor": "settings.group:graphic-organizer#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:graphic-organizer#templateType",
      "label": "Template type"
    }
  ],
  "reveal-grid": [
    {
      "anchor": "settings.group:reveal-grid#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:reveal-grid#setName",
      "label": "Practice set name"
    },
    {
      "anchor": "settings.field:reveal-grid#cards",
      "label": "Cards"
    },
    {
      "anchor": "settings.group:reveal-grid#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.toggle:reveal-grid#isMemoryMode",
      "label": "Memory mode"
    },
    {
      "anchor": "settings.field:reveal-grid#revealMode",
      "label": "Reveal mode"
    },
    {
      "anchor": "settings.group:reveal-grid#display",
      "label": "Display"
    },
    {
      "anchor": "settings.field:reveal-grid#columns",
      "label": "Columns"
    },
    {
      "anchor": "settings.field:reveal-grid#defaultCardColor",
      "label": "Default card front color"
    },
    {
      "anchor": "settings.field:reveal-grid#defaultCardBackColor",
      "label": "Default card back color"
    }
  ],
  "numberLine": [
    {
      "anchor": "settings.group:numberLine#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:numberLine#min",
      "label": "Minimum value"
    },
    {
      "anchor": "settings.field:numberLine#max",
      "label": "Maximum value"
    },
    {
      "anchor": "settings.field:numberLine#step",
      "label": "Step (interval)"
    },
    {
      "anchor": "settings.field:numberLine#displayMode",
      "label": "Display mode"
    },
    {
      "anchor": "settings.field:numberLine#markers",
      "label": "Markers"
    },
    {
      "anchor": "settings.field:numberLine#jumps",
      "label": "Jumps"
    },
    {
      "anchor": "settings.group:numberLine#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.toggle:numberLine#showArrows",
      "label": "Show arrows on ends"
    }
  ],
  "syntax-framer": [
    {
      "anchor": "settings.group:syntax-framer#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:syntax-framer#tokens",
      "label": "Content"
    },
    {
      "anchor": "settings.group:syntax-framer#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.field:syntax-framer#mode",
      "label": "Mode"
    },
    {
      "anchor": "settings.field:syntax-framer#alignment",
      "label": "Alignment"
    }
  ],
  "hotspot-image": [
    {
      "anchor": "settings.group:hotspot-image#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:hotspot-image#baseImageUrl",
      "label": "Base image"
    },
    {
      "anchor": "settings.field:hotspot-image#hotspots",
      "label": "Interactive pins"
    },
    {
      "anchor": "settings.group:hotspot-image#display",
      "label": "Display"
    },
    {
      "anchor": "settings.field:hotspot-image#popoverTheme",
      "label": "Popover theme"
    }
  ],
  "concept-web": [
    {
      "anchor": "settings.group:concept-web#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:concept-web#defaultNodeWidth",
      "label": "New node width"
    },
    {
      "anchor": "settings.field:concept-web#defaultNodeHeight",
      "label": "New node height"
    },
    {
      "anchor": "settings.field:concept-web#nodes",
      "label": "Canvas actions"
    }
  ],
  "starter-pack": [
    {
      "anchor": "settings.group:starter-pack#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:starter-pack#packName",
      "label": "Pack name"
    }
  ],
  "video-activity": [
    {
      "anchor": "settings.group:video-activity#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.toggle:video-activity#autoPlay",
      "label": "Auto-play video"
    },
    {
      "anchor": "settings.toggle:video-activity#requireCorrectAnswer",
      "label": "Require correct answers"
    },
    {
      "anchor": "settings.toggle:video-activity#allowSkipping",
      "label": "Allow skipping"
    }
  ],
  "guided-learning": [
    {
      "anchor": "settings.group:guided-learning#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.field:guided-learning#view",
      "label": "Go to library"
    }
  ],
  "countdown": [
    {
      "anchor": "settings.group:countdown#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:countdown#title",
      "label": "Event title"
    },
    {
      "anchor": "settings.field:countdown#startDate",
      "label": "Start date"
    },
    {
      "anchor": "settings.field:countdown#eventDate",
      "label": "Event date"
    },
    {
      "anchor": "settings.group:countdown#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.toggle:countdown#includeWeekends",
      "label": "Include weekends"
    },
    {
      "anchor": "settings.toggle:countdown#countToday",
      "label": "Count today"
    },
    {
      "anchor": "settings.group:countdown#display",
      "label": "Display"
    },
    {
      "anchor": "settings.field:countdown#viewMode",
      "label": "View mode"
    },
    {
      "anchor": "settings.field:countdown#eventColor",
      "label": "Event title color"
    }
  ],
  "work-symbols": [
    {
      "anchor": "settings.group:work-symbols#display",
      "label": "Display"
    },
    {
      "anchor": "settings.field:work-symbols#titlePosition",
      "label": "Title position"
    }
  ],
  "blooms-taxonomy": [
    {
      "anchor": "settings.group:blooms-taxonomy#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:blooms-taxonomy#enabledCategories",
      "label": "Content categories"
    }
  ],
  "need-do-put-then": [
    {
      "anchor": "settings.group:need-do-put-then#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:need-do-put-then#needItems",
      "label": "What you need"
    },
    {
      "anchor": "settings.field:need-do-put-then#doItems",
      "label": "What you do"
    },
    {
      "anchor": "settings.field:need-do-put-then#putItems",
      "label": "Where it goes"
    },
    {
      "anchor": "settings.field:need-do-put-then#thenItems",
      "label": "What's next"
    }
  ],
  "stations": [
    {
      "anchor": "settings.group:stations#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:stations#stations",
      "label": "Stations"
    },
    {
      "anchor": "settings.group:stations#behavior",
      "label": "Behavior"
    }
  ],
  "materials": [
    {
      "anchor": "settings.group:materials#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:materials#title",
      "label": "Title"
    },
    {
      "anchor": "settings.field:materials#selectedItems",
      "label": "Available materials"
    },
    {
      "anchor": "settings.group:materials#display",
      "label": "Display"
    },
    {
      "anchor": "settings.field:materials#titleFont",
      "label": "Title font"
    }
  ],
  "seating-chart": [
    {
      "anchor": "settings.group:seating-chart#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:seating-chart#rosterMode",
      "label": "Roster"
    },
    {
      "anchor": "settings.field:seating-chart#names",
      "label": "Custom roster"
    },
    {
      "anchor": "settings.field:seating-chart#furniture",
      "label": "Actions"
    }
  ],
  "schedule": [
    {
      "anchor": "settings.group:schedule#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:schedule#schedules",
      "label": "Schedules"
    },
    {
      "anchor": "settings.group:schedule#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.toggle:schedule#autoProgress",
      "label": "Auto-complete items"
    },
    {
      "anchor": "settings.toggle:schedule#autoScroll",
      "label": "Auto-scroll view"
    },
    {
      "anchor": "settings.toggle:schedule#expandActiveItem",
      "label": "Expand current event"
    },
    {
      "anchor": "settings.toggle:schedule#isBuildingSyncEnabled",
      "label": "Sync building schedule"
    },
    {
      "anchor": "settings.group:schedule#display",
      "label": "Display"
    },
    {
      "anchor": "settings.field:schedule#rowStyle",
      "label": "Event style"
    }
  ],
  "recessGear": [
    {
      "anchor": "settings.group:recessGear#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.field:recessGear#linkedWeatherWidgetId",
      "label": "Source Weather widget"
    },
    {
      "anchor": "settings.toggle:recessGear#useFeelsLike",
      "label": "Use “Feels Like” temperature"
    }
  ],
  "pdf": [
    {
      "anchor": "settings.group:pdf#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:pdf#activePdfId",
      "label": "Current document"
    }
  ],
  "quiz": [
    {
      "anchor": "settings.group:quiz#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:quiz#view",
      "label": "Quiz management"
    }
  ],
  "review": [
    {
      "anchor": "settings.group:review#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:review#view",
      "label": "Review management"
    }
  ],
  "breathing": [
    {
      "anchor": "settings.group:breathing#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:breathing#pattern",
      "label": "Pattern"
    },
    {
      "anchor": "settings.group:breathing#display",
      "label": "Display"
    },
    {
      "anchor": "settings.field:breathing#visual",
      "label": "Visual style"
    },
    {
      "anchor": "settings.field:breathing#color",
      "label": "Color theme"
    }
  ],
  "arts-letters-agenda": [],
  "mathTools": [
    {
      "anchor": "settings.group:mathTools#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.field:mathTools#dpiCalibration",
      "label": "Palette DPI calibration (px / inch)"
    }
  ],
  "mathTool": [
    {
      "anchor": "settings.group:mathTool#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:mathTool#toolType",
      "label": "Tool type"
    },
    {
      "anchor": "settings.field:mathTool#numberLineMode",
      "label": "Mode"
    },
    {
      "anchor": "settings.field:mathTool#numberLineMin",
      "label": "Minimum"
    },
    {
      "anchor": "settings.field:mathTool#numberLineMax",
      "label": "Maximum"
    },
    {
      "anchor": "settings.field:mathTool#rulerUnits",
      "label": "Units displayed"
    },
    {
      "anchor": "settings.group:mathTool#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.field:mathTool#pixelsPerInch",
      "label": "True-scale calibration (px / inch)"
    },
    {
      "anchor": "settings.group:mathTool#display",
      "label": "Display"
    },
    {
      "anchor": "settings.field:mathTool#rotation",
      "label": "Rotation"
    }
  ],
  "nextUp": [
    {
      "anchor": "settings.group:nextUp#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:nextUp#activeDriveFileId",
      "label": "Session status"
    },
    {
      "anchor": "settings.group:nextUp#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.field:nextUp#autoStartTimer",
      "label": "Auto-start Timer"
    },
    {
      "anchor": "settings.toggle:nextUp#autoStartTimer",
      "label": "Auto-start Timer"
    },
    {
      "anchor": "settings.field:nextUp#displayCount",
      "label": "Display count"
    },
    {
      "anchor": "settings.group:nextUp#display",
      "label": "Display"
    },
    {
      "anchor": "settings.field:nextUp#styling",
      "label": "Visual style"
    }
  ],
  "music": [
    {
      "anchor": "settings.group:music#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:music#source",
      "label": "Source"
    },
    {
      "anchor": "settings.field:music#layout",
      "label": "Layout"
    },
    {
      "anchor": "settings.field:music#stationId",
      "label": "Select a station"
    },
    {
      "anchor": "settings.field:music#personalSpotifyUrl",
      "label": "Personal Spotify"
    },
    {
      "anchor": "settings.group:music#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.field:music#syncWithTimeTool",
      "label": "Sync with Time Tool"
    },
    {
      "anchor": "settings.group:music#display",
      "label": "Display"
    },
    {
      "anchor": "settings.field:music#bgColor",
      "label": "Background"
    },
    {
      "anchor": "settings.field:music#textColor",
      "label": "Text color"
    }
  ],
  "car-rider-pro": [
    {
      "anchor": "settings.group:car-rider-pro#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:car-rider-pro#iframeUrl",
      "label": "Centrally managed"
    }
  ],
  "blending-board": [
    {
      "anchor": "settings.group:blending-board#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:blending-board#managedNotice",
      "label": "Centrally managed"
    }
  ],
  "first-5": [
    {
      "anchor": "settings.group:first-5#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:first-5#__brand",
      "label": "Automatic content"
    }
  ],
  "custom-widget": [
    {
      "anchor": "settings.group:custom-widget#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:custom-widget#adminSettings",
      "label": "Configuration"
    }
  ],
  "catalyst": [
    {
      "anchor": "settings.group:catalyst#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:catalyst#managedNotice",
      "label": "Admin managed"
    }
  ],
  "catalyst-instruction": [],
  "catalyst-visual": [],
  "smartNotebook": [],
  "miniApp": [
    {
      "anchor": "settings.group:miniApp#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:miniApp#manageNotice",
      "label": "Apps"
    }
  ],
  "traffic": [],
  "classes": [],
  "projects": [
    {
      "anchor": "settings.group:projects#behavior",
      "label": "Behavior"
    },
    {
      "anchor": "settings.field:projects#view",
      "label": "Project library"
    },
    {
      "anchor": "settings.group:projects#display",
      "label": "Display"
    },
    {
      "anchor": "settings.field:projects#cardColor",
      "label": "Group rows"
    }
  ],
  "activity-wall": [
    {
      "anchor": "settings.group:activity-wall#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:activity-wall#managedNotice",
      "label": "Walls"
    }
  ],
  "talking-tool": [
    {
      "anchor": "settings.group:talking-tool#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:talking-tool#managedNotice",
      "label": "Global content settings"
    }
  ],
  "stickers": [
    {
      "anchor": "settings.group:stickers#content",
      "label": "Content"
    },
    {
      "anchor": "settings.field:stickers#managedNotice",
      "label": "Sticker book"
    }
  ]
};
