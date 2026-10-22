import React from 'react';
import { createRoot } from 'react-dom/client';
import { SidePanel } from './SidePanel';
import css from './sidepanel.css?inline';

const style = document.createElement('style');
style.textContent = css;
document.head.append(style);

const root = document.getElementById('root');
if (root) createRoot(root).render(<SidePanel />);
