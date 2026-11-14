import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OverflowMenu } from './LibraryOverflowMenu';
import { scrollMovesAnchor } from '@/utils/domHelpers';

const scroll = (target: EventTarget) =>
  act(() => {
    target.dispatchEvent(new Event('scroll'));
  });

const renderMenu = () =>
  render(
    <div>
      <div data-testid="pane" />
      <div data-testid="list">
        <OverflowMenu
          widgetType="quiz"
          rowKey="row-1"
          actions={[{ id: 'edit', label: 'Edit', onClick: vi.fn() }]}
        />
      </div>
    </div>
  );

const open = () =>
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

describe('library kebab menu and scrolling', () => {
  it('stays open when an unrelated pane scrolls, like a live tour step list', () => {
    renderMenu();
    open();
    expect(screen.getByRole('menu')).toBeTruthy();
    scroll(screen.getByTestId('pane'));
    expect(screen.queryByRole('menu')).toBeTruthy();
  });

  it('stays open when the menu itself scrolls', () => {
    renderMenu();
    open();
    scroll(screen.getByRole('menu'));
    expect(screen.queryByRole('menu')).toBeTruthy();
  });

  it('closes when a container around the trigger scrolls', () => {
    renderMenu();
    open();
    scroll(screen.getByTestId('list'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes when the page scrolls', () => {
    renderMenu();
    open();
    scroll(document);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('scrollMovesAnchor', () => {
  it('treats a missing anchor or a page scroll as moving it', () => {
    const el = document.createElement('div');
    const at = (target: EventTarget, anchor: Element | null) => {
      let hit = false;
      target.addEventListener('scroll', (e) => {
        hit = scrollMovesAnchor(e, anchor);
      });
      target.dispatchEvent(new Event('scroll'));
      return hit;
    };
    expect(at(el, null)).toBe(true);
    expect(at(document, el)).toBe(true);
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.appendChild(child);
    expect(at(parent, child)).toBe(true);
    expect(at(child, parent)).toBe(false);
  });
});
