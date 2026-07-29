// filters.js — Convolution engine, preset kernels, and line extraction

// ========== PRESET KERNELS ==========
export const FILTER_PRESETS = {
    // 平滑降噪
    'mean-blur': {
        name: 'Mean Blur', category: 'smooth',
        kernel: [1/9,1/9,1/9, 1/9,1/9,1/9, 1/9,1/9,1/9]
    },
    'gaussian-blur': {
        name: 'Gaussian Blur', category: 'smooth',
        kernel: [1/16,2/16,1/16, 2/16,4/16,2/16, 1/16,2/16,1/16]
    },
    'median': {
        name: 'Median Filter', category: 'smooth',
        kernel: null, special: 'median'
    },
    // 边缘检测
    'sobel-x': {
        name: 'Sobel X', category: 'edge',
        kernel: [-1,0,1, -2,0,2, -1,0,1]
    },
    'sobel-y': {
        name: 'Sobel Y', category: 'edge',
        kernel: [-1,-2,-1, 0,0,0, 1,2,1]
    },
    'laplacian': {
        name: 'Laplacian', category: 'edge',
        kernel: [0,-1,0, -1,4,-1, 0,-1,0]
    },
    'prewitt-x': {
        name: 'Prewitt X', category: 'edge',
        kernel: [-1,0,1, -1,0,1, -1,0,1]
    },
    'prewitt-y': {
        name: 'Prewitt Y', category: 'edge',
        kernel: [-1,-1,-1, 0,0,0, 1,1,1]
    },
    // 清晰度增强
    'sharpen': {
        name: 'Sharpen', category: 'sharpen',
        kernel: [0,-1,0, -1,5,-1, 0,-1,0]
    },
    'usm': {
        name: 'USM Sharpen', category: 'sharpen',
        kernel: null, special: 'usm'
    },
    // 艺术特效
    'emboss': {
        name: 'Emboss', category: 'artistic',
        kernel: [-2,-1,0, -1,1,1, 0,1,2]
    },
    'sketch': {
        name: 'Sketch', category: 'artistic',
        kernel: null, special: 'sketch'
    },
    'motion-blur': {
        name: 'Motion Blur', category: 'artistic',
        kernel: [1/3,0,0, 0,1/3,0, 0,0,1/3]
    },
    // 二值图像处理
    'erode': {
        name: 'Erode', category: 'morphology',
        kernel: null, special: 'erode'
    },
    'dilate': {
        name: 'Dilate', category: 'morphology',
        kernel: null, special: 'dilate'
    },
    'open': {
        name: 'Open', category: 'morphology',
        kernel: null, special: 'open'
    },
    'close': {
        name: 'Close', category: 'morphology',
        kernel: null, special: 'close'
    }
};

export const CATEGORIES = [
    { id: 'smooth', name: 'SMOOTH / DENOISE' },
    { id: 'edge', name: 'EDGE DETECT' },
    { id: 'sharpen', name: 'SHARPEN' },
    { id: 'artistic', name: 'ARTISTIC FX' },
    { id: 'morphology', name: 'MORPHOLOGY' }
];

// ========== CORE CONVOLUTION ==========

// Apply 3x3 kernel to imageData, returns new ImageData
export function applyKernel3x3(imageData, kernel) {
    const { width, height, data } = imageData;
    const out = new Uint8ClampedArray(data.length);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if (y === 0 || y === height - 1 || x === 0 || x === width - 1) {
                out[idx] = data[idx];
                out[idx+1] = data[idx+1];
                out[idx+2] = data[idx+2];
                out[idx+3] = data[idx+3];
                continue;
            }
            let r = 0, g = 0, b = 0;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const si = ((y+ky) * width + (x+kx)) * 4;
                    const ki = (ky+1) * 3 + (kx+1);
                    r += data[si] * kernel[ki];
                    g += data[si+1] * kernel[ki];
                    b += data[si+2] * kernel[ki];
                }
            }
            out[idx] = Math.min(255, Math.max(0, r));
            out[idx+1] = Math.min(255, Math.max(0, g));
            out[idx+2] = Math.min(255, Math.max(0, b));
            out[idx+3] = data[idx+3];
        }
    }
    return new ImageData(out, width, height);
}

// Apply convolution to a range of rows [startRow, endRow)
export function applyKernelRows(srcData, dstData, width, height, kernel, startRow, endRow) {
    for (let y = startRow; y < endRow; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if (y === 0 || y === height - 1 || x === 0 || x === width - 1) {
                dstData[idx] = srcData[idx];
                dstData[idx+1] = srcData[idx+1];
                dstData[idx+2] = srcData[idx+2];
                dstData[idx+3] = srcData[idx+3];
                continue;
            }
            let r = 0, g = 0, b = 0;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const si = ((y+ky) * width + (x+kx)) * 4;
                    const ki = (ky+1) * 3 + (kx+1);
                    r += srcData[si] * kernel[ki];
                    g += srcData[si+1] * kernel[ki];
                    b += srcData[si+2] * kernel[ki];
                }
            }
            dstData[idx] = Math.min(255, Math.max(0, r));
            dstData[idx+1] = Math.min(255, Math.max(0, g));
            dstData[idx+2] = Math.min(255, Math.max(0, b));
            dstData[idx+3] = srcData[idx+3];
        }
    }
}

// ========== SPECIAL FILTERS ==========

function medianFilter(imageData) {
    const { width, height, data } = imageData;
    const out = new Uint8ClampedArray(data.length);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if (y === 0 || y === height - 1 || x === 0 || x === width - 1) {
                out[idx] = data[idx]; out[idx+1] = data[idx+1];
                out[idx+2] = data[idx+2]; out[idx+3] = data[idx+3];
                continue;
            }
            const rs = [], gs = [], bs = [];
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const si = ((y+ky) * width + (x+kx)) * 4;
                    rs.push(data[si]); gs.push(data[si+1]); bs.push(data[si+2]);
                }
            }
            rs.sort((a,b) => a-b); gs.sort((a,b) => a-b); bs.sort((a,b) => a-b);
            out[idx] = rs[4]; out[idx+1] = gs[4]; out[idx+2] = bs[4]; out[idx+3] = data[idx+3];
        }
    }
    return new ImageData(out, width, height);
}

function grayscale(data) {
    const out = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round(0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]);
        out[i] = gray; out[i+1] = gray; out[i+2] = gray; out[i+3] = data[i+3];
    }
    return out;
}

function sketchFilter(imageData) {
    const { width, height, data } = imageData;
    const gray = grayscale(data);
    // Sobel magnitude + invert
    const sobelX = [-1,0,1, -2,0,2, -1,0,1];
    const sobelY = [-1,-2,-1, 0,0,0, 1,2,1];
    const out = new Uint8ClampedArray(data.length);
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let gx = 0, gy = 0;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const si = ((y+ky) * width + (x+kx)) * 4;
                    const ki = (ky+1) * 3 + (kx+1);
                    gx += gray[si] * sobelX[ki];
                    gy += gray[si] * sobelY[ki];
                }
            }
            const mag = Math.min(255, Math.sqrt(gx*gx + gy*gy));
            const val = 255 - mag;
            const idx = (y * width + x) * 4;
            out[idx] = val; out[idx+1] = val; out[idx+2] = val; out[idx+3] = 255;
        }
    }
    // Border pixels
    for (let x = 0; x < width; x++) {
        const t = x * 4, b = ((height-1)*width+x)*4;
        out[t]=255; out[t+1]=255; out[t+2]=255; out[t+3]=255;
        out[b]=255; out[b+1]=255; out[b+2]=255; out[b+3]=255;
    }
    for (let y = 0; y < height; y++) {
        const l = (y*width)*4, r = (y*width+width-1)*4;
        out[l]=255; out[l+1]=255; out[l+2]=255; out[l+3]=255;
        out[r]=255; out[r+1]=255; out[r+2]=255; out[r+3]=255;
    }
    return new ImageData(out, width, height);
}

function usmSharpen(imageData) {
    const blurKernel = [1/16,2/16,1/16, 2/16,4/16,2/16, 1/16,2/16,1/16];
    const blurred = applyKernel3x3(imageData, blurKernel);
    const { width, height, data } = imageData;
    const out = new Uint8ClampedArray(data.length);
    const amount = 1.5;
    for (let i = 0; i < data.length; i += 4) {
        out[i] = Math.min(255, Math.max(0, data[i] + amount * (data[i] - blurred.data[i])));
        out[i+1] = Math.min(255, Math.max(0, data[i+1] + amount * (data[i+1] - blurred.data[i+1])));
        out[i+2] = Math.min(255, Math.max(0, data[i+2] + amount * (data[i+2] - blurred.data[i+2])));
        out[i+3] = data[i+3];
    }
    return new ImageData(out, width, height);
}

// Morphology: work on grayscale threshold
function toBinary(data) {
    const out = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
        const val = gray < 128 ? 0 : 255;
        out[i] = val; out[i+1] = val; out[i+2] = val; out[i+3] = 255;
    }
    return out;
}

function erodeOp(data, width, height) {
    const out = new Uint8ClampedArray(data.length);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            let minVal = 255;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const ny = y+ky, nx = x+kx;
                    if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                        minVal = Math.min(minVal, data[((ny)*width+(nx))*4]);
                    }
                }
            }
            out[idx] = minVal; out[idx+1] = minVal; out[idx+2] = minVal; out[idx+3] = 255;
        }
    }
    return out;
}

function dilateOp(data, width, height) {
    const out = new Uint8ClampedArray(data.length);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            let maxVal = 0;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const ny = y+ky, nx = x+kx;
                    if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                        maxVal = Math.max(maxVal, data[((ny)*width+(nx))*4]);
                    }
                }
            }
            out[idx] = maxVal; out[idx+1] = maxVal; out[idx+2] = maxVal; out[idx+3] = 255;
        }
    }
    return out;
}

function morphologyFilter(imageData, type) {
    const { width, height, data } = imageData;
    let bin = toBinary(data);
    if (type === 'erode') {
        bin = erodeOp(bin, width, height);
    } else if (type === 'dilate') {
        bin = dilateOp(bin, width, height);
    } else if (type === 'open') {
        bin = erodeOp(bin, width, height);
        bin = dilateOp(bin, width, height);
    } else if (type === 'close') {
        bin = dilateOp(bin, width, height);
        bin = erodeOp(bin, width, height);
    }
    return new ImageData(bin, width, height);
}

// ========== LINE EXTRACTION (Sobel) ==========
export function extractLines(imageData) {
    return sketchFilter(imageData);
}

// ========== APPLY FILTER (dispatch) ==========
export function applyFilter(imageData, presetId) {
    const preset = FILTER_PRESETS[presetId];
    if (!preset) return imageData;

    if (preset.kernel) {
        return applyKernel3x3(imageData, preset.kernel);
    }

    switch (preset.special) {
        case 'median': return medianFilter(imageData);
        case 'usm': return usmSharpen(imageData);
        case 'sketch': return sketchFilter(imageData);
        case 'erode': return morphologyFilter(imageData, 'erode');
        case 'dilate': return morphologyFilter(imageData, 'dilate');
        case 'open': return morphologyFilter(imageData, 'open');
        case 'close': return morphologyFilter(imageData, 'close');
        default: return imageData;
    }
}

// Apply custom kernel from user input
export function applyCustomKernel(imageData, kernelArray) {
    return applyKernel3x3(imageData, kernelArray);
}
