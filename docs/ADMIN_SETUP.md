# Admin Setup Instructions

This document contains steps to activate admin access for the four authorized users.

## Admin Users

The following emails have been configured as admins:

- paul.ivers@orono.k12.mn.us
- bailey.nett@orono.k12.mn.us
- jennifer.ivers@orono.k12.mn.us
- sean.beaverson@orono.k12.mn.us
- joel.mellor@orono.k12.mn.us
- jason.woyak@orono.k12.mn.us

## Setup Steps

### 1. Deploy Firestore Security Rules

First, deploy the security rules that enforce admin-only access:

```bash
firebase deploy --only firestore:rules
```

### 2. Get Firebase Admin Credentials

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project (SPART_Board)
3. Click the gear icon → **Project Settings**
4. Navigate to the **Service Accounts** tab
5. Click **Generate New Private Key**
6. Save the downloaded JSON file as `scripts/service-account-key.json`

**Important:** This file is already in `.gitignore` and will never be committed to the repository.

### 3. Install Firebase Admin SDK

If not already installed:

```bash
npm install firebase-admin
```

### 4. Run the Admin Setup Script

Execute the script to create admin documents in Firestore:

```bash
node scripts/setup-admins.js
```

You should see output like:

```
🚀 Setting up admin users...

✅ Admin access granted to: paul.ivers@orono.k12.mn.us
✅ Admin access granted to: bailey.nett@orono.k12.mn.us
✅ Admin access granted to: Jennifer.ivers@orono.k12.mn.us
✅ Admin access granted to: Sean.beaverson@orono.k12.mn.us

✨ Admin setup complete!

These users now have admin access:
  - paul.ivers@orono.k12.mn.us
  - bailey.nett@orono.k12.mn.us
  - Jennifer.ivers@orono.k12.mn.us
  - Sean.beaverson@orono.k12.mn.us
```

## Verification

After setup:

1. Sign in to the app with one of the admin Google accounts
2. Check the browser console - you should see admin status logged
3. The `isAdmin` flag will be `true` for admin users

## Using Admin Status in Code

To check if a user is an admin in any component:

```typescript
import { useAuth } from '@/context/AuthContext';

function MyComponent() {
  const { isAdmin, user } = useAuth();

  if (!isAdmin) {
    return <div>Access denied - Admin only</div>;
  }

  return (
    <div>
      <h1>Admin Panel</h1>
      <p>Welcome, {user?.email}</p>
      {/* Admin features here */}
    </div>
  );
}
```

## Security Notes

- Admin status is enforced by Firestore Security Rules (server-side)
- Users cannot grant themselves admin access
- The `service-account-key.json` file contains sensitive credentials and must never be committed
- Admin documents can only be created via Firebase Console or the Admin SDK
- To add/remove admins in the future, update the `ADMIN_EMAILS` array in:
  - `scripts/setup-admins.js`

  Then re-run the setup script.

## ClassLink-via-Google Student Auth

Students launch SpartBoard from ClassLink → Google ID token from GIS → Cloud
Function `studentLoginV1` mints a Firebase custom token with an HMAC pseudonym
UID and a `classIds` claim. No student PII is persisted in Firebase.

### HMAC pseudonym secret

**Secret:** `STUDENT_PSEUDONYM_HMAC_SECRET` (32+ random bytes).

This secret is the keystone of the grading match-back system. Every response
doc, submission doc, and pseudonym UID is derived from it. Pseudonyms are
stable within a semester but unlinkable across semesters or without the
server secret.

**Generate and set on first deploy:**

```bash
# Generate a 32-byte random hex string, then paste when prompted.
openssl rand -hex 32
firebase functions:secrets:set STUDENT_PSEUDONYM_HMAC_SECRET
```

Consumed by `studentLoginV1`, `getAssignmentPseudonymV1`, and
`getPseudonymsForAssignmentV1` in `functions/src/index.ts`.

**Rotation rules — read before touching:**

- **NEVER rotate during a semester.** Rotation invalidates every pseudonym in
  every in-flight assignment. Teacher grading breaks silently (pseudonyms in
  Firestore no longer match those the function computes for the roster) and
  students' prior submissions become unrecoverable.
- Rotate only between semesters, with all assignments closed and rosters
  archived.
- If rotation is ever required mid-year (suspected leak), **do not** just
  rotate. Implement dual-key verification first: `getPseudonymsForAssignmentV1`
  tries the new key, falls back to the old key for 30 days, then the old key
  is retired. Budget 1–2 days of dev time.

### Google OAuth client ID

**Secret:** `GOOGLE_OAUTH_CLIENT_ID` — the Web-type OAuth 2.0 client ID from
your Firebase/GCP project. `studentLoginV1` uses it to verify Google ID
tokens server-side; without it, student login returns an error.

**Where to find it:**

1. [Google Cloud Console](https://console.cloud.google.com) → your Firebase
   project.
2. **APIs & Services** → **Credentials**.
3. Find the OAuth 2.0 Client ID of type "Web application".
4. Copy the Client ID.

**Set:**

```bash
firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_ID
```

**Client-side counterpart:** the same value is exposed to the student login
page as `VITE_GOOGLE_CLIENT_ID`. Set it in `.env.local` for local dev, and as
a GitHub Actions repository secret (`secrets.VITE_GOOGLE_CLIENT_ID`) so the
production and dev-branch deploy workflows bake it into the build. The
server-side secret and the client-side Vite variable **must be the same
client ID** — a mismatch produces audience-failure errors in
`studentLoginV1`.

### Per-organization domain configuration

Each Organization document in Firestore carries a `domains: string[]` field.
`studentLoginV1` looks up the organization by matching the student's Google
`hd` claim (and email suffix) against any organization's domains list; no
match = rejected login.

- Manage via Admin Settings → Organizations in the app UI.
- Seed Orono with `['orono.k12.mn.us']`.
- Onboarding a new school is a pure admin-UI action, no code deploy.

### Cloud Monitoring alerts

Ship before rollout, not after. A class of 30 students logging in
simultaneously is the default scenario — silent failures become classroom
emergencies. Configure the following alert policies in Google Cloud
Monitoring (Console → Monitoring → Alerting):

1. **`studentLoginV1` error rate** — alert if >5% errors over any 5-minute
   window. Metric: `cloudfunctions.googleapis.com/function/execution_count`
   filtered to `function_name = "studentLoginV1"` and
   `status != "ok"`; threshold = 5% of total executions.

2. **`studentLoginV1` p95 latency** — alert if p95 > 2s sustained for 10
   minutes. Metric: `cloudfunctions.googleapis.com/function/execution_times`
   filtered to `function_name = "studentLoginV1"`; threshold = 2000ms.
   Sustained latency usually indicates a cold-start or OneRoster slowness.

3. **`students_rejected_domain` counter** — custom log-based counter. A
   sudden spike means a domain-list misconfiguration (an organization's
   domains changed, or a school's DNS/Workspace changed their `hd` claim).
   Create a log-based metric from entries matching
   `resource.type="cloud_function" function_name="studentLoginV1" textPayload=~"rejected_domain"`.

4. **`students_not_in_roster` counter** — custom log-based counter. Low
   baseline expected; spikes during roster rollover mean ClassLink sync is
   behind. Create a log-based metric matching
   `textPayload=~"not_in_roster"`.

Route alert notifications to the admin ops channel. Confirm the channel at
rollout — do not assume.

### Cold-start mitigation

`studentLoginV1` and `getPseudonymsForAssignmentV1` are configured with
`minInstances: 1` to avoid cold-start penalties during simultaneous class
logins. If cost becomes an issue, the two functions can share a warm
instance by co-locating them.

## Troubleshooting

**Script fails with "service-account-key.json not found":**

- Make sure you completed step 2 and saved the file in the correct location

**Admin status is false after signing in:**

- Verify the security rules were deployed (step 1)
- Verify the admin setup script completed successfully (step 4)
- Check that you're signing in with one of the exact email addresses listed above
- Email addresses are normalized to **lowercase** in Firestore. The system automatically handles this, but ensure you've re-run the setup script if you recently added/changed admins.

**"Permission denied" errors:**

- Make sure you've deployed the Firestore security rules
- Verify your Firebase project has Firestore enabled
- If you see "Missing or insufficient permissions" when checking admin status, it's usually because the user is not in the `admins` collection.
