import React from 'react';
import { createRoot } from 'react-dom/client';
import { PanelShell } from './PanelShell';
import css from './sidepanel.css?inline';
import { loadLexend } from '../fonts';
import { installSelectMenus } from '@/utils/selectMenu';

const style = document.createElement('style');
style.textContent = css;
document.head.append(style);
loadLexend();
installSelectMenus();

const root = document.getElementById('root');
if (root) createRoot(root).render(<PanelShell />);
