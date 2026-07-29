// toolbar.js — Toolbar UI, color palette, and mode switching

import { state, clearCanvas, undo, redo, saveCanvasAsFile, startImageImport, confirmImport, cancelImport, isImporting, getCanvasCtx, saveState } from './canvas.js';
import { initAITools, autoColor, finishDrawing, textToDrawing, styleTransfer } from './ai-tools.js';
import { getApiKey, setApiKey, validateApiKey } from './ai-api.js';
import { extractLines } from './filters.js';
import { openFilterDialog } from './filter-dialog.js';
import { openPixelMathDialog } from './pixel-math.js';

const PALETTE_COLORS = [
    '#ff0000', '#ff8000', '#ffff00', '#00ff00',
    '#00ffff', '#0000ff', '#8000ff',
    '#ff69b4', '#8b4513', '#808080', '#ffffff', '#000000'
];

export function initToolbar() {
    buildColorPalette();
    bindToolButtons();
    bindColorInputs();
    bindSizeControls();
    bindActionButtons();
    bindSidebar();
    bindAIToggle();
    bindAITools();
    updateColorPreview();
    updateSizePreview();
}

function buildColorPalette() {
    const palette = document.getElementById('colorPalette');
    PALETTE_COLORS.forEach((color, i) => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch' + (color === '#000000' ? ' active' : '');
        swatch.style.backgroundColor = color;
        swatch.dataset.color = color;
        swatch.addEventListener('click', () => selectSwatch(swatch, color));
        palette.appendChild(swatch);
    });
}

function selectSwatch(swatch, hexColor) {
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');

    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);

    document.getElementById('rInput').value = r;
    document.getElementById('gInput').value = g;
    document.getElementById('bInput').value = b;

    state.currentColor = `rgb(${r}, ${g}, ${b})`;
    updateColorPreview();
}

function bindToolButtons() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentTool = btn.dataset.tool;
        });
    });
}

function bindColorInputs() {
    const rInput = document.getElementById('rInput');
    const gInput = document.getElementById('gInput');
    const bInput = document.getElementById('bInput');

    [rInput, gInput, bInput].forEach(input => {
        input.addEventListener('input', () => {
            let r = clamp(parseInt(rInput.value) || 0, 0, 255);
            let g = clamp(parseInt(gInput.value) || 0, 0, 255);
            let b = clamp(parseInt(bInput.value) || 0, 0, 255);

            state.currentColor = `rgb(${r}, ${g}, ${b})`;
            updateColorPreview();

            // Deselect palette swatches when manually typing
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        });
    });
}

function bindSizeControls() {
    const slider = document.getElementById('sizeSlider');
    const input = document.getElementById('sizeInput');

    slider.addEventListener('input', () => {
        const val = parseInt(slider.value);
        input.value = val;
        state.brushSize = val;
        updateSizePreview();
    });

    input.addEventListener('input', () => {
        let val = clamp(parseInt(input.value) || 1, 1, 50);
        slider.value = val;
        state.brushSize = val;
        updateSizePreview();
    });
}

function bindActionButtons() {
    document.getElementById('clearBtn').addEventListener('click', () => {
        clearCanvas();
    });
}

function bindAIToggle() {
    const toolbar = document.getElementById('toolbar');
    const aiToolbar = document.getElementById('ai-toolbar');

    document.getElementById('aiBtn').addEventListener('click', () => {
        if (!getApiKey()) {
            showApiKeyDialog(() => {
                toolbar.classList.add('hidden');
                aiToolbar.classList.remove('hidden');
            });
        } else {
            toolbar.classList.add('hidden');
            aiToolbar.classList.remove('hidden');
        }
    });

    document.getElementById('aiBackBtn').addEventListener('click', () => {
        aiToolbar.classList.add('hidden');
        toolbar.classList.remove('hidden');
    });
}

function showApiKeyDialog(onSuccess) {
    if (document.getElementById('apiKeyOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'apiKeyOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:10000;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#2a0040;border:2px solid;border-color:#ff80ff #800080 #800080 #ff80ff;width:420px;';

    // Title bar
    const titleBar = document.createElement('div');
    titleBar.style.cssText = 'background:#ff00ff;color:#ffff00;font-family:"BoldsPixels",monospace;font-size:16px;padding:4px 8px;display:flex;justify-content:space-between;align-items:center;text-shadow:1px 1px 0 #800080;';
    titleBar.innerHTML = '<span>API KEY REQUIRED</span>';
    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'font-family:"BoldsPixels",monospace;font-size:14px;background:#ffff00;border:2px solid;border-color:#ffff80 #808000 #808000 #ffff80;color:#800080;cursor:pointer;padding:0 6px;';
    closeBtn.textContent = 'X';
    closeBtn.addEventListener('click', () => overlay.remove());
    titleBar.appendChild(closeBtn);
    dialog.appendChild(titleBar);

    // Body
    const body = document.createElement('div');
    body.style.cssText = 'padding:16px;font-family:"HYPixel","MisterPixel",monospace;font-size:14px;';

    const hint = document.createElement('p');
    hint.style.cssText = 'margin:0 0 10px 0;line-height:1.6;color:#ffff00;';
    hint.textContent = '请输入火山方舟 API Key 以使用 AI 功能：';
    body.appendChild(hint);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'ark-xxxxxxxx-xxxx-xxxx-xxxx-xxxxx';
    input.style.cssText = 'width:100%;padding:6px;font-family:"MisterPixel",monospace;font-size:14px;border:2px solid;border-color:#800080 #ff80ff #ff80ff #800080;background:#1a0030;color:#ffff00;box-sizing:border-box;';
    body.appendChild(input);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:12px;justify-content:flex-end;';

    const confirmBtn = document.createElement('button');
    confirmBtn.style.cssText = 'font-family:"BoldsPixels",monospace;font-size:14px;padding:6px 16px;background:#ff00ff;color:#ffff00;border:2px solid;border-color:#ff80ff #800080 #800080 #ff80ff;cursor:pointer;text-shadow:1px 1px 0 #800080;';
    confirmBtn.textContent = 'CONFIRM';
    confirmBtn.addEventListener('click', async () => {
        const key = input.value.trim();
        if (!key) {
            hint.textContent = '请输入有效的 API Key！';
            hint.style.color = '#ff4040';
            return;
        }
        // Disable buttons during validation
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        confirmBtn.textContent = 'VERIFYING...';
        hint.textContent = '正在验证 API Key...';
        hint.style.color = '#ffff00';

        try {
            const valid = await validateApiKey(key);
            if (valid) {
                setApiKey(key);
                overlay.remove();
                if (onSuccess) onSuccess();
            } else {
                applyErrorTheme();
            }
        } catch (e) {
            applyErrorTheme();
        }

        function applyErrorTheme() {
            // Switch to red error theme
            dialog.style.cssText = 'background:#400000;border:2px solid;border-color:#ff8080 #800000 #800000 #ff8080;width:420px;';
            titleBar.style.cssText = 'background:#cc0000;color:#fff;font-family:"BoldsPixels",monospace;font-size:16px;padding:4px 8px;display:flex;justify-content:space-between;align-items:center;text-shadow:1px 1px 0 #600000;';
            titleBar.querySelector('span').textContent = 'VERIFICATION FAILED';
            closeBtn.style.cssText = 'font-family:"BoldsPixels",monospace;font-size:14px;background:#ff4040;border:2px solid;border-color:#ff8080 #800000 #800000 #ff8080;color:#fff;cursor:pointer;padding:0 6px;';
            input.style.cssText = 'width:100%;padding:6px;font-family:"MisterPixel",monospace;font-size:14px;border:2px solid;border-color:#800000 #ff8080 #ff8080 #800000;background:#300000;color:#ff8080;box-sizing:border-box;';
            confirmBtn.style.cssText = 'font-family:"BoldsPixels",monospace;font-size:14px;padding:6px 16px;background:#cc0000;color:#fff;border:2px solid;border-color:#ff8080 #800000 #800000 #ff8080;cursor:pointer;text-shadow:1px 1px 0 #600000;';
            cancelBtn.style.cssText = 'font-family:"BoldsPixels",monospace;font-size:14px;padding:6px 16px;background:#cc0000;color:#fff;border:2px solid;border-color:#ff8080 #800000 #800000 #ff8080;cursor:pointer;text-shadow:1px 1px 0 #600000;';
            hint.textContent = 'API Key 无效，请检查后重试！';
            hint.style.color = '#ff6060';
            confirmBtn.textContent = 'CONFIRM';
            confirmBtn.disabled = false;
            cancelBtn.disabled = false;
        }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'font-family:"BoldsPixels",monospace;font-size:14px;padding:6px 16px;background:#ff00ff;color:#ffff00;border:2px solid;border-color:#ff80ff #800080 #800080 #ff80ff;cursor:pointer;text-shadow:1px 1px 0 #800080;';
    cancelBtn.textContent = 'CANCEL';
    cancelBtn.addEventListener('click', () => overlay.remove());

    btnRow.appendChild(confirmBtn);
    btnRow.appendChild(cancelBtn);
    body.appendChild(btnRow);

    dialog.appendChild(body);
    overlay.appendChild(dialog);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
    input.focus();
}

function updateColorPreview() {
    document.getElementById('colorPreview').style.backgroundColor = state.currentColor;
}

function updateSizePreview() {
    const preview = document.getElementById('sizePreview');
    const size = Math.max(2, state.brushSize);
    preview.style.width = size + 'px';
    preview.style.height = size + 'px';
}

function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
}

function bindAITools() {
    const overlay = document.getElementById('ai-loading-overlay');
    const loadingText = document.getElementById('aiLoadingText');

    initAITools(
        (show) => {
            if (show) {
                overlay.classList.remove('hidden');
            } else {
                overlay.classList.add('hidden');
            }
        },
        (msg) => {
            loadingText.textContent = msg || 'Working...';
        }
    );

    document.getElementById('aiAutoColor').addEventListener('click', () => {
        autoColor();
    });

    document.getElementById('aiFinish').addEventListener('click', () => {
        finishDrawing();
    });

    document.getElementById('aiTextDraw').addEventListener('click', () => {
        const prompt = document.getElementById('aiPromptInput').value;
        textToDrawing(prompt);
    });

    document.getElementById('aiStyleTransfer').addEventListener('click', () => {
        const style = document.getElementById('styleSelect').value;
        styleTransfer(style);
    });
}

function bindSidebar() {
    const sidebarBtns = document.querySelectorAll('#sidebar .sidebar-btn[data-tool]');
    const topToolBtns = document.querySelectorAll('#toolbar .tool-btn');

    // Sync sidebar tool buttons with top toolbar tool buttons
    function syncToolSelection(toolName) {
        state.currentTool = toolName;
        // Update sidebar
        sidebarBtns.forEach(b => {
            b.classList.toggle('active', b.dataset.tool === toolName);
        });
        // Update top toolbar
        topToolBtns.forEach(b => {
            b.classList.toggle('active', b.dataset.tool === toolName);
        });
    }

    sidebarBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            syncToolSelection(btn.dataset.tool);
        });
    });

    // Also sync when top toolbar buttons are clicked
    topToolBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            syncToolSelection(btn.dataset.tool);
        });
    });

    // Undo button
    document.getElementById('undoBtn').addEventListener('click', () => {
        undo();
    });

    // Redo button
    document.getElementById('redoBtn').addEventListener('click', () => {
        redo();
    });

    // Save button
    document.getElementById('saveBtn').addEventListener('click', () => {
        saveCanvasAsFile();
    });

    // Import button
    const confirmBtn = document.getElementById('confirmImportBtn');
    const cancelBtn = document.getElementById('cancelImportBtn');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';

    document.getElementById('importBtn').addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;
        // Show confirm/cancel buttons
        confirmBtn.classList.remove('hidden');
        cancelBtn.classList.remove('hidden');
        startImageImport(file, () => {
            // On confirm
            confirmBtn.classList.add('hidden');
            cancelBtn.classList.add('hidden');
        }, () => {
            // On cancel
            confirmBtn.classList.add('hidden');
            cancelBtn.classList.add('hidden');
        });
        // Reset file input so same file can be imported again
        fileInput.value = '';
    });

    confirmBtn.addEventListener('click', () => {
        confirmImport();
    });

    cancelBtn.addEventListener('click', () => {
        cancelImport();
    });

    // Extract lines button
    document.getElementById('extractBtn').addEventListener('click', () => {
        const { ctx, canvas } = getCanvasCtx();
        saveState();
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = extractLines(imageData);
        ctx.putImageData(result, 0, 0);
    });

    // Filter dialog button
    document.getElementById('filterBtn').addEventListener('click', () => {
        openFilterDialog();
    });

    // Pixel Math f(x) button
    document.getElementById('pixelMathBtn').addEventListener('click', () => {
        openPixelMathDialog();
    });
}
