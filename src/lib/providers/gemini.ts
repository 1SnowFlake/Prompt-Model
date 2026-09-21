import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Part } from '@google/generative-ai';
import { ProviderOptions, ProviderResponse } from './types';
import { getModel } from '../models';

export async function callGemini(
  apiKey: string,
  options: ProviderOptions
): Promise<ProviderResponse> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelDef = getModel(options.model);
  const start = Date.now();

  const targetModel = options.model === 'gemini-2.5-pro' ? 'gemini-2.5-flash' : options.model;
  const model = genAI.getGenerativeModel({
    model: targetModel,
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
    generationConfig: {
      maxOutputTokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
    },
  });

  // Build chat history (all but last message)
  const systemMsg = options.messages.find((m) => m.role === 'system');
  const chatMessages = options.messages.filter((m) => m.role !== 'system');

  const history = chatMessages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }] as Part[],
  }));

  const chat = model.startChat({
    history,
    systemInstruction: systemMsg?.content,
  });

  const lastMsg = chatMessages[chatMessages.length - 1];
  let parts: Part[] = [{ text: lastMsg.content }];

  // Add image if present
  if (lastMsg.imageBase64) {
    parts = [
      { text: lastMsg.content },
      { inlineData: { data: lastMsg.imageBase64, mimeType: (lastMsg.imageMime ?? 'image/jpeg') as 'image/jpeg' } },
    ];
  }

  let fullContent = '';
  let tokensInput = 0;
  let tokensOutput = 0;

  if (options.stream && options.onChunk) {
    const result = await chat.sendMessageStream(parts);
    for await (const chunk of result.stream) {
      const delta = chunk.text();
      if (delta) {
        fullContent += delta;
        options.onChunk(delta);
      }
    }
    const finalResp = await result.response;
    tokensInput = finalResp.usageMetadata?.promptTokenCount ?? Math.ceil(lastMsg.content.length / 4);
    tokensOutput = finalResp.usageMetadata?.candidatesTokenCount ?? Math.ceil(fullContent.length / 4);
  } else {
    const result = await chat.sendMessage(parts);
    const resp = result.response;
    fullContent = resp.text();
    tokensInput = resp.usageMetadata?.promptTokenCount ?? Math.ceil(lastMsg.content.length / 4);
    tokensOutput = resp.usageMetadata?.candidatesTokenCount ?? Math.ceil(fullContent.length / 4);
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
    provider: 'gemini',
    latency,
    cost,
  };
}
