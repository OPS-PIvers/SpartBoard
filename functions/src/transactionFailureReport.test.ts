import { describe, it, expect } from 'vitest';
import { sanitizeTransactionFailure } from './transactionFailureReport';

const good = {
  code: 'failed-precondition',
  ops: [
    'get quiz_sessions/{id}/responses/{id}',
    'update quiz_sessions/{id}/responses/{id}',
  ],
  count: 7.9,
  page: '/quiz',
};

describe('sanitizeTransactionFailure', () => {
  it('keeps a well-formed report and floors the count', () => {
    expect(sanitizeTransactionFailure(good)).toEqual({ ...good, count: 7 });
  });

  it('drops unknown codes, junk and reports with no usable op', () => {
    expect(sanitizeTransactionFailure(null)).toBeNull();
    expect(sanitizeTransactionFailure('junk')).toBeNull();
    expect(
      sanitizeTransactionFailure({ ...good, code: 'permission-denied' })
    ).toBeNull();
    expect(
      sanitizeTransactionFailure({ ...good, ops: 'get a/{id}' })
    ).toBeNull();
    expect(
      sanitizeTransactionFailure({ ...good, ops: ['drop users', 42] })
    ).toBeNull();
  });

  it('filters malformed ops, caps the list and blanks a bad page', () => {
    const report = sanitizeTransactionFailure({
      ...good,
      ops: [
        'get users/{id} <script>',
        ...Array.from({ length: 20 }, () => 'set users/{id}'),
      ],
      count: 1e9,
      page: '/quiz/ABC123?code=1',
    });
    expect(report?.ops).toHaveLength(11);
    expect(report?.count).toBe(9999);
    expect(report?.page).toBe('');
  });
});
