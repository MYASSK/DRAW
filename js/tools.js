// tools.js — Brush, Eraser, and Flood Fill logic

export function drawLine(ctx, x0, y0, x1, y1, color, size) {
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
}

export function erase(ctx, x0, y0, x1, y1, size) {
    drawLine(ctx, x0, y0, x1, y1, '#ffffff', size);
}

export function floodFill(ctx, startX, startY, fillColor, canvasWidth, canvasHeight) {
    const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imageData.data;

    const startIdx = (startY * canvasWidth + startX) * 4;
    const targetR = data[startIdx];
    const targetG = data[startIdx + 1];
    const targetB = data[startIdx + 2];
    const targetA = data[startIdx + 3];

    const fill = parseFillColor(fillColor);

    // Don't fill if target color is the same as fill color
    if (targetR === fill.r && targetG === fill.g && targetB === fill.b && targetA === 255) {
        return;
    }

    const stack = [[startX, startY]];
    const visited = new Uint8Array(canvasWidth * canvasHeight);

    while (stack.length > 0) {
        const [x, y] = stack.pop();

        if (x < 0 || x >= canvasWidth || y < 0 || y >= canvasHeight) continue;

        const pixelIdx = y * canvasWidth + x;
        if (visited[pixelIdx]) continue;

        const idx = pixelIdx * 4;
        if (!colorMatch(data, idx, targetR, targetG, targetB, targetA)) continue;

        visited[pixelIdx] = 1;
        data[idx] = fill.r;
        data[idx + 1] = fill.g;
        data[idx + 2] = fill.b;
        data[idx + 3] = 255;

        stack.push([x + 1, y]);
        stack.push([x - 1, y]);
        stack.push([x, y + 1]);
        stack.push([x, y - 1]);
    }

    ctx.putImageData(imageData, 0, 0);
}

function colorMatch(data, idx, r, g, b, a) {
    const tolerance = 10;
    return (
        Math.abs(data[idx] - r) <= tolerance &&
        Math.abs(data[idx + 1] - g) <= tolerance &&
        Math.abs(data[idx + 2] - b) <= tolerance &&
        Math.abs(data[idx + 3] - a) <= tolerance
    );
}

function parseFillColor(color) {
    // Accepts "rgb(r,g,b)" format
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
        return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
    }
    // Fallback: parse hex
    if (color.startsWith('#')) {
        const hex = color.slice(1);
        return {
            r: parseInt(hex.substring(0, 2), 16),
            g: parseInt(hex.substring(2, 4), 16),
            b: parseInt(hex.substring(4, 6), 16)
        };
    }
    return { r: 0, g: 0, b: 0 };
}

export function blurStroke(ctx, cx, cy, size, canvasWidth, canvasHeight) {
    const radius = Math.max(size, 4);
    const x = Math.max(0, Math.floor(cx - radius));
    const y = Math.max(0, Math.floor(cy - radius));
    const w = Math.min(canvasWidth - x, radius * 2);
    const h = Math.min(canvasHeight - y, radius * 2);
    if (w <= 0 || h <= 0) return;

    const imageData = ctx.getImageData(x, y, w, h);
    const data = imageData.data;
    const copy = new Uint8ClampedArray(data);
    const kernelSize = 2;

    for (let py = kernelSize; py < h - kernelSize; py++) {
        for (let px = kernelSize; px < w - kernelSize; px++) {
            // Only blur within circular radius
            const dx = px - radius;
            const dy = py - radius;
            if (dx * dx + dy * dy > radius * radius) continue;

            let r = 0, g = 0, b = 0, count = 0;
            for (let ky = -kernelSize; ky <= kernelSize; ky++) {
                for (let kx = -kernelSize; kx <= kernelSize; kx++) {
                    const idx = ((py + ky) * w + (px + kx)) * 4;
                    r += copy[idx];
                    g += copy[idx + 1];
                    b += copy[idx + 2];
                    count++;
                }
            }
            const idx = (py * w + px) * 4;
            data[idx] = r / count;
            data[idx + 1] = g / count;
            data[idx + 2] = b / count;
        }
    }

    ctx.putImageData(imageData, x, y);
}
