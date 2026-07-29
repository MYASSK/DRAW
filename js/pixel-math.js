// pixel-math.js — Per-pixel RGB expression evaluator with dialog

import { getCanvasCtx, saveState } from './canvas.js';

let dialogEl = null;
let linked = true;
let lastFocusedInput = null;

export function openPixelMathDialog() {
    if (dialogEl) return;
    dialogEl = buildDialog();
    document.body.appendChild(dialogEl);
}

export function closePixelMathDialog() {
    if (dialogEl) {
        dialogEl.remove();
        dialogEl = null;
    }
}

const PRESETS = [
    { label: 'Invert', expr: '255-x' },
    { label: 'Darken', expr: 'x*0.5' },
    { label: 'Brighten', expr: 'x*1.5' },
    { label: 'Threshold', expr: 'x>128?255:0' },
    { label: 'Posterize', expr: 'Math.floor(x/64)*85' },
    { label: 'Gamma 2.2', expr: 'Math.pow(x/255,1/2.2)*255' },
];

function buildDialog() {
    const wrap = document.createElement('div');
    wrap.id = 'pixelMathOverlay';

    const dialog = document.createElement('div');
    dialog.id = 'pixelMathDialog';

    // Title bar
    const titleBar = document.createElement('div');
    titleBar.className = 'filter-titlebar';
    titleBar.innerHTML = '<span>PIXEL MATH  f(x)</span>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'filter-close-btn';
    closeBtn.textContent = 'X';
    closeBtn.addEventListener('click', closePixelMathDialog);
    titleBar.appendChild(closeBtn);
    dialog.appendChild(titleBar);

    // Body
    const body = document.createElement('div');
    body.className = 'pm-body';

    // Link checkbox
    const linkRow = document.createElement('div');
    linkRow.className = 'pm-link-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'pmLinked';
    checkbox.checked = true;
    checkbox.addEventListener('change', () => {
        linked = checkbox.checked;
    });
    const linkLabel = document.createElement('label');
    linkLabel.htmlFor = 'pmLinked';
    linkLabel.textContent = ' Link R/G/B (same expression)';
    linkLabel.className = 'pm-link-label';
    linkRow.appendChild(checkbox);
    linkRow.appendChild(linkLabel);
    body.appendChild(linkRow);

    // RGB input fields
    const channels = ['R', 'G', 'B'];
    const colors = ['#ff4040', '#40cc40', '#4080ff'];
    channels.forEach((ch, i) => {
        const row = document.createElement('div');
        row.className = 'pm-input-row';
        const label = document.createElement('span');
        label.className = 'pm-channel-label';
        label.textContent = ch + ':';
        label.style.color = colors[i];
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'pm-expr-input';
        input.id = `pmExpr${ch}`;
        input.value = 'x';
        input.placeholder = 'f(x) e.g. 255-x';
        input.addEventListener('focus', () => { lastFocusedInput = input; });
        // Link behavior: typing in one updates others
        input.addEventListener('input', () => {
            if (linked) {
                channels.forEach(c => {
                    if (c !== ch) {
                        document.getElementById(`pmExpr${c}`).value = input.value;
                    }
                });
            }
        });
        row.appendChild(label);
        row.appendChild(input);
        body.appendChild(row);
    });

    // Presets
    const presetLabel = document.createElement('div');
    presetLabel.className = 'pm-preset-label';
    presetLabel.textContent = 'PRESETS';
    body.appendChild(presetLabel);

    const presetGroup = document.createElement('div');
    presetGroup.className = 'pm-preset-group';
    PRESETS.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'pm-preset-btn';
        btn.textContent = p.label;
        btn.title = p.expr;
        btn.addEventListener('click', () => {
            document.getElementById('pmExprR').value = p.expr;
            document.getElementById('pmExprG').value = p.expr;
            document.getElementById('pmExprB').value = p.expr;
        });
        presetGroup.appendChild(btn);
    });
    body.appendChild(presetGroup);

    // Function snippet buttons
    const SNIPPETS = [
        { label: '+', insert: '+' },
        { label: '-', insert: '-' },
        { label: '*', insert: '*' },
        { label: '/', insert: '/' },
        { label: '%', insert: '%' },
        { label: '**', insert: '**' },
        { label: '( )', insert: '()' },
        { label: 'x', insert: 'x' },
        { label: '?:', insert: '?:' },
    ];

    const MATH_SNIPPETS = [
        { label: 'floor', insert: 'Math.floor()' },
        { label: 'ceil', insert: 'Math.ceil()' },
        { label: 'round', insert: 'Math.round()' },
        { label: 'abs', insert: 'Math.abs()' },
        { label: 'pow', insert: 'Math.pow(,)' },
        { label: 'sqrt', insert: 'Math.sqrt()' },
        { label: 'log', insert: 'Math.log()' },
        { label: 'log2', insert: 'Math.log2()' },
        { label: 'log10', insert: 'Math.log10()' },
        { label: 'sin', insert: 'Math.sin()' },
        { label: 'cos', insert: 'Math.cos()' },
        { label: 'tan', insert: 'Math.tan()' },
        { label: 'min', insert: 'Math.min(,)' },
        { label: 'max', insert: 'Math.max(,)' },
        { label: 'random', insert: 'Math.random()' },
        { label: 'PI', insert: 'Math.PI' },
        { label: 'E', insert: 'Math.E' },
    ];

    function insertSnippet(text) {
        const input = lastFocusedInput || document.getElementById('pmExprR');
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const val = input.value;
        input.value = val.slice(0, start) + text + val.slice(end);
        // Place cursor inside parentheses if applicable
        const parenPos = text.indexOf('()');
        const cursorPos = parenPos >= 0 ? start + parenPos + 1 : start + text.length;
        input.setSelectionRange(cursorPos, cursorPos);
        input.focus();
        // Sync linked inputs
        if (linked) {
            channels.forEach(c => {
                const other = document.getElementById(`pmExpr${c}`);
                if (other !== input) other.value = input.value;
            });
        }
    }

    // Operators
    const opLabel = document.createElement('div');
    opLabel.className = 'pm-snippet-label';
    opLabel.textContent = 'OPERATORS';
    body.appendChild(opLabel);

    const opGroup = document.createElement('div');
    opGroup.className = 'pm-snippet-group';
    SNIPPETS.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'pm-snippet-btn';
        btn.textContent = s.label;
        btn.addEventListener('click', () => insertSnippet(s.insert));
        opGroup.appendChild(btn);
    });
    body.appendChild(opGroup);

    // Math functions
    const mathLabel = document.createElement('div');
    mathLabel.className = 'pm-snippet-label';
    mathLabel.textContent = 'MATH FUNCTIONS';
    body.appendChild(mathLabel);

    const mathGroup = document.createElement('div');
    mathGroup.className = 'pm-snippet-group';
    MATH_SNIPPETS.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'pm-snippet-btn';
        btn.textContent = s.label;
        btn.addEventListener('click', () => insertSnippet(s.insert));
        mathGroup.appendChild(btn);
    });
    body.appendChild(mathGroup);

    // Apply button
    const applyBtn = document.createElement('button');
    applyBtn.className = 'filter-apply-btn';
    applyBtn.textContent = 'APPLY';
    applyBtn.addEventListener('click', applyPixelMath);
    body.appendChild(applyBtn);

    // Status
    const status = document.createElement('div');
    status.className = 'filter-status';
    status.id = 'pmStatus';
    status.textContent = 'Enter f(x) where x is the pixel value (0-255)';
    body.appendChild(status);

    dialog.appendChild(body);
    wrap.appendChild(dialog);

    wrap.addEventListener('click', (e) => {
        if (e.target === wrap) closePixelMathDialog();
    });

    return wrap;
}

function applyPixelMath() {
    const status = document.getElementById('pmStatus');
    const exprR = document.getElementById('pmExprR').value.trim();
    const exprG = document.getElementById('pmExprG').value.trim();
    const exprB = document.getElementById('pmExprB').value.trim();

    if (!exprR || !exprG || !exprB) {
        status.textContent = 'ERROR: All fields must have an expression!';
        return;
    }

    let fnR, fnG, fnB;
    try {
        fnR = new Function('x', 'return ' + exprR);
        fnG = new Function('x', 'return ' + exprG);
        fnB = new Function('x', 'return ' + exprB);
        // Test with a sample value
        fnR(128); fnG(128); fnB(128);
    } catch (e) {
        status.textContent = 'ERROR: Invalid expression — ' + e.message;
        return;
    }

    const { ctx, canvas } = getCanvasCtx();
    saveState();

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const clamp = (v) => Math.min(255, Math.max(0, Math.round(v)));

    for (let i = 0; i < data.length; i += 4) {
        data[i]     = clamp(fnR(data[i]));
        data[i + 1] = clamp(fnG(data[i + 1]));
        data[i + 2] = clamp(fnB(data[i + 2]));
        // Alpha unchanged
    }

    ctx.putImageData(imageData, 0, 0);
    status.textContent = 'Done! R: ' + exprR + ' | G: ' + exprG + ' | B: ' + exprB;
}
