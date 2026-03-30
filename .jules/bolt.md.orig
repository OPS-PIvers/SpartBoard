## 2025-02-23 - Memoizing Context Dependencies

**Learning:** Functions created in the body of a component (like `handleDragStart`, `handleDragEnd`, and `customCollisionDetection`) change references on every render. If these functions are passed into complex context providers like `DndContext`, they can trigger deep re-renders of the entire drag-and-drop tree and all child components even if other props remain unchanged.
**Action:** When implementing complex interaction wrappers (like `@dnd-kit/core` contexts), always use `useCallback` on the event handlers passed to them to preserve stable object references and prevent unnecessary cascading re-renders.

## 2025-02-26 - State Update Deep Equality Overheads

**Learning:** Using `JSON.stringify` inside a state updater (like `setStudents`) as a mechanism to check deep equality for preventing re-renders acts as a hidden performance bottleneck. During high-frequency updates (e.g., Firestore `onSnapshot` inside a live session), the serialization runs twice per snapshot and blocks the main thread synchronously, scaling poorly with array size.
**Action:** When evaluating arrays of flat data objects, use a manual direct property comparison loop instead of `JSON.stringify` to bail out of state updates much faster.

## 2025-02-27 - Unconditional Serialization in Render Loop

**Learning:** Evaluating `JSON.stringify` inside a `useMemo` block that lacks an adequate conditional guard can cause severe performance degradation during high-frequency events (like dragging or resizing widgets). If the object reference changes on every frame, the `useMemo` cache is bypassed, forcing synchronous string serialization on the main thread even when the output is ultimately discarded or unused (e.g., when not in a live session).
**Action:** When using `useMemo` to serialize configuration objects for debounced sync or comparison, ensure the logic includes an early exit condition (like `isLive ? JSON.stringify(...) : null`) and adds that condition to the dependency array.

## 2025-02-28 - Unnecessary Multiple Array Passes During Render

**Learning:** When computing summary data (like counts or expression parts) and grouped display data (like rectangles or lists) from an array in a React component, doing multiple consecutive `.filter()` or `.map()` calls can lead to `O(N*M)` or higher complexity. This can cause significant main thread blocking on each re-render, especially during rapid state updates (like drag-and-drop or continuous tile additions).
**Action:** Consolidate multiple passes into a single grouping loop inside a `useMemo` block. Gather counts, generate derived strings (like expressions), and build UI representations (like grouped rectangles) in one go, caching the results against the dependency array. This reduces complexity back down to O(N) and prevents layout thrashing.

## 2025-02-18 - NextUp Render Optimization

**Learning:** Found an inline array filtering (`.filter(...).length`) executed directly inside a render function inside `NextUp/Widget.tsx`. This causes an O(N) operation on every single re-render unnecessarily, degrading performance on high-frequency update components.
**Action:** Always memoize derived statistics (like waiting counts from a queue) using `useMemo` and an O(N) `reduce` single-pass, avoiding both render-time iteration and intermediate array allocations just for counting lengths.
