// ai-api.js — API configuration and request helpers for Volcengine Ark

// ===== API KEY is loaded from localStorage =====
const CONFIG = {
    apiKey: '',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    endpoints: {
        deepseek: 'deepseek-v4-pro-260425',
        vision: 'doubao-seed-2-1-turbo-260628',
        imageGen: 'doubao-seedream-5-0-pro-260628'
    }
};

// Load API key from localStorage on startup
CONFIG.apiKey = localStorage.getItem('draw_api_key') || '';

export function setApiKey(key) {
    CONFIG.apiKey = key;
    localStorage.setItem('draw_api_key', key);
}

export function getApiKey() {
    return CONFIG.apiKey;
}

export async function validateApiKey(key) {
    const res = await fetch(`${CONFIG.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
            model: CONFIG.endpoints.deepseek,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 1
        })
    });
    return res.ok;
}

/**
 * Chat completion request (text-only or with image)
 */
export async function chatCompletion(endpoint, messages, maxTokens = 2048) {
    const res = await fetch(`${CONFIG.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CONFIG.apiKey}`
        },
        body: JSON.stringify({
            model: endpoint,
            messages,
            max_tokens: maxTokens
        })
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Chat API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
}

/**
 * Image generation request (seedream)
 */
export async function generateImage(prompt, size = '1024x1024') {
    const res = await fetch(`${CONFIG.baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CONFIG.apiKey}`
        },
        body: JSON.stringify({
            model: CONFIG.endpoints.imageGen,
            prompt,
            size,
            output_format: 'png',
            watermark: false,
            response_format: 'b64_json'
        })
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Image Gen API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    return data.data[0].b64_json;
}

/**
 * Vision: send an image (base64) with a text prompt to the vision model
 */
export async function visionAnalyze(base64Image, prompt, maxTokens = 2048) {
    const messages = [
        {
            role: 'user',
            content: [
                { type: 'text', text: prompt },
                {
                    type: 'image_url',
                    image_url: {
                        url: `data:image/png;base64,${base64Image}`
                    }
                }
            ]
        }
    ];

    return chatCompletion(CONFIG.endpoints.vision, messages, maxTokens);
}

/**
 * DeepSeek text completion
 */
export async function deepseekChat(prompt, maxTokens = 2048) {
    const messages = [
        { role: 'user', content: prompt }
    ];

    return chatCompletion(CONFIG.endpoints.deepseek, messages, maxTokens);
}

export { CONFIG };
