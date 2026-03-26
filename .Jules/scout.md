## 2024-10-24 - TextWidget handleInput and handleFocus test coverage

**Gap:** The TextWidget's `onInput` (debounced write) and `onFocus` (placeholder clearing) logic were fully functional but lacked unit testing and were showing missing branch logic (lines 35-36, 53-56) in Vitest coverage.
**Fix:** Expanded test coverage in `components/widgets/TextWidget.test.tsx` to directly interact with the `contentEditable` div (`fireEvent.input`, `fireEvent.focus`) across focus and multiple input scenarios using `innerHTML` updates and validated that `updateWidget` correctly persists state, bringing coverage back toward 100%.

## 2024-10-25 - Avoid forcing branch coverage on React defensive idioms

**Gap:** While increasing coverage in `TextWidget.tsx`, lines 44 and 62 (defensive null checks for `editorRef.current`) remained uncovered because the ref is unconditionally rendered and thus never null during those effects in standard execution.
**Fix:** Instead of using brittle anti-patterns (like spying on `useRef` or reading internal `__reactProps`) to force 100% branch coverage, I left the defensive checks uncovered and focused strictly on behavioral tests for external content updates, ensuring tests test the "what" and not the "how".

## 2026-03-15 - ClassesWidget branch coverage gaps

**Gap:** Lines testing classLinkLoading conditional className, and confirmDeleteId conditional exist but are difficult to safely test without bad mock leaking or anti-patterns since React naturally prevents the negative case (button renders only when id exists).
**Fix:** Accepted slightly less than 100% (95%) on branch coverage for these defensive idioms to avoid writing brittle tests that test implementation details.

## 2026-03-20 - SeatingChart Widget Tests

**Gap:** Multi-select pointer events dropping and failing to update selectedIds in JSDOM.
**Fix:** Wait for state updates with await screen.findByText and mock microtask delays, and use mockClear before executing final target function testing.

## 2026-03-21 - Testing disabled button click handlers safely

**Gap:** Trying to hit a fallback `if (!someDep) { toast(); return; }` inside a custom `<Button>`'s `onClick` handler via React Testing Library failed because RTL strictly enforces that `disabled` elements do not emit click events.
**Fix:** Since the logic wasn't tightly coupled to the DOM implementation (it was testing a fallback logic branch directly within the component's setup), I temporarily modified the wrapper `data-testid` element's underlying DOM `disabled` attribute (`removeAttribute('disabled')`) and updated its pointer-events styling so the event could be triggered, keeping the test contained without exporting internal functions just for testing.

## 2026-03-24 - Mocking ES6 Classes in Vitest Hooks

**Gap:** The tests for `useGoogleDrive` failed with 'is not a constructor' when mocking `GoogleDriveService` as a function that returns an object, because the hook invokes it with `new`.
**Fix:** Modified the `vi.mock` factory to return an actual inline ES6 `class` definition that initializes the required mock methods, correctly simulating class instantiation.

## 2026-03-26 - Testing Window Location Reload in React Testing Library

**Gap:** Tests needing to verify `window.location.reload` calling frequently fail because `window.location` is read-only in JSDOM environments. Trying to mock `reload` by deleting `location` (`delete window.location`) or assigning it as `any` causes TypeScript and ESLint type-safety errors and can't be safely restored without `Object.defineProperty`.
**Fix:** Use `Object.defineProperty` to safely redefine `window.location` for the duration of the test, and mock the `reload` function correctly.
