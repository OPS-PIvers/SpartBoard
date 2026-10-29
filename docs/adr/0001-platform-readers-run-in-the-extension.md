# Platform readers run in the extension, not through site APIs

Platform readers (Schoology, Google Forms, Quizlet, Edpuzzle and the rest in `docs/plans/IMPORT.md`) read the page the teacher is already signed in to, inside the Chrome extension, when the teacher clicks Send to SpartBoard. We chose this over each site's API or a server-side fetch because most of these sites have no API that returns their content (Schoology's REST API can't read quiz questions, probed 2026-10-29), many sit behind SSO or block Google Cloud addresses, and an API route would need a new OAuth grant or district key per site.

## Consequences

- A reader breaks when its site redesigns, so every reader falls back to the generic page read with AI Conversion and logs the failure for admins.
- Teachers without the extension get only files, pasted URLs (server fetch of public pages) and paste.
- The extension can see any page, so an admin-curated Send block list refuses student-data pages and hides the button there.
