import React from 'react';
import {createRoot} from 'react-dom/client';
import {PreviewApp} from './PreviewApp';
import '../../src/styles/themes.css';
import './style.css';
import { resolveStoryForgeTheme } from '../../src/lib/theme';
// The design preview can read appearance preferences, but must never persist data.
document.documentElement.setAttribute('data-theme', resolveStoryForgeTheme(localStorage.getItem('storyforge-theme')));
createRoot(document.getElementById('root')!).render(<React.StrictMode><PreviewApp/></React.StrictMode>);
