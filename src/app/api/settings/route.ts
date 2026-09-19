import { NextRequest, NextResponse } from 'next/server';
import { getApiKey, upsertApiKey, deleteApiKey, getAllApiKeyStatus, getSetting, setSetting } from '@/lib/db';
import { getAllModels } from '@/lib/models';

export const runtime = 'nodejs';

// GET /api/settings — return status of all providers (no key values)
export async function GET() {
  const keyStatuses = getAllApiKeyStatus();
  const allModels = getAllModels();

  const providers = ['openrouter', 'openai', 'gemini', 'anthropic', 'deepseek', 'ollama'].map((p) => {
    const status = keyStatuses.find((k) => k.provider === p);
    const ollamaUrl = getSetting('ollama_base_url');
    return {
      provider: p,
      hasKey: p === 'ollama' ? true : (status?.hasKey ?? false),
      enabled: status?.enabled ?? true,
      source: status?.source ?? (p === 'ollama' ? 'local' : undefined),
      baseUrl: p === 'ollama' ? (ollamaUrl ?? 'http://localhost:11434') : undefined,
      models: allModels.filter((m) => m.provider === p),
    };
  });

  const defaultRoutingMode = getSetting('default_routing_mode') ?? 'auto';

  return NextResponse.json({ providers, defaultRoutingMode });
}

// POST /api/settings — upsert an API key or setting
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, provider, key, enabled, baseUrl, settingKey, settingValue } = body;

    if (action === 'upsert_key') {
      if (!provider) return NextResponse.json({ error: 'provider required' }, { status: 400 });
      upsertApiKey(provider, key ?? '', enabled ?? true, baseUrl);
      return NextResponse.json({ success: true });
    }

    if (action === 'delete_key') {
      if (!provider) return NextResponse.json({ error: 'provider required' }, { status: 400 });
      deleteApiKey(provider);
      return NextResponse.json({ success: true });
    }

    if (action === 'toggle_provider') {
      const existing = getApiKey(provider);
      if (!existing) return NextResponse.json({ error: 'No key found for provider' }, { status: 404 });
      upsertApiKey(provider, existing.keyValue, enabled, existing.baseUrl);
      return NextResponse.json({ success: true });
    }

    if (action === 'set_setting') {
      setSetting(settingKey, settingValue);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST /api/settings/test — test connectivity for a provider
export async function PUT(req: NextRequest) {
  try {
    const { provider } = await req.json();
    const keyInfo = getApiKey(provider);

    if (provider === 'ollama') {
      const baseUrl = getSetting('ollama_base_url') ?? 'http://localhost:11434';
      const resp = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) throw new Error(`Ollama not reachable at ${baseUrl}`);
      const data = await resp.json();
      const models = data.models?.map((m: { name: string }) => m.name) ?? [];
      return NextResponse.json({ success: true, message: `Connected! ${models.length} model(s) available: ${models.join(', ')}` });
    }

    if (!keyInfo) return NextResponse.json({ success: false, message: 'No API key configured' });

    // Lightweight test calls per provider
    if (provider === 'openrouter') {
      const resp = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${keyInfo.keyValue}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) throw new Error(`OpenRouter returned ${resp.status}`);
      return NextResponse.json({ success: true, message: 'OpenRouter connection successful! All cloud models enabled.' });
    } else if (provider === 'openai') {
      const resp = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${keyInfo.keyValue}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) throw new Error(`OpenAI returned ${resp.status}`);
    } else if (provider === 'gemini') {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${keyInfo.keyValue}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!resp.ok) throw new Error(`Gemini returned ${resp.status}`);
    } else if (provider === 'anthropic') {
      const resp = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': keyInfo.keyValue, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) throw new Error(`Anthropic returned ${resp.status}`);
    } else if (provider === 'deepseek') {
      const resp = await fetch('https://api.deepseek.com/models', {
        headers: { Authorization: `Bearer ${keyInfo.keyValue}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) throw new Error(`DeepSeek returned ${resp.status}`);
    }

    return NextResponse.json({ success: true, message: 'Connection successful!' });
  } catch (err) {
    return NextResponse.json({ success: false, message: (err as Error).message });
  }
}
