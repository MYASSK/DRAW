import { getCanvasDataURL, getCanvasSize, getCanvasRevision, replaceCanvasDocument,
    newCanvasDocument, undo, redo, isImporting, finishCanvasStroke } from './canvas.js';
import { parseProject, serializeProject, projectFileName } from './project-format.js';
import { isDesktop, openProjectFile, saveProjectFile, exportPngFile, readDraft,
    writeDraft, clearDraft, setWindowTitle, bindWindowClose } from './desktop.js';

let name = '未命名';
let currentPath = null;
let dirty = false;
let busy = false;
let ready = false;
let autosaveTimer;
let autosaveChain = Promise.resolve();
let closing = false;

function lockWorkspace(locked) {
    for (const id of ['document-bar', 'main-area', 'toolbar', 'ai-toolbar']) {
        document.getElementById(id).inert = locked;
    }
}

function hasProcessingDialog() {
    return !document.getElementById('ai-loading-overlay').classList.contains('hidden') ||
        document.getElementById('filterDialogOverlay') || document.getElementById('pixelMathOverlay');
}

function setStatus(message, error = false) {
    const el = document.getElementById('documentStatus');
    el.textContent = message;
    el.classList.toggle('is-error', error);
}

function updateDocumentLabel() {
    document.getElementById('documentName').textContent = name + (dirty ? ' *' : '');
    const { width, height } = getCanvasSize();
    document.getElementById('canvasDimensions').textContent = `${width} × ${height} px`;
    setWindowTitle(`${dirty ? '* ' : ''}${name} — DRAW!`);
}

function snapshot() {
    return { format: 'draw-project', version: 1, name, ...getCanvasSize(),
        imageDataURL: getCanvasDataURL(), updatedAt: new Date().toISOString() };
}

function flushAutosave() {
    clearTimeout(autosaveTimer);
    if (!ready) return autosaveChain;
    let contents;
    const revision = getCanvasRevision();
    try { contents = serializeProject(snapshot()); }
    catch (error) { setStatus(`草稿未保存：${error.message}`, true); return Promise.reject(error); }
    const task = autosaveChain.catch(() => {}).then(() => writeDraft(contents));
    autosaveChain = task;
    task.then(() => {
        if (revision === getCanvasRevision()) {
            const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date());
            document.getElementById('autosaveStatus').textContent = `本地草稿已备份 ${time}`;
        }
    }, (error) => {
        document.getElementById('autosaveStatus').textContent = '本地草稿备份失败';
        setStatus(`请手动保存工程：${error.message || error}`, true);
    });
    return task;
}

function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    document.getElementById('autosaveStatus').textContent = '等待备份…';
    autosaveTimer = setTimeout(() => flushAutosave().catch(() => {}), 800);
}

function choose(title, message, actions) {
    return new Promise((resolve) => {
        const dialog = document.createElement('dialog');
        dialog.className = 'document-dialog';
        const heading = document.createElement('h2');
        heading.textContent = title;
        const text = document.createElement('p');
        text.textContent = message;
        const row = document.createElement('div');
        row.className = 'document-dialog-actions';
        let settled = false;
        function finish(value) {
            if (settled) return;
            settled = true;
            dialog.close();
            dialog.remove();
            resolve(value);
        }
        for (const action of actions) {
            const button = document.createElement('button');
            button.className = 'document-btn';
            button.textContent = action.label;
            button.addEventListener('click', () => finish(action.value));
            row.appendChild(button);
        }
        dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(null); });
        dialog.append(heading, text, row);
        document.body.appendChild(dialog);
        dialog.showModal();
    });
}

async function saveProject(asNew = false) {
    if (isImporting()) { setStatus('请先确认或取消正在导入的图片。', true); return false; }
    const revision = getCanvasRevision();
    const contents = serializeProject(snapshot());
    const path = await saveProjectFile(contents, asNew ? null : currentPath, projectFileName(name));
    if (!path) return false;
    currentPath = isDesktop ? path : null;
    name = path.split(/[\\/]/).pop().replace(/\.draw$/i, '') || name;
    if (getCanvasRevision() === revision) dirty = false;
    updateDocumentLabel();
    setStatus(isDesktop ? '工程已保存' : '工程已导出，请检查下载文件');
    await flushAutosave().catch(() => {});
    return true;
}

async function mayReplaceDocument() {
    if (isImporting()) { setStatus('请先确认或取消正在导入的图片。', true); return false; }
    if (!dirty) return true;
    const choice = await choose('保存当前工程？', '当前画布有尚未保存到工程文件的修改。', [
        { label: '保存', value: 'save' }, { label: '放弃修改', value: 'discard' }, { label: '取消', value: 'cancel' }
    ]);
    if (choice === 'save') return saveProject();
    return choice === 'discard';
}

async function runAction(action) {
    if (busy || !ready || document.querySelector('dialog[open]')) return;
    if (hasProcessingDialog()) {
        setStatus('请先结束当前处理，再操作工程文件。', true);
        return;
    }
    finishCanvasStroke();
    busy = true;
    lockWorkspace(true);
    document.querySelectorAll('[data-document-action]').forEach(button => { button.disabled = true; });
    try { await action(); }
    catch (error) { setStatus(error.message || String(error), true); }
    finally {
        busy = false;
        lockWorkspace(false);
        document.querySelectorAll('[data-document-action]').forEach(button => { button.disabled = false; });
    }
}

async function openProject() {
    if (!(await mayReplaceDocument())) return;
    const file = await openProjectFile();
    if (!file) return;
    const project = parseProject(file.contents);
    // Decode/validate first: a corrupt file never destroys the current document.
    await replaceCanvasDocument(project);
    currentPath = file.path;
    name = (file.path || file.name || project.name).split(/[\\/]/).pop().replace(/\.draw$/i, '') || '未命名';
    dirty = false;
    updateDocumentLabel();
    setStatus('工程已打开');
    await flushAutosave().catch(() => {});
}

async function newProject() {
    if (!(await mayReplaceDocument())) return;
    newCanvasDocument();
    name = '未命名'; currentPath = null; dirty = false;
    updateDocumentLabel();
    setStatus('新画布');
    await flushAutosave().catch(() => {});
}

export function exportProjectPng() {
    return runAction(async () => {
        if (isImporting()) { setStatus('请先确认或取消正在导入的图片。', true); return; }
        const result = await exportPngFile(getCanvasDataURL(), projectFileName(name).replace(/\.draw$/, '.png'));
        if (result) setStatus(isDesktop ? 'PNG 已导出' : 'PNG 已导出，请检查下载文件');
    });
}

async function confirmClose() {
    if (closing || busy || !ready || document.querySelector('dialog[open]')) return false;
    if (hasProcessingDialog()) {
        setStatus('请先结束 AI 或滤镜处理，再关闭窗口。', true);
        return false;
    }
    finishCanvasStroke();
    closing = true;
    busy = true;
    lockWorkspace(true);
    let approved = false;
    try {
        const allowed = await mayReplaceDocument();
        if (!allowed) return false;
        // Preserve a recovery copy even if a user chose to leave without saving a file.
        try { await flushAutosave(); }
        catch {
            approved = (await choose('备份未成功', '画布尚未备份。仍要关闭 DRAW! 吗？', [
                { label: '继续编辑', value: 'cancel' }, { label: '关闭', value: 'close' }
            ])) === 'close';
            return approved;
        }
        approved = true;
        return true;
    } catch (error) {
        setStatus(error.message || String(error), true);
        return false;
    } finally {
        closing = false;
        if (!approved) { busy = false; lockWorkspace(false); }
    }
}

export async function initProject() {
    const initializingElements = ['document-bar', 'toolbar', 'main-area', 'ai-toolbar'].map(id => document.getElementById(id));
    initializingElements.forEach(el => { el.inert = true; });
    const actions = { new: newProject, open: openProject, save: () => saveProject(), saveAs: () => saveProject(true) };
    document.querySelectorAll('[data-document-action]').forEach(button => {
        button.addEventListener('click', () => button.dataset.documentAction === 'export' ?
            exportProjectPng() : runAction(actions[button.dataset.documentAction]));
    });
    document.getElementById('appMode').textContent = isDesktop ? 'DRAW! DESKTOP 0.1' : 'DRAW! 浏览器预览';
    document.addEventListener('draw:change', () => {
        dirty = true; updateDocumentLabel(); setStatus('未保存到工程'); scheduleAutosave();
    });
    document.addEventListener('draw:close-failed', (event) => {
        busy = false; lockWorkspace(false);
        setStatus(`窗口未关闭：${event.detail}`, true);
    });
    window.addEventListener('keydown', (event) => {
        if (!(event.ctrlKey || event.metaKey) || event.altKey || !ready) return;
        const key = event.key.toLowerCase();
        if (['s', 'o', 'n'].includes(key)) {
            event.preventDefault();
            const action = key === 's' ? () => saveProject(event.shiftKey) : key === 'o' ? openProject : newProject;
            runAction(action);
        } else if ((key === 'z' || key === 'y') &&
            !event.target.closest('input,textarea,select,[contenteditable],dialog') &&
            !document.querySelector('dialog[open]') && !busy && !isImporting() &&
            document.getElementById('ai-loading-overlay').classList.contains('hidden') &&
            !document.getElementById('filterDialogOverlay') && !document.getElementById('pixelMathOverlay')) {
            event.preventDefault();
            if (key === 'y' || event.shiftKey) redo(); else undo();
        }
    });
    window.addEventListener('beforeunload', (event) => {
        if (!isDesktop && dirty) { event.preventDefault(); event.returnValue = ''; }
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && ready && dirty) flushAutosave().catch(() => {});
    });
    updateDocumentLabel();
    try {
        const stored = await readDraft();
        if (stored) {
            const project = parseProject(stored);
            const answer = await choose('恢复上次画布？', `找到“${project.name}”的本地草稿（${project.width} × ${project.height}）。恢复后可另存为工程。`, [
                { label: '恢复画布', value: 'restore' }, { label: '新建空白画布', value: 'discard' }
            ]);
            if (answer !== 'discard') {
                await replaceCanvasDocument(project);
                name = project.name; dirty = true;
                setStatus('已恢复草稿，请保存工程');
            } else {
                await clearDraft(); setStatus('新画布');
            }
        } else { setStatus('新画布'); }
    } catch (error) { setStatus(`无法恢复草稿：${error.message || error}`, true); }
    ready = true;
    initializingElements.forEach(el => { el.inert = false; });
    updateDocumentLabel();
    await bindWindowClose(confirmClose).catch(error => setStatus(`关闭保护未启用：${error.message || error}`, true));
}
