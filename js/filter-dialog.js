// filter-dialog.js — Win95-style filter dialog with animated convolution

import { FILTER_PRESETS, CATEGORIES, applyFilter, applyCustomKernel } from './filters.js';
import { getCanvasCtx, saveState, notifyCanvasChanged, getCanvasRevision } from './canvas.js';

let dialogEl = null;
let animFrameId = null;
let previewCanvas = null;
let applying = false;

export function openFilterDialog() {
    if (dialogEl) return;
    dialogEl = buildDialog();
    document.body.appendChild(dialogEl);
}

export function closeFilterDialog() {
    stopPreview();
    if (dialogEl) {
        dialogEl.remove();
        dialogEl = null;
    }
}

function buildDialog() {
    const wrap = document.createElement('div');
    wrap.id = 'filterDialogOverlay';

    const dialog = document.createElement('div');
    dialog.id = 'filterDialog';

    // Title bar
    const titleBar = document.createElement('div');
    titleBar.className = 'filter-titlebar';
    titleBar.innerHTML = '<span class="filter-title-text">FILTER WORKSHOP</span>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'filter-close-btn';
    closeBtn.textContent = 'X';
    closeBtn.addEventListener('click', closeFilterDialog);
    titleBar.appendChild(closeBtn);
    dialog.appendChild(titleBar);

    // Body
    const body = document.createElement('div');
    body.className = 'filter-body';

    // Left: preset buttons by category
    const presetPanel = document.createElement('div');
    presetPanel.className = 'filter-presets';

    for (const cat of CATEGORIES) {
        const catLabel = document.createElement('div');
        catLabel.className = 'filter-cat-label';
        catLabel.textContent = cat.name;
        presetPanel.appendChild(catLabel);

        const btnGroup = document.createElement('div');
        btnGroup.className = 'filter-btn-group';

        for (const [id, preset] of Object.entries(FILTER_PRESETS)) {
            if (preset.category !== cat.id) continue;
            const btn = document.createElement('button');
            btn.className = 'filter-preset-btn';
            btn.textContent = preset.name;
            btn.addEventListener('click', () => {
                selectPreset(id, preset);
            });
            btnGroup.appendChild(btn);
        }
        presetPanel.appendChild(btnGroup);
    }
    body.appendChild(presetPanel);

    // Right: kernel grid + apply
    const kernelPanel = document.createElement('div');
    kernelPanel.className = 'filter-kernel-panel';

    const kernelLabel = document.createElement('div');
    kernelLabel.className = 'filter-cat-label';
    kernelLabel.textContent = 'KERNEL (3x3)';
    kernelPanel.appendChild(kernelLabel);

    const grid = document.createElement('div');
    grid.className = 'filter-kernel-grid';
    grid.id = 'kernelGrid';

    for (let i = 0; i < 9; i++) {
        const input = document.createElement('input');
        input.type = 'number';
        input.step = 'any';
        input.className = 'kernel-cell';
        input.id = `kc${i}`;
        input.value = (i === 4) ? '1' : '0'; // identity kernel default
        input.addEventListener('input', () => { delete dialogEl.dataset.currentPreset; });
        grid.appendChild(input);
    }
    kernelPanel.appendChild(grid);

    const applyBtn = document.createElement('button');
    applyBtn.className = 'filter-apply-btn';
    applyBtn.id = 'filterApplyBtn';
    applyBtn.textContent = 'APPLY';
    applyBtn.addEventListener('click', () => applyWithAnimation());
    kernelPanel.appendChild(applyBtn);

    const statusText = document.createElement('div');
    statusText.className = 'filter-status';
    statusText.id = 'filterStatus';
    statusText.textContent = 'Select a filter or edit the kernel';
    kernelPanel.appendChild(statusText);

    body.appendChild(kernelPanel);
    dialog.appendChild(body);
    wrap.appendChild(dialog);

    // Close on overlay click
    wrap.addEventListener('click', (e) => {
        if (e.target === wrap) closeFilterDialog();
    });

    return wrap;
}

function selectPreset(id, preset) {
    const status = document.getElementById('filterStatus');
    if (preset.kernel) {
        // Fill kernel grid
        for (let i = 0; i < 9; i++) {
            document.getElementById(`kc${i}`).value = parseFloat(preset.kernel[i].toFixed(4));
        }
        status.textContent = `Loaded: ${preset.name}`;
    } else {
        // Special filters: clear grid, show message
        for (let i = 0; i < 9; i++) {
            document.getElementById(`kc${i}`).value = '-';
        }
        status.textContent = `${preset.name} (special filter — click APPLY)`;
    }
    // Store current preset id
    dialogEl.dataset.currentPreset = id;
}

function getKernelFromGrid() {
    const kernel = [];
    for (let i = 0; i < 9; i++) {
        const val = parseFloat(document.getElementById(`kc${i}`).value);
        if (!Number.isFinite(val)) return null;
        kernel.push(val);
    }
    return kernel;
}

function setApplying(value) {
    applying = value;
    dialogEl?.querySelectorAll('input, .filter-preset-btn, .filter-apply-btn').forEach(control => {
        control.disabled = value;
    });
}

function stopPreview() {
    if (animFrameId !== null) cancelAnimationFrame(animFrameId);
    animFrameId = null;
    previewCanvas?.remove();
    previewCanvas = null;
    setApplying(false);
}

function applyWithAnimation() {
    if (applying || !dialogEl) return;
    const { ctx, canvas } = getCanvasCtx();
    const presetId = dialogEl.dataset.currentPreset;
    const preset = presetId ? FILTER_PRESETS[presetId] : null;
    const status = document.getElementById('filterStatus');
    const isSpecial = preset && !preset.kernel;
    const customKernel = isSpecial ? null : getKernelFromGrid();
    if (!isSpecial && !customKernel) {
        status.textContent = 'ERROR: Invalid kernel values!';
        return;
    }
    setApplying(true);
    const revision = getCanvasRevision();
    try {
        const source = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = isSpecial ? applyFilter(source, presetId) : applyCustomKernel(source, customKernel);
        animateScanline(canvas, ctx, source, result, revision, status);
    } catch (error) {
        stopPreview();
        status.textContent = 'ERROR: ' + error.message;
    }
}

function animateScanline(canvas, ctx, source, result, revision, status) {
    const width = source.width;
    const height = source.height;
    const rowsPerFrame = Math.max(3, Math.ceil(height / 60));
    let currentRow = 0;
    // Preview never writes into the document canvas or undo history.
    previewCanvas = document.createElement('canvas');
    previewCanvas.width = width;
    previewCanvas.height = height;
    previewCanvas.setAttribute('aria-hidden', 'true');
    Object.assign(previewCanvas.style, {
        position: 'absolute', pointerEvents: 'none', zIndex: '101',
    });
    const previewCtx = previewCanvas.getContext('2d');
    previewCtx.putImageData(source, 0, 0);
    canvas.parentElement.appendChild(previewCanvas);
    status.textContent = 'Processing... Close to cancel.';

    function frame() {
        if (!dialogEl || !previewCanvas) return;
        if (getCanvasRevision() !== revision) {
            stopPreview();
            status.textContent = 'Canvas changed. Apply the filter again.';
            return;
        }
        try {
            Object.assign(previewCanvas.style, {
                left: (canvas.offsetLeft + canvas.clientLeft) + 'px',
                top: (canvas.offsetTop + canvas.clientTop) + 'px',
                width: canvas.clientWidth + 'px', height: canvas.clientHeight + 'px',
            });
            currentRow = Math.min(currentRow + rowsPerFrame, height);
            previewCtx.putImageData(result, 0, 0, 0, 0, width, currentRow);
            if (currentRow < height) {
                previewCtx.fillStyle = '#00ff00';
                previewCtx.fillRect(0, currentRow, width, Math.min(2, height - currentRow));
                animFrameId = requestAnimationFrame(frame);
            } else {
                saveState();
                ctx.putImageData(result, 0, 0);
                notifyCanvasChanged('filter');
                stopPreview();
                status.textContent = 'Done!';
            }
        } catch (error) {
            stopPreview();
            status.textContent = 'ERROR: ' + error.message;
        }
    }
    animFrameId = requestAnimationFrame(frame);
}
