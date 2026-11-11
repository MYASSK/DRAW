import test from 'node:test';
import assert from 'node:assert/strict';

let instance = 0;
async function setup() {
    class FakeTarget {
        constructor() { this.listeners = new Map(); this.style = {}; }
        addEventListener(type, callback) {
            if (!this.listeners.has(type)) this.listeners.set(type, new Set());
            this.listeners.get(type).add(callback);
        }
        removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
        dispatchEvent(event) { for (const callback of this.listeners.get(event.type) || []) callback(event); }
    }
    class FakeCanvas extends FakeTarget {
        constructor() {
            super(); this._width = 300; this._height = 150; this.token = 'initial';
            this.captured = new Set(); this.dimensionsWritten = 0;
            this.ctx = {
                fillStyle: '', calls: [],
                fillRect: (...args) => { this.token = this.ctx.fillStyle; this.ctx.calls.push(['fillRect', ...args]); },
                clearRect: () => {}, strokeRect: () => {}, setLineDash: () => {},
                beginPath: () => {}, arc: (...args) => this.ctx.calls.push(['arc', ...args]),
                fill: () => { this.token = 'stroke'; }, moveTo: () => {}, lineTo: () => {},
                stroke: () => { this.token = 'stroke'; },
                getImageData: () => ({ width: this.width, height: this.height,
                    data: { byteLength: this.width * this.height * 4 }, token: this.token }),
                putImageData: image => { this.token = image.token; },
                drawImage: (image, ...args) => { this.token = image.token || 'image'; this.ctx.calls.push(['drawImage', image, ...args]); }
            };
        }
        get width() { return this._width; }
        set width(value) { this._width = value; this.token = 'reset'; this.dimensionsWritten++; }
        get height() { return this._height; }
        set height(value) { this._height = value; this.token = 'reset'; this.dimensionsWritten++; }
        getContext() { return this.ctx; }
        getBoundingClientRect() {
            return { left: 100, top: 80, width: parseFloat(this.style.width || this.width) + 6,
                height: parseFloat(this.style.height || this.height) + 6 };
        }
        setPointerCapture(id) { this.captured.add(id); }
        hasPointerCapture(id) { return this.captured.has(id); }
        releasePointerCapture(id) { this.captured.delete(id); }
        toDataURL() { return 'data:image/png;base64,dGVzdA=='; }
        remove() { this.parentElement.children = this.parentElement.children.filter(item => item !== this); }
    }
    const windowTarget = new FakeTarget();
    const documentTarget = new FakeTarget();
    const parent = new FakeTarget();
    Object.assign(parent, { clientWidth: 658, clientHeight: 500, clientLeft: 0, clientTop: 2,
        scrollLeft: 0, scrollTop: 0, children: [], getBoundingClientRect: () => ({ left: 80, top: 60 }),
        appendChild(child) { child.parentElement = this; this.children.push(child); } });
    const canvas = new FakeCanvas(); canvas.id = 'drawCanvas'; canvas.parentElement = parent;
    const created = [];
    documentTarget.getElementById = id => id === 'drawCanvas' ? canvas : null;
    documentTarget.createElement = tag => {
        assert.equal(tag, 'canvas');
        const element = new FakeCanvas(); created.push(element); return element;
    };
    const images = [];
    class FakeImage {
        constructor() { images.push(this); }
        set src(value) { this.source = value; }
        succeed(width, height) { this.naturalWidth = width; this.naturalHeight = height; this.onload?.(); }
        fail() { this.onerror?.(); }
    }
    const revoked = [];
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:test-image';
    URL.revokeObjectURL = url => revoked.push(url);
    Object.assign(globalThis, {
        window: windowTarget, document: documentTarget, Image: FakeImage,
        getComputedStyle: element => element === parent ? {
            paddingLeft: '4px', paddingRight: '4px', paddingTop: '4px', paddingBottom: '4px'
        } : { borderLeftWidth: '3px', borderRightWidth: '3px', borderTopWidth: '3px', borderBottomWidth: '3px' }
    });
    const module = await import(`../js/canvas.js?test=${++instance}`);
    module.initCanvas();
    const changes = [];
    documentTarget.addEventListener('draw:change', event => changes.push(event.detail.reason));
    return { module, canvas, parent, window: windowTarget, images, revoked, created, changes,
        cleanup() { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; } };
}

function pointer(type, values = {}) {
    return { type, pointerId: 1, isPrimary: true, button: 0,
        clientX: 423, clientY: 263, preventDefault() {}, ...values };
}

test('shrinking and restoring the viewport leaves document pixels, size and revision intact', async () => {
    const h = await setup();
    try {
        const { module, canvas, parent, window } = h;
        canvas.token = 'drawing-at-right-edge';
        const revision = module.getCanvasRevision();
        const dimensionsWritten = canvas.dimensionsWritten;
        parent.clientWidth = 300; window.dispatchEvent({ type: 'resize' });
        assert.equal(canvas.token, 'drawing-at-right-edge');
        parent.clientWidth = 1800; window.dispatchEvent({ type: 'resize' });
        assert.deepEqual(module.getCanvasSize(), { width: 1280, height: 720 });
        assert.equal(canvas.token, 'drawing-at-right-edge');
        assert.equal(canvas.dimensionsWritten, dimensionsWritten);
        assert.equal(module.getCanvasRevision(), revision);
        assert.deepEqual(h.changes, []);
    } finally { h.cleanup(); }
});

test('pointer input maps scaled content coordinates and notifies once on cancellation', async () => {
    const h = await setup();
    try {
        const revision = h.module.getCanvasRevision();
        h.canvas.dispatchEvent(pointer('pointerdown', { clientX: 101 })); // Border: ignore.
        assert.equal(h.module.getCanvasRevision(), revision);
        h.canvas.dispatchEvent(pointer('pointerdown'));
        const dot = h.canvas.ctx.calls.find(call => call[0] === 'arc');
        assert.deepEqual(dot.slice(1, 3), [640, 360]);
        assert.equal(h.canvas.captured.has(1), true);
        assert.ok(h.module.getCanvasRevision() > revision);
        assert.deepEqual(h.changes, []);
        h.canvas.dispatchEvent(pointer('pointercancel'));
        h.canvas.dispatchEvent(pointer('lostpointercapture'));
        assert.equal(h.canvas.captured.size, 0);
        assert.deepEqual(h.changes, ['stroke']);
    } finally { h.cleanup(); }
});

test('history has a shared 96 MiB budget and supports undo/redo after viewport changes', async () => {
    const h = await setup();
    try {
        h.module.newCanvasDocument(4096, 4096); // Each snapshot is 64 MiB.
        h.canvas.token = 'first'; h.module.saveState();
        h.canvas.token = 'second'; h.module.saveState();
        h.canvas.token = 'third';
        h.parent.clientWidth = 200; h.window.dispatchEvent({ type: 'resize' });
        h.module.undo(); assert.equal(h.canvas.token, 'second');
        h.module.undo(); assert.equal(h.canvas.token, 'second'); // First state was evicted.
        h.module.redo(); assert.equal(h.canvas.token, 'third');
        assert.deepEqual(h.changes, ['undo', 'redo']);
    } finally { h.cleanup(); }
});

test('finishing an active stroke before a document action publishes it exactly once', async () => {
    const h = await setup();
    try {
        h.canvas.dispatchEvent(pointer('pointerdown'));
        h.module.finishCanvasStroke();
        assert.deepEqual(h.changes, ['stroke']);
        assert.equal(h.canvas.captured.size, 0);
        h.canvas.dispatchEvent(pointer('pointerup'));
        h.module.finishCanvasStroke();
        assert.deepEqual(h.changes, ['stroke']);
        h.module.undo();
        assert.equal(h.canvas.token, '#ffffff');
    } finally { h.cleanup(); }
});

test('history retains at most 30 steps and a new edit invalidates redo', async () => {
    const h = await setup();
    try {
        h.module.newCanvasDocument(10, 10);
        for (let i = 0; i < 35; i++) { h.canvas.token = `state-${i}`; h.module.saveState(); }
        h.canvas.token = 'latest';
        for (let i = 0; i < 40; i++) h.module.undo();
        assert.equal(h.canvas.token, 'state-5');
        assert.equal(h.changes.length, 30);
        h.canvas.token = 'new-edit'; h.module.saveState(); h.canvas.token = 'after-edit';
        h.module.redo(); assert.equal(h.canvas.token, 'after-edit');
    } finally { h.cleanup(); }
});

test('failed or mismatched project decode preserves the live document and its history', async () => {
    const h = await setup();
    try {
        h.canvas.token = 'before'; h.module.saveState(); h.canvas.token = 'current';
        const revision = h.module.getCanvasRevision();
        const pending = h.module.replaceCanvasDocument({ width: 100, height: 100, imageDataURL: 'data:image/png;base64,dGVzdA==' });
        h.images.at(-1).succeed(200, 100);
        await assert.rejects(pending, /尺寸不一致/);
        assert.equal(h.canvas.token, 'current');
        assert.equal(h.module.getCanvasRevision(), revision);
        h.module.undo(); assert.equal(h.canvas.token, 'before');
    } finally { h.cleanup(); }
});

test('successful project replacement clears history without emitting an edit event', async () => {
    const h = await setup();
    try {
        h.module.saveState();
        const pending = h.module.replaceCanvasDocument({ width: 200, height: 100, imageDataURL: 'data:image/png;base64,dGVzdA==' });
        h.images.at(-1).succeed(200, 100); await pending;
        assert.deepEqual(h.module.getCanvasSize(), { width: 200, height: 100 });
        h.module.undo(); assert.equal(h.canvas.token, 'image');
        assert.deepEqual(h.changes, []);
    } finally { h.cleanup(); }
});

test('AI image replacement rejects stale or cancelled decode and centers successful output', async () => {
    const h = await setup();
    try {
        h.canvas.token = 'original';
        const stale = h.module.loadImageToCanvas('dGVzdA==');
        h.module.notifyCanvasChanged('external-edit');
        h.images.at(-1).succeed(512, 1024);
        await assert.rejects(stale, /画布已发生变化/);
        assert.equal(h.canvas.token, 'original');
        const controller = new AbortController();
        const cancelled = h.module.loadImageToCanvas('dGVzdA==', { signal: controller.signal });
        controller.abort(); await assert.rejects(cancelled, { name: 'AbortError' });
        assert.equal(h.canvas.token, 'original');
        const success = h.module.loadImageToCanvas('dGVzdA==');
        h.images.at(-1).succeed(512, 1024); await success;
        const stage = h.created.at(-1);
        assert.deepEqual(stage.ctx.calls.find(call => call[0] === 'drawImage').slice(2), [460, 0, 360, 720]);
        assert.deepEqual(h.changes, ['external-edit', 'ai']);
        h.module.undo(); assert.equal(h.canvas.token, 'original');
    } finally { h.cleanup(); }
});

test('image import errors release URLs, report failure, and do not modify the drawing', async () => {
    const h = await setup();
    try {
        h.canvas.token = 'original'; let error;
        const pending = h.module.startImageImport({}, undefined, value => { error = value; });
        assert.equal(h.module.isImporting(), true);
        h.images.at(-1).fail();
        assert.equal(await pending, false);
        assert.match(error.message, /图片无法读取/);
        assert.deepEqual(h.revoked, ['blob:test-image']);
        assert.equal(h.module.isImporting(), false);
        assert.equal(h.canvas.token, 'original');
        assert.deepEqual(h.changes, []);
    } finally { h.cleanup(); }
});

test('image import overlay follows the content rect when the display shrinks', async () => {
    const h = await setup();
    try {
        const pending = h.module.startImageImport({});
        h.images.at(-1).succeed(200, 100); assert.equal(await pending, true);
        const overlay = h.parent.children[0];
        assert.equal(overlay.style.width, '640px');
        assert.equal(overlay.style.left, '23px');
        assert.equal(overlay.style.top, '21px');
        h.parent.clientWidth = 338; h.window.dispatchEvent({ type: 'resize' });
        assert.equal(overlay.style.width, '320px');
        assert.equal(overlay.width, 1280);
        assert.equal(overlay.height, 720);
        h.module.confirmImport();
        assert.equal(h.parent.children.length, 0);
        assert.deepEqual(h.changes, ['import']);
        assert.deepEqual(h.revoked, ['blob:test-image']);
    } finally { h.cleanup(); }
});

test('a newer image import cancels old decoding and never creates an orphan overlay', async () => {
    const h = await setup();
    try {
        let cancelled = 0;
        const old = h.module.startImageImport({}, undefined, () => { cancelled++; });
        const oldImage = h.images.at(-1);
        const current = h.module.startImageImport({});
        h.images.at(-1).succeed(200, 100);
        assert.equal(await current, true);
        assert.equal(await old, false);
        oldImage.succeed(100, 100);
        assert.equal(cancelled, 1);
        assert.equal(h.parent.children.length, 1);
        assert.equal(h.revoked.length, 2);
        h.module.cancelImport();
        assert.equal(h.parent.children.length, 0);
        assert.equal(h.module.isImporting(), false);
        assert.deepEqual(h.changes, []);
    } finally { h.cleanup(); }
});
