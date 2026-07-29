// bgm.js — Background music playlist player

const TRACKS = [
    'bgm/mus.wav',
    'bgm/ten.wav'
];

let audio = null;
let currentIndex = 0;

export function startBGM() {
    audio = new Audio();
    audio.volume = 0.5;
    audio.addEventListener('ended', () => {
        currentIndex = (currentIndex + 1) % TRACKS.length;
        setTimeout(() => {
            audio.src = TRACKS[currentIndex];
            audio.play();
        }, 2000);
    });
    audio.src = TRACKS[currentIndex];
    audio.play();
}

export function setBGMVolume(vol) {
    if (audio) audio.volume = vol;
}
