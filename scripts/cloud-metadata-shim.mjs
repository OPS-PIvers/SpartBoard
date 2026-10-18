// Cloud sessions only: a local GCE metadata stand-in so Google client libraries send the proxy's placeholder token.
import http from 'node:http';

const port = Number(process.env.METADATA_SHIM_PORT ?? 8939);
const token = process.env.CLOUDSDK_AUTH_ACCESS_TOKEN ?? 'proxy-injected';
const project = process.env.GOOGLE_CLOUD_PROJECT ?? 'spartboard-dev';
const base = '/computeMetadata/v1';

const routes = {
  [`${base}/instance/service-accounts/default/token`]: () =>
    JSON.stringify({
      access_token: token,
      expires_in: 3599,
      token_type: 'Bearer',
    }),
  [`${base}/instance/service-accounts/default/email`]: () =>
    'claude-cloud@proxy',
  [`${base}/instance/service-accounts/default/scopes`]: () =>
    'https://www.googleapis.com/auth/cloud-platform',
  [`${base}/project/project-id`]: () => project,
  [`${base}/project/numeric-project-id`]: () => '0',
  [`${base}/instance`]: () => '',
  [base]: () => '',
};

http
  .createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0].replace(/\/$/, '');
    const route = routes[path];
    res.setHeader('Metadata-Flavor', 'Google');
    if (!route) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader(
      'Content-Type',
      path.endsWith('/token') ? 'application/json' : 'text/plain'
    );
    res.end(route());
  })
  .listen(port, '127.0.0.1');
