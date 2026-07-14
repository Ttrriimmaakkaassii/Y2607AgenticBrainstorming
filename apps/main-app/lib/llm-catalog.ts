import { LLMProvider } from './types';

export interface ModelInfo {
  id: string;
  label: string;
  supportsEffort: boolean;
}

export interface ProviderInfo {
  id: LLMProvider;
  name: string;
  endpoint: string;
  /** GET endpoint that lists the models a key can access — used by lib/fetch-models.ts to populate the model dropdown live instead of trusting a hardcoded list. */
  modelsEndpoint: string;
  models: ModelInfo[];
}

// Curated suggestion list compiled from each provider's docs and public
// model-release/benchmark data. NOT exhaustive, and IDs drift over time —
// the model field is a combobox (pick OR type your own), and the 🔄 button
// fetches the authoritative live list from modelsEndpoint using your key,
// so anything missing or slightly off is never a dead end. supportsEffort
// is kept conservative (true only for models known to accept the effort/
// thinking param the code sends) — a wrong true can 400 the call.
export const LLM_CATALOG: ProviderInfo[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    modelsEndpoint: 'https://api.openai.com/v1/models',
    models: [
      { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol (flagship reasoning)', supportsEffort: true },
      { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra (balanced)', supportsEffort: true },
      { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna (fast/cheap)', supportsEffort: true },
      { id: 'gpt-5.5', label: 'GPT-5.5', supportsEffort: true },
      { id: 'gpt-5.4', label: 'GPT-5.4', supportsEffort: true },
      { id: 'gpt-5.2', label: 'GPT-5.2', supportsEffort: true },
      { id: 'gpt-5.1', label: 'GPT-5.1', supportsEffort: true },
      { id: 'gpt-5', label: 'GPT-5', supportsEffort: true },
      { id: 'gpt-4.5', label: 'GPT-4.5', supportsEffort: false },
      { id: 'gpt-4.1', label: 'GPT-4.1', supportsEffort: false },
      { id: 'gpt-4o', label: 'GPT-4o', supportsEffort: false },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', supportsEffort: false },
      { id: 'o4-mini', label: 'o4-mini (reasoning)', supportsEffort: true },
      { id: 'o3', label: 'o3 (reasoning)', supportsEffort: true },
      { id: 'o3-pro', label: 'o3-pro (reasoning)', supportsEffort: true },
      { id: 'o3-mini', label: 'o3-mini (reasoning)', supportsEffort: true },
      { id: 'o1', label: 'o1 (reasoning)', supportsEffort: true },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
    modelsEndpoint: 'https://api.anthropic.com/v1/models',
    models: [
      { id: 'claude-fable-5', label: 'Claude Fable 5', supportsEffort: true },
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', supportsEffort: true },
      { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', supportsEffort: true },
      { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', supportsEffort: true },
      { id: 'claude-opus-4-5', label: 'Claude Opus 4.5', supportsEffort: true },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', supportsEffort: true },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', supportsEffort: true },
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', supportsEffort: true },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', supportsEffort: false },
      { id: 'claude-3-7-sonnet', label: 'Claude 3.7 Sonnet', supportsEffort: true },
      { id: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', supportsEffort: false },
    ],
  },
  {
    id: 'google',
    name: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    modelsEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    models: [
      { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro', supportsEffort: true },
      { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', supportsEffort: true },
      { id: 'gemini-3-pro', label: 'Gemini 3 Pro', supportsEffort: true },
      { id: 'gemini-3-flash', label: 'Gemini 3 Flash', supportsEffort: true },
      { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', supportsEffort: false },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', supportsEffort: true },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', supportsEffort: true },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', supportsEffort: false },
      { id: 'gemini-2.0-pro', label: 'Gemini 2.0 Pro', supportsEffort: false },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', supportsEffort: false },
      { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite', supportsEffort: false },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', supportsEffort: false },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', supportsEffort: false },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    modelsEndpoint: 'https://api.deepseek.com/models',
    models: [
      { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (reasoning)', supportsEffort: false },
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', supportsEffort: false },
      { id: 'deepseek-v3.2', label: 'DeepSeek V3.2', supportsEffort: false },
      { id: 'deepseek-v3.1', label: 'DeepSeek V3.1', supportsEffort: false },
      { id: 'deepseek-v3', label: 'DeepSeek V3', supportsEffort: false },
      { id: 'deepseek-chat', label: 'DeepSeek Chat (legacy alias)', supportsEffort: false },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (reasoning)', supportsEffort: false },
      { id: 'deepseek-r1', label: 'DeepSeek R1 (reasoning)', supportsEffort: false },
      { id: 'deepseek-v2.5', label: 'DeepSeek V2.5', supportsEffort: false },
    ],
  },
  {
    id: 'zhipu',
    name: 'Z.ai (Zhipu GLM)',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    modelsEndpoint: 'https://open.bigmodel.cn/api/paas/v4/models',
    models: [
      { id: 'glm-5.2', label: 'GLM-5.2 (current flagship)', supportsEffort: false },
      { id: 'glm-5.1', label: 'GLM-5.1 (agentic reasoning)', supportsEffort: false },
      { id: 'glm-4.7', label: 'GLM-4.7', supportsEffort: false },
      { id: 'glm-4.7-flash', label: 'GLM-4.7 Flash', supportsEffort: false },
      { id: 'glm-4.6', label: 'GLM-4.6', supportsEffort: false },
      { id: 'glm-4.5', label: 'GLM-4.5 (agent foundation)', supportsEffort: false },
      { id: 'glm-4.5-air', label: 'GLM-4.5 Air (lightweight)', supportsEffort: false },
    ],
  },
  {
    id: 'moonshot',
    name: 'Moonshot AI (Kimi)',
    endpoint: 'https://api.moonshot.cn/v1/chat/completions',
    modelsEndpoint: 'https://api.moonshot.cn/v1/models',
    models: [
      { id: 'kimi-k2.7-code', label: 'Kimi K2.7 Code', supportsEffort: false },
      { id: 'kimi-k2.6', label: 'Kimi K2.6 (recommended)', supportsEffort: false },
      { id: 'kimi-k2.5', label: 'Kimi K2.5', supportsEffort: false },
      { id: 'moonshot-v1-128k', label: 'Moonshot v1 128k', supportsEffort: false },
    ],
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    modelsEndpoint: 'https://api.x.ai/v1/models',
    models: [
      { id: 'grok-4.5', label: 'Grok 4.5 (latest)', supportsEffort: false },
      { id: 'grok-4.3', label: 'Grok 4.3 (1M context)', supportsEffort: false },
      { id: 'grok-4.20', label: 'Grok 4.20 (2M context)', supportsEffort: false },
      { id: 'grok-4.1', label: 'Grok 4.1', supportsEffort: false },
      { id: 'grok-4.1-fast-reasoning', label: 'Grok 4.1 Fast Reasoning', supportsEffort: false },
      { id: 'grok-4.1-fast', label: 'Grok 4.1 Fast', supportsEffort: false },
      { id: 'grok-4-heavy', label: 'Grok 4 Heavy', supportsEffort: false },
      { id: 'grok-4', label: 'Grok 4', supportsEffort: false },
      { id: 'grok-3', label: 'Grok 3', supportsEffort: false },
      { id: 'grok-3-mini', label: 'Grok 3 Mini (reasoning)', supportsEffort: false },
      { id: 'grok-2', label: 'Grok 2', supportsEffort: false },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    modelsEndpoint: 'https://api.mistral.ai/v1/models',
    models: [
      { id: 'mistral-large-latest', label: 'Mistral Large (latest)', supportsEffort: false },
      { id: 'mistral-large-3', label: 'Mistral Large 3', supportsEffort: false },
      { id: 'mistral-large-2407', label: 'Mistral Large 2 (2407)', supportsEffort: false },
      { id: 'mistral-medium-3.5', label: 'Mistral Medium 3.5', supportsEffort: false },
      { id: 'mistral-medium-3', label: 'Mistral Medium 3', supportsEffort: false },
      { id: 'mistral-small-3.1', label: 'Mistral Small 3.1', supportsEffort: false },
      { id: 'mistral-small-latest', label: 'Mistral Small (latest)', supportsEffort: false },
      { id: 'magistral-medium-latest', label: 'Magistral Medium (reasoning)', supportsEffort: false },
      { id: 'codestral-latest', label: 'Codestral (code)', supportsEffort: false },
      { id: 'open-mixtral-8x22b', label: 'Mixtral 8x22B (open)', supportsEffort: false },
      { id: 'open-mixtral-8x7b', label: 'Mixtral 8x7B (open)', supportsEffort: false },
      { id: 'open-mistral-7b', label: 'Mistral 7B (open)', supportsEffort: false },
    ],
  },
];

export function getProvider(id: LLMProvider): ProviderInfo | undefined {
  return LLM_CATALOG.find((p) => p.id === id);
}

export function getModel(providerId: LLMProvider, modelId: string): ModelInfo | undefined {
  return getProvider(providerId)?.models.find((m) => m.id === modelId);
}
