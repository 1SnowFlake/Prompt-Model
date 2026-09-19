// Unified response type returned by every provider adapter
export interface ProviderResponse {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  model: string;
  provider: string;
  latency: number;
  cost: number;
}

export interface StreamChunk {
  delta: string;
  done: boolean;
  metadata?: Omit<ProviderResponse, 'content'>;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageBase64?: string;   // for vision models
  imageMime?: string;
}

export interface ProviderOptions {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  onChunk?: (chunk: string) => void;
}
