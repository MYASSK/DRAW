// Pixel documents are independent of their displayed size.
import { drawLine, erase, floodFill, blurStroke } from './tools.js';
import { validateDocumentSize, fitDocumentDisplay, contentRect,
    clientToDocumentPoint, fitImageInside, resizeImageFromCorner } from './canvas-geometry.js';

let canvas, ctx;
let activePointerId = null;
let lastX = 0;
let lastY = 0;
let revision = 0;
let resizeObserver;
const undoStack = [];
const redoStack = [];
const MAX_UNDO = 30;
const MAX_HISTORY_BYTES = 96 * 1024 * 1024;

export const state = {
    currentTool: 'brush', currentColor: 'rgb(0, 0, 0)', brushSize: 5
};

export function initCanvas() {
    if (canvas) return;
    canvas = document.getElementById('drawCanvas');
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.style.touchAction = 'none';
    canvas.style.boxSizing = 'content-box';
    newCanvasDocument();
    window.addEventListener('resize', resizeCanvas);
    if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(resizeCanvas);
        resizeObserver.observe(canvas.parentElement);
    }
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', finishStroke);
    canvas.addEventListener('pointercancel', finishStroke);
    canvas.addEventListener('lostpointercapture', finishStroke);
}

function numericStyle(style, name) {
    return parseFloat(style[name]) || 0;
}

function canvasContentRect() {
    const style = getComputedStyle(canvas);
    return contentRect(canvas.getBoundingClientRect(), {
        left: numericStyle(style, 'borderLeftWidth') + numericStyle(style, 'paddingLeft'),
        right: numericStyle(style, 'borderRightWidth') + numericStyle(style, 'paddingRight'),
        top: numericStyle(style, 'borderTopWidth') + numericStyle(style, 'paddingTop'),
        bottom: numericStyle(style, 'borderBottomWidth') + numericStyle(style, 'paddingBottom')
    });
}

function resizeCanvas() {
    const container = canvas.parentElement;
    const style = getComputedStyle(container);
    const canvasStyle = getComputedStyle(canvas);
    const availableWidth = container.clientWidth - numericStyle(style, 'paddingLeft') -
        numericStyle(style, 'paddingRight') - numericStyle(canvasStyle, 'borderLeftWidth') -
        numericStyle(canvasStyle, 'borderRightWidth') - 4;
    const availableHeight = container.clientHeight - numericStyle(style, 'paddingTop') -
        numericStyle(style, 'paddingBottom') - numericStyle(canvasStyle, 'borderTopWidth') -
        numericStyle(canvasStyle, 'borderBottomWidth') - 4;
    const display = fitDocumentDisplay(canvas.width, canvas.height, availableWidth, availableHeight);
    canvas.style.width = `${display.width}px`;
    canvas.style.height = `${display.height}px`;
    syncImportOverlay();
}

function getCanvasPos(event) {
    return clientToDocumentPoint(event.clientX, event.clientY,
        canvasContentRect(), canvas.width, canvas.height);
}

function insideDocument({ x, y }) {
    return x >= 0 && y >= 0 && x < canvas.width && y < canvas.height;
}

function onPointerDown(event) {
    if (event.button !== 0 || event.isPrimary === false || activePointerId !== null || isImporting()) return;
    const pos = getCanvasPos(event);
    if (!insideDocument(pos)) return;
    event.preventDefault();
    saveState();
    if (state.currentTool === 'fill') {
        floodFill(ctx, Math.floor(pos.x), Math.floor(pos.y), state.currentColor, canvas.width, canvas.height);
        notifyCanvasChanged('fill');
        return;
    }
    activePointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    lastX = pos.x;
    lastY = pos.y;
    drawAt(pos);
}

function drawAt(pos) {
    if (state.currentTool === 'brush') {
        drawLine(ctx, lastX, lastY, pos.x, pos.y, state.currentColor, state.brushSize);
    } else if (state.currentTool === 'eraser') {
        erase(ctx, lastX, lastY, pos.x, pos.y, state.brushSize);
    } else if (state.currentTool === 'blur') {
        blurStroke(ctx, pos.x, pos.y, state.brushSize, canvas.width, canvas.height);
    }
    lastX = pos.x;
    lastY = pos.y;
    // Invalidate async work immediately, before the stroke-end notification.
    revision++;
}

function onPointerMove(event) {
    if (event.pointerId !== activePointerId) return;
    event.preventDefault();
    const coalesced = event.getCoalescedEvents?.();
    for (const sample of coalesced?.length ? coalesced : [event]) drawAt(getCanvasPos(sample));
}

function finishStroke(event) {
    if (activePointerId === null || (event && event.pointerId !== activePointerId)) return;
    const pointerId = activePointerId;
    activePointerId = null;
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    notifyCanvasChanged('stroke');
}

export function finishCanvasStroke() {
    finishStroke();
}

export function notifyCanvasChanged(reason = 'edit') {
    revision++;
    document.dispatchEvent(new CustomEvent('draw:change', { detail: { reason } }));
}

export function getCanvasRevision() {
    return revision;
}

function historyBytes() {
    return [...undoStack, ...redoStack].reduce((sum, image) => sum + image.data.byteLength, 0);
}

function trimHistory(preferredStack) {
    while (undoStack.length > MAX_UNDO) undoStack.shift();
    while (redoStack.length > MAX_UNDO) redoStack.shift();
    // Both stacks share one budget; discard the farthest reachable states first.
    while (historyBytes() > MAX_HISTORY_BYTES) {
        const otherStack = preferredStack === undoStack ? redoStack : undoStack;
        if (otherStack.length) otherStack.shift();
        else if (preferredStack.length) preferredStack.shift();
        else break;
    }
}

export function saveState() {
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    redoStack.length = 0;
    trimHistory(undoStack);
}

export function undo() {
    if (!undoStack.length) return;
    finishStroke();
    const previous = undoStack.pop();
    redoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(previous, 0, 0);
    trimHistory(redoStack);
    notifyCanvasChanged('undo');
}

export function redo() {
    if (!redoStack.length) return;
    finishStroke();
    const next = redoStack.pop();
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(next, 0, 0);
    trimHistory(undoStack);
    notifyCanvasChanged('redo');
}

export function clearCanvas() {
    finishStroke();
    saveState();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    notifyCanvasChanged('clear');
}

export function getCanvasDataURL() {
    return canvas.toDataURL('image/png');
}

export function getCanvasBase64() {
    return getCanvasDataURL().split(',')[1];
}

function abortError() {
    return new DOMException('操作已取消。', 'AbortError');
}

function decodeImage(source, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(abortError()); return; }
        const img = new Image();
        const cleanup = () => {
            img.onload = null;
            img.onerror = null;
            signal?.removeEventListener('abort', onAbort);
        };
        const onAbort = () => { cleanup(); img.src = ''; reject(abortError()); };
        img.onload = () => {
            cleanup();
            try {
                validateDocumentSize(img.naturalWidth || img.width, img.naturalHeight || img.height);
                resolve(img);
            } catch (error) { reject(error); }
        };
        img.onerror = () => { cleanup(); reject(new Error('图片无法读取，请选择有效的 PNG、JPEG 或 WebP 图片。')); };
        signal?.addEventListener('abort', onAbort, { once: true });
        img.src = source;
    });
}

function checkPendingEdit(expectedRevision, signal) {
    if (signal?.aborted) throw abortError();
    if (expectedRevision !== revision) throw new Error('画布已发生变化，请重新生成。');
}

export async function loadImageToCanvas(base64Data, options = {}) {
    const expectedRevision = options.expectedRevision ?? revision;
    const source = base64Data.startsWith('data:image/') ? base64Data : `data:image/png;base64,${base64Data}`;
    const img = await decodeImage(source, options.signal);
    checkPendingEdit(expectedRevision, options.signal);
    const staged = document.createElement('canvas');
    staged.width = canvas.width;
    staged.height = canvas.height;
    const stageCtx = staged.getContext('2d');
    stageCtx.fillStyle = '#ffffff';
    stageCtx.fillRect(0, 0, staged.width, staged.height);
    const rect = fitImageInside(img.naturalWidth || img.width, img.naturalHeight || img.height,
        staged.width, staged.height);
    stageCtx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
    checkPendingEdit(expectedRevision, options.signal);
    saveState();
    ctx.drawImage(staged, 0, 0);
    notifyCanvasChanged('ai');
}

function resetDocument(width, height, image = null) {
    cancelImport();
    if (activePointerId !== null) {
        const pointerId = activePointerId;
        activePointerId = null;
        if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    }
    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    if (image) ctx.drawImage(image, 0, 0);
    undoStack.length = 0;
    redoStack.length = 0;
    revision++;
    resizeCanvas();
}

export function newCanvasDocument(width = 1280, height = 720) {
    validateDocumentSize(width, height);
    resetDocument(width, height);
}

export async function replaceCanvasDocument({ width, height, imageDataURL }) {
    validateDocumentSize(width, height);
    if (typeof imageDataURL !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/i.test(imageDataURL)) {
        throw new Error('项目图片必须是 PNG、JPEG 或 WebP 的 data URL。');
    }
    const expectedRevision = revision;
    const img = await decodeImage(imageDataURL);
    if ((img.naturalWidth || img.width) !== width || (img.naturalHeight || img.height) !== height) {
        throw new Error('项目声明的画布尺寸与图片尺寸不一致。');
    }
    if (expectedRevision !== revision) throw new Error('读取项目时画布已变化，请重新打开项目。');
    resetDocument(width, height, img);
}

export function getCanvasSize() {
    return { width: canvas.width, height: canvas.height };
}

export function getCanvasCtx() {
    return { ctx, canvas };
}

export function saveCanvasAsFile() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const filename = `DRAW_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;
    const link = document.createElement('a');
    link.download = filename;
    link.href = getCanvasDataURL();
    link.click();
}

// Imported images stay in document coordinates; only the overlay follows the viewport.
let importState = null;
let pendingImport = null;
let importGeneration = 0;
let importOverlayCanvas = null;
let importOverlayCtx = null;
const HANDLE_SIZE = 10;

export async function startImageImport(file, onConfirm, onCancel) {
    cancelImport();
    const generation = ++importGeneration;
    const controller = new AbortController();
    pendingImport = { controller, onCancel };
    let url;
    try {
        url = URL.createObjectURL(file);
        const img = await decodeImage(url, controller.signal);
        if (generation !== importGeneration) return false;
        pendingImport = null;
        const placement = fitImageInside(img.naturalWidth || img.width, img.naturalHeight || img.height,
            canvas.width * 0.8, canvas.height * 0.8, 1);
        importState = {
            img, ...placement,
            x: placement.x + canvas.width * 0.1,
            y: placement.y + canvas.height * 0.1,
            originalAspect: (img.naturalWidth || img.width) / (img.naturalHeight || img.height),
            dragging: false, resizing: false, pointerId: null,
            dragOffX: 0, dragOffY: 0, resizeCorner: null, onConfirm, onCancel
        };
        createImportOverlay();
        drawImportOverlay();
        return true;
    } catch (error) {
        if (generation === importGeneration) {
            pendingImport = null;
            removeImportOverlay();
            onCancel?.(error);
            if (!onCancel && error.name !== 'AbortError') {
                document.dispatchEvent(new CustomEvent('draw:error', { detail: { message: error.message } }));
            }
        }
        return false;
    } finally {
        if (url) URL.revokeObjectURL(url);
    }
}

function createImportOverlay() {
    importOverlayCanvas = document.createElement('canvas');
    importOverlayCanvas.id = 'importOverlay';
    importOverlayCanvas.width = canvas.width;
    importOverlayCanvas.height = canvas.height;
    Object.assign(importOverlayCanvas.style, {
        position: 'absolute', cursor: 'move', zIndex: '100', touchAction: 'none',
        border: '0', padding: '0', margin: '0', boxSizing: 'content-box'
    });
    canvas.parentElement.style.position = 'relative';
    canvas.parentElement.appendChild(importOverlayCanvas);
    importOverlayCtx = importOverlayCanvas.getContext('2d');
    importOverlayCanvas.addEventListener('pointerdown', onImportPointerDown);
    importOverlayCanvas.addEventListener('pointermove', onImportPointerMove);
    importOverlayCanvas.addEventListener('pointerup', onImportPointerUp);
    importOverlayCanvas.addEventListener('pointercancel', onImportPointerUp);
    importOverlayCanvas.addEventListener('lostpointercapture', onImportPointerUp);
    window.addEventListener('keydown', onImportKeyDown);
    syncImportOverlay();
}

function syncImportOverlay() {
    if (!importOverlayCanvas) return;
    const rect = canvasContentRect();
    const parent = canvas.parentElement;
    const parentRect = parent.getBoundingClientRect();
    importOverlayCanvas.style.left = `${rect.left - parentRect.left - parent.clientLeft + parent.scrollLeft}px`;
    importOverlayCanvas.style.top = `${rect.top - parentRect.top - parent.clientTop + parent.scrollTop}px`;
    importOverlayCanvas.style.width = `${rect.width}px`;
    importOverlayCanvas.style.height = `${rect.height}px`;
    drawImportOverlay();
}

function removeImportOverlay() {
    importOverlayCanvas?.remove();
    importOverlayCanvas = null;
    importOverlayCtx = null;
    window.removeEventListener('keydown', onImportKeyDown);
    importState = null;
}

function handleSizeInDocument() {
    return HANDLE_SIZE * canvas.width / canvasContentRect().width;
}

function getHandle(x, y) {
    if (!importState) return null;
    const s = importState;
    const radius = handleSizeInDocument();
    for (const [name, cx, cy] of [
        ['tl', s.x, s.y], ['tr', s.x + s.w, s.y],
        ['bl', s.x, s.y + s.h], ['br', s.x + s.w, s.y + s.h]
    ]) {
        if (Math.abs(x - cx) <= radius && Math.abs(y - cy) <= radius) return name;
    }
    return null;
}

function onImportPointerDown(event) {
    if (!importState || event.button !== 0 || event.isPrimary === false || importState.pointerId !== null) return;
    const { x, y } = getCanvasPos(event);
    const handle = getHandle(x, y);
    const s = importState;
    if (handle) {
        s.resizing = true;
        s.resizeCorner = handle;
        s.resizeStart = { x: s.x, y: s.y, w: s.w, h: s.h, originalAspect: s.originalAspect };
    } else if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) {
        s.dragging = true;
        s.dragOffX = x - s.x;
        s.dragOffY = y - s.y;
    } else return;
    event.preventDefault();
    s.pointerId = event.pointerId;
    importOverlayCanvas.setPointerCapture(event.pointerId);
}

function onImportPointerMove(event) {
    if (!importState) return;
    const { x, y } = getCanvasPos(event);
    const s = importState;
    const handle = getHandle(x, y);
    importOverlayCanvas.style.cursor = handle ?
        ((handle === 'tl' || handle === 'br') ? 'nwse-resize' : 'nesw-resize') :
        (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h ? 'move' : 'default');
    if (event.pointerId !== s.pointerId) return;
    event.preventDefault();
    if (s.dragging) {
        // Keep a small portion accessible for dragging back into view.
        s.x = Math.max(10 - s.w, Math.min(canvas.width - 10, x - s.dragOffX));
        s.y = Math.max(10 - s.h, Math.min(canvas.height - 10, y - s.dragOffY));
    } else if (s.resizing) {
        Object.assign(s, resizeImageFromCorner(s.resizeStart, s.resizeCorner, x, y, !event.shiftKey));
    }
    drawImportOverlay();
}

function onImportPointerUp(event) {
    if (!importState || event.pointerId !== importState.pointerId) return;
    const pointerId = importState.pointerId;
    importState.pointerId = null;
    importState.dragging = false;
    importState.resizing = false;
    importState.resizeCorner = null;
    if (importOverlayCanvas.hasPointerCapture(pointerId)) importOverlayCanvas.releasePointerCapture(pointerId);
}

function onImportKeyDown(event) {
    if (event.key === 'Escape') cancelImport();
    if (event.key === 'Enter' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) confirmImport();
}

function drawImportOverlay() {
    if (!importOverlayCtx || !importState) return;
    const octx = importOverlayCtx;
    const { img, x, y, w, h } = importState;
    const handle = handleSizeInDocument();
    const scale = canvas.width / canvasContentRect().width;
    octx.clearRect(0, 0, canvas.width, canvas.height);
    octx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    octx.fillRect(0, 0, canvas.width, canvas.height);
    octx.clearRect(x, y, w, h);
    octx.drawImage(img, x, y, w, h);
    octx.strokeStyle = '#00a660';
    octx.lineWidth = 2 * scale;
    octx.setLineDash([6 * scale, 4 * scale]);
    octx.strokeRect(x, y, w, h);
    octx.setLineDash([]);
    octx.fillStyle = '#ffffff';
    for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
        octx.fillRect(cx - handle / 2, cy - handle / 2, handle, handle);
        octx.strokeRect(cx - handle / 2, cy - handle / 2, handle, handle);
    }
}

export function confirmImport() {
    if (!importState) return;
    saveState();
    const { img, x, y, w, h, onConfirm } = importState;
    ctx.drawImage(img, x, y, w, h);
    removeImportOverlay();
    notifyCanvasChanged('import');
    onConfirm?.();
}

export function cancelImport() {
    importGeneration++;
    if (pendingImport) {
        const { controller, onCancel } = pendingImport;
        pendingImport = null;
        controller.abort();
        onCancel?.();
    }
    if (importState) {
        const { onCancel } = importState;
        removeImportOverlay();
        onCancel?.();
    }
}

export function isImporting() {
    return importState !== null || pendingImport !== null;
}
