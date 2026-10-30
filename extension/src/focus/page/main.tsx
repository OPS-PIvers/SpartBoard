import React from 'react';
import { createRoot } from 'react-dom/client';
import { FocusPage, pageMode, PARKED_TITLE } from './FocusPage';
import css from './focus.css?inline';
import { loadLexend } from '../../fonts';

const style = document.createElement('style');
style.textContent = css;
document.head.append(style);
loadLexend();
if (pageMode(window.location.search) === 'parked')
  document.title = PARKED_TITLE;

const root = document.getElementById('root');
if (root) createRoot(root).render(<FocusPage />);
