import { ProviderOptions, ProviderResponse } from './types';
import { getModel } from '../models';

export async function callOllama(
  baseUrl: string,
  options: ProviderOptions
): Promise<ProviderResponse> {
  const modelDef = getModel(options.model);
  const start = Date.now();

  const messages = options.messages.map((m) => ({
    role: m.role,
    content: m.content,
    ...(m.imageBase64 ? { images: [m.imageBase64] } : {}),
  }));

  let fullContent = '';
  let tokensInput = 0;
  let tokensOutput = 0;

  let targetModel = options.model;
  try {
    const tagsRes = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (tagsRes.ok) {
      const tagsData = await tagsRes.json();
      const installed: string[] = (tagsData.models || []).map((m: { name: string }) => m.name);
      if (installed.length > 0 && !installed.includes(targetModel)) {
        const match = installed.find((m) => m.startsWith(targetModel) || targetModel.startsWith(m.split(':')[0]));
        targetModel = match || installed[0];
      }
    }
  } catch {
    // ignore
  }

  if (options.stream && options.onChunk) {
    const resp = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: targetModel,
        messages,
        stream: true,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 4096,
        },
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Ollama error ${resp.status}: ${err}`);
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
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          const delta = json.message?.content ?? '';
          if (delta) {
            fullContent += delta;
            options.onChunk(delta);
          }
          if (json.done && json.prompt_eval_count) {
            tokensInput = json.prompt_eval_count;
            tokensOutput = json.eval_count ?? Math.ceil(fullContent.length / 4);
          }
        } catch {
          // ignore partial lines
        }
      }
    }
  } else {
    const resp = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: targetModel,
        messages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 4096,
        },
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Ollama error ${resp.status}: ${err}`);
    }

    const json = await resp.json();
    fullContent = json.message?.content ?? '';
    tokensInput = json.prompt_eval_count ?? Math.ceil(JSON.stringify(messages).length / 4);
    tokensOutput = json.eval_count ?? Math.ceil(fullContent.length / 4);
  }

  const latency = Date.now() - start;
  const cost = 0; // Local model, always free

  return {
    content: fullContent,
    tokensInput,
    tokensOutput,
    model: options.model,
    provider: 'ollama',
    latency,
    cost,
  };
}
