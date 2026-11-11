// ai-tools.js — AI tool implementations: Auto-Color, Finish Drawing, Text to Drawing, Style Transfer

import { visionAnalyze, generateImage, deepseekChat } from './ai-api.js';
import { getCanvasBase64, loadImageToCanvas, getCanvasSize, getCanvasRevision } from './canvas.js';

let _setLoading = null;
let _setStatus = null;
let activeOperation = null;

export function initAITools(setLoading, setStatus) {
    _setLoading = setLoading;
    _setStatus = setStatus;
}

function showLoading(msg) {
    if (_setLoading) _setLoading(true);
    if (_setStatus) _setStatus(msg);
}

function hideLoading() {
    if (_setLoading) _setLoading(false);
    if (_setStatus) _setStatus('');
}

function showError(msg) {
    alert('AI Error: ' + msg);
}

function beginAI(message) {
    if (activeOperation) return null;
    const operation = {
        controller: new AbortController(),
        revision: getCanvasRevision()
    };
    activeOperation = operation;
    showLoading(message);
    return operation;
}

function assertCurrent(operation) {
    if (operation.controller.signal.aborted || activeOperation !== operation) {
        throw new DOMException('Cancelled', 'AbortError');
    }
    if (operation.revision !== getCanvasRevision()) {
        throw new Error('The canvas has changed. Generate again to use the current drawing.');
    }
}

async function applyAIResult(operation, base64) {
    assertCurrent(operation);
    await loadImageToCanvas(base64, {
        expectedRevision: operation.revision,
        signal: operation.controller.signal
    });
}

function finishAI(operation) {
    if (activeOperation !== operation) return;
    activeOperation = null;
    hideLoading();
}

function handleAIError(operation, error) {
    if (activeOperation === operation && !operation.controller.signal.aborted) {
        showError(error.message || 'Unable to complete the request.');
    }
}

export function cancelAI() {
    const operation = activeOperation;
    if (!operation) return;
    operation.controller.abort(new DOMException('Cancelled', 'AbortError'));
    finishAI(operation);
}

/**
 * AUTO-COLOR: Analyze the line art on canvas, generate a colorized version
 */
export async function autoColor() {
    const operation = beginAI('Analyzing your drawing...');
    if (!operation) return;
    try {
        const base64 = getCanvasBase64();
        const { width, height } = getCanvasSize();

        // Step 1: Vision model describes the line art
        const description = await visionAnalyze(
            base64,
            'You are looking at a hand-drawn sketch/line art on a white canvas. ' +
            'Describe what is drawn in detail, including shapes, objects, and composition. ' +
            'Then suggest appropriate, vivid colors for each part. ' +
            'Output a single detailed prompt for an image generation AI to recreate this drawing with full color. ' +
            'The prompt should preserve the original composition and shapes exactly, but add rich, natural coloring. ' +
            'Output ONLY the prompt text, nothing else.',
            2048, { signal: operation.controller.signal }
        );

        // Step 2: Generate colorized version with seedream
        assertCurrent(operation);
        showLoading('Generating colored version...');
        const size = getSeedreamSize(width, height);
        const b64Result = await generateImage(description, size, { signal: operation.controller.signal });

        // Step 3: Load result onto canvas
        await applyAIResult(operation, b64Result);
    } catch (error) {
        handleAIError(operation, error);
    } finally {
        finishAI(operation);
    }
}

/**
 * FINISH DRAWING: AI completes an unfinished drawing
 */
export async function finishDrawing() {
    const operation = beginAI('Understanding your drawing...');
    if (!operation) return;
    try {
        const base64 = getCanvasBase64();
        const { width, height } = getCanvasSize();

        // Step 1: Vision model analyzes the incomplete drawing
        const description = await visionAnalyze(
            base64,
            'You are looking at an incomplete, unfinished hand-drawn sketch on a white canvas. ' +
            'Describe what has been drawn so far in detail, and infer what the artist was trying to draw. ' +
            'Then create a detailed prompt for an image generation AI to produce the COMPLETED version of this drawing. ' +
            'The prompt should: preserve everything already drawn, complete the missing parts naturally, ' +
            'match the existing art style, and add appropriate colors and details. ' +
            'Output ONLY the prompt text, nothing else.',
            2048, { signal: operation.controller.signal }
        );

        // Step 2: Generate completed version
        assertCurrent(operation);
        showLoading('Completing your drawing...');
        const size = getSeedreamSize(width, height);
        const b64Result = await generateImage(description, size, { signal: operation.controller.signal });

        // Step 3: Load result onto canvas
        await applyAIResult(operation, b64Result);
    } catch (error) {
        handleAIError(operation, error);
    } finally {
        finishAI(operation);
    }
}

/**
 * TEXT TO DRAWING: Generate a drawing from a text description
 */
export async function textToDrawing(textPrompt) {
    if (!textPrompt || !textPrompt.trim()) {
        alert('Please enter a description first!');
        return;
    }

    const operation = beginAI('Creating your drawing...');
    if (!operation) return;
    try {
        const { width, height } = getCanvasSize();

        // Step 1: Enhance the prompt with DeepSeek for better results
        const enhancedPrompt = await deepseekChat(
            'You are a prompt engineer for an image generation AI. ' +
            'The user wants to generate this image: "' + textPrompt.trim() + '"\n\n' +
            'Enhance this into a detailed, vivid image generation prompt that will produce a high-quality result. ' +
            'Add details about style, lighting, composition, and colors while preserving the user\'s intent. ' +
            'Output ONLY the enhanced prompt text, nothing else.',
            2048, { signal: operation.controller.signal }
        );

        // Step 2: Generate image with seedream
        assertCurrent(operation);
        showLoading('Generating image...');
        const size = getSeedreamSize(width, height);
        const b64Result = await generateImage(enhancedPrompt, size, { signal: operation.controller.signal });

        // Step 3: Load result onto canvas
        await applyAIResult(operation, b64Result);
    } catch (error) {
        handleAIError(operation, error);
    } finally {
        finishAI(operation);
    }
}

/**
 * STYLE TRANSFER: Transform the current drawing into a different art style
 */
const STYLES = {
    'oil-painting': 'a classical oil painting with visible brushstrokes, rich textures, and deep colors, in the style of the Old Masters',
    'watercolor': 'a delicate watercolor painting with soft washes, bleeding colors, and visible paper texture',
    'pixel-art': 'retro pixel art with a limited color palette, sharp pixels, and nostalgic 8-bit game aesthetic',
    'comic': 'a bold comic book illustration with thick outlines, halftone dots, vibrant flat colors, and dynamic composition',
    'sketch': 'a detailed pencil sketch with crosshatching, fine lines, graphite shading, and artistic hand-drawn quality',
    'ukiyo-e': 'a Japanese ukiyo-e woodblock print with flat areas of color, bold outlines, and traditional Japanese aesthetic'
};

export function getStyleList() {
    return Object.keys(STYLES);
}

export async function styleTransfer(styleName) {
    const styleDesc = STYLES[styleName];
    if (!styleDesc) {
        alert('Unknown style: ' + styleName);
        return;
    }

    const operation = beginAI('Analyzing your artwork...');
    if (!operation) return;
    try {
        const base64 = getCanvasBase64();
        const { width, height } = getCanvasSize();

        // Step 1: Vision model describes the current drawing
        const description = await visionAnalyze(
            base64,
            'Describe this image in detail: the subjects, composition, colors, and scene. ' +
            'Then create a prompt for an image generation AI to recreate this EXACT same scene and composition, ' +
            'but rendered as ' + styleDesc + '. ' +
            'The prompt must preserve the original subject matter and layout precisely. ' +
            'Output ONLY the prompt text, nothing else.',
            2048, { signal: operation.controller.signal }
        );

        // Step 2: Generate styled version
        assertCurrent(operation);
        showLoading('Applying ' + styleName.replace('-', ' ') + ' style...');
        const size = getSeedreamSize(width, height);
        const b64Result = await generateImage(description, size, { signal: operation.controller.signal });

        // Step 3: Load result onto canvas
        await applyAIResult(operation, b64Result);
    } catch (error) {
        handleAIError(operation, error);
    } finally {
        finishAI(operation);
    }
}

/**
 * Map canvas dimensions to the closest seedream supported size
 */
function getSeedreamSize(w, h) {
    const ratio = w / h;
    if (ratio > 1.3) return '1280x720';
    if (ratio < 0.77) return '720x1280';
    return '1024x1024';
}
