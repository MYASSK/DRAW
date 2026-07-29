// filter-dialog.js — Win95-style filter dialog with animated convolution

import { FILTER_PRESETS, CATEGORIES, applyKernelRows, applyFilter, applyCustomKernel } from './filters.js';
import { getCanvasCtx, saveState } from './canvas.js';

let dialogEl = null;
let animFrameId = null;

export function openFilterDialog() {
    if (dialogEl) return;
    dialogEl = buildDialog();
    document.body.appendChild(dialogEl);
}

export function closeFilterDialog() {
    if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }
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
        grid.appendChild(input);
    }
    kernelPanel.appendChild(grid);

    const applyBtn = document.createElement('button');
    applyBtn.className = 'filter-apply-btn';
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
        if (isNaN(val)) return null;
        kernel.push(val);
    }
    return kernel;
}

function applyWithAnimation() {
    const { ctx, canvas } = getCanvasCtx();
    const presetId = dialogEl?.dataset.currentPreset;
    const preset = presetId ? FILTER_PRESETS[presetId] : null;
    const status = document.getElementById('filterStatus');

    // Determine if we use custom kernel or special filter
    const isSpecial = preset && !preset.kernel;
    const customKernel = isSpecial ? null : getKernelFromGrid();

    if (!isSpecial && !customKernel) {
        status.textContent = 'ERROR: Invalid kernel values!';
        return;
    }

    saveState();

    const width = canvas.width;
    const height = canvas.height;
    const srcImageData = ctx.getImageData(0, 0, width, height);

    if (isSpecial) {
        // Special filters: animate with pre-computed result
        const result = applyFilter(srcImageData, presetId);
        animateScanline(ctx, srcImageData, result, width, height, status);
        return;
    }

    // Kernel convolution: compute full result first, then animate
    const result = applyCustomKernel(srcImageData, customKernel);
    animateScanline(ctx, srcImageData, result, width, height, status);
}

function animateScanline(ctx, srcImageData, resultImageData, width, height, statusEl) {
    const rowsPerFrame = Math.max(3, Math.ceil(height / 60)); // ~60 frames total, 1-2 seconds
    let currentRow = 0;

    statusEl.textContent = 'Processing...';

    function frame() {
        const endRow = Math.min(currentRow + rowsPerFrame, height);

        // Draw processed rows from result
        const strip = new ImageData(
            resultImageData.data.slice(currentRow * width * 4, endRow * width * 4),
            width,
            endRow - currentRow
        );
        ctx.putImageData(strip, 0, currentRow);

        // Draw scanline indicator
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(0, endRow - 1, width, 2);

        currentRow = endRow;

        if (currentRow < height) {
            animFrameId = requestAnimationFrame(frame);
        } else {
            // Clean up: put final row without green line
            ctx.putImageData(resultImageData, 0, 0);
            statusEl.textContent = 'Done!';
            animFrameId = null;
        }
    }

    animFrameId = requestAnimationFrame(frame);
}
