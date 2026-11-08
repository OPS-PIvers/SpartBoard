// Loaded by scripts/cloud-run.sh: routes Google API calls through the cloud proxy and swaps the prod key for its injected token.
const https = require('node:https');
const path = require('node:path');

const root = path.join(__dirname, '..');
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const MARKER = 'cloud-proxy';

if (proxy) {
  const { HttpsProxyAgent } = require(
    require.resolve('https-proxy-agent', {
      paths: [path.join(root, 'node_modules/.pnpm/node_modules')],
    })
  );
  const OriginalAgent = https.Agent;
  // google-gax builds its own https.Agent, which skips the proxy and so never gets the injected token.
  function ProxiedAgent(options) {
    return new HttpsProxyAgent(proxy, options);
  }
  ProxiedAgent.prototype = OriginalAgent.prototype;
  https.Agent = ProxiedAgent;
}

const appEntry = require.resolve('firebase-admin/app', { paths: [root] });
const factory = require(path.join(path.dirname(appEntry), 'credential-factory.js'));
const originalCert = factory.cert;
factory.cert = (account, agent) => {
  const value = typeof account === 'string' ? safeParse(account) : account;
  if (value && value.type === MARKER) return factory.applicationDefault(agent);
  return originalCert(account, agent);
};

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
