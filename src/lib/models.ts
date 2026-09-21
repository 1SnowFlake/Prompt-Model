// Model Registry — add/update models and capabilities here

export type TaskType =
  | 'code'
  | 'vision'
  | 'reasoning'
  | 'creative'
  | 'conversation'
  | 'analysis'
  | 'math'
  | 'search';

export type ProviderName = 'openai' | 'gemini' | 'anthropic' | 'deepseek' | 'ollama';

export interface ModelDefinition {
  id: string;
  name: string;
  provider: ProviderName;
  capabilities: TaskType[];
  contextWindow: number;
  costPer1kInputTokens: number;   // USD
  costPer1kOutputTokens: number;  // USD
  qualityScore: number;           // 0–100
  speedScore: number;             // 0–100 (higher = faster)
  taskScores?: Partial<Record<TaskType, number>>; // 0-100 score for specific task domains
  supportsVision: boolean;
  supportsStreaming: boolean;
  maxOutputTokens: number;
  description: string;
}

export const MODEL_REGISTRY: Record<string, ModelDefinition> = {
  // ── OpenAI ──────────────────────────────────────────────────────────────
  'gpt-4o': {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    capabilities: ['code', 'vision', 'reasoning', 'creative', 'conversation', 'analysis', 'math'],
    contextWindow: 128000,
    costPer1kInputTokens: 0.0025,
    costPer1kOutputTokens: 0.01,
    qualityScore: 95,
    speedScore: 75,
    taskScores: { code: 94, vision: 95, reasoning: 95, creative: 96, conversation: 90, analysis: 96, math: 94 },
    supportsVision: true,
    supportsStreaming: true,
    maxOutputTokens: 16384,
    description: 'GPT-4o is OpenAI\'s flagship multimodal model, excellent for most tasks.',
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    capabilities: ['code', 'vision', 'conversation', 'creative', 'analysis'],
    contextWindow: 128000,
    costPer1kInputTokens: 0.00015,
    costPer1kOutputTokens: 0.0006,
    qualityScore: 78,
    speedScore: 92,
    taskScores: { code: 78, vision: 80, conversation: 92, creative: 80, analysis: 78 },
    supportsVision: true,
    supportsStreaming: true,
    maxOutputTokens: 16384,
    description: 'Affordable and fast, great for everyday tasks and high-volume usage.',
  },
  'gpt-4.1': {
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    provider: 'openai',
    capabilities: ['code', 'reasoning', 'analysis', 'math', 'conversation'],
    contextWindow: 1047576,
    costPer1kInputTokens: 0.002,
    costPer1kOutputTokens: 0.008,
    qualityScore: 97,
    speedScore: 65,
    taskScores: { code: 96, reasoning: 97, analysis: 98, math: 96, conversation: 88 },
    supportsVision: true,
    supportsStreaming: true,
    maxOutputTokens: 32768,
    description: 'OpenAI\'s most capable model with a massive 1M token context window.',
  },

  // ── Google Gemini ────────────────────────────────────────────────────────
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'gemini',
    capabilities: ['code', 'vision', 'conversation', 'creative', 'analysis', 'reasoning'],
    contextWindow: 1048576,
    costPer1kInputTokens: 0.0001,
    costPer1kOutputTokens: 0.0004,
    qualityScore: 85,
    speedScore: 95,
    taskScores: { conversation: 96, vision: 96, code: 82, reasoning: 84, creative: 82, analysis: 85, math: 80 },
    supportsVision: true,
    supportsStreaming: true,
    maxOutputTokens: 8192,
    description: 'Google\'s fastest multimodal model with a massive 1M token context.',
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'gemini',
    capabilities: ['code', 'vision', 'reasoning', 'analysis', 'math', 'creative'],
    contextWindow: 2097152,
    costPer1kInputTokens: 0.00125,
    costPer1kOutputTokens: 0.01,
    qualityScore: 97,
    speedScore: 60,
    taskScores: { reasoning: 98, math: 98, analysis: 98, code: 93, vision: 95, creative: 92, conversation: 86 },
    supportsVision: true,
    supportsStreaming: true,
    maxOutputTokens: 65536,
    description: 'Google\'s most capable reasoning model with 2M context window.',
  },

  // ── Anthropic Claude ─────────────────────────────────────────────────────
  'claude-3-5-sonnet-20241022': {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    capabilities: ['code', 'vision', 'reasoning', 'creative', 'analysis', 'conversation'],
    contextWindow: 200000,
    costPer1kInputTokens: 0.003,
    costPer1kOutputTokens: 0.015,
    qualityScore: 93,
    speedScore: 70,
    taskScores: { code: 98, creative: 98, reasoning: 95, analysis: 95, vision: 94, conversation: 90, math: 90 },
    supportsVision: true,
    supportsStreaming: true,
    maxOutputTokens: 8192,
    description: 'Anthropic\'s Claude Sonnet 4.5 — excellent balance of intelligence and speed.',
  },
  'claude-3-5-haiku-20241022': {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    capabilities: ['code', 'conversation', 'analysis', 'creative'],
    contextWindow: 200000,
    costPer1kInputTokens: 0.0008,
    costPer1kOutputTokens: 0.004,
    qualityScore: 75,
    speedScore: 95,
    taskScores: { conversation: 94, code: 84, creative: 82, analysis: 80 },
    supportsVision: true,
    supportsStreaming: true,
    maxOutputTokens: 8192,
    description: 'Anthropic\'s fastest and most affordable Claude model for everyday tasks.',
  },

  // ── DeepSeek ─────────────────────────────────────────────────────────────
  'deepseek-chat': {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat (V3)',
    provider: 'deepseek',
    capabilities: ['code', 'conversation', 'analysis', 'reasoning', 'math'],
    contextWindow: 64000,
    costPer1kInputTokens: 0.00027,
    costPer1kOutputTokens: 0.0011,
    qualityScore: 85,
    speedScore: 80,
    taskScores: { code: 98, conversation: 86, analysis: 88, reasoning: 88, math: 88 },
    supportsVision: false,
    supportsStreaming: true,
    maxOutputTokens: 8192,
    description: 'DeepSeek V3 — extremely cost-efficient for code and reasoning tasks.',
  },
  'deepseek-reasoner': {
    id: 'deepseek-reasoner',
    name: 'DeepSeek Reasoner (R1)',
    provider: 'deepseek',
    capabilities: ['reasoning', 'math', 'code', 'analysis'],
    contextWindow: 64000,
    costPer1kInputTokens: 0.00055,
    costPer1kOutputTokens: 0.00219,
    qualityScore: 90,
    speedScore: 55,
    taskScores: { reasoning: 99, math: 99, code: 92, analysis: 95 },
    supportsVision: false,
    supportsStreaming: true,
    maxOutputTokens: 8192,
    description: 'DeepSeek R1 — chain-of-thought reasoning model, best for complex logic.',
  },

  // ── Ollama (Local Llama) ──────────────────────────────────────────────────
  'llama3.2': {
    id: 'llama3.2',
    name: 'Llama 3.2 (3B)',
    provider: 'ollama',
    capabilities: ['conversation', 'code', 'creative'],
    contextWindow: 128000,
    costPer1kInputTokens: 0,
    costPer1kOutputTokens: 0,
    qualityScore: 60,
    speedScore: 85,
    taskScores: { conversation: 85, code: 62, creative: 65 },
    supportsVision: false,
    supportsStreaming: true,
    maxOutputTokens: 4096,
    description: 'Meta\'s Llama 3.2 3B running locally via Ollama — completely free.',
  },
  'llama3.3': {
    id: 'llama3.3',
    name: 'Llama 3.3 (70B)',
    provider: 'ollama',
    capabilities: ['code', 'reasoning', 'conversation', 'analysis', 'math'],
    contextWindow: 128000,
    costPer1kInputTokens: 0,
    costPer1kOutputTokens: 0,
    qualityScore: 82,
    speedScore: 45,
    taskScores: { code: 86, reasoning: 86, conversation: 82, analysis: 84, math: 82 },
    supportsVision: false,
    supportsStreaming: true,
    maxOutputTokens: 8192,
    description: 'Meta\'s Llama 3.3 70B — powerful open-weight model running locally via Ollama.',
  },
  'mistral': {
    id: 'mistral',
    name: 'Mistral 7B',
    provider: 'ollama',
    capabilities: ['conversation', 'code', 'creative', 'analysis'],
    contextWindow: 32000,
    costPer1kInputTokens: 0,
    costPer1kOutputTokens: 0,
    qualityScore: 62,
    speedScore: 90,
    taskScores: { conversation: 82, code: 65, creative: 68, analysis: 64 },
    supportsVision: false,
    supportsStreaming: true,
    maxOutputTokens: 4096,
    description: 'Mistral 7B running locally via Ollama — fast and free.',
  },
  'qwen2.5-coder:7b': {
    id: 'qwen2.5-coder:7b',
    name: 'Qwen 2.5 Coder (7B)',
    provider: 'ollama',
    capabilities: ['code', 'conversation', 'reasoning', 'analysis'],
    contextWindow: 32768,
    costPer1kInputTokens: 0,
    costPer1kOutputTokens: 0,
    qualityScore: 84,
    speedScore: 80,
    taskScores: { code: 94, conversation: 82, analysis: 80, reasoning: 82 },
    supportsVision: false,
    supportsStreaming: true,
    maxOutputTokens: 4096,
    description: 'Alibaba Qwen 2.5 Coder 7B running locally via Ollama — private and free.',
  },
};

export function getModelsByProvider(provider: ProviderName): ModelDefinition[] {
  return Object.values(MODEL_REGISTRY).filter((m) => m.provider === provider);
}

export function getModel(id: string): ModelDefinition | undefined {
  return MODEL_REGISTRY[id];
}

export function getAllModels(): ModelDefinition[] {
  return Object.values(MODEL_REGISTRY);
}
