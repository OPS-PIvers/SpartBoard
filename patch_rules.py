import re

with open("firestore.rules", "r") as f:
    content = f.read()

content = content.replace("""    // Admin-only collections
    match /admin_settings/{document=**} {""", """    // Starter Packs
    match /artifacts/{appId}/public/data/starterPacks/{packId} {
      allow read: if request.auth != null;
      allow write: if isAdmin();
    }
    match /artifacts/{appId}/users/{userId}/starterPacks/{packId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Admin-only collections
    match /admin_settings/{document=**} {""")

with open("firestore.rules", "w") as f:
    f.write(content)
