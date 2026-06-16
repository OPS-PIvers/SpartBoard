/**
 * `getClassLinkRosterV1` — fetches the calling teacher's ClassLink OneRoster
 * classes and per-class students (F12 split out of the old monolithic
 * `index.ts`). Held in memory only; nothing is persisted.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import axios, { AxiosError } from 'axios';
import {
  ALLOWED_ORIGINS,
  ONEROSTER_BASE,
  getOAuthHeaders,
  isSafeEmailForOneRosterFilter,
  type ClassLinkClass,
  type ClassLinkStudent,
  type ClassLinkUser,
} from './classlinkShared';
import { chunk } from './shared';
import {
  CLASSLINK_CLIENT_ID,
  CLASSLINK_CLIENT_SECRET,
  CLASSLINK_TENANT_URL,
} from './secrets';
import './functionsInit';

export const getClassLinkRosterV1 = onCall(
  {
    memory: '256MiB',
    secrets: [
      CLASSLINK_CLIENT_ID,
      CLASSLINK_CLIENT_SECRET,
      CLASSLINK_TENANT_URL,
    ],
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }

    const userEmail = request.auth.token.email;
    if (!userEmail) {
      throw new HttpsError(
        'invalid-argument',
        'User must have an email associated with their account.'
      );
    }

    const clientId = CLASSLINK_CLIENT_ID.value();
    const clientSecret = CLASSLINK_CLIENT_SECRET.value();
    const tenantUrl = CLASSLINK_TENANT_URL.value();

    if (!clientId || !clientSecret || !tenantUrl) {
      throw new HttpsError(
        'internal',
        'ClassLink configuration is missing on the server.'
      );
    }

    const cleanTenantUrl = tenantUrl.replace(/\/$/, '');

    try {
      if (!isSafeEmailForOneRosterFilter(userEmail)) {
        return { classes: [], studentsByClass: {} };
      }
      const usersBaseUrl = `${cleanTenantUrl}${ONEROSTER_BASE}/users`;
      const userParams = { filter: `email='${userEmail}'` };

      const userHeaders = getOAuthHeaders(
        usersBaseUrl,
        userParams,
        'GET',
        clientId,
        clientSecret
      );

      const userResponse = await axios.get<{ users: ClassLinkUser[] }>(
        usersBaseUrl,
        {
          params: userParams,
          headers: { ...userHeaders },
        }
      );

      const users = userResponse.data.users;

      if (!users || users.length === 0) {
        return { classes: [], studentsByClass: {} };
      }

      const teacherSourcedId = users[0].sourcedId;

      const classesUrl = `${cleanTenantUrl}${ONEROSTER_BASE}/users/${teacherSourcedId}/classes`;
      const classesHeaders = getOAuthHeaders(
        classesUrl,
        {},
        'GET',
        clientId,
        clientSecret
      );

      const classesResponse = await axios.get<{ classes: ClassLinkClass[] }>(
        classesUrl,
        { headers: { ...classesHeaders } }
      );
      const classes = classesResponse.data.classes;

      const studentsByClass: Record<string, ClassLinkStudent[]> = {};

      // Chunk the per-class student lookups so a teacher with 100+ classes
      // doesn't fire 100+ simultaneous HTTP requests at ClassLink. Audit
      // item #5. Batch size 15 is the mid-point of the audit's 10-20 range.
      const CLASSLINK_FANOUT_CHUNK = 15;
      for (const classBatch of chunk(classes, CLASSLINK_FANOUT_CHUNK)) {
        await Promise.all(
          classBatch.map(async (cls: ClassLinkClass) => {
            const studentsUrl = `${cleanTenantUrl}${ONEROSTER_BASE}/classes/${cls.sourcedId}/students`;
            const studentsHeaders = getOAuthHeaders(
              studentsUrl,
              {},
              'GET',
              clientId,
              clientSecret
            );
            try {
              const studentsResponse = await axios.get<{
                users: ClassLinkStudent[];
              }>(studentsUrl, { headers: { ...studentsHeaders } });
              studentsByClass[cls.sourcedId] =
                studentsResponse.data.users ?? [];
            } catch (err) {
              // Single-class failures aren't fatal (the teacher's other
              // classes should still load), but they must be visible —
              // an empty `[]` here without a log makes ClassLink auth
              // expiry or per-class permission issues silently look like
              // "this class has no students" to the teacher.
              console.warn(
                '[getClassLinkRosterV1] students fetch failed for class',
                {
                  classId: cls.sourcedId,
                  error: err instanceof Error ? err.message : String(err),
                }
              );
              studentsByClass[cls.sourcedId] = [];
            }
          })
        );
      }

      return {
        classes,
        studentsByClass,
      };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        throw new HttpsError(
          'internal',
          `Failed to fetch data from ClassLink: ${axiosError.message}`
        );
      }
      throw new HttpsError('internal', 'Failed to fetch data from ClassLink');
    }
  }
);
