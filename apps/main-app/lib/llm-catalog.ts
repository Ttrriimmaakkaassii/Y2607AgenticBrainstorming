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
  models: ModelInfo[];
}

export const LLM_CATALOG: ProviderInfo[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: [
      { id: 'gpt-5', label: 'GPT-5', supportsEffort: true },
      { id: 'gpt-5-mini', label: 'GPT-5 Mini', supportsEffort: true },
      { id: 'o3', label: 'o3 (reasoning)', supportsEffort: true },
      { id: 'o3-mini', label: 'o3-mini (reasoning)', supportsEffort: true },
      { id: 'gpt-4o', label: 'GPT-4o', supportsEffort: false },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini', supportsEffort: false },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
    models: [
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', supportsEffort: true },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', supportsEffort: true },
      { id: 'claude-fable-5', label: 'Claude Fable 5', supportsEffort: true },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', supportsEffort: false },
    ],
  },
  {
    id: 'google',
    name: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', supportsEffort: true },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', supportsEffort: true },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', supportsEffort: false },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', supportsEffort: false },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek-V3 (chat)', supportsEffort: false },
      { id: 'deepseek-reasoner', label: 'DeepSeek-R1 (reasoner)', supportsEffort: false },
    ],
  },
  {
    id: 'zhipu',
    name: 'Z.ai (Zhipu GLM)',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    models: [
      { id: 'glm-4.6', label: 'GLM-4.6', supportsEffort: false },
      { id: 'glm-4.5-air', label: 'GLM-4.5 Air', supportsEffort: false },
    ],
  },
  {
    id: 'moonshot',
    name: 'Moonshot AI (Kimi)',
    endpoint: 'https://api.moonshot.cn/v1/chat/completions',
    models: [
      { id: 'kimi-k2-0905-preview', label: 'Kimi K2', supportsEffort: false },
      { id: 'moonshot-v1-32k', label: 'Moonshot v1 32k', supportsEffort: false },
      { id: 'moonshot-v1-128k', label: 'Moonshot v1 128k', supportsEffort: false },
    ],
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    models: [
      { id: 'grok-4', label: 'Grok 4', supportsEffort: false },
      { id: 'grok-4-fast', label: 'Grok 4 Fast', supportsEffort: false },
      { id: 'grok-3-mini', label: 'Grok 3 Mini (reasoning)', supportsEffort: false },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    models: [
      { id: 'mistral-large-latest', label: 'Mistral Large', supportsEffort: false },
      { id: 'mistral-small-latest', label: 'Mistral Small', supportsEffort: false },
      { id: 'magistral-medium-latest', label: 'Magistral Medium (reasoning)', supportsEffort: false },
    ],
  },
];

export function getProvider(id: LLMProvider): ProviderInfo | undefined {
  return LLM_CATALOG.find((p) => p.id === id);
}

export function getModel(providerId: LLMProvider, modelId: string): ModelInfo | undefined {
  return getProvider(providerId)?.models.find((m) => m.id === modelId);
}
