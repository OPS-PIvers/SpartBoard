import React from 'react';
import { createRoot } from 'react-dom/client';
import { SidePanel } from './SidePanel';
import css from './sidepanel.css?inline';
import { loadLexend } from '../fonts';

const style = document.createElement('style');
style.textContent = css;
document.head.append(style);
loadLexend();

const root = document.getElementById('root');
if (root) createRoot(root).render(<SidePanel />);
