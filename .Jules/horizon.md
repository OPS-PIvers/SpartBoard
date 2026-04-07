# Horizon: AI-Powered Intelligence

Horizon is the intelligence layer of SpartBoard, leveraging Large Language Models (Gemini API) to automate tedious tasks and enhance the teaching experience.

## AI Capabilities

### Magic Layout

**Description:** Generates a full dashboard setup based on a natural language lesson description.
**Implementation:** `generateDashboardLayout` in `utils/ai.ts` sends prompts to a Firebase Function, returning a structured list of widgets and configs.
**UI:** Accessible via the "Cast Spell" button in the Magic Layout Modal (Dock).

### Smart Polls

**Description:** Generates educational multiple-choice questions based on a topic.
**Implementation:** `generatePoll` in `utils/ai.ts` processes topics into questions and 4 distinct options.
**UI:** Integrated into the `PollWidget` settings panel via the `MagicInput` component.

### Smart Paste

**Description:** Automatically detects the best widget type for content pasted from the clipboard.
**Implementation:** `detectWidgetType` in `utils/smartPaste.ts` uses heuristics to identify URLs (Stickers/Embeds/QR) and lists (Checklists).
**UI:** Global paste listener in `Dock.tsx` that triggers widget creation with a success toast.

### Mini-Apps

**Description:** Generates fully functional, single-file HTML/JS interactive tools.
**Implementation:** `generateMiniAppCode` in `utils/ai.ts` handles complex code generation for the `MiniAppWidget`.

## Usage Limits

- **Admins:** Unlimited generations.
- **Teachers:** 20 generations per 24-hour period (enforced via Cloud Functions).
