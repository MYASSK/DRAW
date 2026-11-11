// Versioned, portable single-canvas projects. Credentials and history are never serialized.
export const MAX_PROJECT_BYTES = 64 * 1024 * 1024;
export const MAX_PIXELS = 16 * 1024 * 1024;
const PNG_PREFIX = 'data:image/png;base64,';

export function validateDimensions(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) ||
        width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > MAX_PIXELS) {
        throw new Error('画布尺寸无效：单边最多 8192 像素，总面积最多 1600 万像素。');
    }
}

export function validateProject(value) {
    if (!value || value.format !== 'draw-project' || value.version !== 1) {
        throw new Error('这不是受支持的 DRAW 工程（需要版本 1）。');
    }
    validateDimensions(value.width, value.height);
    const dataURL = value.imageDataURL;
    if (typeof dataURL !== 'string' || dataURL.length > MAX_PROJECT_BYTES || !dataURL.startsWith(PNG_PREFIX)) {
        throw new Error('工程缺少有效的 PNG 画布。');
    }
    const encoded = dataURL.slice(PNG_PREFIX.length);
    if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
        throw new Error('工程中的图片编码已损坏。');
    }
    let header;
    try { header = Uint8Array.from(atob(encoded.slice(0, 44)), c => c.charCodeAt(0)); }
    catch { throw new Error('工程中的图片编码已损坏。'); }
    const magic = [137, 80, 78, 71, 13, 10, 26, 10];
    if (header.length < 24 || magic.some((byte, i) => header[i] !== byte) ||
        String.fromCharCode(...header.slice(12, 16)) !== 'IHDR') {
        throw new Error('工程中的图片不是 PNG。');
    }
    const view = new DataView(header.buffer);
    if (view.getUint32(16) !== value.width || view.getUint32(20) !== value.height) {
        throw new Error('工程记录的尺寸与图片不一致。');
    }
    return {
        format: 'draw-project', version: 1,
        name: typeof value.name === 'string' ? value.name.slice(0, 120) : '未命名',
        width: value.width, height: value.height, imageDataURL: dataURL,
        updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString()
    };
}

export function parseProject(text) {
    if (typeof text !== 'string' || text.length > MAX_PROJECT_BYTES ||
        new TextEncoder().encode(text).byteLength > MAX_PROJECT_BYTES) {
        throw new Error('工程文件超过 64 MiB 上限。');
    }
    let value;
    try { value = JSON.parse(text); }
    catch { throw new Error('工程文件无法读取：JSON 已损坏。'); }
    return validateProject(value);
}

export function serializeProject(value) {
    const text = JSON.stringify(validateProject(value));
    if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_BYTES) {
        throw new Error('工程文件超过 64 MiB 上限。');
    }
    return text;
}

export function projectFileName(name) {
    return (name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\.draw$/i, '').trim() || '未命名') + '.draw';
}
