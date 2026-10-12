import type { GlobalFeature } from '@/types';
import { FEATURE_DEFAULTS } from '@/config/featureDefaults';

export const RETIRE_LABEL = 'retire-flag';

/** Prefilled GitHub issue asking Claude for the cleanup PR that deletes a public flag's gate. */
export const retireIssueUrl = (featureId: GlobalFeature): string => {
  const { label } = FEATURE_DEFAULTS[featureId];
  const body = [
    `The \`${featureId}\` preview (${label}) is public for everyone. Open one PR into \`dev-paul\` that retires it:`,
    '',
    `- Remove every \`canAccessFeature('${featureId}')\` check and keep the new behaviour.`,
    '- Delete the old code path the flag guarded, and tests that only covered it.',
    `- Remove \`${featureId}\` from \`GlobalFeature\` in \`types.ts\`, \`FEATURE_DEFAULTS\` in \`config/featureDefaults.ts\`, and \`functions/src/featureMissingDoc.ts\`.`,
    '- Add a `public/changelog.json` entry if the feature never got one (docs/DEV_WORKFLOW.md).',
    '- Leave the `global_permissions` doc alone; nothing reads it once the gate is gone.',
  ].join('\n');
  const params = new URLSearchParams({
    title: `Retire flag: ${label}`,
    labels: RETIRE_LABEL,
    body,
  });
  return `https://github.com/OPS-PIvers/SpartBoard/issues/new?${params.toString()}`;
};
