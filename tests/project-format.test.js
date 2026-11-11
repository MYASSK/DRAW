import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject, serializeProject, projectFileName, validateDimensions } from '../js/project-format.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYZkAAAAASUVORK5CYII=';
const project = { format: 'draw-project', version: 1, name: '草稿', width: 1, height: 1,
    imageDataURL: png, updatedAt: '2026-11-11T01:00:00.000Z' };

test('projects round-trip pixels, size, name and version without credentials or unrelated data', () => {
    const text = serializeProject({ ...project, apiKey: 'must-never-save', undoStack: ['private'] });
    assert.deepEqual(parseProject(text), project);
    assert.equal(text.includes('must-never-save'), false);
    assert.equal(text.includes('undoStack'), false);
});

test('rejects corrupt, unsupported and inconsistent documents before replacing a canvas', () => {
    for (const value of [null, {}, { ...project, version: 2 }, { ...project, width: 2 },
        { ...project, imageDataURL: 'data:text/html;base64,PGgxPg==' },
        { ...project, imageDataURL: 'data:image/png;base64,AAAA' }]) {
        assert.throws(() => parseProject(JSON.stringify(value)));
    }
    assert.throws(() => parseProject('{not json'));
});

test('canvas dimensions have integer, single-side and total-pixel bounds', () => {
    validateDimensions(1280, 720);
    validateDimensions(4096, 4096);
    for (const pair of [[0, 1], [-1, 10], [1.5, 1], [8193, 1], [8192, 8192], [NaN, 10]]) {
        assert.throws(() => validateDimensions(...pair));
    }
});

test('suggested project filenames cannot contain path separators', () => {
    assert.equal(projectFileName('../hello:world.draw'), '.._hello_world.draw');
    assert.equal(projectFileName('   '), '未命名.draw');
    assert.equal(projectFileName('草稿.draw'), '草稿.draw');
});
