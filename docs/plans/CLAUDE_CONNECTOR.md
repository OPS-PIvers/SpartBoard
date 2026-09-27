# Claude connector (remote MCP server)

Teachers in the district's Claude for Teachers organization connect Claude to their own SpartBoard
account and ask it to create or edit flashcards, quizzes and other library content, and to read
class-level result summaries. Target: ready for teacher rollout by late October 2026.

Decisions were settled in a grill-me session on 2026-09-27. Code comments cite them as "CC-D<n>".

## Decisions

| #      | Decision                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CC-D1  | **Own OAuth 2.1 authorization server** in Cloud Functions. The consent page reuses SpartBoard's Google sign-in. Public clients only, PKCE S256 required, Dynamic Client Registration (RFC 7591), protected-resource metadata (RFC 9728).                                                                                                                                     |
| CC-D2  | **No student-level data reaches Claude.** No names, pseudonyms, PINs or per-student rows.                                                                                                                                                                                                                                                                                    |
| CC-D3  | **Class-level aggregates are allowed**: per-question stats for the teacher's own quiz and video-activity sessions, suppressed when a session has fewer than 5 responses.                                                                                                                                                                                                     |
| CC-D4  | **Write scope: create and edit own items.** No delete, assign, launch or share tools.                                                                                                                                                                                                                                                                                        |
| CC-D5  | **Org members only.** Sign-in completes only for an active `organizations/{org}/members/{email}` doc (via the verified email's domain) or a `/admins/{email}` doc. Re-checked on every token refresh.                                                                                                                                                                        |
| CC-D6  | **v1 content types**: flashcards, quizzes, question banks, video activities, rubrics, Activity Wall activities, mini-apps. Boards and Guided Learning come after rollout.                                                                                                                                                                                                    |
| CC-D7  | **Gate: `claude-connector` GlobalFeature**, `stage: 'preview'`, `defaultAccessLevel: 'admin'`, `afterLaunch: 'keep'` (category `integrations`). Checked at consent, at every token refresh, and (cached 60 s) on every MCP request, so it doubles as a kill switch.                                                                                                          |
| CC-D8  | **Two connectors** in the Claude org: "SpartBoard" → `https://spartboard.web.app/mcp`, "SpartBoard (Dev)" → `https://spartboard-dev.web.app/mcp`. Non-admins are rejected by the dev gate.                                                                                                                                                                                   |
| CC-D9  | **Edit safety**: before every Claude edit the prior content is stored in `users/{uid}/claude_revisions` (30-day TTL), every write is logged to `users/{uid}/claude_activity` (30-day TTL), and a `restore_revision` tool undoes an edit. Items carry `claudeCreatedAt` / `claudeEditedAt` so the library can badge them. Drive-backed items also keep Drive's own revisions. |
| CC-D10 | **Connected apps** section in Profile & Settings: when connected, when last used, recent Claude activity, and a Disconnect button that revokes the grant immediately.                                                                                                                                                                                                        |
| CC-D11 | **Aggregate scope**: own quiz and video sessions (`teacherUid == uid`) only. PLC aggregates are out of scope.                                                                                                                                                                                                                                                                |
| CC-D12 | **Companion skill** in `OPS-PIvers/claude-skills` teaching pedagogy and tool etiquette. Tool descriptions carry the hard rules.                                                                                                                                                                                                                                              |
| CC-D13 | **URL**: `/mcp` and the OAuth endpoints are Firebase Hosting rewrites on `spartboard.web.app` / `spartboard-dev.web.app`; consent page at `/connect` on the same origin. The URL must never change (changing it means every teacher reconnects).                                                                                                                             |
| CC-D14 | **Placement**: create tools take an optional `folderId` (a `list_folders` tool lets Claude find one); without it the item goes to the library root.                                                                                                                                                                                                                          |
| CC-D15 | **Admin usage view** comes after rollout; the activity log records everything from day one.                                                                                                                                                                                                                                                                                  |
| CC-D16 | **Near-zero cost** (see Cost below).                                                                                                                                                                                                                                                                                                                                         |

## Architecture

```
Claude ──(Bearer JWT)──▶ spartboard.web.app/mcp ──rewrite──▶ mcpServer (onRequest, stateless Streamable HTTP, JSON responses)
Claude ──DCR / token──▶ spartboard.web.app/oauth/* ─rewrite─▶ mcpOAuth (onRequest, path-routed)
Teacher ─browser──▶ spartboard.web.app/connect (SPA route) ──callable──▶ mcpAuthorizeV1
Teacher ─Profile & Settings > Connected apps──callable──▶ revokeMcpGrantV1
```

### Endpoints (all `https://<host>`, host pinned per project, not taken from the request)

| Path                                          | Handler        | Purpose                                                                                   |
| --------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------- |
| `/mcp`                                        | `mcpServer`    | MCP. Unauthenticated → 401 + `WWW-Authenticate: Bearer resource_metadata="…"`.            |
| `/.well-known/oauth-protected-resource[/mcp]` | `mcpOAuth`     | RFC 9728 metadata; `resource` = `<host>/mcp` exactly.                                     |
| `/.well-known/oauth-authorization-server`     | `mcpOAuth`     | RFC 8414 metadata. `authorization_endpoint` = `<host>/connect`.                           |
| `/oauth/register`                             | `mcpOAuth`     | DCR. Stateless: `client_id` is a signed token carrying the redirect URIs and client name. |
| `/oauth/token`                                | `mcpOAuth`     | `authorization_code` (PKCE) and `refresh_token` grants; form-urlencoded; `invalid_grant`. |
| `/oauth/revoke`                               | `mcpOAuth`     | RFC 7009 revocation of a refresh token.                                                   |
| `/connect`                                    | SPA + callable | Google sign-in, eligibility check, consent, then redirect with `code` + `state`.          |

**Redirect URI allowlist** (checked at registration and again at authorize):
`https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback`, and loopback
`http://localhost:*` / `http://127.0.0.1:*` (Claude Code, MCP Inspector). Any other client is refused,
so the server cannot be used to phish teachers through a third-party app.

### Tokens

- **Access token**: HS256 JWT, 1 hour, `aud` = `<host>/mcp`, claims `sub` (uid), `email`, `gid` (grant id).
  Verified by signature only; grant revocation, the feature gate and admin status are cached 60 s
  per instance.
- **Refresh token**: opaque `<b64url(uid:gid)>.<secret>`; only a SHA-256 hash is stored on
  `users/{uid}/mcp_grants/{gid}`. Rotated on every use. Replaying the previous token within 60 s
  (a client retry) rotates again; replaying it later revokes the grant. Expires after 30 days
  without a refresh.
- **Authorization code**: 5 minutes, single use, stored by hash in `mcp_oauth_codes/{hash}` (TTL).
- **Signing key**: 32 random bytes generated on first use into the server-only doc
  `mcp_oauth/keys`. A Secret Manager secret was rejected because a `defineSecret` missing from
  `spartboard-dev` fails every dev deploy until someone sets it by hand.

### Firestore

| Path                                    | Written by | Client access | Notes                                |
| --------------------------------------- | ---------- | ------------- | ------------------------------------ |
| `mcp_oauth/keys`                        | server     | none          | signing key                          |
| `mcp_oauth_codes/{hash}`                | server     | none          | TTL `expireAt`                       |
| `users/{uid}/mcp_grants/{gid}`          | server     | owner read    | connection record for Connected apps |
| `users/{uid}/claude_activity/{id}`      | server     | owner read    | write log, TTL `expireAt` (30 d)     |
| `users/{uid}/claude_revisions/{id}`     | server     | owner read    | pre-edit snapshots, TTL `expireAt`   |
| `users/{uid}/claude_usage/{yyyy-mm-dd}` | server     | none          | daily write counter                  |

TTL is configured through `fieldOverrides` in `firestore.indexes.json`.

### Writes mirror the client

Each write tool reproduces what the owning widget's hook does on save, because functions cannot
import client code. For flashcards that is `hooks/useFlashcardSets.ts` `saveSet`: normalise
(trim, 500-card cap, 500/1000-char term/definition caps), refresh the public share snapshot when
`publicShareId` is set, and rewrite open Study sessions. Server mirrors carry a one-line
"Mirrors …" comment so drift is findable.

Drive-backed types (quizzes, question banks, video activities) write through the teacher's stored
offline Google grant (`refreshGoogleAccessTokenForUid`). The `/connect` page captures that grant
when it is missing. `drive.file` only covers files created by SpartBoard's own OAuth client, which
the server already uses.

## Tools

Every tool declares `readOnlyHint` and `destructiveHint`. Lists return ids and titles only (25 per
page); full content only from `get_*`.

| PR  | Tools                                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `get_my_account`, `list_folders`, `create_folder`, `list_flashcard_sets`, `get_flashcard_set`, `create_flashcard_set`, `update_flashcard_set`, `list_revisions`, `restore_revision` |
| 2   | quizzes and question banks: list / get / create / update (Drive), `/connect` captures the offline Drive grant                                                                       |
| 3   | video activities, rubrics, Activity Wall, mini-apps; `get_quiz_results_summary`, `get_video_activity_results_summary` (CC-D3)                                                       |
| 4   | Companion skill in `claude-skills`; MCP prompts for the common workflows                                                                                                            |

### PR 2 notes

- Items with `sync` set (shared with a PLC) are read-only to Claude: editing them would have to publish a new synced version and mirror PLC headers, which stays in SpartBoard.
- Claude edits questions in a friendly shape (`multiple_choice`, `choose_all`, `matching` pairs, …) that the server encodes into the client's `correctAnswer` strings. An edited question keeps its targets, stimuli and rubric; its answer key and `optionOrder` are replaced.
- Sections, bank pulls and stimuli are preserved but not editable; new questions land after existing `order` entries.
- A pre-edit revision stores the Drive JSON when it is under 800 KB; above that, restore points the teacher to Drive's version history.

### PR 3 notes

- Video activities reuse the quiz Drive file format (`SpartBoard/Quizzes/*.quiz.json`) and the PLC read-only rule. Questions are MC, choose-all and FIB with `timestamp`; FIB alternates are stored as `acceptableVariants`.
- Rubric docs are written with exactly the keys `firestore.rules` allows, so they carry no Claude markers. Quiz questions keep their rubric snapshot until the teacher reattaches it.
- Activity Wall edits keep class targeting and the live accepting/visible toggles. When the wall has a session doc, the session mirror is refreshed in the same batch.
- Mini-apps are capped at 120k characters through Claude and keep their library `order`.
- Result summaries reuse `computeAssessmentAggregate` (the PLC rollup) on one session at a time: `teacherUid == uid` only, hidden under 5 completed responses, newest 5 assignments. They return percents, score bands and MC/choose-all option counts, never a student id or typed answer. Quiz keys come from the PLC canonical copy when synced, otherwise the assignment's Drive file.

## Limits and cost (CC-D16)

- No `minInstances`. `maxInstances`: 10 for `mcpServer`, 5 for `mcpOAuth`.
- 300 write-tool calls per teacher per day (Firestore counter, written in the same batch as the
  activity log). 2,000 calls per teacher per day per instance (in-memory).
- Read tools touch Firestore only for the data they return. The activity log records writes only.
- Expected: about $0–3/month at 200 teachers × 20 calls/day. Worst case (every teacher at the
  limit every school day) about $150–200/month.
- Neither the connector nor its tools call Gemini or the Claude API.

## Rollout

1. PR1 merges to `dev-paul` → deploys to `spartboard-dev`. Paul adds "SpartBoard (Dev)" in Claude
   org settings (Organization settings > Connectors > Add > Custom > Web, URL
   `https://spartboard-dev.web.app/mcp`, no client ID) and connects from Customize > Connectors.
2. PRs 2–4 land the same way.
3. Release to `main`; Paul adds "SpartBoard" (`https://spartboard.web.app/mcp`), tests with the
   flag at admin.
4. Paul sets `claude-connector` to Public in Admin Settings > Access > Previews for rollout. The
   changelog entry ships then.

## Open items

- ~~Confirm class-level aggregates (CC-D3) are covered by the district data agreement.~~ Resolved 2026-09-27: Anthropic signed the district DPA.
- Set a $5 budget alert on both Firebase projects' billing accounts.
