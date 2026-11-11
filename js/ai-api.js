// API configuration and cancellable request helpers for Volcengine Ark.
const CONFIG = {
    apiKey: '',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    endpoints: {
        deepseek: 'deepseek-v4-pro-260425',
        vision: 'doubao-seed-2-1-turbo-260628',
        imageGen: 'doubao-seedream-5-0-pro-260628'
    }
};

// Storage can be unavailable; this must not prevent the local drawing app loading.
try { CONFIG.apiKey = localStorage.getItem('draw_api_key') || ''; } catch { /* Session only. */ }

export function setApiKey(key) {
    CONFIG.apiKey = key;
    try { localStorage.setItem('draw_api_key', key); } catch { /* Keep the in-memory key. */ }
}
export function getApiKey() { return CONFIG.apiKey; }

async function postJSON(path, body, options = {}, read = async response => {
    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`API error ${response.status}: ${detail.slice(0, 500)}`);
    }
    return response.json();
}) {
    const { signal, timeoutMs = 60000, apiKey = CONFIG.apiKey } = options;
    const controller = new AbortController();
    const cancel = () => controller.abort(signal?.reason || new DOMException('Cancelled', 'AbortError'));
    if (signal?.aborted) cancel();
    else signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => {
        controller.abort(new DOMException('The AI request timed out. Please try again.', 'TimeoutError'));
    }, timeoutMs);
    try {
        const response = await fetch(`${CONFIG.baseUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        // Keep the deadline active while reading a potentially large image response.
        const result = await read(response);
        if (controller.signal.aborted) throw controller.signal.reason;
        return result;
    } catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason;
        throw error;
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
    }
}

export async function validateApiKey(key, options = {}) {
    return postJSON('/chat/completions', {
        model: CONFIG.endpoints.deepseek,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1
    }, { ...options, apiKey: key }, async response => {
        // Consume the response before releasing the timeout and connection.
        await response.text();
        return response.ok;
    });
}

export async function chatCompletion(endpoint, messages, maxTokens = 2048, options = {}) {
    const data = await postJSON('/chat/completions', {
        model: endpoint, messages, max_tokens: maxTokens
    }, options);
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('The AI returned an empty text response.');
    return content;
}

export async function generateImage(prompt, size = '1024x1024', options = {}) {
    const data = await postJSON('/images/generations', {
        model: CONFIG.endpoints.imageGen,
        prompt,
        size,
        output_format: 'png',
        watermark: false,
        response_format: 'b64_json'
    }, { timeoutMs: 120000, ...options });
    const image = data?.data?.[0]?.b64_json;
    if (typeof image !== 'string' || !image) throw new Error('The AI returned no image.');
    return image;
}

export async function visionAnalyze(base64Image, prompt, maxTokens = 2048, options = {}) {
    return chatCompletion(CONFIG.endpoints.vision, [{
        role: 'user',
        content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
        ]
    }], maxTokens, options);
}

export async function deepseekChat(prompt, maxTokens = 2048, options = {}) {
    return chatCompletion(CONFIG.endpoints.deepseek, [{ role: 'user', content: prompt }], maxTokens, options);
}

export { CONFIG };
