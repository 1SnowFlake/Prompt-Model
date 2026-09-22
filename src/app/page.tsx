'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import styles from './chat.module.css';

type RoutingMode = 'auto' | 'best_quality' | 'cheapest' | 'fastest' | 'manual';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  provider?: string;
  tokensIn?: number;
  tokensOut?: number;
  cost?: number;
  latency?: number;
  routingExplanation?: string;
  error?: string;
  imagePreview?: string;
  isStreaming?: boolean;
}

interface ModelOption {
  id: string;
  name: string;
  provider: string;
}

const MODE_INFO = {
  auto: { icon: '⚡', label: 'Auto', desc: 'Best fit for task' },
  best_quality: { icon: '🏆', label: 'Best Quality', desc: 'Highest capability' },
  cheapest: { icon: '💰', label: 'Cheapest', desc: 'Lowest cost' },
  fastest: { icon: '🚀', label: 'Fastest', desc: 'Lowest latency' },
  manual: { icon: '🎯', label: 'Manual', desc: 'You choose' },
};

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10a37f',
  gemini: '#4285f4',
  anthropic: '#d4a574',
  deepseek: '#ff6b6b',
  ollama: '#8b5cf6',
};

function renderMarkdown(text: string = ''): string {
  if (!text) return '';
  return text
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hup]|<li|<pre)(.+)$/gm, (m) => m ? `<p>${m}</p>` : '')
    .replace(/<p><\/p>/g, '');
}

function ChatPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [routingMode, setRoutingMode] = useState<RoutingMode>('auto');
  const [manualModel, setManualModel] = useState('');
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showRouting, setShowRouting] = useState(true);
  const [activeExplanation, setActiveExplanation] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  // Load available models
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        const models: ModelOption[] = [];
        data.providers?.forEach((p: { provider: string; hasKey: boolean; enabled: boolean; models: { id: string; name: string }[] }) => {
          if (p.hasKey && p.enabled) {
            p.models.forEach((m) => models.push({ id: m.id, name: m.name, provider: p.provider }));
          }
        });
        setAvailableModels(models);
        if (data.defaultRoutingMode) setRoutingMode(data.defaultRoutingMode);
      })
      .catch(console.error);
  }, []);

  // Handle ?new=1 and ?load=<id>
  useEffect(() => {
    const isNew = searchParams.get('new');
    const loadId = searchParams.get('load');

    if (isNew) {
      setMessages([]);
      setConversationId(null);
      router.replace('/');
    } else if (loadId) {
      loadConversation(loadId);
    }
  }, [searchParams]);

  const loadConversation = async (id: string) => {
    const res = await fetch(`/api/history?id=${id}`);
    const data = await res.json();
    if (data.messages) {
      setConversationId(id);
      setMessages(
        data.messages.map((m: {
          id: string;
          role: 'user' | 'assistant';
          content: string;
          model?: string;
          provider?: string;
          tokens_input?: number;
          tokens_output?: number;
          cost?: number;
          latency?: number;
          routing_explanation?: string;
        }) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          model: m.model,
          provider: m.provider,
          tokensIn: m.tokens_input,
          tokensOut: m.tokens_output,
          cost: m.cost,
          latency: m.latency,
          routingExplanation: m.routing_explanation,
        }))
      );
    }
  };

  const handleImageSelect = (file: File) => {
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = useCallback(async () => {
    if ((!input.trim() && !imageFile) || isLoading) return;

    const userContent = input.trim();
    setInput('');

    // Convert image to base64 if present
    let imageBase64: string | undefined;
    let imageMime: string | undefined;
    if (imageFile) {
      const reader = new FileReader();
      imageBase64 = await new Promise<string>((resolve) => {
        reader.onload = (e) => {
          const result = e.target?.result as string;
          resolve(result.split(',')[1]);
        };
        reader.readAsDataURL(imageFile);
      });
      imageMime = imageFile.type;
    }

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userContent,
      imagePreview: imagePreview ?? undefined,
    };

    const assistantMsgId = `assistant-${Date.now()}`;
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    clearImage();
    setIsLoading(true);

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    history.push({ role: 'user', content: userContent });

    try {
      abortRef.current = new AbortController();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          conversationId,
          messages: history,
          routingMode,
          manualModel: routingMode === 'manual' ? manualModel : undefined,
          imageBase64,
          imageMime,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Request failed');
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let routingExplanation = '';
      let serverConvId = conversationId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'routing') {
              routingExplanation = event.decision.explanation;
            } else if (event.type === 'meta') {
              serverConvId = event.conversationId;
              setConversationId(event.conversationId);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, model: event.model, provider: event.provider }
                    : m
                )
              );
            } else if (event.type === 'chunk') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + event.delta }
                    : m
                )
              );
            } else if (event.type === 'done') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        isStreaming: false,
                        tokensIn: event.tokensInput,
                        tokensOut: event.tokensOutput,
                        cost: event.cost,
                        latency: event.latency,
                        model: event.model,
                        provider: event.provider,
                        routingExplanation,
                        error: event.error,
                      }
                    : m
                )
              );
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, isStreaming: false, error: (err as Error).message, content: '' }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [input, imageFile, imagePreview, isLoading, messages, conversationId, routingMode, manualModel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleImageSelect(file);
  };

  const stopGeneration = () => {
    abortRef.current?.abort();
    setIsLoading(false);
    setMessages((prev) =>
      prev.map((m) => m.isStreaming ? { ...m, isStreaming: false } : m)
    );
  };

  const formatCost = (cost?: number) => {
    if (!cost) return 'Free';
    if (cost < 0.0001) return '<$0.0001';
    return `$${cost.toFixed(4)}`;
  };

  return (
    <div className={styles.chatLayout}>
      {/* Main Chat Area */}
      <div className={styles.chatMain}>
        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.modeBar}>
            {(Object.keys(MODE_INFO) as RoutingMode[]).map((mode) => (
              <button
                key={mode}
                id={`mode-${mode}`}
                className={`mode-chip ${routingMode === mode ? 'active' : ''}`}
                onClick={() => setRoutingMode(mode)}
                title={MODE_INFO[mode].desc}
              >
                <span>{MODE_INFO[mode].icon}</span>
                {MODE_INFO[mode].label}
              </button>
            ))}
          </div>

          <div className={styles.toolbarRight}>
            {routingMode === 'manual' && (
              <select
                className={`input ${styles.modelSelect}`}
                value={manualModel}
                onChange={(e) => setManualModel(e.target.value)}
                id="manual-model-select"
              >
                <option value="">Select model…</option>
                {availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.provider})
                  </option>
                ))}
              </select>
            )}
            <button
              className={`btn btn-ghost btn-sm ${styles.routingToggle} ${showRouting ? styles.active : ''}`}
              onClick={() => setShowRouting(!showRouting)}
              id="toggle-routing-panel"
              title="Toggle routing explanation panel"
            >
              🧭 Routing
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          className={styles.messages}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          id="messages-container"
        >
          {messages.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>⚡</div>
              <h2 className={styles.emptyTitle}>AI Model Router</h2>
              <p className={styles.emptySubtitle}>
                Send a message and the router will automatically select the best AI model for your task.
              </p>
              <div className={styles.emptyHints}>
                {[
                  { icon: '💻', text: 'Write me a React component for a carousel' },
                  { icon: '🧮', text: 'Solve the integral of x²sin(x)' },
                  { icon: '✍️', text: 'Write a short story about a rogue AI' },
                  { icon: '🔍', text: 'Explain quantum entanglement simply' },
                ].map((hint, i) => (
                  <button
                    key={i}
                    className={styles.hintBtn}
                    onClick={() => setInput(hint.text)}
                  >
                    <span>{hint.icon}</span>
                    {hint.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`${styles.message} ${styles[msg.role]} animate-fade-in`}>
              <div className={styles.msgAvatar}>
                {msg.role === 'user' ? '👤' : (
                  <span
                    className={styles.providerAvatar}
                    style={{ background: PROVIDER_COLORS[msg.provider ?? ''] ?? '#7c3aed' }}
                  >
                    {msg.provider?.[0]?.toUpperCase() ?? '🤖'}
                  </span>
                )}
              </div>

              <div className={styles.msgBody}>
                {msg.role === 'assistant' && msg.model && (
                  <div className={styles.msgMeta}>
                    <span className={`badge badge-${msg.provider}`}>
                      <span className={`provider-dot ${msg.provider}`} />
                      {msg.model}
                    </span>
                  </div>
                )}

                {msg.imagePreview && (
                  <img src={msg.imagePreview} alt="attachment" className={styles.imageAttachment} />
                )}

                {msg.error ? (
                  <div className={styles.errorBox}>
                    <span>⚠️</span> {msg.error}
                  </div>
                ) : (
                  <div
                    className={`msg-content ${styles.msgContent} ${msg.isStreaming ? 'typing-cursor' : ''}`}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                )}

                {!msg.isStreaming && msg.role === 'assistant' && !msg.error && (
                  <div className={styles.msgFooter}>
                    {msg.tokensIn !== undefined && (
                      <span className="text-muted text-xs">
                        {msg.tokensIn + (msg.tokensOut ?? 0)} tokens · {formatCost(msg.cost)} · {msg.latency}ms
                      </span>
                    )}
                    {msg.routingExplanation && (
                      <button
                        className={`btn btn-ghost btn-sm ${styles.explanationBtn}`}
                        onClick={() =>
                          setActiveExplanation(activeExplanation === msg.id ? null : msg.id)
                        }
                      >
                        🧭 Why this model?
                      </button>
                    )}
                  </div>
                )}

                {activeExplanation === msg.id && msg.routingExplanation && (
                  <div className={styles.inlineExplanation} id="routing-explanation-inline">
                    <div className={styles.explanationHeader}>
                      <span>🧭 Routing Explanation</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => setActiveExplanation(null)}>✕</button>
                    </div>
                    <pre className={styles.explanationText}>{msg.routingExplanation}</pre>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className={styles.inputArea}>
          {imagePreview && (
            <div className={styles.imagePreviewBar}>
              <img src={imagePreview} alt="preview" className={styles.imageThumb} />
              <span className="text-sm text-secondary">{imageFile?.name}</span>
              <button className="btn btn-ghost btn-sm" onClick={clearImage}>✕</button>
            </div>
          )}

          <div className={styles.inputRow}>
            <button
              className={`btn btn-ghost btn-icon ${styles.attachBtn}`}
              onClick={() => fileInputRef.current?.click()}
              title="Attach image"
              id="attach-image-btn"
            >
              📎
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className={styles.hiddenInput}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImageSelect(f);
              }}
            />

            <textarea
              ref={textareaRef}
              id="chat-input"
              className={styles.chatInput}
              placeholder="Message AI Router… (Shift+Enter for newline)"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
              }}
              onKeyDown={handleKeyDown}
              rows={1}
            />

            <button
              className={`btn ${isLoading ? 'btn-danger' : 'btn-primary'} ${styles.sendBtn}`}
              onClick={isLoading ? stopGeneration : handleSend}
              disabled={!isLoading && !input.trim() && !imageFile}
              id="send-btn"
            >
              {isLoading ? '⏹' : '↑'}
            </button>
          </div>
        </div>
      </div>

      {/* Routing Panel */}
      {showRouting && (
        <div className={styles.routingPanel} id="routing-panel">
          <div className={styles.routingHeader}>
            <span>🧭 Routing Engine</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowRouting(false)}>✕</button>
          </div>

          <div className={styles.routingContent}>
            {messages.length === 0 ? (
              <div className={styles.routingEmpty}>
                <p className="text-muted text-sm">
                  Routing decisions will appear here after you send a message.
                </p>
                <div className={styles.modeExplainer}>
                  {(Object.keys(MODE_INFO) as RoutingMode[]).map((mode) => (
                    <div key={mode} className={styles.modeRow}>
                      <span className={styles.modeIcon}>{MODE_INFO[mode].icon}</span>
                      <div>
                        <div className="text-sm" style={{ fontWeight: 600 }}>{MODE_INFO[mode].label}</div>
                        <div className="text-xs text-muted">{MODE_INFO[mode].desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              (() => {
                const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.routingExplanation);
                if (!lastAssistant) return <p className="text-muted text-sm">No routing data yet.</p>;
                return (
                  <div
                    className={styles.explanationText}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(lastAssistant.routingExplanation ?? '') }}
                  />
                );
              })()
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading…</div>}>
      <ChatPageContent />
    </Suspense>
  );
}
