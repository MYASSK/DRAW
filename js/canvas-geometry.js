// Document geometry stays independent of viewport size and browser events.
export const MAX_DOCUMENT_SIDE = 8192;
export const MAX_DOCUMENT_PIXELS = 16_777_216;

export function validateDocumentSize(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width > MAX_DOCUMENT_SIDE || height > MAX_DOCUMENT_SIDE || width * height > MAX_DOCUMENT_PIXELS) {
        throw new Error('画布宽高须为 1–8192 的整数，总像素不能超过 16777216。');
    }
    return { width, height };
}

export function fitDocumentDisplay(width, height, availableWidth, availableHeight) {
    const scale = Math.min(1, Math.max(1, availableWidth) / width, Math.max(1, availableHeight) / height);
    return { width: width * scale, height: height * scale, scale };
}

export function contentRect(rect, insets = {}) {
    const left = insets.left || 0;
    const top = insets.top || 0;
    return {
        left: rect.left + left, top: rect.top + top,
        width: Math.max(1, rect.width - left - (insets.right || 0)),
        height: Math.max(1, rect.height - top - (insets.bottom || 0))
    };
}

export function clientToDocumentPoint(clientX, clientY, rect, width, height) {
    return { x: (clientX - rect.left) * width / rect.width,
        y: (clientY - rect.top) * height / rect.height };
}

export function fitImageInside(imageWidth, imageHeight, width, height, maxScale = Infinity) {
    const scale = Math.min(maxScale, width / imageWidth, height / imageHeight);
    const w = imageWidth * scale;
    const h = imageHeight * scale;
    return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

// Resizing keeps the opposite corner fixed, including when aspect ratio is locked.
export function resizeImageFromCorner(rect, corner, x, y, lockAspect, minSize = 20) {
    const leftCorner = corner.includes('l');
    const topCorner = corner.includes('t');
    const anchorX = leftCorner ? rect.x + rect.w : rect.x;
    const anchorY = topCorner ? rect.y + rect.h : rect.y;
    let w = Math.max(minSize, leftCorner ? anchorX - x : x - anchorX);
    let h = Math.max(minSize, topCorner ? anchorY - y : y - anchorY);
    if (lockAspect) {
        const aspect = rect.originalAspect || rect.w / rect.h;
        if (w / h > aspect) h = w / aspect;
        else w = h * aspect;
    }
    return { x: leftCorner ? anchorX - w : anchorX,
        y: topCorner ? anchorY - h : anchorY, w, h };
}
