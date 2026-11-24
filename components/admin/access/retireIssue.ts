import type { GlobalFeature, GlobalFeaturePermission } from '@/types';
import { FEATURE_DEFAULTS } from '@/config/featureDefaults';
import { BUILDINGS_BY_ID } from '@/config/buildings';
import { rolloutSwitchKey, type RolloutSwitch } from '@/config/rolloutSwitches';
import { isReadyToGraduate, previewStatus } from './previewStatus';

export const RETIRE_LABEL = 'retire-flag';

const ISSUE_URL = 'https://github.com/OPS-PIvers/SpartBoard/issues/new';

const issueUrl = (title: string, body: string[]): string =>
  `${ISSUE_URL}?${new URLSearchParams({ title, labels: RETIRE_LABEL, body: body.join('\n') }).toString()}`;

const buildingNames = (ids: readonly string[]): string =>
  ids
    .map((id) => `${BUILDINGS_BY_ID.get(id)?.name ?? id} (\`${id}\`)`)
    .join(', ');

/** Prefilled GitHub issue asking Claude for the PR that deletes a flag's gate and keeps its saved reach. */
export const retireIssueUrl = (
  featureId: GlobalFeature,
  permission: GlobalFeaturePermission,
  districtOn: boolean | null | undefined
): string => {
  const { label } = FEATURE_DEFAULTS[featureId];
  const gate = `\`canAccessFeature('${featureId}')\``;
  const off = districtOn === false || !permission.enabled;
  const everyone = isReadyToGraduate(permission, true, districtOn);
  const reach = off
    ? [
        `The \`${featureId}\` preview (${label}) is off everywhere. Open one PR into \`dev-paul\` that retires it by removing the feature:`,
        '',
        `- Remove every ${gate} check and keep the behaviour teachers have with it off.`,
        '- Delete the code the flag turned on, and tests that only covered it.',
      ]
    : everyone
      ? [
          `The \`${featureId}\` preview (${label}) is public for everyone. Open one PR into \`dev-paul\` that retires it:`,
          '',
          `- Remove every ${gate} check and keep the new behaviour.`,
          '- Delete the old code path the flag guarded, and tests that only covered it.',
        ]
      : [
          `The \`${featureId}\` preview (${label}) is staying exactly as it is: ${previewStatus(permission, districtOn)}. Open one PR into \`dev-paul\` that retires the switch and keeps that reach in code:`,
          '',
          `- Replace every ${gate} check with a fixed check for the same people.`,
          `- Access level: \`${permission.accessLevel}\`.`,
          ...((permission.buildings?.length ?? 0) > 0
            ? [`- Buildings: ${buildingNames(permission.buildings ?? [])}.`]
            : []),
          ...(permission.minTier
            ? [`- Minimum tier: \`${permission.minTier}\`.`]
            : []),
          ...(permission.accessLevel === 'beta' ||
          (permission.excludedUsers?.length ?? 0) > 0
            ? [
                '- It names individual people. Keep their emails out of the code; ask Paul in the PR how to handle them.',
              ]
            : []),
        ];
  return issueUrl(`Retire flag: ${label}`, [
    ...reach,
    `- Remove \`${featureId}\` from \`GlobalFeature\` in \`types.ts\`, \`FEATURE_DEFAULTS\` in \`config/featureDefaults.ts\`, and \`functions/src/featureMissingDoc.ts\`.`,
    "- Add a What's New entry in a new `changelog.d/<name>.json` file if teachers gain or lose something they never got a note for (docs/DEV_WORKFLOW.md).",
    '- Leave the `global_permissions` doc alone; nothing reads it once the gate is gone.',
    '- Add the id to `RETIRED_TOUR_FEATURES` in `config/tourConditions.ts`, then rerun `tests/mcpTourConditionList.test.ts` with `UPDATE_TOUR_ANCHOR_LIST=1`.',
    '- If the old path had its own Firestore collection or `admin_settings` doc, delete its rules in `firestore.rules` and flip its rules tests to `assertFails` (`tests/rulesDeadPaths.test.ts` fails until you do).',
  ]);
};

/** Prefilled GitHub issue asking Claude to delete a district switch and keep its current state. */
export const retireSwitchIssueUrl = (
  sw: RolloutSwitch,
  enabled: boolean
): string => {
  const where = `\`admin_settings/${sw.docId}\`${sw.field ? ` field \`${sw.field}\`` : ''}`;
  return issueUrl(`Retire district switch: ${sw.title}`, [
    `The district switch "${sw.title}" (${where}) is ${enabled ? 'on' : 'off'} and staying that way. Open one PR into \`dev-paul\` that retires it:`,
    '',
    enabled
      ? '- Remove every read of the switch and keep the behaviour it turns on, for everyone.'
      : '- Remove every read of the switch and delete the code it turns on, with tests that only covered it.',
    `- Remove its entry (\`${rolloutSwitchKey(sw)}\`) from \`ROLLOUT_SWITCHES\` in \`config/rolloutSwitches.ts\`, and its normalizer if nothing else uses it.`,
    '- Remove its id from any server-side checks in `functions/src/` and from the read list in `firestore.rules` once nothing reads the doc (`tests/rulesDeadPaths.test.ts` fails until the rules tests match).',
    "- Add a What's New entry in a new `changelog.d/<name>.json` file if teachers gain or lose something they never got a note for (docs/DEV_WORKFLOW.md).",
    '- Leave the `admin_settings` doc itself alone.',
  ]);
};
