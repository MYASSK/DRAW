// Narrow desktop bridge; browser preview uses downloads and IndexedDB.
import { MAX_PROJECT_BYTES } from './project-format.js';

export const isDesktop = Boolean(window.__TAURI__?.core?.invoke);
export const invoke = (command, args = {}) => window.__TAURI__.core.invoke(command, args);

function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function openProjectFile() {
    if (isDesktop) return invoke('open_project');
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.draw,application/json';
        input.addEventListener('cancel', () => resolve(null), { once: true });
        input.addEventListener('change', async () => {
            const file = input.files[0];
            if (!file) return resolve(null);
            if (file.size > MAX_PROJECT_BYTES) return reject(new Error('工程文件超过 64 MiB 上限。'));
            try { resolve({ path: null, name: file.name, contents: await file.text() }); }
            catch (error) { reject(error); }
        }, { once: true });
        input.click();
    });
}

export async function saveProjectFile(contents, path, suggestedName) {
    if (isDesktop) return invoke('save_project', { contents, path, suggestedName });
    download(new Blob([contents], { type: 'application/json' }), suggestedName);
    return suggestedName;
}

export async function exportPngFile(dataUrl, suggestedName) {
    if (isDesktop) return invoke('export_png', { dataUrl, suggestedName });
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));
    download(new Blob([bytes], { type: 'image/png' }), suggestedName);
    return suggestedName;
}

let dbPromise;
function openDraftDatabase() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open('draw-desktop-preview', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('drafts');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    return dbPromise;
}

async function draftOperation(mode, operation) {
    const db = await openDraftDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('drafts', mode);
        const request = operation(transaction.objectStore('drafts'));
        let result;
        request.onsuccess = () => { result = request.result; };
        transaction.oncomplete = () => resolve(result ?? null);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('草稿写入已取消。'));
    });
}

export const readDraft = () => isDesktop ? invoke('read_autosave') : draftOperation('readonly', s => s.get('latest'));
export const writeDraft = (contents) => isDesktop ? invoke('write_autosave', { contents }) : draftOperation('readwrite', s => s.put(contents, 'latest'));
export const clearDraft = () => isDesktop ? invoke('clear_autosave') : draftOperation('readwrite', s => s.delete('latest'));

export function setWindowTitle(title) {
    document.title = title;
    if (isDesktop) window.__TAURI__.window.getCurrentWindow().setTitle(title).catch(() => {});
}

export async function bindWindowClose(callback) {
    if (!isDesktop) return;
    const nativeWindow = window.__TAURI__.window.getCurrentWindow();
    const close = async () => {
        try { if (await callback()) await invoke('exit_app'); }
        catch (error) { document.dispatchEvent(new CustomEvent('draw:close-failed', { detail: String(error) })); }
    };
    await window.__TAURI__.event.listen('draw:quit-requested', close);
    await nativeWindow.onCloseRequested(async (event) => {
        event.preventDefault();
        await close();
    });
}
