I'd like to create a 'Next Up' widget that has a student-facing interface that they would access via a single delegated shared device.

I'm aiming for a system kind of like the "take a number" system at the DMV. As I wrap up this unit, there will be several days where students are working but can also see me for feedback. Typically this results in a long line of students who are waiting to meet with me, leading to wasted time for them and off-task behavior. What I'd love is a way for them to take a number (metaphorically or literally I guess but they would need a way to remember their number. Maybe they enter their name? But it cannot save to firestore - it would have to save to the user's drive), and then for numbers or names depending on the logic to be posted on the teacher's board. As I finish up with a student, I should be able to click next up and it'll scroll so that I can see "Currently helping: _" and "Next Up: _" and maybe even a couple more below grayed out or something.

Initial plan:

Looking at types.ts, the application already uses a pattern for this with the ClassRosterMeta and ClassRoster interfaces: Firestore stores a driveFileId, and the actual student names are loaded directly from the user's Google Drive. We can use this exact hybrid approach for the "Next Up" widget.

Here is the architectural plan and code mockup for your new widget.

1. Architecture & Data Flow
   To achieve real-time updates without putting names in Firestore, we will use a hybrid storage pattern:

Google Drive (GoogleDriveService): Stores a JSON file containing the actual queue (e.g., [{ id: 1, name: "Sarah", status: "waiting" }]).

Firestore (Widget Config): Stores the driveFileId and a lastUpdated timestamp.

The Shared Device (Kiosk): The teacher leaves a device logged in but sets the widget to "Kiosk Mode." When a student types their name, the widget updates the Drive file and then updates the Firestore lastUpdated timestamp.

The Teacher Board: The Firestore timestamp change triggers a real-time listener, prompting the teacher's board to re-fetch the latest names from Drive.

2. Type Definitions (types.ts)
   First, we need to register the new widget type and its configuration.

TypeScript
// Add to WidgetType union
export type WidgetType =
| 'clock'
// ... existing widgets ...
| 'nextUp';

// Define the Next Up widget config
export interface NextUpConfig {
viewMode: 'teacher' | 'kiosk'; // Determines which UI to show
driveFileId: string | null; // Points to the JSON file in Drive
lastUpdated: number; // Ephemeral timestamp to trigger real-time syncs
}

// Add to ConfigForWidget and WidgetConfig unions
export type WidgetConfig =
// ... existing configs ...
| NextUpConfig;

// Data structure to be saved IN GOOGLE DRIVE (Not Firestore)
export interface NextUpQueueItem {
id: string;
name: string;
status: 'waiting' | 'active' | 'done';
joinedAt: number;
} 3. The Widget Mockup (NextUpWidget.tsx)
This component utilizes the standardized WidgetLayout object and uses Tailwind CSS for the UI. It conditionally renders the Teacher view or the Kiosk view based on config.viewMode.

TypeScript
import React, { useState, useEffect } from 'react';
import { WidgetComponentProps, NextUpConfig, WidgetLayout, NextUpQueueItem } from '@/types';
import { useGoogleDrive } from '@/hooks/useGoogleDrive'; // Assuming standard hook location
import { useFirestore } from '@/hooks/useFirestore';

export const NextUpWidget = ({ widget }: WidgetComponentProps) => {
const config = widget.config as NextUpConfig;
const { downloadFile, updateFileContent } = useGoogleDrive();
const { updateWidgetConfig } = useFirestore(); // Mocked hook to update Firestore

const [queue, setQueue] = useState<NextUpQueueItem[]>([]);
const [studentName, setStudentName] = useState('');

// Re-fetch from Drive whenever the Firestore lastUpdated timestamp changes
useEffect(() => {
if (config.driveFileId) {
downloadFile(config.driveFileId)
.then(blob => blob.text())
.then(text => setQueue(JSON.parse(text)))
.catch(console.error);
}
}, [config.driveFileId, config.lastUpdated]);

// Handle a student joining the queue (Kiosk Mode)
const handleJoinQueue = async () => {
if (!studentName.trim() || !config.driveFileId) return;

    const newItem: NextUpQueueItem = {
      id: crypto.randomUUID(),
      name: studentName,
      status: 'waiting',
      joinedAt: Date.now()
    };

    const updatedQueue = [...queue, newItem];
    setQueue(updatedQueue);
    setStudentName('');

    // 1. Save names to Google Drive (PII Safe)
    const blob = new Blob([JSON.stringify(updatedQueue)], { type: 'application/json' });
    await updateFileContent(config.driveFileId, blob);

    // 2. Ping Firestore to tell the teacher board to update (Real-time trigger)
    await updateWidgetConfig(widget.id, { lastUpdated: Date.now() });

};

// Handle teacher moving to the next student (Teacher Mode)
const handleNextStudent = async () => {
if (!config.driveFileId) return;

    let updatedQueue = [...queue];
    // Mark current active as done
    const activeIndex = updatedQueue.findIndex(q => q.status === 'active');
    if (activeIndex !== -1) updatedQueue[activeIndex].status = 'done';

    // Make the next waiting student active
    const nextIndex = updatedQueue.findIndex(q => q.status === 'waiting');
    if (nextIndex !== -1) updatedQueue[nextIndex].status = 'active';

    setQueue(updatedQueue);

    // Save to Drive and ping Firestore
    const blob = new Blob([JSON.stringify(updatedQueue)], { type: 'application/json' });
    await updateFileContent(config.driveFileId, blob);
    await updateWidgetConfig(widget.id, { lastUpdated: Date.now() });

};

// --- RENDER KIOSK VIEW ---
if (config.viewMode === 'kiosk') {
return {
content: (

<div className="flex flex-col items-center justify-center h-full p-6 bg-slate-50">
<h2 className="text-3xl font-bold text-slate-800 mb-6">Take a Number</h2>
<input
type="text"
placeholder="Enter your first name..."
className="w-full max-w-md p-4 text-2xl border-2 border-slate-300 rounded-xl mb-4 text-center"
value={studentName}
onChange={(e) => setStudentName(e.target.value)}
/>
<button 
            onClick={handleJoinQueue}
            className="px-8 py-4 bg-blue-500 text-white text-2xl font-bold rounded-xl shadow-md hover:bg-blue-600 transition-colors"
          >
Get in Line
</button>
</div>
)
} as WidgetLayout;
}

// --- RENDER TEACHER VIEW ---
const activeStudent = queue.find(q => q.status === 'active');
const waitingStudents = queue.filter(q => q.status === 'waiting');

return {
header: (

<div className="flex justify-between items-center bg-slate-800 text-white p-3 rounded-t-xl">
<h3 className="font-bold text-lg">Next Up</h3>
<button 
          onClick={handleNextStudent}
          className="bg-green-500 hover:bg-green-600 px-4 py-1 rounded-md font-bold transition-colors"
        >
Next
</button>
</div>
),
content: (
<div className="flex flex-col h-full p-4 overflow-y-auto">
{/_ Currently Helping _/}
<div className="mb-6 p-4 bg-green-100 border-2 border-green-400 rounded-xl text-center">
<p className="text-sm text-green-700 uppercase font-bold tracking-wider mb-1">Currently Helping</p>
<p className="text-3xl font-extrabold text-green-900">
{activeStudent ? activeStudent.name : "Available"}
</p>
</div>

        {/* Queue */}
        <div className="flex-1">
          <p className="text-sm text-slate-500 font-bold uppercase tracking-wider mb-2">Waiting Line</p>
          {waitingStudents.length === 0 ? (
            <p className="text-slate-400 text-center italic mt-4">Queue is empty</p>
          ) : (
            <ul className="space-y-2">
              {waitingStudents.map((student, idx) => (
                <li key={student.id} className="flex items-center p-3 bg-slate-100 rounded-lg">
                  <span className="w-8 h-8 flex items-center justify-center bg-slate-300 text-slate-700 font-bold rounded-full mr-3">
                    {idx + 1}
                  </span>
                  <span className="text-lg font-medium text-slate-700">{student.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )

} as WidgetLayout;
}; 4. Registry Integration (WidgetRegistry.ts)
Finally, we register the component and define its default scaling behavior.

TypeScript
export const WIDGET_COMPONENTS: Partial<Record<WidgetType, WidgetComponent>> = {
// ... existing
nextUp: lazyNamed(() => import('./NextUpWidget'), 'NextUpWidget'),
};

export const WIDGET_SCALING_CONFIG: Record<WidgetType, ScalingConfig> = {
// ... existing
nextUp: {
baseWidth: 350,
baseHeight: 500,
canSpread: true,
skipScaling: true, // Uses native CSS container layouts for responsiveness
padding: 0,
},
};
This design keeps the app secure and compliant with PII rules, while giving me an elegant, real-time "Take a number" system for the classroom.
