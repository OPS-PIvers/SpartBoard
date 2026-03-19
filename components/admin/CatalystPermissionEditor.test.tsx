import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CatalystPermissionEditor } from './CatalystPermissionEditor';

describe('CatalystPermissionEditor', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the admin-managed stub message', () => {
    render(<CatalystPermissionEditor />);
    expect(screen.getByText('Admin Managed')).toBeInTheDocument();
  });
});
