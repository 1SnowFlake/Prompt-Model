'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import styles from './history.module.css';

interface ConversationItem {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  message_count: number;
  total_cost: number;
  models_used?: string;
}

interface MessagePreview {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  provider?: string;
  cost?: number;
  latency?: number;
}

export default function HistoryPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Preview modal state
  const [selectedConv, setSelectedConv] = useState<ConversationItem | null>(null);
  const [previewMessages, setPreviewMessages] = useState<MessagePreview[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Confirm delete dialog state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleOpenPreview = async (conv: ConversationItem) => {
    setSelectedConv(conv);
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/history?id=${conv.id}`);
      const data = await res.json();
      setPreviewMessages(data.messages || []);
    } catch (err) {
      console.error('Failed to load conversation details:', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleResumeChat = (id: string) => {
    router.push(`/?load=${id}`);
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/history?id=${id}`, { method: 'DELETE' });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (selectedConv?.id === id) {
        setSelectedConv(null);
      }
      setDeleteTargetId(null);
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to delete ALL conversation history? This cannot be undone.')) {
      return;
    }
    try {
      await fetch('/api/history?id=all', { method: 'DELETE' });
      setConversations([]);
      setSelectedConv(null);
    } catch (err) {
      console.error('Failed to clear all conversations:', err);
    }
  };

  const filteredConversations = conversations.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      (c.title || '').toLowerCase().includes(q) ||
      (c.models_used || '').toLowerCase().includes(q)
    );
  });

  const formatDate = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffHours = Math.abs(now.getTime() - date.getTime()) / 36e5;
    
    if (diffHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Conversation History</h1>
          <p className="page-subtitle">Search, inspect, resume, or export your past chat sessions</p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {conversations.length > 0 && (
            <button
              className="btn btn-danger btn-sm"
              onClick={handleClearAll}
              title="Delete all conversations"
            >
              <span>🗑️</span> Clear All
            </button>
          )}

          <button
            className="btn btn-secondary btn-sm"
            onClick={fetchConversations}
            title="Refresh list"
          >
            <span className={loading ? 'animate-spin' : ''}>🔄</span> Refresh
          </button>
        </div>
      </div>

      <div className={styles.container}>
        {/* Search bar */}
        <div className={styles.searchBarRow}>
          <div className={styles.searchWrapper}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search conversations by title or model..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* History List */}
        {filteredConversations.length === 0 && !loading ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🕐</div>
            <div className={styles.emptyTitle}>
              {searchQuery ? 'No matching conversations' : 'No chat history found'}
            </div>
            <p className={styles.emptyDesc}>
              {searchQuery
                ? `No conversations matched "${searchQuery}". Try a different keyword.`
                : 'Start chatting with AI models to automatically save and track your conversations here.'}
            </p>
            {!searchQuery && (
              <a href="/" className="btn btn-primary" style={{ marginTop: '8px' }}>
                Start a New Chat
              </a>
            )}
          </div>
        ) : (
          <div className={styles.historyList}>
            {filteredConversations.map((conv) => {
              const models = conv.models_used ? conv.models_used.split(',').filter(Boolean) : [];
              return (
                <div
                  key={conv.id}
                  className={styles.historyCard}
                  onClick={() => handleOpenPreview(conv)}
                >
                  <div className={styles.historyLeft}>
                    <div className={styles.historyIcon}>💬</div>
                    <div className={styles.historyInfo}>
                      <div className={styles.historyTitle}>{conv.title || 'Untitled Conversation'}</div>
                      <div className={styles.historyMeta}>
                        <span className={styles.historyMetaItem}>
                          <span>📅</span> {formatDate(conv.updated_at || conv.created_at)}
                        </span>
                        <span className={styles.historyMetaItem}>
                          <span>💬</span> {conv.message_count} {conv.message_count === 1 ? 'msg' : 'msgs'}
                        </span>
                        {conv.total_cost !== null && conv.total_cost !== undefined && conv.total_cost > 0 && (
                          <span className={styles.historyMetaItem} style={{ color: 'var(--accent-2)' }}>
                            <span>💰</span> ${(conv.total_cost < 0.01 ? conv.total_cost.toFixed(4) : conv.total_cost.toFixed(3))}
                          </span>
                        )}
                        {models.length > 0 && (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {models.slice(0, 2).map((m) => (
                              <span key={m} className="badge badge-primary" style={{ fontSize: '10.5px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                                {m}
                              </span>
                            ))}
                            {models.length > 2 && (
                              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>+{models.length - 2} more</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className={styles.historyActions} onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleResumeChat(conv.id)}
                      title="Continue this chat"
                    >
                      <span>💬</span> Resume
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleOpenPreview(conv)}
                      title="View conversation"
                    >
                      <span>👁️</span> Preview
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(conv.id)}
                      title="Delete conversation"
                    >
                      <span>🗑️</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {selectedConv && (
        <div className={styles.modalOverlay} onClick={() => setSelectedConv(null)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>{selectedConv.title || 'Conversation Preview'}</h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {formatDate(selectedConv.updated_at || selectedConv.created_at)} · {selectedConv.message_count} messages
                </span>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedConv(null)}
                style={{ fontSize: '16px', padding: '4px 8px' }}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              {previewLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <span className="animate-spin" style={{ display: 'inline-block', fontSize: '24px' }}>⏳</span>
                  <div style={{ marginTop: '10px' }}>Loading messages...</div>
                </div>
              ) : previewMessages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                  No messages recorded in this conversation.
                </div>
              ) : (
                previewMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`${styles.previewMsg} ${msg.role === 'user' ? styles.previewMsgUser : styles.previewMsgAssistant}`}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className={styles.previewRole}>
                        {msg.role === 'user' ? '👤 User' : `🤖 ${msg.model || 'Assistant'}`}
                      </span>
                      {msg.latency && (
                        <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                          {msg.latency}ms
                        </span>
                      )}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5', fontSize: '13px' }}>
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className={styles.modalFooter}>
              <button className="btn btn-secondary" onClick={() => setSelectedConv(null)}>
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  handleResumeChat(selectedConv.id);
                }}
              >
                <span>💬</span> Resume in Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
