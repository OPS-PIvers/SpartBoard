# Plan: 'Next Up' Queue Widget

I'd like to create a 'Next Up' widget that has a student-facing interface that they would access via a dedicated live link.

I'm aiming for a system kind of like the "take a number" system at the DMV. As I wrap up this unit, there will be several days where students are working but can also see me for feedback. Typically this results in a long line of students who are waiting to meet with me, leading to wasted time for them and off-task behavior. What I'd love is a way for them to enter their name via a live URL (accessible on their own devices or a shared classroom iPad), and then for those names to be posted on the teacher's board. As I finish up with a student, I should be able to click next up and it'll scroll so that I can see "Currently helping: _" and "Next Up: _" and maybe even a couple more below.

## 1. Architecture & Data Flow

To achieve real-time updates without putting student names in Firestore, we will use the established hybrid storage pattern:

1.  **Google Drive (`GoogleDriveService`)**: Stores multiple named JSON files in a `SPART Board/NextUp/` subfolder. Each file contains a queue array (PII-sensitive).
2.  **Firestore (Widget Config)**: Stores the `activeDriveFileId`, `sessionName`, `isActive` flag, `createdAt` timestamp, and a `lastUpdated` sync trigger.
3.  **Student Live Link**: Students access `/nextup?id=[widgetId]`.
    - If `isActive` is false OR the `createdAt` date is not today, students see a "Queue is not currently active" message.
    - If active, submissions update the Drive file and ping Firestore.
4.  **The Teacher Board**: Triggers a re-fetch from Drive on any config change. Includes an **auto-expiry check** that deactivates the session if it's from a previous day.

## 2. Type Definitions (`types.ts`)

```typescript
// Add to WidgetType union
export type WidgetType =
  | 'clock'
  // ...
  | 'nextUp';

// Define the Next Up widget config
export interface NextUpConfig {
  activeDriveFileId: string | null;
  sessionName: string | null;
  isActive: boolean;
  createdAt: number; // Used for midnight auto-expiry
  lastUpdated: number;
  displayCount: number;
  styling: {
    fontFamily: string;
    themeColor: string;
    animation: 'slide' | 'fade' | 'none';
  };
}

// Global config for building defaults
export interface NextUpGlobalConfig {
  buildingDefaults: Record<
    string,
    {
      displayCount: number;
      fontFamily: string;
      themeColor: string;
    }
  >;
}

// Add to ConfigForWidget and WidgetConfig unions
export type WidgetConfig =
  // ...
  NextUpConfig;

// Data structure to be saved IN GOOGLE DRIVE (Not Firestore)
export interface NextUpQueueItem {
  id: string;
  name: string;
  status: 'waiting' | 'active' | 'done';
  joinedAt: number;
}
```

## 3. The Widget Implementation (`components/widgets/NextUpWidget.tsx`)

- **Teacher View**: Displays "Currently Helping" and the next X students based on `displayCount`.
- **Advance Control**: "Next" button moves the status of items in the Drive file.
- **Reset Action**: A "Reset" button (available during active sessions) that clears the current list in Drive without ending the session.
- **Expiry Logic**: On mount, if `isActive` is true but `createdAt` is not today, it calls `updateWidget` to set `isActive: false`.

## 4. Widget Settings Pane (`NextUpSettings`)

- **Session Controls**:
  - **Start Button**: "Create New" (enter title) or "Load Existing". Sets `isActive: true`, `createdAt: Date.now()`.
  - **End Button**: Sets `isActive: false`. (Progress is already auto-saved to Drive).
- **Display Settings**:
  - **Display Count**: 1-10 names.
  - **Styling**: Typeface (Lexend, Patrick Hand, etc.), Theme Color, and Animations.
- **Live Link**: Copyable student URL (`/nextup?id=...`).

## 5. Global Administration (`components/admin/NextUpConfigurationPanel.tsx`)

- Admin users set the default `displayCount`, `fontFamily`, and `themeColor` for each building.

## 6. Student Interface (`components/student/NextUpStudentApp.tsx`)

- Standalone route at `/nextup`.
- Displays a "Session Expired" or "Inactive" screen if the Firestore `isActive` is false or the date is stale.
- Real-time name submission directly to the teacher's Drive file.

## 7. Configuration & Integration

### `config/widgetDefaults.ts`

```typescript
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
      animation: 'slide'
    }
  }
},
```
