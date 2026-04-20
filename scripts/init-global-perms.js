const admin = require('firebase-admin');
const serviceAccount = require('../.temp-service-account.json');

// Initialize Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function initGlobalPermissions() {
  const features = [
    {
      id: 'gemini-functions',
      config: { dailyLimit: 20, dailyLimitEnabled: true },
      accessLevel: 'public',
      enabled: true,
      betaUsers: [],
    },
    {
      id: 'smart-poll',
      config: { dailyLimit: 20, dailyLimitEnabled: true },
      accessLevel: 'public',
      enabled: true,
      betaUsers: [],
    },
    {
      id: 'embed-mini-app',
      config: { dailyLimit: 20, dailyLimitEnabled: true },
      accessLevel: 'admin',
      enabled: true,
      betaUsers: [],
    },
    {
      id: 'video-activity-audio-transcription',
      config: { dailyLimit: 5, dailyLimitEnabled: true },
      accessLevel: 'public',
      enabled: true,
      betaUsers: [],
    },
    {
      id: 'live-session',
      accessLevel: 'public',
      enabled: true,
      betaUsers: [],
    },
    {
      id: 'dashboard-sharing',
      accessLevel: 'public',
      enabled: true,
      betaUsers: [],
    },
    {
      id: 'dashboard-import',
      accessLevel: 'public',
      enabled: true,
      betaUsers: [],
    },
    {
      // Phase 3: gates the Organization admin panel's write actions. Default
      // to beta so a domain admin can't accidentally mutate org state until
      // Paul's team has validated the flow end-to-end.
      id: 'org-admin-writes',
      accessLevel: 'beta',
      enabled: true,
      betaUsers: ['paul.ivers@orono.k12.mn.us'],
    },
  ];

  console.log('🚀 Initializing global_permissions collection...');

  for (const feature of features) {
    const { id, ...data } = feature;
    await db
      .collection('global_permissions')
      .doc(id)
      .set({
        featureId: id,
        ...data,
      });
    console.log(`✅ Feature initialized: ${id}`);
  }

  console.log(
    '\n✨ Database poke complete. Refresh your browser to see changes.'
  );
  process.exit(0);
}

initGlobalPermissions().catch((err) => {
  console.error('❌ Failed to initialize:', err);
  process.exit(1);
});
