# Web tours get their own page, opened from the extension

Web tours are managed on a standalone admin page in SpartBoard (`/web-tours`, with no board), reached from a Manage tours button in the extension's side panel. They are no longer managed inside the Guided Learning library. Paul wanted Web tours to feel like a separate tool for his team, ideally living fully in the extension. That would take about eight new bearer-token endpoints and moving a roughly 9,000-line editor off the Firebase SDK and app contexts. It would also break the rule that the extension never touches Firestore ([CHROME_EXTENSION.md](../plans/CHROME_EXTENSION.md) D3). A separate page opened from the extension gives the same feel by moving the editor rather than rewriting it.

## Consequences

- The extension stays free of Firebase. Recording still hands off through the quiet intake tab, which now opens the new page.
- Moving everything into the extension later stays possible, and this page is the piece to replace.
