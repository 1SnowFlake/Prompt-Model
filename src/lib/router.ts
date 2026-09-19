import { ModelDefinition, TaskType, getAllModels, getModel } from './models';
import { ChatMessage } from './providers/types';

export type RoutingMode = 'auto' | 'best_quality' | 'cheapest' | 'fastest' | 'manual';

export interface TaskAnalysis {
  detectedTypes: TaskType[];
  hasImage: boolean;
  estimatedTokens: number;
  complexity: 'simple' | 'medium' | 'complex';
  primaryType: TaskType;
}

export interface RoutingDecision {
  selectedModel: string;
  selectedProvider: string;
  analysis: TaskAnalysis;
  scores: { modelId: string; score: number; reason: string }[];
  explanation: string;
  mode: RoutingMode;
  fallbackChain: string[];
}

// ── Task Analysis ─────────────────────────────────────────────────────────────

const CODE_PATTERNS = [
  /\b(code|function|implement|debug|fix|refactor|class|method|algorithm|script|regex|sql|query|endpoint|crud)\b/i,
  /\b(python|javascript|typescript|java|rust|go|c\+\+|bash|html|css|php|ruby|swift|kotlin)\b/i,
  /```[\s\S]*```/,
  /\b(error|exception|bug|stack trace|compile|runtime|syntax)\b/i,
];

const MATH_PATTERNS = [
  /\b(calculate|solve|equation|integral|derivative|probability|statistics|combinatorics|matrix|algebra|calculus|geometry|theorem|proof)\b/i,
  /\b\d+\s*[\+\-\*\/^=]\s*\d+\b/,
];

const REASONING_PATTERNS = [
  /\b(reason|evaluate|compare|assess|explain why|argument|logic|deduce|infer|step by step|tradeoffs|chain of thought)\b/i,
];

const CREATIVE_PATTERNS = [
  /\b(write|story|poem|creative|fiction|narrative|essay|blog|article|novel|dialogue|script|prose|haiku|rhyme|metaphor|character)\b/i,
  /\b(compose|draft|imagine|brainstorm)\b/i,
];

const STRUCTURE_PATTERNS = [
  /\b(json|schema|system design|architecture|openapi|swagger|specification|spec|structured data|data model|dto|business strategy)\b/i,
];

const LOCAL_PATTERNS = [
  /\b(local|offline|private|privacy|confidential|internal only|airgapped|ollama)\b/i,
];

export function analyzeTask(messages: ChatMessage[], hasImage: boolean): TaskAnalysis {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  const text = lastUserMsg?.content ?? '';
  const allText = messages.map((m) => m.content).join(' ');

  const detectedTypes: TaskType[] = [];

  if (hasImage || lastUserMsg?.imageBase64) detectedTypes.push('vision');
  if (LOCAL_PATTERNS.some((p) => p.test(text))) detectedTypes.push('conversation');
  if (STRUCTURE_PATTERNS.some((p) => p.test(text))) detectedTypes.push('analysis');
  if (CREATIVE_PATTERNS.some((p) => p.test(text))) detectedTypes.push('creative');
  if (CODE_PATTERNS.some((p) => p.test(text))) detectedTypes.push('code');
  if (MATH_PATTERNS.some((p) => p.test(text))) detectedTypes.push('math');
  if (REASONING_PATTERNS.some((p) => p.test(text))) detectedTypes.push('reasoning');
  if (detectedTypes.length === 0) detectedTypes.push('conversation');
  if (allText.length > 8000 && !detectedTypes.includes('analysis')) detectedTypes.push('analysis');

  const estimatedTokens = Math.ceil(allText.length / 4);

  let complexity: 'simple' | 'medium' | 'complex' = 'simple';
  if (
    estimatedTokens > 2000 ||
    detectedTypes.includes('reasoning') ||
    detectedTypes.includes('math') ||
    (detectedTypes.includes('code') && text.length > 500)
  ) {
    complexity = 'complex';
  } else if (estimatedTokens > 500 || detectedTypes.length > 1) {
    complexity = 'medium';
  }

  // Determine primary purpose
  let primaryType: TaskType = detectedTypes[0] ?? 'conversation';
  if (hasImage || lastUserMsg?.imageBase64) primaryType = 'vision';
  else if (LOCAL_PATTERNS.some((p) => p.test(text))) primaryType = 'conversation';
  else if (STRUCTURE_PATTERNS.some((p) => p.test(text))) primaryType = 'analysis';
  else if (CREATIVE_PATTERNS.some((p) => p.test(text))) primaryType = 'creative';
  else if (CODE_PATTERNS.some((p) => p.test(text))) primaryType = 'code';
  else if (MATH_PATTERNS.some((p) => p.test(text))) primaryType = 'math';

  return { detectedTypes, hasImage, estimatedTokens, complexity, primaryType };
}

// ── Model Scoring ─────────────────────────────────────────────────────────────

function scoreModel(
  model: ModelDefinition,
  analysis: TaskAnalysis,
  mode: RoutingMode,
  lastText?: string
): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  // Disqualify if no vision capability but image present
  if (analysis.hasImage && !model.supportsVision) {
    return { score: -1, reason: 'No vision support for image input' };
  }

  // Capability match
  const capabilityMatches = analysis.detectedTypes.filter((t) => model.capabilities.includes(t)).length;
  const capabilityScore = (capabilityMatches / Math.max(analysis.detectedTypes.length, 1)) * 30;
  score += capabilityScore;
  if (capabilityMatches > 0) {
    reasons.push(`Supports ${capabilityMatches}/${analysis.detectedTypes.length} detected task types`);
  }

  // Context window check
  if (model.contextWindow < analysis.estimatedTokens * 2) {
    score -= 20;
    reasons.push('Context window may be insufficient');
  }

  // Privacy / Local offline intent
  const isLocalIntent = lastText && LOCAL_PATTERNS.some((p) => p.test(lastText));
  if (isLocalIntent && model.provider === 'ollama') {
    return { score: 150, reason: 'Explicit private/offline local task preference' };
  }

  switch (mode) {
    case 'auto': {
      const primary = analysis.primaryType;
      const domainScore = model.taskScores?.[primary] ?? model.qualityScore;

      if (primary === 'code') {
        // Coding champion weight: domain 55%, quality 25%, speed 10%, cost 10%
        const codeContrib = (domainScore / 100) * 45;
        const qualityContrib = (model.qualityScore / 100) * 15;
        const speedContrib = (model.speedScore / 100) * 5;
        const costNorm = Math.max(0, 1 - (model.costPer1kOutputTokens / 0.02)) * 5;
        score += codeContrib + qualityContrib + speedContrib + costNorm;
        reasons.push(`Coding Benchmark: ${domainScore}/100, Quality: ${model.qualityScore}`);
      } else if (primary === 'math' || primary === 'reasoning') {
        // Logic champion weight: domain 60%, quality 25%, speed 15%
        const reasoningContrib = (domainScore / 100) * 45;
        const qualityContrib = (model.qualityScore / 100) * 15;
        const speedContrib = (model.speedScore / 100) * 10;
        score += reasoningContrib + qualityContrib + speedContrib;
        reasons.push(`Reasoning/Logic Benchmark: ${domainScore}/100, Quality: ${model.qualityScore}`);
      } else if (primary === 'creative') {
        // Creative champion weight: domain 60%, quality 25%, speed 15%
        const creativeContrib = (domainScore / 100) * 45;
        const qualityContrib = (model.qualityScore / 100) * 15;
        const speedContrib = (model.speedScore / 100) * 10;
        score += creativeContrib + qualityContrib + speedContrib;
        reasons.push(`Creative/Stylistic Nuance: ${domainScore}/100, Quality: ${model.qualityScore}`);
      } else if (primary === 'analysis') {
        // Architecture / Structured analysis: domain 50%, quality 35%, speed 15%
        const analysisContrib = (domainScore / 100) * 40;
        const qualityContrib = (model.qualityScore / 100) * 20;
        const speedContrib = (model.speedScore / 100) * 10;
        score += analysisContrib + qualityContrib + speedContrib;
        reasons.push(`Structured Architecture/Analysis Score: ${domainScore}/100`);
      } else if (primary === 'vision') {
        // Multimodal Vision: domain 50%, speed 30%, cost 20%
        const visionContrib = (domainScore / 100) * 40;
        const speedContrib = (model.speedScore / 100) * 20;
        const costNorm = Math.max(0, 1 - (model.costPer1kOutputTokens / 0.02)) * 10;
        score += visionContrib + speedContrib + costNorm;
        reasons.push(`Multimodal Vision Score: ${domainScore}/100, Speed: ${model.speedScore}`);
      } else {
        // General conversational: speed 40%, cost 35%, domain 25%
        const convContrib = (domainScore / 100) * 20;
        const speedContrib = (model.speedScore / 100) * 25;
        const costNorm = Math.max(0, 1 - (model.costPer1kOutputTokens / 0.02)) * 25;
        score += convContrib + speedContrib + costNorm;
        reasons.push(`Conversational: ${domainScore}/100, Speed: ${model.speedScore}, Low Latency`);
      }
      break;
    }
    case 'best_quality': {
      const primary = analysis.primaryType;
      const domainScore = model.taskScores?.[primary] ?? model.qualityScore;
      score += (domainScore / 100) * 40 + (model.qualityScore / 100) * 20;
      reasons.push(`Domain Quality: ${domainScore}/100, Overall: ${model.qualityScore}/100`);
      break;
    }
    case 'cheapest': {
      const avgCost = (model.costPer1kInputTokens + model.costPer1kOutputTokens) / 2;
      const costScore = Math.max(0, 1 - avgCost / 0.015) * 60;
      score += costScore;
      if (avgCost === 0) reasons.push('Free local model');
      else reasons.push(`Cost: $${model.costPer1kInputTokens.toFixed(4)}/1k in, $${model.costPer1kOutputTokens.toFixed(4)}/1k out`);
      break;
    }
    case 'fastest': {
      score += (model.speedScore / 100) * 60;
      reasons.push(`Speed score: ${model.speedScore}/100`);
      break;
    }
  }

  // Complexity bonus
  if (analysis.complexity === 'complex' && model.qualityScore >= 85) {
    score += 5;
    reasons.push('High-quality model for complex task');
  }

  return { score: Math.max(0, score), reason: reasons.join('; ') };
}

// ── Router ────────────────────────────────────────────────────────────────────

export function route(
  messages: ChatMessage[],
  hasImage: boolean,
  mode: RoutingMode,
  availableModels: Set<string>, // models with valid API keys
  manualModel?: string
): RoutingDecision {
  const analysis = analyzeTask(messages, hasImage);
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  const text = lastUserMsg?.content ?? '';

  if (mode === 'manual' && manualModel) {
    const modelDef = getModel(manualModel);
    return {
      selectedModel: manualModel,
      selectedProvider: modelDef?.provider ?? 'unknown',
      analysis,
      scores: [{ modelId: manualModel, score: 100, reason: 'Manually selected by user' }],
      explanation: `You manually selected **${modelDef?.name ?? manualModel}**. No automatic routing applied.`,
      mode,
      fallbackChain: [],
    };
  }

  const allModels = getAllModels().filter((m) => availableModels.has(m.id));

  if (allModels.length === 0) {
    throw new Error('No models available. Please add API keys in Settings.');
  }

  const scored = allModels
    .map((m) => {
      const { score, reason } = scoreModel(m, analysis, mode, text);
      return { modelId: m.id, score, reason, model: m };
    })
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    throw new Error('No compatible models found for this request (e.g., image input with no vision model configured).');
  }

  const best = scored[0];
  const fallbackChain = scored.slice(1, 4).map((s) => s.modelId);

  const taskDesc = analysis.detectedTypes.join(', ');
  const modeName = {
    auto: 'Auto',
    best_quality: 'Best Quality',
    cheapest: 'Cheapest',
    fastest: 'Fastest',
    manual: 'Manual',
  }[mode];

  const explanation = `**Routing Mode:** ${modeName}

**Task Analysis:**
- Detected types: ${taskDesc}
- Complexity: ${analysis.complexity}
- Estimated tokens: ~${analysis.estimatedTokens.toLocaleString()}${hasImage ? '\n- Image attachment detected' : ''}

**Selected Model:** ${best.model.name} (${best.model.provider})
- ${best.reason}
- Quality: ${best.model.qualityScore}/100 | Speed: ${best.model.speedScore}/100
- Cost: $${best.model.costPer1kInputTokens.toFixed(4)}/1k in, $${best.model.costPer1kOutputTokens.toFixed(4)}/1k out

**Alternatives Considered:**
${scored
  .slice(0, 5)
  .map((s, i) => `${i + 1}. ${getModel(s.modelId)?.name ?? s.modelId} — score ${s.score.toFixed(1)}: ${s.reason}`)
  .join('\n')}`;

  return {
    selectedModel: best.modelId,
    selectedProvider: best.model.provider,
    analysis,
    scores: scored.map((s) => ({ modelId: s.modelId, score: s.score, reason: s.reason })),
    explanation,
    mode,
    fallbackChain,
  };
}
