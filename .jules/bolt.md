## 2025-02-23 - Memoizing Context Dependencies

**Learning:** Functions created in the body of a component (like `handleDragStart`, `handleDragEnd`, and `customCollisionDetection`) change references on every render. If these functions are passed into complex context providers like `DndContext`, they can trigger deep re-renders of the entire drag-and-drop tree and all child components even if other props remain unchanged.
**Action:** When implementing complex interaction wrappers (like `@dnd-kit/core` contexts), always use `useCallback` on the event handlers passed to them to preserve stable object references and prevent unnecessary cascading re-renders.

## 2025-02-26 - State Update Deep Equality Overheads

**Learning:** Using `JSON.stringify` inside a state updater (like `setStudents`) as a mechanism to check deep equality for preventing re-renders acts as a hidden performance bottleneck. During high-frequency updates (e.g., Firestore `onSnapshot` inside a live session), the serialization runs twice per snapshot and blocks the main thread synchronously, scaling poorly with array size.
**Action:** When evaluating arrays of flat data objects, use a manual direct property comparison loop instead of `JSON.stringify` to bail out of state updates much faster.
