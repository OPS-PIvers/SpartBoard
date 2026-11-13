// Message steps and Site switches in a web tour (docs/plans/WEB_TOURS_CROSS_SITE.md X1-X13); pure, shared with `extension/`.

import type {
  GuidedLearningSet,
  GuidedLearningStep,
  WebTourMessageStep,
} from '@/types';
import {
  isWebTourSet,
  type WebTourStep,
} from '@/components/widgets/GuidedLearning/utils/liveTour';

/** A step of a web tour's sequence: one with a target, or a Message step. */
export type WebTourSequenceStep = WebTourStep | WebTourMessageStep;

export interface SiteSwitch {
  /** Index of the last targeted step on the site being left. */
  fromIndex: number;
  /** Index of the first targeted step on the next site. */
  toIndex: number;
  /** The site the learner continues on. */
  host: string;
  /** The step whose Next makes the switch: the Message step right before `toIndex`, else `fromIndex` (X6). */
  goStepIndex: number;
}

export const isMessageStep = (
  step: GuidedLearningStep
): step is WebTourMessageStep => step.message === true && !step.web;

/** A web set's targeted and Message steps in authored order; none for any other set. */
export const webTourSequenceOf = (
  set: Pick<GuidedLearningSet, 'surface' | 'steps'>
): WebTourSequenceStep[] =>
  isWebTourSet(set)
    ? set.steps.filter(
        (s): s is WebTourSequenceStep => !!s.web || isMessageStep(s)
      )
    : [];

/** The host of a step's `urlPattern`, lowercased, without userinfo or a default port; null when it isn't an http(s) address. */
export const hostOf = (urlPattern: string): string | null => {
  const m = /^(https?):\/\/([^/?#]+)/i.exec(urlPattern.trim());
  if (!m) return null;
  const host = m[2].slice(m[2].lastIndexOf('@') + 1).toLowerCase();
  const defaultPort = m[1].toLowerCase() === 'https' ? ':443' : ':80';
  return host.endsWith(defaultPort) ? host.slice(0, -defaultPort.length) : host;
};

/** The address a Site switch opens (X2): the pattern cut at its first `*` segment, else its origin; null when the host itself has a wildcard or it isn't https. */
export const switchUrlFor = (urlPattern: string): string | null => {
  const m = /^(https:\/\/)([^/?#]+)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(
    urlPattern.trim()
  );
  if (!m || m[2].includes('*')) return null;
  const [, scheme, authority, path, query = '', hash = ''] = m;
  const origin = scheme + authority.slice(authority.lastIndexOf('@') + 1);
  const segments = path.split('/');
  const wild = segments.findIndex((seg) => seg.includes('*'));
  let url: string;
  if (wild >= 0) {
    url = origin + segments.slice(0, wild).join('/');
  } else {
    const params = query
      .slice(1)
      .split('&')
      .filter((p) => p && !p.includes('*'));
    url =
      origin +
      path +
      (params.length ? `?${params.join('&')}` : '') +
      (hash.includes('*') ? '' : hash);
  }
  try {
    return new URL(url || origin).href;
  } catch {
    return null;
  }
};

/** Each point where the next targeted step is on another host than the last, ignoring Message steps between (X1). */
export const siteSwitchesOf = (
  steps: readonly (WebTourStep | WebTourMessageStep)[]
): SiteSwitch[] => {
  const switches: SiteSwitch[] = [];
  let prev = -1;
  steps.forEach((step, i) => {
    if (isMessageStep(step) || !step.web) return;
    if (prev >= 0) {
      const from = hostOf((steps[prev] as WebTourStep).web.urlPattern);
      const to = hostOf(step.web.urlPattern);
      if (from && to && from !== to) {
        switches.push({
          fromIndex: prev,
          toIndex: i,
          host: to,
          goStepIndex:
            i - 1 > prev && isMessageStep(steps[i - 1]) ? i - 1 : prev,
        });
      }
    }
    prev = i;
  });
  return switches;
};

/** A tour with a Message step or a Site switch needs an extension at `CROSS_SITE_PROTOCOL` (X13). */
export const needsCrossSite = (
  steps: readonly (WebTourStep | WebTourMessageStep)[]
): boolean => steps.some(isMessageStep) || siteSwitchesOf(steps).length > 0;

/** Index of the first step with a target, which sets where the tour opens (X8); -1 when none has one. */
export const firstTargetedIndex = (
  steps: readonly GuidedLearningStep[]
): number => steps.findIndex((s) => !!s.web && !isMessageStep(s));
