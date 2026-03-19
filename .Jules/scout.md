## 2024-10-24 - TextWidget handleInput and handleFocus test coverage

**Gap:** The TextWidget's `onInput` (debounced write) and `onFocus` (placeholder clearing) logic were fully functional but lacked unit testing and were showing missing branch logic (lines 35-36, 53-56) in Vitest coverage.
**Fix:** Expanded test coverage in `components/widgets/TextWidget.test.tsx` to directly interact with the `contentEditable` div (`fireEvent.input`, `fireEvent.focus`) across focus and multiple input scenarios using `innerHTML` updates and validated that `updateWidget` correctly persists state, bringing coverage back toward 100%.

## 2024-10-25 - Avoid forcing branch coverage on React defensive idioms

**Gap:** While increasing coverage in `TextWidget.tsx`, lines 44 and 62 (defensive null checks for `editorRef.current`) remained uncovered because the ref is unconditionally rendered and thus never null during those effects in standard execution.
**Fix:** Instead of using brittle anti-patterns (like spying on `useRef` or reading internal `__reactProps`) to force 100% branch coverage, I left the defensive checks uncovered and focused strictly on behavioral tests for external content updates, ensuring tests test the "what" and not the "how".

## 2026-03-15 - ClassesWidget branch coverage gaps\n\n**Gap:** Lines testing classLinkLoading conditional className, and confirmDeleteId conditional exist but are difficult to safely test without bad mock leaking or anti-patterns since React naturally prevents the negative case (button renders only when id exists).\n**Fix:** Accepted slightly less than 100% (95%) on branch coverage for these defensive idioms to avoid writing brittle tests that test implementation details.
