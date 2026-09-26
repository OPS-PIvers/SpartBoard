# AI Responsible Use Widget — Implementation Plan

Status: **planned** (2026-09-25). Author: Paul Ivers + Claude (grill-me session).
Source of truth for wording: Google Doc **"OPS Responsible AI Use Guidelines"**
(`1RbxmwWGF7a7io-_Ufk8IYgJwHzWIoVDCek3YdA9SEA0`), tabs _AI Responsible Use Infographic_,
_Dept. Specific AIRU Scale_, _MS Model – Three Pillars_. Plus the Key Terminology and
"Important Questions to Ask Myself" posters (attached to the originating session).

## 1. Vision

A board widget that lets a teacher show students, at a glance, **how AI may be used on
today's activity** using the district-approved OPS scale, and keeps an **AI literacy
terminology bank** and a **metacognitive question bank** one click away, so responsible
use is taught during the lesson rather than only enforced afterward.

Principles decided in the session:

| Decision                                       | Choice                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scale version                                  | Both district presets ship; **admin picks per building** (4-level OPS or 3-level OMS Three Pillars).                                                         |
| Wording                                        | **Verbatim** from the district doc. **Locked for teachers**, **editable by admins** (Admin config modal) so a district revision needs no release.            |
| Main use                                       | **Two view modes**: _Today's Level_ (one level large) and _Full Scale_ (poster of all columns, active column highlighted as in the district screenshot).     |
| Allowed/Disallowed task list                   | Built in this plan, **behind its own global feature flag** so it can stay admin-only after the widget opens.                                                 |
| Terms & questions                              | Tabs inside one widget; any term/question can be **spawned as its own card** on the board (Bloom's `blooms-detail` pattern).                                 |
| Term definitions                               | Claude drafts student-friendly (grades 3-12) definitions; **admin-editable**; district reviews before the flag opens.                                        |
| Question bank use                              | Browse by phase (poster colors kept), feature one, random / auto-rotate, teacher adds own (per board).                                                       |
| Grades                                         | 3-12.                                                                                                                                                        |
| Student surfaces                               | **Board only.** No student-app popover in v1.                                                                                                                |
| 5 tips / Recommended tools / dishonesty footer | **Not now.** Kept in content types as optional so they can be added later without migration.                                                                 |
| AI generation                                  | **None.** Curated district content only.                                                                                                                     |
| Icons                                          | Doc column colors + lucide stand-ins (no custom assets).                                                                                                     |
| Nexus                                          | Expectations "AI" row and building-assignable citation stems (Syntax Framer / Talking Tool). Assignment AI tag and Schedule auto-level are **out of scope**. |

## 2. Content (verbatim; seeds `config/aiResponsibleUseContent.ts`)

### 2.1 Policy line (stored, shown in Full Scale only when admin enables it; default off)

> Any work created or significantly altered with AI that is submitted as the student's own
> original work or to misrepresent the students' skills-based proficiency without proper
> citation falls under building policy for Academic Dishonesty.

### 2.2 Preset `ops-4` (AI Responsible Use Infographic)

Rows: `title`, `subtitle`, `valueStatement` (bold spans preserved as `**…**`),
`studentValue`, `expectation`.

| id          | color token                             | lucide      | title        | subtitle                                              |
| ----------- | --------------------------------------- | ----------- | ------------ | ----------------------------------------------------- |
| `free`      | red/pink (#F4A3A8 header, #FDE3E4 body) | `Ban`       | AI Free      | Intentional student-only skill demonstration          |
| `assisted`  | orange (#FF9A4D / #FFE1CC)              | `Lightbulb` | AI Assisted  | Student uses AI for tasks unrelated to assessed skill |
| `enhanced`  | yellow (#F7E27A / #FFF8D6)              | `Sparkles`  | AI Enhanced  | Student uses AI to help demonstrate assessed skill    |
| `empowered` | green (#A8DDA0 / #E6F6E2)               | `Rocket`    | AI Empowered | Student uses AI for skill replacement as enrichment   |

Exact header hex values are to be sampled from the district image at build time. They are
not a teacher appearance setting. Icons are stand-ins and live in the preset so admins can't
break them.

- **free.** Value: We value **authentic skill development** and **meaningful human connections** through independent demonstration and social collaboration. / Student: We value you showing your thinking skills and building connections through working on your own and with others. / Expectation: Student should not use AI for any steps in this activity
- **assisted.** Value: We value **student independence** and **original thinking** with the use of supportive tools and strategic scaffolds for age appropriate development. / Student: We value your individual learning journey with AI as a supporting tool, not a replacement for your thinking. / Expectation: Student can use AI for brainstorming, idea generation, and spelling or grammar revision. ¶ Student is able to demonstrate proficiency without AI assistance.
- **enhanced.** Value: We value **transparent** and **authentic** demonstrations of learning while maintaining academic integrity. / Student: We value honesty about how AI helped you learn or demonstrate your learning while maintaining the integrity of your work. / Expectation: Student can use AI to help demonstrate the skill or content-knowledge being assessed ¶ Student is able to cite or explain how AI assisted in demonstrating proficiency.
- **empowered.** Value: We value **extending learning** opportunities for all students beyond their current proficiency in order to develop new competencies. / Student: We value using AI to help you reach beyond what you already know and develop new abilities. / Expectation: Student uses AI to complete a task that extends beyond the classroom activity and/or may be beyond the current level of proficiency in order to create additional learning opportunities.

### 2.3 Preset `oms-3` (MS Model – Three Pillars)

Levels `free`, `assisted`, `enhanced` (same titles, subtitles and colors), with a `when` row,
the value statement under "Why is this the expectation?", and "I can" statements under
"What does this look like?":

- **free.** When: Student **may not use AI** at any point before, during, or after the learning process. / Why: (same as 4-level value) / I can:
  - I can explain my steps, thinking, or attempts throughout the process to demonstrate how my ideas evolved.
  - I ask questions that go beyond "How do I do this?" to "What if we tried it this way?" or "How does this connect to..."?
  - I support my unique opinions with facts and data to ensure my work reflects my own voice, experiences, and research.
  - I can explain what was easy, what was hard, and what I want to improve next time.
  - I can connect my ideas with those of other students to create something better than we could have done alone.
- **assisted.** When: Student may use AI **after the learning process** with instructor-approved uses. / I can:
  - I can be clear and honest about when and how I use AI to support my learning process.
  - I can determine when and when not to accept AI-generated information.
  - I can check AI-edited materials with other sources and my own knowledge.
  - I can clearly identify my own unique perspective, experience, and voice in everything that I create.
  - I can use AI for secondary tasks (like formatting and spelling) so I can focus my energy on the core skill.
- **enhanced.** When: Student may use AI **before**, **during, or after the learning process** with instructor-approved uses. / I can:
  - I can use AI to brainstorm, outline, or explain complex concepts and explain how core ideas and created work remain my own.
  - I can clearly explain which parts of my work were generated by my own brain and which parts were assisted by a tool.
  - I can describe the specific instructions I gave AI why I chose those prompts to help my learning.
  - I can explain how AI helped me understand the topic better, rather than just using it to finish the task faster.
  - I can discuss any part of my work in detail, showing that I fully understand the material regardless of the tools I used.

> The doc's table layout makes the "I can" column mapping ambiguous (the export shifts rows).
> The mapping above follows reading order per column. **Verify it against the rendered doc
> during build**, since wording is verbatim and the admin can fix placement in the modal.
> Typos in the source ("instructions I gave AI why I chose") are kept verbatim by decision.

### 2.4 Allowed & Disallowed tasks (Dept. Specific AIRU Scale)

Five groups from the doc. The export drops the group headers, so the proposed headers below
are **placeholders to confirm with the district**:

| group (placeholder)      | tasks (verbatim)                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| Writing                  | Topic/genre selection, Outline, Research, Grammar/ Spell-check, Draft, Feedback, Revise               |
| Projects & presentations | Brainstorm, Plan, Research, Creation, Feedback, Speech or discussion preparation, Slide creation      |
| Learning support         | Explain a topic, Tutor, Give examples/ non-examples, Review, Level text, Summarize reading, Translate |
| Organization             | Break down tasks, Timeline development, Organize & Summarize notes                                    |
| Creative / media         | Idea generation, Image generation, Media generation (audio, slides, music, video, etc)                |

Admin note from the doc, shown as helper text in the teacher picker: _"Please keep in mind that
if you only tell students what they can't do, they won't know what they can do."_

### 2.5 Key Terminology bank

Header: **Use AI as a Strategic Scaffold · Discerning Judgement · Practice Attribution**.

Terms (verbatim): Prompt, Context (engineering), Iterate, Character consistency, Steer, Tasks
(individual steps), Phases (groups of tasks), Attribution, Transparency, Bias, Generic, Align,
Outcome, Mock up & prototype.

Draft grade 3-12 definitions (**district review required before the flag opens**; admin-editable):

| Term                     | Draft definition                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Prompt                   | The instructions or question you type to tell AI what you want.                                                         |
| Context (engineering)    | The background information you give AI (who it's for, the goal, examples) so its answer fits your situation.            |
| Iterate                  | To try, look at the result, and improve your prompt or work again and again.                                            |
| Character consistency    | Keeping a character, style, or voice the same every time AI creates something new.                                      |
| Steer                    | To guide AI toward what you want by adding details, corrections, or limits.                                             |
| Tasks (individual steps) | The small single steps a bigger job is broken into.                                                                     |
| Phases (groups of tasks) | Groups of related steps that together finish one part of a project.                                                     |
| Attribution              | Saying clearly which parts of your work AI helped with and how.                                                         |
| Transparency             | Being open and honest about how you used AI.                                                                            |
| Bias                     | When AI's answers unfairly favor or leave out certain people, ideas, or viewpoints because of the data it learned from. |
| Generic                  | Plain, predictable, "could be about anything" output that lacks your own ideas or voice.                                |
| Align                    | To check that the AI output matches your goal, your assignment, and your values.                                        |
| Outcome                  | The final result you are trying to create or reach.                                                                     |
| Mock up & prototype      | A rough early version of an idea used to test and improve it before making the final product.                           |

### 2.6 Metacognitive question bank ("Important Questions to Ask Myself:")

Five phases; colors from the posters.

1. **Intent & Goal Setting (Before You Prompt)** (gold `#B8900A`)
   - What specific task am I asking AI to support, and why? Am I seeking brainstorming, structural feedback, or technical assistance? _(no label)_
   - **Value-Add:** What unique perspective, emotion, or core direction do I need to supply before inviting AI into the process?
   - **Tool Fit:** Is generative AI the best partner for this step, or would sketching on paper, searching a library, or talking to a team member yield a better result?
2. **Prompt Strategy & Iteration (During Interactivity)** (purple `#8C7DBE`)
   - **Pre-Steering:** What generic tropes or clichés will AI likely default to, and how can I write my prompt to avoid them?
   - **Coaching:** Am I treating AI like a search engine or an answer generator, or am I guiding it like a peer in a creative workspace?
   - **Refinement:** How did altering my prompt change the output, and what did that shift teach me about my own request?
3. **Discernment & Critical Evaluation (Analyzing Output)** (purple, shares the poster with 2)
   - **Verification:** Which facts, claims, or citations in this response need independent verification before I rely on them?
   - **Anchoring Check:** Am I favoring this idea simply because AI generated it first, or is it genuinely the strongest option for my project?
   - **Quality Filter:** Where is the output surface-level or predictable, and where does it actually offer a useful spark?
4. **Ownership & Voice (Transforming Output)** (periwinkle `#A9BDEB`)
   - **Voice Alignment:** Does this work sound like an authentic expression of my team's vision, or does it sound like standard machine-generated prose?
   - **Transformation:** What deliberate additions, edits, or human nuances did I make to transform the raw output into a finished product?
   - **Defense:** If challenged on any portion of this work, can I explain the reasoning behind the choice in my own words?
5. **Self-Reflection & Growth (Post-Task)** (teal-gray `#A8C2C4`)
   - **Cognitive Shift:** Did using AI force me to think deeper about my subject, or did it encourage me to switch on "cognitive autopilot"?
   - **Efficiency vs. Depth:** Where did AI save me time, and did that saved time go back into higher-level creative or critical thinking?
   - **Skill Transfer:** What prompt adjustment or evaluation habit worked best today that I should carry into my next collaborative project?

## 3. Architecture

Follow the `new-widget` skill checklist. Two widget types, mirroring `blooms-taxonomy` / `blooms-detail`:

- `ai-responsible-use`: the main widget (in the tray).
- `ai-responsible-use-card`: a read-only spawned card (hidden from the tray like `blooms-detail`, see `config/tools.ts:75`).

### 3.1 Types (`types.ts`)

```ts
type AiScalePresetId = 'ops-4' | 'oms-3';
type AiLevelId = 'free' | 'assisted' | 'enhanced' | 'empowered';
type AiTaskMark = 'allowed' | 'disallowed';

interface AiResponsibleUseConfig {
  view: 'today' | 'scale' | 'terms' | 'questions'; // tabs; 'today'/'scale' are the two scale modes
  activeLevel: AiLevelId | null;
  taskMarks?: Record<string, AiTaskMark>; // taskId -> mark; flag-gated UI
  activityLabel?: string; // "Persuasive essay draft", per board
  customQuestions?: {
    id: string;
    phaseId: string;
    label?: string;
    text: string;
  }[];
  customTerms?: { id: string; term: string; definition?: string }[];
  featuredQuestionId?: string | null;
  rotate?: { enabled: boolean; intervalSec: number; phaseId?: string | null };
}

interface AiResponsibleUseCardConfig {
  parentWidgetId: string;
  kind: 'level' | 'term' | 'question';
  refId: string; // level id, term id, or question id (custom ids included)
  snapshot?: { title: string; body: string; color?: string }; // for custom items
  buildingId?: string;
}

interface AiResponsibleUseGlobalConfig {
  buildingDefaults?: Record<string, AiResponsibleUseBuildingConfig>;
}
interface AiResponsibleUseBuildingConfig {
  preset?: AiScalePresetId; // default 'ops-4'
  levelOverrides?: Partial<Record<AiLevelId, Partial<AiLevelContent>>>;
  showPolicyLine?: boolean;
  taskGroups?: AiTaskGroup[]; // replaces default when present
  terms?: AiTerm[]; // replaces default when present
  questionPhases?: AiQuestionPhase[]; // replaces default when present
  citationStems?: string[]; // Phase 3
}
```

All teacher config keys are **per-board** (content), so nothing is added to
`APPEARANCE_CONFIG_KEYS`.

### 3.2 Content resolution

`utils/aiResponsibleUse.ts` exports `resolveAiContent(buildingConfig)`: preset + overrides give
the effective levels, task groups, terms and phases. It is pure and unit-tested. If the stored
`activeLevel` is not in the resolved preset (e.g. `empowered` on an OMS building), the widget
renders "no level set" rather than crashing.

Building resolution uses `useWidgetBuildingId(widget)` and `featurePermissions` for
`ai-responsible-use`, exactly as `ExpectationsWidget/Widget.tsx` does.

### 3.3 Teacher UI (main widget)

Use `WidgetLayout`. All sizing uses `cqmin` container-query units per `components/widgets/CLAUDE.md`.

- **Today's Level** (default view): the active level's color header, icon, title and subtitle,
  plus the student-facing value (`studentValue` for OPS, `when` for OMS) and the expectation.
  Large and legible from the back of the room. Empty state: a row of level buttons,
  "Set today's AI level".
  - Optional `activityLabel` line ("For: Persuasive essay draft").
  - OMS preset: an "I can…" list under the level, collapsible.
  - **Task list (flag `ai-use-task-list`)**: ✅ Allowed / ❌ Not allowed chips from
    `taskMarks`. Only marked tasks show. Allowed tasks are listed first (per the doc's note).
- **Full Scale**: all 3-4 columns (poster), active column outlined (yellow outline as in the
  district screenshot); the rest are dimmed but readable. Click a column to set it active.
  Optional policy footer.
- **Terms**: the three-pillar header plus a grid of term chips. Clicking one expands its definition inline.
  "Pin to board" spawns a `term` card. Teacher-added terms show a small "yours" marker.
- **Questions**: phase filter pills (colored); the list is grouped by phase. Actions:
  ★ feature (shows the question big, at the top of the tab), 🎲 random (within the
  filtered phase), rotate toggle (interval 30s–10min), "Pin to board" spawns a `question` card.
  Teacher "+ Add question" (per board, with a phase and optional label).
- Front-face level switcher: a small segmented control in the header, so the level can be
  changed without opening settings.

Rotation uses one `setInterval` in an effect (a timer is an external system) that advances
`featuredQuestionId`. It writes through `updateWidget` no more than once per interval, and
only while the widget is mounted and `rotate.enabled`.

### 3.4 Settings panel (`settingsFields.tsx`, drawer schema)

- Active level, activity label, default tab.
- Task picker (flag-gated): group accordions, each task a three-state control
  (unset / allowed / disallowed), with the doc's "tell them what they can do" hint.
- Custom terms / questions editors (per board).
- Rotation interval.
- No wording edits here; district text is admin-only.

### 3.5 Spawned card (`ai-responsible-use-card`)

Read-only card that resolves its content live from the building config via `refId` (so admin
wording updates flow through), falling back to `snapshot` for teacher-custom items or when the
id no longer resolves. It uses the phase/level color as its background. Its default size is
large text, since it's meant to sit on the board while students work. It is spawned with
`addWidget('ai-responsible-use-card', …)` like `BloomsTaxonomy/Widget.tsx:133`.

### 3.6 Admin config (`admin-widget-config` skill)

`components/admin/AiResponsibleUseConfigurationModal.tsx`, modeled on
`BloomsTaxonomyConfigurationModal.tsx`. It has a building selector plus these tabs:

1. **Scale:** preset radio (OPS 4-level / OMS 3-level), per-level text fields prefilled with
   the verbatim defaults, "Reset to district wording" per field, and a policy-line toggle.
2. **Tasks:** edit groups and tasks (add, rename, reorder, remove).
3. **Terms:** edit terms and definitions.
4. **Questions:** edit phases (title, subtitle, color) and questions (label, text).

It is stored at `feature_permissions/ai-responsible-use.config`. No rules change is needed,
because the existing `feature_permissions` rules already cover admin writes and user reads
(confirm in `firestore.rules` at build time).

### 3.7 Registration checklist

`types.ts` (`WidgetType`, config union, conditional config map), `config/tools.ts` (card
hidden), `config/widgetDefaults.ts`, `config/widgetGradeLevels.ts` (3-12 bands),
`components/widgets/WidgetRegistry.ts`, `components/admin/Analytics/widgetLabels.ts`,
`FeaturePermissionsManager` (config button), tray keywords (`ai`, `responsible use`,
`academic integrity`, `metacognition`, `ai literacy`, `citation`). Add tour anchors only if
they are needed; register them in `config/tourAnchors.ts`.

## 4. Nexus connections

### 4.1 Expectations widget "AI" row (Phase 2)

- `ExpectationsConfig.aiLevel?: AiLevelId | null` (per board).
- `ExpectationsBuildingConfig.showAi?: boolean` (default **false** so existing buildings don't change).
- Options come from `resolveAiContent(<AI widget building config>)`, so labels and colors match
  the district scale and OMS buildings show 3 levels.
- In the Expectations admin panel, an "AI Use" category toggle.
- **Linking:** if an `ai-responsible-use` widget is on the same board, setting the level in
  either widget updates both. Both writes go through `updateWidget` in the click handler (no
  sync effect), found via the board's widget list from `DashboardActionsContext`. Linking is
  one-hop and only happens on a user action.
- Gate: global feature `ai-use-expectations-row`.

### 4.2 Building-assignable citation stems (Phase 3)

- `AiResponsibleUseBuildingConfig.citationStems` is admin-edited per building. Defaults:
  - "I used AI to **_ by prompting _**."
  - "AI helped me with **_; the ideas and final decisions were my own because _**."
  - "I checked the AI's information by \_\_\_."
  - "I changed the AI's output by \_\_\_ so that it sounds like me."
  - "I did not use AI for **_ because _**."
- The main widget has a **Citation** strip under Today's Level (Enhanced/Empowered by default,
  admin-configurable) with a "Send to Syntax Framer" / "Send to Talking Tool" action that
  spawns a pre-filled widget with `addWidget`.
- Talking Tool also gets an **"AI Attribution"** category sourced from the same building stems,
  so buildings that don't use the AI widget can still assign them. It is appended in the
  Talking Tool resolver when the building's `citationStems` exist and the flag is on.
- Gate: global feature `ai-use-citation-stems`.

### 4.3 Out of scope (recorded so they aren't re-litigated)

- **Assignment AI tag** (Quiz / Video Activity / Guided Learning / Mini App plus student apps
  and rules): large; revisit after v1 is used.
- **Schedule auto-level:** revisit after v1.
- Student-app scale popover, 5 tips, Recommended Tools, and AI generation: declined for now.

## 5. Flags & rollout (per CLAUDE.md "Releasing a feature")

| Gate                             | Kind                                                                              | Starting level | Covers                                                                |
| -------------------------------- | --------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------- |
| `ai-responsible-use` (+ `-card`) | `feature_permissions` widget                                                      | `admin`        | Widget in tray                                                        |
| `ai-use-task-list`               | `GlobalFeature` (`FEATURE_DEFAULTS`: admin / enabled / `missingDocPublic: false`) | `admin`        | Allowed/Disallowed tasks, which can stay admin after the widget opens |
| `ai-use-expectations-row`        | `GlobalFeature`                                                                   | `admin`        | Expectations AI row                                                   |
| `ai-use-citation-stems`          | `GlobalFeature`                                                                   | `admin`        | Citation strip + Talking Tool category                                |

The admin path for opening them is Admin Settings > Access > Feature Permissions
(widget) / Global Settings (features) > Public. Paul flips it after prod testing, and agents
never do. Admins always pass these gates, so "on for Paul" means all `/admins`. The changelog
entry is written when the widget flag opens, without naming flags.

## 6. Phases & PRs

1. **PR 1: Content + core widget.** Content module (§2), types, `resolveAiContent` plus tests,
   main widget (Today / Scale / Terms / Questions tabs, feature/random/rotate, custom per-board
   items), spawned card, registration, and the admin modal (Scale / Terms / Questions tabs).
   Also includes the task-list data model, admin Tasks tab and teacher UI behind `ai-use-task-list`.
2. **PR 2: Expectations AI row** (§4.1).
3. **PR 3: Citation stems** (§4.2).

Each PR is verified on https://spartboard-dev.web.app with the admin config seeded on a dev
building.

## 7. Tests

- `utils/aiResponsibleUse.test.ts`: preset resolution, overrides, reset, a stale `empowered`
  level on OMS, and replace-vs-merge for terms and phases.
- A content snapshot test asserting the verbatim strings (guards against accidental rewording).
- Widget tests: set a level from the empty state, switch views, feature/random a question,
  pin to board calls `addWidget` with the card config, custom question round-trip, task list
  hidden when the flag is off.
- Admin modal test (pattern: `BloomsTaxonomyConfigurationModal.test.tsx`).
- Expectations: AI row hidden by default, shows the resolved preset levels, and linked update.
- Talking Tool: AI Attribution category appears only with the flag and building stems.
- `tests/tourAnchors.test.ts` if anchors are added. `pnpm run test:counts` baseline bump.

## 8. Open items for the district / Paul

1. Confirm the five task-group headers (§2.4); the doc export dropped them.
2. Confirm the OMS "I can" column mapping (§2.3).
3. Approve the term definitions (§2.5) and the default citation stems (§4.2).
4. Sample the exact column colors from the district graphic.
5. Decide whether the OMS preset should also be offered to 6-12 buildings or only OMS.
