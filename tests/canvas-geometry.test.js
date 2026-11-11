import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDocumentSize, fitDocumentDisplay, contentRect, clientToDocumentPoint,
    fitImageInside, resizeImageFromCorner } from '../js/canvas-geometry.js';

test('viewport fit preserves aspect ratio without changing document dimensions', () => {
    assert.deepEqual(fitDocumentDisplay(1280, 720, 640, 500), { width: 640, height: 360, scale: 0.5 });
    assert.deepEqual(fitDocumentDisplay(1280, 720, 2000, 1000), { width: 1280, height: 720, scale: 1 });
});

test('pointer mapping excludes canvas borders and accounts for display scale', () => {
    const rect = contentRect({ left: 100, top: 80, width: 646, height: 366 },
        { left: 3, right: 3, top: 3, bottom: 3 });
    assert.deepEqual(clientToDocumentPoint(103, 83, rect, 1280, 720), { x: 0, y: 0 });
    assert.deepEqual(clientToDocumentPoint(423, 263, rect, 1280, 720), { x: 640, y: 360 });
    assert.equal(clientToDocumentPoint(101, 83, rect, 1280, 720).x, -4);
});

test('portrait AI output is centered without stretching', () => {
    assert.deepEqual(fitImageInside(512, 1024, 1280, 720), { x: 460, y: 0, w: 360, h: 720 });
});

test('document validation rejects oversized, fractional, missing and coerced dimensions', () => {
    assert.deepEqual(validateDocumentSize(4096, 4096), { width: 4096, height: 4096 });
    assert.deepEqual(validateDocumentSize(8192, 2048), { width: 8192, height: 2048 });
    for (const dimensions of [[8193, 1], [8192, 2049], [0, 1], [-1, 5], [2.5, 4], ['100', 100], [NaN, 1]]) {
        assert.throws(() => validateDocumentSize(...dimensions));
    }
});

test('locked corner resizing preserves the opposite corner and original aspect', () => {
    const rect = { x: 100, y: 100, w: 200, h: 100, originalAspect: 2 };
    const changed = resizeImageFromCorner(rect, 'tl', 20, 30, true);
    assert.equal(changed.x + changed.w, 300);
    assert.equal(changed.y + changed.h, 200);
    assert.equal(changed.w / changed.h, 2);
    assert.deepEqual(resizeImageFromCorner(rect, 'br', 400, 400, false),
        { x: 100, y: 100, w: 300, h: 300 });
});
