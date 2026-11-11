// app.js — Entry point

import { initCanvas } from './canvas.js';
import { initToolbar } from './toolbar.js';
import { initSettings } from './settings.js';
import { startBGM } from './bgm.js';
import { initProject } from './project.js';
import { isDesktop } from './desktop.js';

document.addEventListener('DOMContentLoaded', async () => {
    initCanvas();
    initToolbar();
    initSettings();

    const startScreen = document.getElementById('startScreen');
    const startBtn = document.getElementById('startBtn');

    if (isDesktop) {
        startScreen.remove();
        await initProject();
        return;
    }

    startBtn.addEventListener('click', () => {
        startScreen.classList.add('fade-out');
        startBGM();
        startScreen.addEventListener('transitionend', () => startScreen.remove(), { once: true });
    });
    await initProject();
});
