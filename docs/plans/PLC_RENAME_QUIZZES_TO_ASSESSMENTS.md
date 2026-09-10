# Rename "Quizzes" to "Assessments" in PLC copy

**Status:** outline only, not grilled
**Origin:** lead-teacher feedback 2026-09-09: "I'd rather just rename quizzes as
assessments"; separate quiz and assessment concepts feel like Schoology.
**Depends on:** `docs/plans/PLC_ASSESSMENT_DATA.md` PR 2 (merged Assessments tab)

## Outline

- Scope is user-visible copy only. Code identifiers, collection names, and types keep
  `quiz`.
- Surface: 37 `plcDashboard.*` strings in `locales/en.json` plus de/es/fr mirrors (about
  188 strings), and inline `defaultValue` fallbacks in `PlcQuizzesBody.tsx`,
  `PlcQuizLibraryBody.tsx`, `PlcAssessmentsBody.tsx`, and `PlcSettingsTab.tsx`
  `FEATURE_ROWS`.
- Open questions for the grilling: does the teacher-side Quiz widget rename too (Dock
  label, library title, Assignments Hub) or only the PLC page? Do video activities and
  rubrics stay as kinds under Assessments? What do students see?

## Checklist

- [ ] Grilling session with Paul (`/grill-me`) to settle scope and wording
- [ ] Inventory every user-visible "quiz" string in the chosen scope
- [ ] Update en/de/es/fr and inline fallbacks
- [ ] Help center and changelog
- [ ] i18n tests pass; screenshots of the PLC page in all four locales
