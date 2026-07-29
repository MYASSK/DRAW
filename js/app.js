// app.js — Entry point

import { initCanvas } from './canvas.js';
import { initToolbar } from './toolbar.js';
import { initSettings } from './settings.js';
import { startBGM } from './bgm.js';

document.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    initToolbar();
    initSettings();

    const startScreen = document.getElementById('startScreen');
    const startBtn = document.getElementById('startBtn');

    startBtn.addEventListener('click', () => {
        startScreen.classList.add('fade-out');
        startBGM();
        startScreen.addEventListener('transitionend', () => {
            startScreen.remove();
        });
    });
});
