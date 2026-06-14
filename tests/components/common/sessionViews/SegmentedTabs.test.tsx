import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SegmentedTabs } from '@/components/common/sessionViews/SegmentedTabs';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'students', label: 'Students', count: 4 },
];

describe('SegmentedTabs', () => {
  it('marks the active tab with aria-selected and white surface', () => {
    render(<SegmentedTabs tabs={TABS} value="overview" onChange={vi.fn()} />);
    const active = screen.getByRole('tab', { name: 'Overview' });
    expect(active).toHaveAttribute('aria-selected', 'true');
    expect(active.className).toContain('bg-white');
    expect(active.className).toContain('focus-visible:ring-brand-blue-primary');
  });

  it('fires onChange with the tab key', () => {
    const onChange = vi.fn();
    render(<SegmentedTabs tabs={TABS} value="overview" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Students' }));
    expect(onChange).toHaveBeenCalledWith('students');
  });

  it('renders a count badge when count > 0', () => {
    render(<SegmentedTabs tabs={TABS} value="overview" onChange={vi.fn()} />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('hides labels but keeps icons/aria when labelsHidden', () => {
    render(
      <SegmentedTabs
        tabs={TABS}
        value="overview"
        onChange={vi.fn()}
        labelsHidden
      />
    );
    expect(screen.queryByText('Overview')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
  });
});
