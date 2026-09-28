import { describe, expect, it } from 'vitest';
import { isClaudeReviewPending, withoutClaudeReview } from './claudeReview';
import { normalizeClaudeReviewRemindersSettings } from '@/config/claudeReviewReminders';
import { ROLLOUT_SWITCHES } from '@/config/rolloutSwitches';

describe('Claude review mark', () => {
  it('is pending only while the timestamp is set', () => {
    expect(isClaudeReviewPending({ claudeReviewPendingAt: 5 })).toBe(true);
    expect(isClaudeReviewPending({ claudeReviewPendingAt: null })).toBe(false);
    expect(isClaudeReviewPending({})).toBe(false);
  });

  it('drops the mark from a teacher save without touching anything else', () => {
    const item = { id: 'a', title: 'T', claudeReviewPendingAt: 5 };
    expect(withoutClaudeReview(item)).toEqual({ id: 'a', title: 'T' });
    expect(item.claudeReviewPendingAt).toBe(5);
    const clean = { id: 'b' };
    expect(withoutClaudeReview(clean)).toBe(clean);
  });
});

describe('review reminders switch', () => {
  it('is on unless an admin saved enabled: false', () => {
    expect(normalizeClaudeReviewRemindersSettings(undefined).enabled).toBe(
      true
    );
    expect(normalizeClaudeReviewRemindersSettings({}).enabled).toBe(true);
    expect(
      normalizeClaudeReviewRemindersSettings({ enabled: false }).enabled
    ).toBe(false);
  });

  it('shows on the Previews tab next to the connector flag', () => {
    expect(
      ROLLOUT_SWITCHES.find((s) => s.docId === 'claude_review_reminders')
        ?.feature
    ).toBe('claude-connector');
  });
});
