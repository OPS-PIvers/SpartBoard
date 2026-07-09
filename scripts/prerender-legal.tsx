/**
 * Build-time prerender for the public legal/support pages.
 *
 * The app is a client-rendered SPA, so /privacy, /terms, and /support would
 * otherwise serve an empty shell to crawlers — including Google's OAuth
 * verification checks, which require the Privacy Policy / Terms URLs to have
 * readable content. This script renders the real React components to static
 * HTML and writes dist/{privacy,terms,support}/index.html. Firebase Hosting
 * serves those files ahead of the `**` SPA rewrite; when the SPA bundle then
 * boots on top, it renders the same route, so users and crawlers see
 * identical content (single source of truth — the components).
 *
 * Pipeline (see the `build` script in package.json):
 *   1. vite build                  → dist/ (SPA, hashed assets)
 *   2. vite build --ssr this file  → dist-ssr/prerender-legal.js
 *   3. node dist-ssr/prerender-legal.js
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrivacyPolicyPage } from '@/components/legal/PrivacyPolicyPage';
import { TermsOfServicePage } from '@/components/legal/TermsOfServicePage';
import { SupportPage } from '@/components/legal/SupportPage';

const PAGES: Array<{
  route: string;
  title: string;
  description: string;
  component: React.FC;
}> = [
  {
    route: 'privacy',
    title: 'Privacy Policy — SpartBoard',
    description:
      'How SpartBoard collects, uses, and protects information, including Google user data and student education records.',
    component: PrivacyPolicyPage,
  },
  {
    route: 'terms',
    title: 'Terms of Service — SpartBoard',
    description: 'The terms that govern use of SpartBoard.',
    component: TermsOfServicePage,
  },
  {
    route: 'support',
    title: 'Support — SpartBoard',
    description: 'How to get help with SpartBoard.',
    component: SupportPage,
  },
];

const distDir = path.resolve(process.cwd(), 'dist');
const template = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');

if (!template.includes('<div id="root"></div>')) {
  throw new Error(
    'prerender-legal: dist/index.html has no empty <div id="root"></div> mount point — update the injection logic.'
  );
}

for (const page of PAGES) {
  const markup = renderToStaticMarkup(React.createElement(page.component));
  const html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${page.title}</title>`)
    .replace(
      '</head>',
      `  <meta name="description" content="${page.description}" />\n  </head>`
    )
    .replace('<div id="root"></div>', `<div id="root">${markup}</div>`);

  const outDir = path.join(distDir, page.route);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  console.log(`prerendered /${page.route} (${markup.length} bytes of markup)`);
}
