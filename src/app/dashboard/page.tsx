'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './dashboard.module.css';

interface SummaryRow {
  provider: string;
  model: string;
  request_count: number;
  total_tokens_input: number;
  total_tokens_output: number;
  total_cost: number;
  avg_latency: number;
  success_count: number;
}

interface Totals {
  requests: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10a37f',
  gemini: '#4285f4',
  anthropic: '#d4a574',
  deepseek: '#ff6b6b',
  ollama: '#8b5cf6',
};

const PROVIDER_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  anthropic: 'Anthropic Claude',
  deepseek: 'DeepSeek',
  ollama: 'Ollama / Llama',
};

export default function DashboardPage() {
  const [days, setDays] = useState<number>(30);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [totals, setTotals] = useState<Totals>({ requests: 0, tokensIn: 0, tokensOut: 0, cost: 0 });
  const [loading, setLoading] = useState(true);

  const fetchUsage = useCallback(async (selectedDays: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/usage?days=${selectedDays}`);
      const data = await res.json();
      setSummary(data.summary || []);
      setTotals(data.totals || { requests: 0, tokensIn: 0, tokensOut: 0, cost: 0 });
    } catch (err) {
      console.error('Failed to load usage data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage(days);
  }, [days, fetchUsage]);

  // Aggregate provider-level metrics for charts
  const providerStats = summary.reduce((acc, row) => {
    const prov = row.provider || 'unknown';
    if (!acc[prov]) {
      acc[prov] = {
        provider: prov,
        cost: 0,
        requests: 0,
        tokensIn: 0,
        tokensOut: 0,
        latencySum: 0,
        successCount: 0,
      };
    }
    acc[prov].cost += row.total_cost || 0;
    acc[prov].requests += row.request_count || 0;
    acc[prov].tokensIn += row.total_tokens_input || 0;
    acc[prov].tokensOut += row.total_tokens_output || 0;
    acc[prov].latencySum += (row.avg_latency || 0) * (row.request_count || 1);
    acc[prov].successCount += row.success_count || 0;
    return acc;
  }, {} as Record<string, { provider: string; cost: number; requests: number; tokensIn: number; tokensOut: number; latencySum: number; successCount: number }>);

  const providerList = Object.values(providerStats);
  const totalTokens = totals.tokensIn + totals.tokensOut;
  const overallSuccessCount = summary.reduce((sum, r) => sum + (r.success_count || 0), 0);
  const successRate = totals.requests > 0 ? Math.round((overallSuccessCount / totals.requests) * 100) : 100;
  
  const totalLatencySum = summary.reduce((sum, r) => sum + (r.avg_latency || 0) * (r.request_count || 1), 0);
  const overallAvgLatency = totals.requests > 0 ? Math.round(totalLatencySum / totals.requests) : 0;

  const handleExportCSV = () => {
    if (summary.length === 0) return;

    const headers = ['Provider', 'Model', 'Requests', 'Input Tokens', 'Output Tokens', 'Total Tokens', 'Total Cost (USD)', 'Avg Latency (ms)', 'Success Count'];
    const rows = summary.map((r) => [
      r.provider,
      r.model,
      r.request_count,
      r.total_tokens_input,
      r.total_tokens_output,
      r.total_tokens_input + r.total_tokens_output,
      (r.total_cost || 0).toFixed(6),
      Math.round(r.avg_latency || 0),
      r.success_count,
    ]);

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ai-model-router-usage-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Usage & Cost Analytics</h1>
          <p className="page-subtitle">Track token consumption, estimated expenditure, and performance across all AI providers</p>
        </div>

        <div className={styles.headerActions}>
          <div className={styles.timeFilter}>
            {[
              { label: '7 Days', val: 7 },
              { label: '30 Days', val: 30 },
              { label: '90 Days', val: 90 },
            ].map((item) => (
              <button
                key={item.val}
                className={`${styles.filterBtn} ${days === item.val ? styles.active : ''}`}
                onClick={() => setDays(item.val)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={handleExportCSV}
            disabled={summary.length === 0}
            title="Download report as CSV"
          >
            <span>📥</span> Export CSV
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => fetchUsage(days)}
            title="Refresh analytics data"
          >
            <span className={loading ? 'animate-spin' : ''}>🔄</span> Refresh
          </button>
        </div>
      </div>

      <div className={styles.container}>
        {/* KPI Summary Cards */}
        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <span className={styles.kpiLabel}>Total Estimated Cost</span>
              <div className={styles.kpiIcon}>💰</div>
            </div>
            <div className={styles.kpiValue}>
              ${totals.cost < 0.01 && totals.cost > 0 ? totals.cost.toFixed(4) : totals.cost.toFixed(2)}
            </div>
            <div className={styles.kpiSub}>USD based on standard token pricing</div>
          </div>

          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <span className={styles.kpiLabel}>Total Tokens</span>
              <div className={styles.kpiIcon}>⚡</div>
            </div>
            <div className={styles.kpiValue}>
              {totalTokens.toLocaleString()}
            </div>
            <div className={styles.kpiSub}>
              {totals.tokensIn.toLocaleString()} in · {totals.tokensOut.toLocaleString()} out
            </div>
          </div>

          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <span className={styles.kpiLabel}>Total Requests</span>
              <div className={styles.kpiIcon}>💬</div>
            </div>
            <div className={styles.kpiValue}>
              {totals.requests.toLocaleString()}
            </div>
            <div className={styles.kpiSub}>Across all active providers</div>
          </div>

          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <span className={styles.kpiLabel}>Avg Latency</span>
              <div className={styles.kpiIcon}>⏱️</div>
            </div>
            <div className={styles.kpiValue}>
              {overallAvgLatency ? `${overallAvgLatency}ms` : '—'}
            </div>
            <div className={styles.kpiSub}>Response turnaround time</div>
          </div>

          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <span className={styles.kpiLabel}>Success Rate</span>
              <div className={styles.kpiIcon}>🎯</div>
            </div>
            <div className={styles.kpiValue}>
              {totals.requests > 0 ? `${successRate}%` : '—'}
            </div>
            <div className={styles.kpiSub}>
              {overallSuccessCount} / {totals.requests} successful
            </div>
          </div>
        </div>

        {summary.length === 0 && !loading ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📊</div>
            <div className={styles.emptyTitle}>No usage data yet</div>
            <p className={styles.emptyDesc}>
              Once you start chatting with models, your token usage, routing latency, and cost estimates will appear here in real-time.
            </p>
            <a href="/" className="btn btn-primary" style={{ marginTop: '8px' }}>
              Start your first chat
            </a>
          </div>
        ) : (
          <>
            {/* Visual breakdown cards */}
            <div className={styles.chartsGrid}>
              {/* Cost Share by Provider */}
              <div className={styles.chartCard}>
                <div className={styles.chartHeader}>
                  <div>
                    <h3 className={styles.chartTitle}>
                      <span>💸</span> Cost Breakdown by Provider
                    </h3>
                    <span className={styles.chartSubtitle}>Share of estimated spend</span>
                  </div>
                </div>

                <div className={styles.distList}>
                  {providerList.map((p) => {
                    const pct = totals.cost > 0 ? (p.cost / totals.cost) * 100 : 0;
                    const color = PROVIDER_COLORS[p.provider] || 'var(--accent-1)';
                    return (
                      <div key={p.provider} className={styles.distItem}>
                        <div className={styles.distInfo}>
                          <span className={styles.distName}>
                            <span className={`provider-dot ${p.provider}`} />
                            {PROVIDER_NAMES[p.provider] || p.provider}
                          </span>
                          <div className={styles.distValues}>
                            <span>${p.cost < 0.01 && p.cost > 0 ? p.cost.toFixed(4) : p.cost.toFixed(3)}</span>
                            <span style={{ color: 'var(--text-muted)', width: '38px', textAlign: 'right' }}>
                              {Math.round(pct)}%
                            </span>
                          </div>
                        </div>
                        <div className={styles.progressBarTrack}>
                          <div
                            className={styles.progressBarFill}
                            style={{ width: `${pct}%`, background: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Token Usage by Provider */}
              <div className={styles.chartCard}>
                <div className={styles.chartHeader}>
                  <div>
                    <h3 className={styles.chartTitle}>
                      <span>📈</span> Token Volume by Provider
                    </h3>
                    <span className={styles.chartSubtitle}>Processed prompt & response tokens</span>
                  </div>
                </div>

                <div className={styles.distList}>
                  {providerList.map((p) => {
                    const pTokens = p.tokensIn + p.tokensOut;
                    const pct = totalTokens > 0 ? (pTokens / totalTokens) * 100 : 0;
                    const color = PROVIDER_COLORS[p.provider] || 'var(--accent-2)';
                    return (
                      <div key={p.provider} className={styles.distItem}>
                        <div className={styles.distInfo}>
                          <span className={styles.distName}>
                            <span className={`provider-dot ${p.provider}`} />
                            {PROVIDER_NAMES[p.provider] || p.provider}
                          </span>
                          <div className={styles.distValues}>
                            <span>{pTokens.toLocaleString()} tokens</span>
                            <span style={{ color: 'var(--text-muted)', width: '38px', textAlign: 'right' }}>
                              {Math.round(pct)}%
                            </span>
                          </div>
                        </div>
                        <div className={styles.progressBarTrack}>
                          <div
                            className={styles.progressBarFill}
                            style={{ width: `${pct}%`, background: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Detailed Table */}
            <div className={styles.tableCard}>
              <div className={styles.tableHeaderRow}>
                <div>
                  <h3 className={styles.chartTitle}>
                    <span>📋</span> Detailed Model Breakdown
                  </h3>
                  <span className={styles.chartSubtitle}>Metrics broken down by individual model</span>
                </div>
              </div>

              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Model</th>
                      <th>Requests</th>
                      <th>Input Tokens</th>
                      <th>Output Tokens</th>
                      <th>Total Cost</th>
                      <th>Avg Latency</th>
                      <th>Reliability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((row, idx) => {
                      const modelTotalTokens = (row.total_tokens_input || 0) + (row.total_tokens_output || 0);
                      const modelSuccessPct = row.request_count > 0 ? Math.round((row.success_count / row.request_count) * 100) : 100;
                      return (
                        <tr key={`${row.provider}-${row.model}-${idx}`}>
                          <td>
                            <span className={`badge badge-${row.provider}`}>
                              <span className={`provider-dot ${row.provider}`} />
                              {row.provider}
                            </span>
                          </td>
                          <td className={styles.modelCell}>{row.model}</td>
                          <td><strong>{row.request_count}</strong></td>
                          <td>{row.total_tokens_input?.toLocaleString()}</td>
                          <td>{row.total_tokens_output?.toLocaleString()}</td>
                          <td>
                            ${row.total_cost < 0.01 && row.total_cost > 0 ? row.total_cost.toFixed(4) : (row.total_cost || 0).toFixed(3)}
                          </td>
                          <td>{row.avg_latency ? `${Math.round(row.avg_latency)}ms` : '—'}</td>
                          <td>
                            <span style={{ color: modelSuccessPct >= 95 ? 'var(--success)' : modelSuccessPct >= 80 ? 'var(--warning)' : 'var(--error)' }}>
                              {modelSuccessPct}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
