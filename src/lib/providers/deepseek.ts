import { ProviderOptions, ProviderResponse } from './types';
import { getModel } from '../models';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

export async function callDeepSeek(
  apiKey: string,
  options: ProviderOptions
): Promise<ProviderResponse> {
  const modelDef = getModel(options.model);
  const start = Date.now();

  const messages = options.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let fullContent = '';
  let tokensInput = 0;
  let tokensOutput = 0;

  if (options.stream && options.onChunk) {
    const resp = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
        stream: true,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`DeepSeek API error ${resp.status}: ${err}`);
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
            // ignore parse errors on partial chunks
          }
        }
      }
    }
  } else {
    const resp = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`DeepSeek API error ${resp.status}: ${err}`);
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
    provider: 'deepseek',
    latency,
    cost,
  };
}
