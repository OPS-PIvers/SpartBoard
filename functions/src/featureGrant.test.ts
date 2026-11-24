/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory store rows. */
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeFirestore } from './writingTestFakes';
import { isWidgetGranted } from './featureGrant';
import { WIDGET_CONFIG_RUNTIME } from './mcp/widgetConfigRuntime.gen';

const store = new Map<string, any>();
const db = fakeFirestore(store);
const granted = (type: string, email = 't@orono.k12.mn.us') =>
  isWidgetGranted(db, type, email, 't1');

beforeEach(() => store.clear());

describe('isWidgetGranted with no permission doc', () => {
  it('follows the generated WIDGET_DEFAULT_ACCESS_LEVEL mirror', async () => {
    expect(WIDGET_CONFIG_RUNTIME.accessLevels.writing).toBe('admin');
    await expect(granted('writing')).resolves.toBe(false);
    await expect(granted('clock')).resolves.toBe(true);
  });

  it('lets an admin through an admin-first default', async () => {
    store.set('admins/t@orono.k12.mn.us', {});
    await expect(granted('writing')).resolves.toBe(true);
  });
});

describe('isWidgetGranted with a permission doc', () => {
  it('honours disabled, beta and building switches', async () => {
    store.set('feature_permissions/writing', {
      enabled: true,
      accessLevel: 'public',
      config: { dockDefaults: { b1: false } },
    });
    await expect(granted('writing')).resolves.toBe(true);
    store.set('users/t1/userProfile/profile', { selectedBuildings: ['b1'] });
    await expect(granted('writing')).resolves.toBe(false);
    store.set('feature_permissions/writing', {
      enabled: true,
      accessLevel: 'beta',
      betaUsers: ['T@orono.k12.mn.us'],
    });
    await expect(granted('writing')).resolves.toBe(true);
    store.set('feature_permissions/writing', {
      enabled: false,
      accessLevel: 'public',
    });
    store.set('admins/t@orono.k12.mn.us', {});
    await expect(granted('writing')).resolves.toBe(false);
  });
});
