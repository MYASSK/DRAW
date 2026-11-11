// bgm.js — Background music playlist player

const TRACKS = [
    'bgm/mus.wav',
    'bgm/ten.wav'
];

let audio = null;
let currentIndex = 0;
let volume = 0;
try { volume = Math.min(1, Math.max(0, Number(localStorage.getItem('draw_bgm_volume')) || 0)); } catch {}

export function getBGMVolume() { return volume; }

export function startBGM() {
    if (audio || volume === 0) return;
    audio = new Audio();
    audio.volume = volume;
    audio.addEventListener('ended', () => {
        currentIndex = (currentIndex + 1) % TRACKS.length;
        setTimeout(() => {
            audio.src = TRACKS[currentIndex];
            if (volume > 0) audio.play().catch(() => {});
        }, 2000);
    });
    audio.src = TRACKS[currentIndex];
    audio.play().catch(() => {});
}

export function setBGMVolume(vol) {
    volume = Math.min(1, Math.max(0, vol));
    try { localStorage.setItem('draw_bgm_volume', String(volume)); } catch {}
    if (!audio && volume > 0) startBGM();
    if (audio) {
        audio.volume = volume;
        if (volume === 0) audio.pause();
        else if (audio.paused) audio.play().catch(() => {});
    }
}
