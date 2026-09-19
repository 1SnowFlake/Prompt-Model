'use client';

import { useState, useEffect } from 'react';
import styles from './settings.module.css';

interface ProviderData {
  provider: string;
  hasKey: boolean;
  enabled: boolean;
  source?: 'db' | 'env' | 'local' | 'openrouter';
  baseUrl?: string;
  models: { id: string; name: string; description: string; qualityScore: number; speedScore: number; costPer1kInputTokens: number; costPer1kOutputTokens: number }[];
}

const PROVIDER_INFO: Record<string, { name: string; icon: string; color: string; keyLabel: string; keyPlaceholder: string; docsUrl: string }> = {
  openrouter: {
    name: 'OpenRouter (All-in-One)',
    icon: '⚡',
    color: '#6366f1',
    keyLabel: 'API Key',
    keyPlaceholder: 'sk-or-v1-...',
    docsUrl: 'https://openrouter.ai/keys',
  },
  openai: {
    name: 'OpenAI',
    icon: 'C',
    color: '#10a37f',
    keyLabel: 'API Key',
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  gemini: {
    name: 'Google Gemini',
    icon: 'G',
    color: '#4285f4',
    keyLabel: 'API Key',
    keyPlaceholder: 'AIza...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
  },
  anthropic: {
    name: 'Anthropic Claude',
    icon: 'A',
    color: '#d4a574',
    keyLabel: 'API Key',
    keyPlaceholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  deepseek: {
    name: 'DeepSeek',
    icon: 'D',
    color: '#ff6b6b',
    keyLabel: 'API Key',
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/api_keys',
  },
  ollama: {
    name: 'Ollama (Local)',
    icon: 'L',
    color: '#8b5cf6',
    keyLabel: 'Base URL',
    keyPlaceholder: 'http://localhost:11434',
    docsUrl: 'https://ollama.ai',
  },
};

export default function SettingsPage() {
  const [providers, setProviders] = useState<ProviderData[]>([]);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string } | null>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [defaultMode, setDefaultMode] = useState('auto');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [savingMode, setSavingMode] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const res = await fetch('/api/settings');
    const data = await res.json();
    setProviders(data.providers ?? []);
    setDefaultMode(data.defaultRoutingMode ?? 'auto');
    const ollama = data.providers?.find((p: ProviderData) => p.provider === 'ollama');
    if (ollama?.baseUrl) setOllamaUrl(ollama.baseUrl);
  };

  const handleSaveKey = async (provider: string) => {
    setSaving((s) => ({ ...s, [provider]: true }));
    try {
      const keyVal = keys[provider] ?? '';
      const body: Record<string, unknown> = { action: 'upsert_key', provider, enabled: true };

      if (provider === 'ollama') {
        body.key = '';
        body.baseUrl = ollamaUrl;
      } else {
        body.key = keyVal;
      }

      await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setKeys((k) => ({ ...k, [provider]: '' }));
      await loadSettings();
    } finally {
      setSaving((s) => ({ ...s, [provider]: false }));
    }
  };

  const handleDeleteKey = async (provider: string) => {
    if (!confirm(`Remove ${PROVIDER_INFO[provider]?.name ?? provider} API key?`)) return;
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_key', provider }),
    });
    await loadSettings();
  };

  const handleToggle = async (provider: string, enabled: boolean) => {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_provider', provider, enabled }),
    });
    await loadSettings();
  };

  const handleTest = async (provider: string) => {
    setTesting((t) => ({ ...t, [provider]: true }));
    setTestResults((r) => ({ ...r, [provider]: null }));
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      setTestResults((r) => ({ ...r, [provider]: data }));
    } finally {
      setTesting((t) => ({ ...t, [provider]: false }));
    }
  };

  const handleSaveMode = async () => {
    setSavingMode(true);
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_setting', settingKey: 'default_routing_mode', settingValue: defaultMode }),
    });
    setSavingMode(false);
  };

  const providerColors = Object.fromEntries(
    Object.entries(PROVIDER_INFO).map(([k, v]) => [k, v.color])
  );

  return (
    <div className={styles.page}>
      <div className="page-header">
        <div>
          <h1 className="page-title">⚙️ Settings</h1>
          <p className="page-subtitle">Manage API keys and routing preferences</p>
        </div>
      </div>

      <div className={styles.content}>
        {/* Default Routing Mode */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Default Routing Mode</h2>
          <div className="card">
            <div className={styles.modeGrid}>
              {[
                { value: 'auto', icon: '⚡', label: 'Auto', desc: 'Router picks the best model' },
                { value: 'best_quality', icon: '🏆', label: 'Best Quality', desc: 'Highest capability model' },
                { value: 'cheapest', icon: '💰', label: 'Cheapest', desc: 'Lowest cost model' },
                { value: 'fastest', icon: '🚀', label: 'Fastest', desc: 'Lowest latency model' },
              ].map((mode) => (
                <button
                  key={mode.value}
                  id={`default-mode-${mode.value}`}
                  className={`${styles.modeCard} ${defaultMode === mode.value ? styles.modeCardActive : ''}`}
                  onClick={() => setDefaultMode(mode.value)}
                >
                  <span className={styles.modeIcon}>{mode.icon}</span>
                  <div className={styles.modeLabel}>{mode.label}</div>
                  <div className={styles.modeDesc}>{mode.desc}</div>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary btn-sm" onClick={handleSaveMode} disabled={savingMode}>
                {savingMode ? 'Saving…' : 'Save Default'}
              </button>
            </div>
          </div>
        </section>

        {/* API Keys */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>API Keys & Providers</h2>
          <div className={styles.providerList}>
            {providers.map((p) => {
              const info = PROVIDER_INFO[p.provider];
              if (!info) return null;
              const testResult = testResults[p.provider];
              const isOllama = p.provider === 'ollama';

              return (
                <div key={p.provider} className={`card ${styles.providerCard}`} id={`provider-${p.provider}`}>
                  <div className={styles.providerHeader}>
                    <div className={styles.providerLeft}>
                      <div
                        className={styles.providerIcon}
                        style={{ background: info.color }}
                      >
                        {info.icon}
                      </div>
                      <div>
                        <div className={styles.providerName}>{info.name}</div>
                        <div className="text-xs text-muted">
                          {isOllama
                            ? 'Local — no API key needed'
                            : p.hasKey
                            ? p.source === 'openrouter'
                              ? '● Enabled via OpenRouter'
                              : p.source === 'env'
                              ? '● Configured (.env / environment)'
                              : '● Key configured'
                            : '○ No key configured'}
                        </div>
                      </div>
                    </div>
                    <div className={styles.providerActions}>
                      {p.hasKey && !isOllama && (
                        <label className="toggle" title={p.enabled ? 'Disable' : 'Enable'}>
                          <input
                            type="checkbox"
                            checked={p.enabled}
                            onChange={(e) => handleToggle(p.provider, e.target.checked)}
                          />
                          <span className="toggle-slider" />
                        </label>
                      )}
                      {(p.hasKey || isOllama) && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleTest(p.provider)}
                          disabled={testing[p.provider]}
                          id={`test-${p.provider}`}
                        >
                          {testing[p.provider] ? (
                            <span className="animate-spin">↻</span>
                          ) : '⚡ Test'}
                        </button>
                      )}
                      {p.hasKey && !isOllama && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteKey(p.provider)}
                          id={`delete-key-${p.provider}`}
                        >
                          🗑 Remove
                        </button>
                      )}
                    </div>
                  </div>

                  {testResult && (
                    <div className={`${styles.testResult} ${testResult.success ? styles.testSuccess : styles.testError}`}>
                      {testResult.success ? '✅' : '❌'} {testResult.message}
                    </div>
                  )}

                  {/* Key Input */}
                  {!isOllama && (
                    <div className={styles.keyRow}>
                      <div className={styles.keyInputWrap}>
                        <input
                          type={showKey[p.provider] ? 'text' : 'password'}
                          className="input input-mono"
                          placeholder={p.hasKey ? '•••••••••••••••• (replace to update)' : info.keyPlaceholder}
                          value={keys[p.provider] ?? ''}
                          onChange={(e) => setKeys((k) => ({ ...k, [p.provider]: e.target.value }))}
                          id={`key-input-${p.provider}`}
                        />
                        <button
                          className={`btn btn-ghost btn-sm ${styles.showBtn}`}
                          onClick={() => setShowKey((s) => ({ ...s, [p.provider]: !s[p.provider] }))}
                        >
                          {showKey[p.provider] ? '🙈' : '👁'}
                        </button>
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleSaveKey(p.provider)}
                        disabled={saving[p.provider] || !keys[p.provider]}
                        id={`save-key-${p.provider}`}
                      >
                        {saving[p.provider] ? 'Saving…' : 'Save'}
                      </button>
                      <a
                        href={info.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ghost btn-sm"
                        title="Get API key"
                      >
                        🔗
                      </a>
                    </div>
                  )}

                  {/* Ollama URL */}
                  {isOllama && (
                    <div className={styles.keyRow}>
                      <input
                        type="text"
                        className="input"
                        placeholder="http://localhost:11434"
                        value={ollamaUrl}
                        onChange={(e) => setOllamaUrl(e.target.value)}
                        id="ollama-url-input"
                      />
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleSaveKey('ollama')}
                        disabled={saving['ollama']}
                        id="save-ollama-url"
                      >
                        {saving['ollama'] ? 'Saving…' : 'Save URL'}
                      </button>
                    </div>
                  )}

                  {/* Models list */}
                  <details className={styles.modelsDetails}>
                    <summary className={styles.modelsSummary}>
                      {p.models.length} model{p.models.length !== 1 ? 's' : ''} available
                    </summary>
                    <div className={styles.modelsList}>
                      {p.models.map((m) => (
                        <div key={m.id} className={styles.modelRow}>
                          <div className={styles.modelInfo}>
                            <span className={styles.modelName}>{m.name}</span>
                            <span className="text-xs text-muted">{m.description}</span>
                          </div>
                          <div className={styles.modelScores}>
                            <span className="text-xs" style={{ color: '#10b981' }}>Q:{m.qualityScore}</span>
                            <span className="text-xs" style={{ color: '#06b6d4' }}>S:{m.speedScore}</span>
                            {m.costPer1kOutputTokens === 0 ? (
                              <span className="text-xs" style={{ color: '#8b5cf6' }}>Free</span>
                            ) : (
                              <span className="text-xs text-muted">${m.costPer1kOutputTokens.toFixed(4)}/1k</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
