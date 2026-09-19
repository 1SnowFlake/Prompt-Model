import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

function getDatabasePath(): string {
  const isVercel = process.env.VERCEL === '1' || !!process.env.VERCEL_ENV;
  if (isVercel) {
    return path.join('/tmp', 'router.db');
  }
  const dataDir = path.join(process.cwd(), 'data');
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.join(dataDir, 'router.db');
  } catch {
    const tmpDir = process.env.TEMP || process.env.TMP || '/tmp';
    return path.join(tmpDir, 'router.db');
  }
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    const dbPath = getDatabasePath();
    try {
      _db = new Database(dbPath);
    } catch {
      _db = new Database(':memory:');
    }
    try {
      _db.pragma('journal_mode = WAL');
    } catch {
      // Ignore journal_mode errors on serverless/ephemeral storage
    }
    try {
      _db.pragma('foreign_keys = ON');
    } catch {
      // Ignore
    }
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      provider TEXT PRIMARY KEY,
      key_value TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      base_url TEXT,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      attachments TEXT,
      model TEXT,
      provider TEXT,
      tokens_input INTEGER DEFAULT 0,
      tokens_output INTEGER DEFAULT 0,
      cost REAL DEFAULT 0,
      latency INTEGER DEFAULT 0,
      routing_explanation TEXT,
      error TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS usage_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      tokens_input INTEGER NOT NULL DEFAULT 0,
      tokens_output INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      latency INTEGER NOT NULL DEFAULT 0,
      success INTEGER NOT NULL DEFAULT 1,
      error TEXT,
      routing_mode TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO settings (key, value) VALUES ('default_routing_mode', 'auto');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('ollama_base_url', 'http://localhost:11434');
  `);
}

// ── Environment Variables & Fallback Keys ───────────────────────────────────

const ENV_KEY_MAP: Record<string, string[]> = {
  openrouter: ['OPENROUTER_API_KEY', 'openrouter_api', 'OPENROUTER_KEY', 'OPEN_ROUTER_API_KEY'],
  openai: ['OPENAI_API_KEY', 'OPENAI_KEY', 'open_api', 'OPEN_API'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'gemini_api', 'GEMINI_API'],
  anthropic: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'claude_api', 'CLAUDE_API', 'anthropic_api'],
  deepseek: ['DEEPSEEK_API_KEY', 'deepseek_api', 'DEEPSEEK_API'],
};

// Ensure .env files are loaded from current and parent directories
function loadEnvFiles() {
  const candidatePaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '..', '.env'),
    path.join(process.cwd(), '..', '.env.local'),
  ];

  for (const envPath of candidatePaths) {
    if (fs.existsSync(/*turbopackIgnore: true*/ envPath)) {
      try {
        const content = fs.readFileSync(/*turbopackIgnore: true*/ envPath, 'utf8');
        content.split('\n').forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
              val = val.slice(1, -1);
            }
            if (key && val && !process.env[key]) {
              process.env[key] = val;
            }
          }
        });
      } catch {
        // ignore read error
      }
    }
  }
}

loadEnvFiles();

function getEnvKey(provider: string): string | null {
  loadEnvFiles();
  const keys = ENV_KEY_MAP[provider] ?? [];
  for (const k of keys) {
    const val = process.env[k];
    if (val && val.trim().length > 0) return val.trim();
  }
  return null;
}

// ── API Keys ─────────────────────────────────────────────────────────────────

export function getApiKey(provider: string): {
  keyValue: string;
  enabled: boolean;
  baseUrl?: string;
  source?: 'db' | 'env' | 'openrouter';
  isOpenRouter?: boolean;
} | null {
  const db = getDb();
  const row = db.prepare('SELECT key_value, enabled, base_url FROM api_keys WHERE provider = ?').get(provider) as
    | { key_value: string; enabled: number; base_url: string | null }
    | undefined;

  if (row && row.key_value && row.key_value.trim().length > 0) {
    return {
      keyValue: row.key_value,
      enabled: !!row.enabled,
      baseUrl: row.base_url ?? undefined,
      source: 'db',
      isOpenRouter: provider === 'openrouter',
    };
  }

  // Fallback to provider-specific environment variables
  const envVal = getEnvKey(provider);
  if (envVal) {
    const isExplicitlyDisabled = row && !row.enabled;
    return {
      keyValue: envVal,
      enabled: !isExplicitlyDisabled,
      source: 'env',
      isOpenRouter: provider === 'openrouter',
    };
  }

  // Fallback to OpenRouter key for cloud AI providers
  if (['openai', 'anthropic', 'deepseek', 'gemini', 'openrouter'].includes(provider)) {
    const openRouterRow = db.prepare('SELECT key_value, enabled FROM api_keys WHERE provider = ?').get('openrouter') as
      | { key_value: string; enabled: number }
      | undefined;
    const openRouterKey = (openRouterRow && openRouterRow.key_value?.trim()) || getEnvKey('openrouter');
    if (openRouterKey) {
      const isExplicitlyDisabled = (row && !row.enabled) || (openRouterRow && !openRouterRow.enabled);
      return {
        keyValue: openRouterKey,
        enabled: !isExplicitlyDisabled,
        source: 'openrouter',
        isOpenRouter: true,
      };
    }
  }

  return null;
}

export function upsertApiKey(provider: string, keyValue: string, enabled: boolean, baseUrl?: string) {
  const db = getDb();
  db.prepare(
    `INSERT INTO api_keys (provider, key_value, enabled, base_url, updated_at)
     VALUES (?, ?, ?, ?, unixepoch())
     ON CONFLICT(provider) DO UPDATE SET
       key_value = excluded.key_value,
       enabled = excluded.enabled,
       base_url = excluded.base_url,
       updated_at = unixepoch()`
  ).run(provider, keyValue, enabled ? 1 : 0, baseUrl ?? null);
}

export function deleteApiKey(provider: string) {
  getDb().prepare('DELETE FROM api_keys WHERE provider = ?').run(provider);
}

export function getAllApiKeyStatus(): { provider: string; hasKey: boolean; enabled: boolean; source?: 'db' | 'env' | 'openrouter' }[] {
  const db = getDb();
  const rows = db.prepare('SELECT provider, key_value, enabled FROM api_keys').all() as { provider: string; key_value: string; enabled: number }[];
  const dbMap = new Map(rows.map((r) => [r.provider, { hasKey: !!r.key_value && r.key_value.trim().length > 0, enabled: !!r.enabled }]));

  const openRouterDb = dbMap.get('openrouter');
  const openRouterEnv = getEnvKey('openrouter');
  const hasOpenRouter = (openRouterDb && openRouterDb.hasKey) || !!openRouterEnv;
  const openRouterEnabled = openRouterDb ? openRouterDb.enabled : true;

  const allProviders = ['openrouter', 'openai', 'gemini', 'anthropic', 'deepseek', 'ollama'];
  return allProviders.map((p) => {
    if (p === 'ollama') {
      return { provider: p, hasKey: true, enabled: true, source: 'db' as const };
    }
    const dbEntry = dbMap.get(p);
    if (dbEntry && dbEntry.hasKey) {
      return { provider: p, hasKey: true, enabled: dbEntry.enabled, source: 'db' as const };
    }
    const envVal = getEnvKey(p);
    if (envVal) {
      const isExplicitlyDisabled = dbEntry && !dbEntry.enabled;
      return { provider: p, hasKey: true, enabled: !isExplicitlyDisabled, source: 'env' as const };
    }
    if (hasOpenRouter && ['openai', 'gemini', 'anthropic', 'deepseek'].includes(p)) {
      const isExplicitlyDisabled = (dbEntry && !dbEntry.enabled) || !openRouterEnabled;
      return { provider: p, hasKey: true, enabled: !isExplicitlyDisabled, source: 'openrouter' as const };
    }
    return { provider: p, hasKey: false, enabled: false };
  });
}

// ── Conversations ─────────────────────────────────────────────────────────────

export function createConversation(id: string, title: string) {
  getDb().prepare('INSERT INTO conversations (id, title) VALUES (?, ?)').run(id, title);
}

export function updateConversationTitle(id: string, title: string) {
  getDb().prepare('UPDATE conversations SET title = ?, updated_at = unixepoch() WHERE id = ?').run(title, id);
}

export function touchConversation(id: string) {
  getDb().prepare('UPDATE conversations SET updated_at = unixepoch() WHERE id = ?').run(id);
}

export function getConversation(id: string) {
  return getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id);
}

export function getAllConversations() {
  return getDb()
    .prepare('SELECT * FROM conversations ORDER BY updated_at DESC')
    .all() as { id: string; title: string; created_at: number; updated_at: number }[];
}

export function deleteConversation(id: string) {
  getDb().prepare('DELETE FROM conversations WHERE id = ?').run(id);
}

export function deleteAllConversations() {
  getDb().prepare('DELETE FROM conversations').run();
}

// ── Messages ──────────────────────────────────────────────────────────────────

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments: string | null;
  model: string | null;
  provider: string | null;
  tokens_input: number;
  tokens_output: number;
  cost: number;
  latency: number;
  routing_explanation: string | null;
  error: string | null;
  created_at: number;
}

export function insertMessage(msg: Omit<MessageRow, 'created_at'>) {
  getDb()
    .prepare(
      `INSERT INTO messages
        (id, conversation_id, role, content, attachments, model, provider,
         tokens_input, tokens_output, cost, latency, routing_explanation, error)
       VALUES
        (@id, @conversation_id, @role, @content, @attachments, @model, @provider,
         @tokens_input, @tokens_output, @cost, @latency, @routing_explanation, @error)`
    )
    .run(msg);
}

export function getMessages(conversationId: string): MessageRow[] {
  return getDb()
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(conversationId) as MessageRow[];
}

// ── Usage Stats ───────────────────────────────────────────────────────────────

export function insertUsageStat(stat: {
  provider: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  cost: number;
  latency: number;
  success: boolean;
  error?: string;
  routingMode?: string;
}) {
  getDb()
    .prepare(
      `INSERT INTO usage_stats (provider, model, tokens_input, tokens_output, cost, latency, success, error, routing_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      stat.provider,
      stat.model,
      stat.tokensInput,
      stat.tokensOutput,
      stat.cost,
      stat.latency,
      stat.success ? 1 : 0,
      stat.error ?? null,
      stat.routingMode ?? null
    );
}

export function getUsageStats(days = 30) {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  return getDb()
    .prepare('SELECT * FROM usage_stats WHERE created_at >= ? ORDER BY created_at ASC')
    .all(since);
}

export function getUsageSummary() {
  return getDb().prepare(`
    SELECT
      provider,
      model,
      COUNT(*) as request_count,
      SUM(tokens_input) as total_tokens_input,
      SUM(tokens_output) as total_tokens_output,
      SUM(cost) as total_cost,
      AVG(latency) as avg_latency,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count
    FROM usage_stats
    GROUP BY provider, model
    ORDER BY total_cost DESC
  `).all();
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}
