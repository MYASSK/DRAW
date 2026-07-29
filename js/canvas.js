// canvas.js — Canvas management and event handling

import { drawLine, erase, floodFill, blurStroke } from './tools.js';

let canvas, ctx;
let isDrawing = false;
let lastX = 0;
let lastY = 0;

// Undo/Redo history
const undoStack = [];
const redoStack = [];
const MAX_UNDO = 30;

// State shared with toolbar
export const state = {
    currentTool: 'brush',
    currentColor: 'rgb(0, 0, 0)',
    brushSize: 5
};

export function initCanvas() {
    canvas = document.getElementById('drawCanvas');
    ctx = canvas.getContext('2d');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);

    // Prevent page zoom (Ctrl+scroll, Ctrl+plus/minus)
    window.addEventListener('wheel', (e) => {
        if (e.ctrlKey) e.preventDefault();
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0')) {
            e.preventDefault();
        }
    });
}

let hasDrawn = false;

function resizeCanvas() {
    const container = document.getElementById('canvas-container');
    const w = container.clientWidth - 16;
    const h = container.clientHeight - 16;

    // Save current drawing at full old size before resizing
    const oldW = canvas.width;
    const oldH = canvas.height;
    const tempImage = (ctx && hasDrawn) ? ctx.getImageData(0, 0, oldW, oldH) : null;

    canvas.width = w;
    canvas.height = h;

    // Fill white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Restore drawing if existed — use drawImage to preserve content at any size
    if (tempImage) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = oldW;
        tempCanvas.height = oldH;
        tempCanvas.getContext('2d').putImageData(tempImage, 0, 0);
        ctx.drawImage(tempCanvas, 0, 0);
    }

    hasDrawn = true;
}

function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: Math.floor(e.clientX - rect.left),
        y: Math.floor(e.clientY - rect.top)
    };
}

function onMouseDown(e) {
    const pos = getCanvasPos(e);

    // Save state before any drawing action
    saveState();

    if (state.currentTool === 'fill') {
        floodFill(ctx, pos.x, pos.y, state.currentColor, canvas.width, canvas.height);
        return;
    }

    isDrawing = true;
    lastX = pos.x;
    lastY = pos.y;

    // Draw a dot on click
    if (state.currentTool === 'brush') {
        drawLine(ctx, lastX, lastY, lastX, lastY, state.currentColor, state.brushSize);
    } else if (state.currentTool === 'eraser') {
        erase(ctx, lastX, lastY, lastX, lastY, state.brushSize);
    } else if (state.currentTool === 'blur') {
        blurStroke(ctx, lastX, lastY, state.brushSize, canvas.width, canvas.height);
    }
}

function onMouseMove(e) {
    if (!isDrawing) return;

    const pos = getCanvasPos(e);

    if (state.currentTool === 'brush') {
        drawLine(ctx, lastX, lastY, pos.x, pos.y, state.currentColor, state.brushSize);
    } else if (state.currentTool === 'eraser') {
        erase(ctx, lastX, lastY, pos.x, pos.y, state.brushSize);
    } else if (state.currentTool === 'blur') {
        blurStroke(ctx, pos.x, pos.y, state.brushSize, canvas.width, canvas.height);
    }

    lastX = pos.x;
    lastY = pos.y;
}

function onMouseUp() {
    isDrawing = false;
}

export function clearCanvas() {
    saveState();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

export function saveState() {
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.length > MAX_UNDO) {
        undoStack.shift();
    }
    // New drawing action clears redo history
    redoStack.length = 0;
}

export function undo() {
    if (undoStack.length === 0) return;
    // Save current state to redo stack before undoing
    redoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    const imageData = undoStack.pop();
    ctx.putImageData(imageData, 0, 0);
}

export function redo() {
    if (redoStack.length === 0) return;
    // Save current state to undo stack before redoing
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    const imageData = redoStack.pop();
    ctx.putImageData(imageData, 0, 0);
}

export function getCanvasDataURL() {
    return canvas.toDataURL('image/png');
}

export function getCanvasBase64() {
    return canvas.toDataURL('image/png').split(',')[1];
}

export function loadImageToCanvas(base64Data) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve();
        };
        img.onerror = reject;
        img.src = `data:image/png;base64,${base64Data}`;
    });
}

export function getCanvasSize() {
    return { width: canvas.width, height: canvas.height };
}

export function getCanvasCtx() {
    return { ctx, canvas };
}

export function saveCanvasAsFile() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const filename = `DRAW_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

// Import image overlay system
let importState = null; // { img, x, y, w, h, dragging, resizing, ... }
let importOverlayCanvas = null;
let importOverlayCtx = null;

export function startImageImport(file, onConfirm, onCancel) {
    const img = new Image();
    img.onload = () => {
        // Scale image to fit within canvas, max 80% of canvas size
        let w = img.width;
        let h = img.height;
        const maxW = canvas.width * 0.8;
        const maxH = canvas.height * 0.8;
        if (w > maxW || h > maxH) {
            const scale = Math.min(maxW / w, maxH / h);
            w = Math.floor(w * scale);
            h = Math.floor(h * scale);
        }
        const x = Math.floor((canvas.width - w) / 2);
        const y = Math.floor((canvas.height - h) / 2);

        importState = {
            img, x, y, w, h,
            originalAspect: img.width / img.height,
            dragging: false, resizing: false,
            dragOffX: 0, dragOffY: 0,
            resizeCorner: null,
            onConfirm, onCancel
        };

        createImportOverlay();
        drawImportOverlay();
    };
    img.src = URL.createObjectURL(file);
}

function createImportOverlay() {
    importOverlayCanvas = document.createElement('canvas');
    importOverlayCanvas.id = 'importOverlay';
    importOverlayCanvas.width = canvas.width;
    importOverlayCanvas.height = canvas.height;

    // Position overlay exactly on top of the canvas using its bounding rect
    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = canvas.parentElement.getBoundingClientRect();
    importOverlayCanvas.style.position = 'absolute';
    importOverlayCanvas.style.top = (canvasRect.top - containerRect.top) + 'px';
    importOverlayCanvas.style.left = (canvasRect.left - containerRect.left) + 'px';
    importOverlayCanvas.style.cursor = 'move';
    importOverlayCanvas.style.zIndex = '100';
    canvas.parentElement.style.position = 'relative';
    canvas.parentElement.appendChild(importOverlayCanvas);
    importOverlayCtx = importOverlayCanvas.getContext('2d');

    importOverlayCanvas.addEventListener('mousedown', onImportMouseDown);
    importOverlayCanvas.addEventListener('mousemove', onImportMouseMove);
    importOverlayCanvas.addEventListener('mouseup', onImportMouseUp);
    importOverlayCanvas.addEventListener('mouseleave', onImportMouseUp);
    window.addEventListener('keydown', onImportKeyDown);
}

function removeImportOverlay() {
    if (importOverlayCanvas) {
        importOverlayCanvas.remove();
        importOverlayCanvas = null;
        importOverlayCtx = null;
    }
    window.removeEventListener('keydown', onImportKeyDown);
    importState = null;
}

const HANDLE_SIZE = 10;

function getHandle(mx, my) {
    if (!importState) return null;
    const { x, y, w, h } = importState;
    const corners = [
        { name: 'tl', cx: x, cy: y },
        { name: 'tr', cx: x + w, cy: y },
        { name: 'bl', cx: x, cy: y + h },
        { name: 'br', cx: x + w, cy: y + h }
    ];
    for (const c of corners) {
        if (Math.abs(mx - c.cx) <= HANDLE_SIZE && Math.abs(my - c.cy) <= HANDLE_SIZE) {
            return c.name;
        }
    }
    return null;
}

function onImportMouseDown(e) {
    if (!importState) return;
    const rect = importOverlayCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const handle = getHandle(mx, my);
    if (handle) {
        importState.resizing = true;
        importState.resizeCorner = handle;
        return;
    }

    const { x, y, w, h } = importState;
    if (mx >= x && mx <= x + w && my >= y && my <= y + h) {
        importState.dragging = true;
        importState.dragOffX = mx - x;
        importState.dragOffY = my - y;
    }
}

function onImportMouseMove(e) {
    if (!importState) return;
    const rect = importOverlayCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Update cursor
    const handle = getHandle(mx, my);
    if (handle) {
        importOverlayCanvas.style.cursor = (handle === 'tl' || handle === 'br') ? 'nwse-resize' : 'nesw-resize';
    } else {
        const { x, y, w, h } = importState;
        importOverlayCanvas.style.cursor = (mx >= x && mx <= x + w && my >= y && my <= y + h) ? 'move' : 'default';
    }

    if (importState.dragging) {
        importState.x = mx - importState.dragOffX;
        importState.y = my - importState.dragOffY;
        drawImportOverlay();
    } else if (importState.resizing) {
        const lockAspect = !e.shiftKey;
        resizeImport(mx, my, lockAspect);
        drawImportOverlay();
    }
}

function resizeImport(mx, my, lockAspect) {
    const s = importState;
    const corner = s.resizeCorner;
    let newX = s.x, newY = s.y, newW = s.w, newH = s.h;

    if (corner === 'br') {
        newW = Math.max(20, mx - s.x);
        newH = Math.max(20, my - s.y);
    } else if (corner === 'bl') {
        newW = Math.max(20, (s.x + s.w) - mx);
        newH = Math.max(20, my - s.y);
        newX = mx;
    } else if (corner === 'tr') {
        newW = Math.max(20, mx - s.x);
        newH = Math.max(20, (s.y + s.h) - my);
        newY = my;
    } else if (corner === 'tl') {
        newW = Math.max(20, (s.x + s.w) - mx);
        newH = Math.max(20, (s.y + s.h) - my);
        newX = mx;
        newY = my;
    }

    if (lockAspect) {
        const aspect = s.originalAspect;
        if (newW / newH > aspect) {
            newW = Math.floor(newH * aspect);
        } else {
            newH = Math.floor(newW / aspect);
        }
    }

    s.x = newX;
    s.y = newY;
    s.w = newW;
    s.h = newH;
}

function onImportMouseUp() {
    if (!importState) return;
    importState.dragging = false;
    importState.resizing = false;
    importState.resizeCorner = null;
}

function onImportKeyDown(e) {
    if (e.key === 'Escape' && importState) {
        const cb = importState.onCancel;
        removeImportOverlay();
        if (cb) cb();
    }
}

function drawImportOverlay() {
    if (!importOverlayCtx || !importState) return;
    const octx = importOverlayCtx;
    const { img, x, y, w, h } = importState;

    octx.clearRect(0, 0, importOverlayCanvas.width, importOverlayCanvas.height);

    // Semi-transparent background
    octx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    octx.fillRect(0, 0, importOverlayCanvas.width, importOverlayCanvas.height);
    octx.clearRect(x, y, w, h);

    // Draw image
    octx.drawImage(img, x, y, w, h);

    // Draw border
    octx.strokeStyle = '#00ff00';
    octx.lineWidth = 2;
    octx.setLineDash([6, 4]);
    octx.strokeRect(x, y, w, h);
    octx.setLineDash([]);

    // Draw corner handles
    octx.fillStyle = '#ff0000';
    const corners = [
        [x, y], [x + w, y], [x, y + h], [x + w, y + h]
    ];
    for (const [cx, cy] of corners) {
        octx.fillRect(cx - HANDLE_SIZE / 2, cy - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    }
}

export function confirmImport() {
    if (!importState) return;
    saveState();
    const { img, x, y, w, h, onConfirm } = importState;
    ctx.drawImage(img, x, y, w, h);
    removeImportOverlay();
    if (onConfirm) onConfirm();
}

export function cancelImport() {
    if (!importState) return;
    const cb = importState.onCancel;
    removeImportOverlay();
    if (cb) cb();
}

export function isImporting() {
    return importState !== null;
}
