// app.js — Entry point

import { initCanvas } from './canvas.js';
import { initToolbar } from './toolbar.js';
import { initSettings } from './settings.js';

document.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    initToolbar();
    initSettings();
});
