import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getApiKey, getSetting, createConversation, getConversation, insertMessage, touchConversation, updateConversationTitle, insertUsageStat } from '@/lib/db';
import { route, RoutingMode } from '@/lib/router';
import { ChatMessage, ProviderOptions } from '@/lib/providers/types';
import { getAllModels } from '@/lib/models';
import { callOpenAI } from '@/lib/providers/openai';
import { callGemini } from '@/lib/providers/gemini';
import { callAnthropic } from '@/lib/providers/anthropic';
import { callDeepSeek } from '@/lib/providers/deepseek';
import { callOllama } from '@/lib/providers/ollama';
import { callOpenRouter } from '@/lib/providers/openrouter';

export const runtime = 'nodejs';
export const maxDuration = 120;

async function callProvider(
  provider: string,
  options: ProviderOptions,
  apiKey?: string,
  baseUrl?: string,
  isOpenRouter?: boolean
) {
  if (isOpenRouter || provider === 'openrouter') {
    return callOpenRouter(apiKey!, options);
  }
  switch (provider) {
    case 'openai':
      return callOpenAI(apiKey!, options);
    case 'gemini':
      return callGemini(apiKey!, options);
    case 'anthropic':
      return callAnthropic(apiKey!, options);
    case 'deepseek':
      return callDeepSeek(apiKey!, options);
    case 'ollama':
      return callOllama(baseUrl ?? 'http://localhost:11434', options);
    default:
      return callOpenRouter(apiKey!, options);
  }
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  try {
    const body = await req.json();
    const {
      conversationId: existingConvId,
      messages,
      routingMode = 'auto',
      manualModel,
      imageBase64,
      imageMime,
    }: {
      conversationId?: string;
      messages: ChatMessage[];
      routingMode?: RoutingMode;
      manualModel?: string;
      imageBase64?: string;
      imageMime?: string;
    } = body;

    // Attach image to last user message if provided
    const chatMessages: ChatMessage[] = messages.map((m, i) => {
      if (i === messages.length - 1 && m.role === 'user' && imageBase64) {
        return { ...m, imageBase64, imageMime };
      }
      return m;
    });

    const isVercel = process.env.VERCEL === '1' || !!process.env.VERCEL_ENV;
    const ollamaBaseUrl = getSetting('ollama_base_url') ?? 'http://localhost:11434';
    const isOllamaLocal = ollamaBaseUrl.includes('localhost') || ollamaBaseUrl.includes('127.0.0.1');

    // Determine available models (those with API keys)
    const keyStatuses = getAllModels().map((m) => {
      if (m.provider === 'ollama') {
        return { id: m.id, available: isVercel && isOllamaLocal ? false : true };
      }
      const key = getApiKey(m.provider);
      return { id: m.id, available: !!key && key.enabled };
    });
    const availableModels = new Set(keyStatuses.filter((s) => s.available).map((s) => s.id));

    if (availableModels.size === 0) {
      return NextResponse.json(
        { error: 'No AI models are available. Please configure your API key in Settings or Vercel Environment Variables.' },
        { status: 400 }
      );
    }

    // Route to best model
    const decision = route(chatMessages, !!imageBase64, routingMode, availableModels, manualModel);

    // Resolve API credentials
    const keyInfo = getApiKey(decision.selectedProvider);
    const ollamaUrl = getSetting('ollama_base_url') ?? 'http://localhost:11434';

    // Conversation management
    const conversationId = existingConvId ?? uuidv4();
    if (!existingConvId || !getConversation(existingConvId)) {
      const title = messages[messages.length - 1]?.content?.slice(0, 60) || 'New Chat';
      createConversation(conversationId, title);
    }

    // Save user message
    const userMsgId = uuidv4();
    const lastUserMsg = messages[messages.length - 1];
    insertMessage({
      id: userMsgId,
      conversation_id: conversationId,
      role: 'user',
      content: lastUserMsg.content,
      attachments: imageBase64 ? JSON.stringify({ type: 'image', mime: imageMime }) : null,
      model: null,
      provider: null,
      tokens_input: 0,
      tokens_output: 0,
      cost: 0,
      latency: 0,
      routing_explanation: null,
      error: null,
    });

    // Stream response back to client
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        send({ type: 'routing', decision: { ...decision, explanation: decision.explanation } });
        send({ type: 'meta', conversationId, model: decision.selectedModel, provider: decision.selectedProvider });

        const assistantMsgId = uuidv4();
        let fullContent = '';
        let result = null;

        // Try primary model, then fallbacks
        const modelChain = [decision.selectedModel, ...decision.fallbackChain];
        let lastError: Error | null = null;

        for (const modelId of modelChain) {
          try {
            const { selectedProvider } = modelId === decision.selectedModel
              ? decision
              : { selectedProvider: getAllModels().find((m) => m.id === modelId)?.provider ?? '' };
            const mKeyInfo = getApiKey(selectedProvider);

            if (modelId !== decision.selectedModel) {
              send({ type: 'fallback', model: modelId, provider: selectedProvider });
            }

            const options: ProviderOptions = {
              model: modelId,
              messages: chatMessages,
              maxTokens: selectedProvider === 'gemini' ? 4096 : 1024, // keep full output for Gemini (own key)
              temperature: 0.7,
              stream: true,
              onChunk: (delta) => {
                fullContent += delta;
                send({ type: 'chunk', delta });
              },
            };

            result = await callProvider(
              selectedProvider,
              options,
              mKeyInfo?.keyValue ?? keyInfo?.keyValue,
              ollamaUrl,
              mKeyInfo?.isOpenRouter ?? keyInfo?.isOpenRouter
            );
            lastError = null;
            break;
          } catch (err) {
            lastError = err as Error;
            send({ type: 'error', model: modelId, error: (err as Error).message, retrying: true });
            fullContent = '';
          }
        }

        if (lastError || !result) {
          send({ type: 'done', error: lastError?.message ?? 'All models failed', success: false });
          controller.close();
          return;
        }

        // Save assistant message
        insertMessage({
          id: assistantMsgId,
          conversation_id: conversationId,
          role: 'assistant',
          content: result.content,
          attachments: null,
          model: result.model,
          provider: result.provider,
          tokens_input: result.tokensInput,
          tokens_output: result.tokensOutput,
          cost: result.cost,
          latency: result.latency,
          routing_explanation: decision.explanation,
          error: null,
        });

        touchConversation(conversationId);

        // Update conversation title from first message
        if (!existingConvId) {
          const title = messages[messages.length - 1]?.content?.slice(0, 60) || 'New Chat';
          updateConversationTitle(conversationId, title);
        }

        // Log usage
        insertUsageStat({
          provider: result.provider,
          model: result.model,
          tokensInput: result.tokensInput,
          tokensOutput: result.tokensOutput,
          cost: result.cost,
          latency: result.latency,
          success: true,
          routingMode,
        });

        send({
          type: 'done',
          success: true,
          tokensInput: result.tokensInput,
          tokensOutput: result.tokensOutput,
          cost: result.cost,
          latency: result.latency,
          model: result.model,
          provider: result.provider,
          conversationId,
          messageId: assistantMsgId,
        });

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
