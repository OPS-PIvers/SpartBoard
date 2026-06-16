import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SegmentedTabs } from '@/components/common/sessionViews/SegmentedTabs';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'students', label: 'Students', count: 4 },
];

describe('SegmentedTabs', () => {
  it('marks the active tab with aria-selected and white surface', () => {
    render(
      <SegmentedTabs
        tabs={TABS}
        value="overview"
        onChange={vi.fn()}
        ariaLabel="Sections"
      />
    );
    const active = screen.getByRole('tab', { name: 'Overview' });
    expect(active).toHaveAttribute('aria-selected', 'true');
    expect(active.className).toContain('bg-white');
    expect(active.className).toContain('focus-visible:ring-brand-blue-primary');
  });

  it('fires onChange with the tab key', () => {
    const onChange = vi.fn();
    render(
      <SegmentedTabs
        tabs={TABS}
        value="overview"
        onChange={onChange}
        ariaLabel="Sections"
      />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Students' }));
    expect(onChange).toHaveBeenCalledWith('students');
  });

  it('renders a count badge when count > 0', () => {
    render(
      <SegmentedTabs
        tabs={TABS}
        value="overview"
        onChange={vi.fn()}
        ariaLabel="Sections"
      />
    );
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('hides labels but keeps icons/aria when labelsHidden', () => {
    render(
      <SegmentedTabs
        tabs={TABS}
        value="overview"
        onChange={vi.fn()}
        labelsHidden
        ariaLabel="Sections"
      />
    );
    expect(screen.queryByText('Overview')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
  });

  it('wires id + aria-controls when panelIdPrefix is set', () => {
    render(
      <SegmentedTabs
        tabs={TABS}
        value="overview"
        onChange={vi.fn()}
        ariaLabel="Sections"
        panelIdPrefix="qr"
      />
    );
    const tab = screen.getByRole('tab', { name: 'Overview' });
    expect(tab).toHaveAttribute('id', 'qr-tab-overview');
    expect(tab).toHaveAttribute('aria-controls', 'qr-panel-overview');
  });

  it('moves focus with ArrowRight/ArrowLeft/Home/End per ARIA tablist keyboard pattern', () => {
    const onChange = vi.fn();
    render(
      <SegmentedTabs
        tabs={TABS}
        value="overview"
        onChange={onChange}
        ariaLabel="Sections"
      />
    );
    const firstTab = screen.getByRole('tab', { name: 'Overview' });
    const secondTab = screen.getByRole('tab', { name: /Students/i });

    firstTab.focus();
    expect(firstTab).toHaveFocus();

    // ArrowRight from first tab → second tab
    fireEvent.keyDown(firstTab, { key: 'ArrowRight' });
    expect(secondTab).toHaveFocus();

    // ArrowLeft from second tab → first tab
    fireEvent.keyDown(secondTab, { key: 'ArrowLeft' });
    expect(firstTab).toHaveFocus();

    // ArrowLeft from first tab → wraps to last tab (second)
    fireEvent.keyDown(firstTab, { key: 'ArrowLeft' });
    expect(secondTab).toHaveFocus();

    // ArrowRight from last tab → wraps to first tab
    fireEvent.keyDown(secondTab, { key: 'ArrowRight' });
    expect(firstTab).toHaveFocus();

    // End from first tab → jumps to last tab
    fireEvent.keyDown(firstTab, { key: 'End' });
    expect(secondTab).toHaveFocus();

    // Home from last tab → jumps to first tab
    fireEvent.keyDown(secondTab, { key: 'Home' });
    expect(firstTab).toHaveFocus();
  });

  it('applies roving tabindex: selected tab has tabIndex=0, others have tabIndex=-1', () => {
    render(
      <SegmentedTabs
        tabs={TABS}
        value="overview"
        onChange={vi.fn()}
        ariaLabel="Sections"
      />
    );
    const selectedTab = screen.getByRole('tab', { name: 'Overview' });
    const otherTab = screen.getByRole('tab', { name: /Students/i });
    expect(selectedTab).toHaveAttribute('tabindex', '0');
    expect(otherTab).toHaveAttribute('tabindex', '-1');
  });
});
