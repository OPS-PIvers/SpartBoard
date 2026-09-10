# Learning targets and state standards on quiz questions

**Status:** outline only, not grilled
**Origin:** lead-teacher feedback 2026-09-09: tag questions by learning target and/or
import state standards; one standard covers many learning targets in English.
**Depends on:** `docs/plans/PLC_ASSESSMENT_DATA.md` PR 2 (pooled per-question data)

## Outline

- Two levels: teacher-authored learning targets (free text, per PLC or per teacher) and
  imported state standards (a fixed catalog, Minnesota first).
- Tag at question level in the quiz editor; tags travel with synced quizzes.
- Data: pooled view and teacher Results filter and group by target; a target rollup shows
  percent incorrect across every assessment that touches it.
- Open questions: source and licensing of the standards catalog; PLC-owned vs personal
  target lists; several targets per question; whether reassessment pulls by target (see
  `QUIZ_QUESTION_BANKS.md`).

## Checklist

- [ ] Grilling session with Paul (`/grill-me`)
- [ ] Standards catalog source decided and imported
- [ ] Data model for targets on `QuizQuestion` and on synced quizzes
- [ ] Editor tagging UI
- [ ] Results and PLC filters and rollup
- [ ] Tests, help center, changelog
