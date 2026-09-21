process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { ProviderOptions, ProviderResponse } from './types';
import { getModel } from '../models';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Map internal model IDs to OpenRouter model IDs
// Updated to current valid OpenRouter model slugs (Sept 2026)
const OPENROUTER_MODEL_MAP: Record<string, string> = {
  // OpenAI
  'gpt-4o': 'openai/gpt-4o',
  'gpt-4o-mini': 'openai/gpt-4o-mini',
  'gpt-4.1': 'openai/gpt-4o',                             // gpt-4.1 not on OR, use gpt-4o
  // Google Gemini
  'gemini-2.5-flash': 'google/gemini-2.5-flash',
  'gemini-2.5-pro': 'google/gemini-2.5-pro',
  // Anthropic Claude — 3.5 series retired; map to latest equivalents
  'claude-3-5-sonnet-20241022': 'anthropic/claude-sonnet-4.5',
  'claude-3-5-haiku-20241022': 'anthropic/claude-haiku-4.5',
  // DeepSeek
  'deepseek-chat': 'deepseek/deepseek-chat',
  'deepseek-reasoner': 'deepseek/deepseek-r1',
  // Meta Llama (via OpenRouter free tier)
  'llama3.2': 'meta-llama/llama-3.2-3b-instruct',
  'llama3.3': 'meta-llama/llama-3.3-70b-instruct',
  'llama4-scout': 'meta-llama/llama-4-scout',
  // Mistral
  'mistral': 'mistralai/mistral-small-3.1-24b-instruct',
};

export function getOpenRouterModelId(modelId: string): string {
  return OPENROUTER_MODEL_MAP[modelId] ?? modelId;
}

export async function callOpenRouter(
  apiKey: string,
  options: ProviderOptions
): Promise<ProviderResponse> {
  const modelDef = getModel(options.model);
  const openRouterModel = getOpenRouterModelId(options.model);
  const start = Date.now();

  // Build messages array with vision support
  const messages = options.messages.map((m) => {
    if (m.imageBase64 && m.role === 'user') {
      return {
        role: 'user',
        content: [
          { type: 'text', text: m.content },
          {
            type: 'image_url',
            image_url: { url: `data:${m.imageMime ?? 'image/jpeg'};base64,${m.imageBase64}` },
          },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  let fullContent = '';
  let tokensInput = 0;
  let tokensOutput = 0;

  if (options.stream && options.onChunk) {
    let maxTokens = options.maxTokens ?? 650;
    let resp = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'AI Model Router',
      },
      body: JSON.stringify({
        model: openRouterModel,
        messages,
        max_tokens: maxTokens,
        temperature: options.temperature ?? 0.7,
        stream: true,
      }),
    });

    if (resp.status === 402) {
      const errText = await resp.text();
      const affordMatch = errText.match(/can only afford (\d+)/);
      if (affordMatch) {
        const affordable = Math.max(120, parseInt(affordMatch[1], 10) - 15);
        resp = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'AI Model Router',
          },
          body: JSON.stringify({
            model: openRouterModel,
            messages,
            max_tokens: affordable,
            temperature: options.temperature ?? 0.7,
            stream: true,
          }),
        });
      }
      if (!resp.ok && (openRouterModel === 'openai/gpt-4o' || openRouterModel === 'openai/gpt-4.1')) {
        // Fallback to gpt-4o-mini on low credit balance
        resp = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'AI Model Router',
          },
          body: JSON.stringify({
            model: 'openai/gpt-4o-mini',
            messages,
            max_tokens: 600,
            temperature: options.temperature ?? 0.7,
            stream: true,
          }),
        });
      }
    }

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`OpenRouter error ${resp.status}: ${err}`);
    }

    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              fullContent += delta;
              options.onChunk(delta);
            }
            if (json.usage) {
              tokensInput = json.usage.prompt_tokens ?? 0;
              tokensOutput = json.usage.completion_tokens ?? 0;
            }
          } catch {
            // ignore partial json
          }
        }
      }
    }
  } else {
    const resp = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'AI Model Router',
      },
      body: JSON.stringify({
        model: openRouterModel,
        messages,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`OpenRouter error ${resp.status}: ${err}`);
    }

    const json = await resp.json();
    fullContent = json.choices?.[0]?.message?.content ?? '';
    tokensInput = json.usage?.prompt_tokens ?? 0;
    tokensOutput = json.usage?.completion_tokens ?? 0;
  }

  if (tokensInput === 0) tokensInput = Math.ceil(JSON.stringify(messages).length / 4);
  if (tokensOutput === 0) tokensOutput = Math.ceil(fullContent.length / 4);

  const latency = Date.now() - start;
  const cost =
    (tokensInput / 1000) * (modelDef?.costPer1kInputTokens ?? 0) +
    (tokensOutput / 1000) * (modelDef?.costPer1kOutputTokens ?? 0);

  return {
    content: fullContent,
    tokensInput,
    tokensOutput,
    model: options.model,
    provider: modelDef?.provider ?? 'openrouter',
    latency,
    cost,
  };
}
