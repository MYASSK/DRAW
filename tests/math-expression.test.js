import test from 'node:test';
import assert from 'node:assert/strict';
import { compileExpression } from '../js/math-expression.js';

const value = (expression, x = 128) => compileExpression(expression)(x);

test('arithmetic precedence, unary signs and right-associative power', () => {
    assert.equal(value('2+3*4'), 14);
    assert.equal(value('(2+3)*4'), 20);
    assert.equal(value('2**3**2'), 512);
    assert.equal(value('-2**2'), -4);
    assert.equal(value('(-2)**2'), 4);
    assert.equal(value('2**-2'), 0.25);
    assert.equal(value('10-3-2'), 5);
    assert.equal(value('.5 + 1e2 % 3'), 1.5);
});

test('all existing presets and pixel values', () => {
    const presets = [
        ['255-x', x => 255-x], ['x*0.5', x => x*0.5],
        ['x*1.5', x => x*1.5], ['x>128?255:0', x => x>128?255:0],
        ['Math.floor(x/64)*85', x => Math.floor(x/64)*85],
        ['Math.pow(x/255,1/2.2)*255', x => Math.pow(x/255,1/2.2)*255],
    ];
    for (const [expression, expected] of presets) {
        const fn = compileExpression(expression);
        for (let x = 0; x < 256; x++) assert.equal(fn(x), expected(x), `${expression} at ${x}`);
    }
});

test('supported Math functions, constants and nested conditional', () => {
    assert.equal(value('Math.ceil(1.2)+Math.round(1.6)+Math.abs(-3)'), 7);
    assert.equal(value('Math.sqrt(9)+Math.log(Math.E)+Math.log2(8)+Math.log10(100)'), 9);
    assert.equal(value('Math.min(x,200)+Math.max(2,3,4)'), 132);
    assert.equal(value('Math.sin(0)+Math.cos(0)+Math.tan(0)'), 1);
    assert.equal(value('Math.PI'), Math.PI);
    assert.equal(value('x<=128 ? x==0 ? 1:2 :3'), 2);
    assert.equal(value('x!==0 ? 3:1'), 3);
    const random = value('Math.random()');
    assert.ok(random >= 0 && random < 1);
    assert.equal(value('x==0 ? 0 : 1/x', 0), 0);
});

test('rejects arbitrary JavaScript, global access and property traversal', () => {
    for (const expression of [
        'globalThis', 'window.location', 'localStorage.getItem("draw_api_key")',
        'fetch("https://example.com")', 'x.constructor', 'Math.constructor(1)',
        'Math["random"]()', '(()=>1)()', 'x=4', '1;alert(1)',
        'Math.random.call()', 'Math.PI.toString()', 'new Date()',
        'Math.__proto__', 'Math.max(1,,2)', 'Math.pow(2)', 'Math.random(1)',
        '1 /* comment */ + 2', 'x++', '',
    ]) assert.throws(() => compileExpression(expression), undefined, expression);
});

test('rejects non-finite inputs, literals and intermediate results', () => {
    assert.throws(() => compileExpression('1e999'));
    for (const expression of ['1/0', '0/0', 'Math.sqrt(-1)', 'Math.log(0)', '2**1024', '0*(1/0)']) {
        assert.throws(() => value(expression), /non-finite/, expression);
    }
    assert.throws(() => compileExpression('x')(Infinity), /non-finite/);
    assert.throws(() => compileExpression('('.repeat(600) + '1' + ')'.repeat(600)), /too long/);
});
