import Anthropic from '@anthropic-ai/sdk';
import { ProviderOptions, ProviderResponse } from './types';
import { getModel } from '../models';

export async function callAnthropic(
  apiKey: string,
  options: ProviderOptions
): Promise<ProviderResponse> {
  const client = new Anthropic({ apiKey });
  const modelDef = getModel(options.model);
  const start = Date.now();

  const systemMsg = options.messages.find((m) => m.role === 'system')?.content;
  const chatMessages = options.messages.filter((m) => m.role !== 'system');

  const messages: Anthropic.MessageParam[] = chatMessages.map((m) => {
    if (m.imageBase64 && m.role === 'user') {
      return {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: (m.imageMime ?? 'image/jpeg') as 'image/jpeg',
              data: m.imageBase64,
            },
          },
          { type: 'text', text: m.content },
        ],
      };
    }
    return { role: m.role as 'user' | 'assistant', content: m.content };
  });

  let fullContent = '';
  let tokensInput = 0;
  let tokensOutput = 0;

  if (options.stream && options.onChunk) {
    const stream = client.messages.stream({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      system: systemMsg,
      messages,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        fullContent += chunk.delta.text;
        options.onChunk(chunk.delta.text);
      }
    }

    const finalMsg = await stream.finalMessage();
    tokensInput = finalMsg.usage.input_tokens;
    tokensOutput = finalMsg.usage.output_tokens;
  } else {
    const resp = await client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      system: systemMsg,
      messages,
    });
    fullContent = (resp.content[0] as Anthropic.TextBlock).text;
    tokensInput = resp.usage.input_tokens;
    tokensOutput = resp.usage.output_tokens;
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
    provider: 'anthropic',
    latency,
    cost,
  };
}
