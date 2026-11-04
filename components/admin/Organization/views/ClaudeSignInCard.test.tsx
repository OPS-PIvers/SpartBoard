import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OrgRecord } from '@/components/admin/Organization/types';
import { ClaudeSignInCard } from './ClaudeSignInCard';

const ORG = {
  id: 'orono',
  name: 'Orono',
} as unknown as OrgRecord;

const ISSUER = 'https://identity.anthropic.com/issuers/abc123';

describe('ClaudeSignInCard', () => {
  it('saves the issuer and switch together', async () => {
    const onUpdate = vi.fn();
    render(<ClaudeSignInCard org={ORG} canEdit onUpdate={onUpdate} />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await userEvent.type(
      screen.getByPlaceholderText(/identity\.anthropic\.com/),
      ` ${ISSUER} `
    );
    await userEvent.click(
      screen.getByRole('switch', {
        name: /Sign staff in to the Claude connector/,
      })
    );
    await userEvent.click(save);
    expect(onUpdate).toHaveBeenCalledWith({
      claudeManagedAuth: { enabled: true, issuer: ISSUER },
    });
  });

  it('will not save a non-https issuer or turn on without one', async () => {
    render(<ClaudeSignInCard org={ORG} canEdit onUpdate={vi.fn()} />);
    const save = screen.getByRole('button', { name: 'Save' });
    await userEvent.click(
      screen.getByRole('switch', {
        name: /Sign staff in to the Claude connector/,
      })
    );
    expect(save).toBeDisabled();
    await userEvent.type(
      screen.getByPlaceholderText(/identity\.anthropic\.com/),
      'http://identity.anthropic.com/issuers/x'
    );
    expect(save).toBeDisabled();
    expect(screen.getByText('Enter an https:// URL')).toBeInTheDocument();
  });

  it('shows the org id as the tenant ID and is read-only for building admins', () => {
    render(
      <ClaudeSignInCard
        org={{
          ...ORG,
          claudeManagedAuth: { enabled: true, issuer: ISSUER },
        }}
        canEdit={false}
        onUpdate={vi.fn()}
      />
    );
    expect(screen.getByDisplayValue('orono')).toBeInTheDocument();
    expect(screen.getByDisplayValue(ISSUER)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
