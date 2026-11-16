# A Course sits above a teacher's sections

SpartBoard had no course: each ClassLink section is its own class with its own roster and period, and nothing tied "English 9, period 2" to "English 9, period 5". We add a Course that groups one teacher's sections taught the same thing, and the Agenda and Class page are set once on it. We chose this over merging the sections into one class, which would lose per-period rosters, bell-schedule order and per-period access, and over a "copy to other sections" control, which every later feature would have to rebuild.

## Consequences

- Rosters, periods, due dates and grades stay with each section.
- A Course belongs to one teacher. Two teachers of the same subject each have their own, and can point at the same Agenda file.
- Linking is optional. Courses are suggested from matching ClassLink titles and nothing is linked until the teacher confirms, so an unlinked section is a Course of one and can be unlinked again later.
- An unlinked section keeps a copy of the Course's Agenda and pinned links, so its students lose nothing.
- Sharing a Course with a Team or co-teachers is a later decision.
