import OpenAI from 'openai';
import { ProviderOptions, ProviderResponse } from './types';
import { getModel } from '../models';

export async function callOpenAI(
  apiKey: string,
  options: ProviderOptions
): Promise<ProviderResponse> {
  const client = new OpenAI({ apiKey });
  const modelDef = getModel(options.model);
  const start = Date.now();

  // Build messages array with vision support
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = options.messages.map((m) => {
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
    const stream = await client.chat.completions.create({
      model: options.model,
      messages,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta) {
        fullContent += delta;
        options.onChunk(delta);
      }
      if (chunk.usage) {
        tokensInput = chunk.usage.prompt_tokens ?? 0;
        tokensOutput = chunk.usage.completion_tokens ?? 0;
      }
    }

    // Estimate if usage not returned
    if (tokensInput === 0) tokensInput = Math.ceil(JSON.stringify(messages).length / 4);
    if (tokensOutput === 0) tokensOutput = Math.ceil(fullContent.length / 4);
  } else {
    const resp = await client.chat.completions.create({
      model: options.model,
      messages,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
    });
    fullContent = resp.choices[0]?.message?.content ?? '';
    tokensInput = resp.usage?.prompt_tokens ?? 0;
    tokensOutput = resp.usage?.completion_tokens ?? 0;
  }

  const latency = Date.now() - start;
  const cost =
    (tokensInput / 1000) * (modelDef?.costPer1kInputTokens ?? 0) +
    (tokensOutput / 1000) * (modelDef?.costPer1kOutputTokens ?? 0);

  return {
    content: fullContent,
    tokensInput,
    tokensOutput,
    model: options.model,
    provider: 'openai',
    latency,
    cost,
  };
}
