// The fixture web tour the playback harness sends, shaped like the hub's `web-tour/start` message.
import { WEB_TOUR_FIXTURE_PATH } from './WebTourFixtureSite';

type Picture = { mime: 'image/png'; data: string; w: number; h: number };

/** A labelled grey card standing in for a recorded screenshot. */
export function fixturePicture(label: string): Picture | undefined {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 120;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, 320, 120);
  ctx.strokeStyle = '#2d3f89';
  ctx.lineWidth = 4;
  ctx.strokeRect(100, 40, 120, 40);
  ctx.fillStyle = '#0f172a';
  ctx.font = '600 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 160, 66);
  const data = canvas.toDataURL('image/png').split(',')[1];
  return data ? { mime: 'image/png', data, w: 320, h: 120 } : undefined;
}

export function fixtureTourStart(
  origin: string,
  stepIndex = 0,
  withTargets = true
) {
  const base = `${origin}${WEB_TOUR_FIXTURE_PATH}`;
  const step = (
    id: string,
    label: string,
    text: string,
    urlPattern: string,
    action: 'observe' | 'click' | 'type' | 'select',
    locator: Record<string, unknown>,
    pictureLabel?: string
  ) => ({
    id,
    label,
    text,
    web: { urlPattern, action, locator },
    ...(pictureLabel ? { picture: fixturePicture(pictureLabel) } : {}),
  });
  return {
    type: 'web-tour/start' as const,
    startUrl: base,
    stepIndex,
    tour: {
      setId: 'fixture-web-tour',
      version: 1,
      title: 'Fixture web tour',
      // Where Share sits in its picture (the drawn box), for Show me where's ring (protocol 12).
      ...(withTargets
        ? { targets: { share: { x: 0.3125, y: 0.3333, w: 0.375, h: 0.3333 } } }
        : {}),
      // Markup drawn over the Share picture, which Show me where shows (protocol 12).
      markup: {
        share: [
          { id: 'm1', kind: 'number' as const, x: 0.22, y: 0.5, n: 1 },
          {
            id: 'm2',
            kind: 'arrow' as const,
            x1: 0.12,
            y1: 0.2,
            x2: 0.29,
            y2: 0.38,
          },
        ],
      },
      steps: [
        step(
          'open',
          'Open the course',
          'Click Open course.',
          base,
          'click',
          { role: 'button', name: 'Open course' },
          'Open course'
        ),
        step(
          'grades',
          'Grades',
          'Grades live here (found by its text).',
          `${base}/course/*`,
          'observe',
          { role: 'tab', name: 'Grades', text: 'Grades' }
        ),
        step(
          'edit',
          'The right Edit',
          'Two Edit buttons; the recorded spot picks the right one.',
          `${base}/course/*`,
          'observe',
          {
            role: 'button',
            name: 'Edit',
            box: { x: 0.8, y: 0.2, w: 0.1, h: 0.05 },
          }
        ),
        step(
          'more',
          'Load more',
          'This button shows up late. Click it.',
          `${base}/course/*`,
          'click',
          { role: 'button', name: 'Load more' },
          'Load more'
        ),
        step(
          'comment',
          'Comment',
          'Type a comment inside the frame.',
          `${base}/course/*`,
          'type',
          {
            role: 'textbox',
            name: 'Comment',
            frames: [{ urlPattern: `${base}/frame`, index: 0 }],
          }
        ),
        step(
          'next',
          'Next page',
          'Click Next page to load a new page.',
          `${base}/course/*`,
          'click',
          { role: 'link', name: 'Next page' }
        ),
        step(
          'share',
          'Share',
          'This control is gone, so you see its picture.',
          `${base}/done`,
          'observe',
          { role: 'button', name: 'Share', css: '#share' },
          'Share'
        ),
      ],
    },
  };
}
