import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface PresentWindowProps {
  /** Popup document title. */
  title: string;
  /** Called when the popup closes from the OS or on unmount cleanup. */
  onClose: () => void;
  /** Called when the browser blocked `window.open`. */
  onBlocked: () => void;
  /** Receives the popup window so the teacher panel can drive its media. */
  onWindowReady?: (win: Window | null) => void;
  children: React.ReactNode;
}

// The popup has no bundler, so the parent document's styles are cloned in.
function cloneStyles(target: Document): void {
  if (target === document) return;
  document
    .querySelectorAll('link[rel="stylesheet"], style')
    .forEach((node) => target.head.appendChild(node.cloneNode(true)));
}

/**
 * Hosts the projected presentation in a second window, so the teacher's own
 * screen keeps the private monitor. The portal shares this React tree — and
 * therefore the existing Firestore listener — with the widget.
 */
export const PresentWindow: React.FC<PresentWindowProps> = ({
  title,
  onClose,
  onBlocked,
  onWindowReady,
  children,
}) => {
  // Created up front so the portal has a target on the first render; it stays
  // detached (and therefore invisible) if the browser blocks the popup.
  const [mount] = useState(() => {
    const el = document.createElement('div');
    el.dataset.presentRoot = 'true';
    return el;
  });
  const winRef = useRef<Window | null>(null);
  const cbRef = useRef({ onClose, onBlocked, onWindowReady });
  // Declared before the mount effect so the popup always sees fresh callbacks.
  useEffect(() => {
    cbRef.current = { onClose, onBlocked, onWindowReady };
  });

  useEffect(() => {
    const win = window.open(
      '',
      'spartboard-present',
      'width=1280,height=800,menubar=no,toolbar=no'
    );
    if (!win) {
      cbRef.current.onBlocked();
      return;
    }
    winRef.current = win;
    cloneStyles(win.document);
    win.document.body.className = 'bg-brand-blue-dark';
    win.document.body.appendChild(mount);
    cbRef.current.onWindowReady?.(win);

    const handleUnload = () => cbRef.current.onClose();
    win.addEventListener('beforeunload', handleUnload);
    return () => {
      win.removeEventListener('beforeunload', handleUnload);
      winRef.current = null;
      cbRef.current.onWindowReady?.(null);
      mount.remove();
      win.close();
    };
    // Mount-once: reopening on prop change would steal focus mid-lesson.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (winRef.current) winRef.current.document.title = title;
  }, [title]);

  return createPortal(children, mount);
};
