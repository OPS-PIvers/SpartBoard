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
