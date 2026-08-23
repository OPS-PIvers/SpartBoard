/**
 * Regression test: adding a sign-in domain must persist it lowercased.
 *
 * `resolveOrgIdForDomain` (functions/src/classlinkShared.ts) resolves a
 * signed-in user's org via an EXACT Firestore string match on the `domain`
 * field, always comparing against a lowercased candidate derived from the
 * user's verified email/hd claim (functions/src/resolveOrgForUser.ts). If an
 * admin types a domain with any uppercase letters in the "Add sign-in
 * domain" form, the stored `domain` field never matches that lowercased
 * candidate, and every real user on that domain silently fails to resolve
 * to the organization — even though the admin panel shows the domain as
 * added/verified. This mirrors the established "lowercase on write" pattern
 * already used by every other admin email/domain input in this app (see
 * BetaUsersPanel, GlobalPermissionsManager, BackgroundManager).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DomainsView } from '@/components/admin/Organization/views/DomainsView';
import type { DomainRecord } from '@/components/admin/Organization/types';

describe('DomainsView — Add sign-in domain', () => {
  it('lowercases the domain before handing it to onAdd', () => {
    const onAdd = vi.fn();
    render(<DomainsView domains={[]} onAdd={onAdd} onRemove={vi.fn()} />);

    fireEvent.click(screen.getAllByRole('button', { name: /add domain/i })[0]);

    const input = screen.getByPlaceholderText('orono.k12.mn.us');
    fireEvent.change(input, { target: { value: 'Orono.K12.MN.US' } });

    fireEvent.click(screen.getByRole('button', { name: /send verification/i }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const record = onAdd.mock.calls[0][0] as Partial<DomainRecord>;
    expect(record.domain).toBe('@orono.k12.mn.us');
  });

  // firestore.rules now rejects a non-normalized `domain`, so a shape the
  // rule won't accept has to fail in the form rather than as permission-denied.
  it.each(['localhost', 'orono.', 'orono k12.mn.us', 'orono.k12.mn.1'])(
    'blocks submit and explains why for %j',
    (typed) => {
      const onAdd = vi.fn();
      render(<DomainsView domains={[]} onAdd={onAdd} onRemove={vi.fn()} />);

      fireEvent.click(
        screen.getAllByRole('button', { name: /add domain/i })[0]
      );
      fireEvent.change(screen.getByPlaceholderText('orono.k12.mn.us'), {
        target: { value: typed },
      });

      const submit = screen.getByRole('button', { name: /send verification/i });
      expect(submit).toBeDisabled();
      expect(screen.getByText(/use a full domain with a dot/i)).toBeTruthy();

      fireEvent.click(submit);
      expect(onAdd).not.toHaveBeenCalled();
    }
  );

  it('shows no error before anything is typed', () => {
    render(<DomainsView domains={[]} onAdd={vi.fn()} onRemove={vi.fn()} />);

    fireEvent.click(screen.getAllByRole('button', { name: /add domain/i })[0]);

    expect(screen.queryByText(/use a full domain with a dot/i)).toBeNull();
    expect(screen.getByText(/example: orono\.k12\.mn\.us/i)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /send verification/i })
    ).toBeDisabled();
  });

  it('accepts a domain the rule allows, with or without the @ typed', () => {
    const onAdd = vi.fn();
    render(<DomainsView domains={[]} onAdd={onAdd} onRemove={vi.fn()} />);

    fireEvent.click(screen.getAllByRole('button', { name: /add domain/i })[0]);
    fireEvent.change(screen.getByPlaceholderText('orono.k12.mn.us'), {
      target: { value: '@orono.k12.mn.us' },
    });

    expect(screen.queryByText(/use a full domain with a dot/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /send verification/i }));

    const record = onAdd.mock.calls[0][0] as Partial<DomainRecord>;
    expect(record.domain).toBe('@orono.k12.mn.us');
  });
});
