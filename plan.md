Great! I will copy the time parsing logic and build `handleStartTimer` in `CalendarWidget.tsx`.

1. **Add Time Parsing Utilities in `CalendarWidget.tsx`**:

```typescript
const parseTimeSeconds = (t: string | undefined): number => {
  if (!t || !t.includes(':')) return -1;
  const parts = t.split(':');
  let h = parseInt(parts[0], 10);
  const mStr = parts[1].replace(/[^0-9]/g, '');
  let m = parseInt(mStr, 10);

  const isPM = t.toLowerCase().includes('pm');
  const isAM = t.toLowerCase().includes('am');

  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;

  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return -1;
  return h * 3600 + m * 60;
};
```

2. **Add `handleStartTimer` inside `CalendarWidget`**:

```typescript
const handleStartTimer = useCallback(
  (event: CalendarEvent) => {
    if (!event.time) return;

    const startSeconds = parseTimeSeconds(event.time);
    if (startSeconds < 0) return;

    const now = new Date();
    const nowSeconds =
      now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    const remainingSeconds = Math.max(0, startSeconds - nowSeconds);
    if (remainingSeconds === 0) return; // Event already started

    const spawnNow = Date.now();

    addWidget('time-tool', {
      x: widget.x + widget.w + 20,
      y: widget.y,
      config: {
        mode: 'timer',
        visualType: 'digital',
        duration: remainingSeconds,
        elapsedTime: remainingSeconds,
        isRunning: true,
        startTime: spawnNow,
        selectedSound: 'Gong',
      },
    });
  },
  [addWidget, widget.x, widget.y, widget.w]
);
```

3. **Add Button in `displayEvents.map`**:

```tsx
// ... existing code inside map ...
const isToday = event.date === today;
let canStartTimer = false;
if (isToday && event.time) {
  const startSeconds = parseTimeSeconds(event.time);
  const now = new Date();
  const nowSeconds =
    now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  canStartTimer = startSeconds > nowSeconds;
}

// then inside the event row, render the button if `canStartTimer`:
<div className="...">
  // existing rendering
  {canStartTimer && (
    <button
      onClick={() => handleStartTimer(event)}
      className="text-slate-400 hover:text-indigo-500 transition-colors"
      title="Start countdown to event"
    >
      <Timer className="w-4 h-4" />
    </button>
  )}
</div>;
```

4. Add `Timer` to imports from `lucide-react`.

5. Provide plan for review.
