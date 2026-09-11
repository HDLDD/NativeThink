/**
 * AI Provider Configuration
 *
 * All providers support OpenAI-compatible chat completions API.
 * Free tiers available for all listed providers.
 */

// 出厂内置 API Key — 构建时由 vite.config 从 gitignore 的 scripts/.apikey 注入。
// 用户未配置自己的 Key 时，出厂默认服务商（GLM）自动回落使用它。
declare const __FACTORY_API_KEY__: string;

const FACTORY_API_KEY: string =
  typeof __FACTORY_API_KEY__ !== 'undefined' ? __FACTORY_API_KEY__ : '';

/** 出厂默认服务商（出厂 Key 归属） */
export const FACTORY_PROVIDER: AIProvider = 'glm';

/** 出厂是否内置了 API Key */
export function hasFactoryKey(): boolean {
  return FACTORY_API_KEY.length > 0;
}

/**
 * 该服务商当前是否正在使用出厂内置 Key
 * （用户未配置自己的 Key，且出厂 Key 覆盖此服务商）
 */
export function isFactoryKey(provider: AIProvider): boolean {
  if (provider !== FACTORY_PROVIDER || !FACTORY_API_KEY) return false;
  try {
    return !localStorage.getItem(`ai_key_${provider}`);
  } catch {
    return true;
  }
}

export type AIProvider =
  | 'deepseek'
  | 'doubao'
  | 'qwen'
  | 'glm'
  | 'siliconflow'
  | 'moonshot'
  | 'groq';

export const ALL_PROVIDERS: AIProvider[] = [
  'deepseek',
  'doubao',
  'qwen',
  'glm',
  'siliconflow',
  'moonshot',
  'groq',
];

export interface ProviderConfig {
  name: string;
  /** 显示用的简短描述 */
  description: string;
  apiEndpoint: string;
  defaultModel: string;
  freeModel: string;
  /** 获取 API Key 的链接 */
  registerUrl: string;
  supportsStreaming: boolean;
}

export const PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig> = {
  deepseek: {
    name: 'DeepSeek',
    description: '深度求索 — 免费 500 万 token，R1 推理模型',
    apiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    freeModel: 'deepseek-chat',
    registerUrl: 'https://platform.deepseek.com',
    supportsStreaming: true,
  },
  doubao: {
    name: '豆包 (Doubao)',
    description: '字节跳动 — 免费 50 万 token/天(约)',
    apiEndpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    defaultModel: 'doubao-lite-32k',
    freeModel: 'doubao-lite-32k',
    registerUrl: 'https://console.volcengine.com/ark',
    supportsStreaming: true,
  },
  qwen: {
    name: '通义千问 (Qwen)',
    description: '阿里云 — 百万 token 免费额度',
    apiEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    defaultModel: 'qwen-plus',
    freeModel: 'qwen-turbo',
    registerUrl: 'https://dashscope.console.aliyun.com',
    supportsStreaming: true,
  },
  glm: {
    name: '智谱 GLM',
    description: '智谱 AI — GLM-4.7-Flash 免费',
    apiEndpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    defaultModel: 'glm-4.7-flash',
    freeModel: 'glm-4.7-flash',
    registerUrl: 'https://open.bigmodel.cn',
    supportsStreaming: true,
  },
  siliconflow: {
    name: '硅基流动 (SiliconFlow)',
    description: '模型聚合平台 — 2000 万 token 免费',
    apiEndpoint: 'https://api.siliconflow.cn/v1/chat/completions',
    defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
    freeModel: 'Qwen/Qwen2.5-7B-Instruct',
    registerUrl: 'https://siliconflow.cn',
    supportsStreaming: true,
  },
  moonshot: {
    name: 'Moonshot (Kimi)',
    description: '月之暗面 — 新用户 15 元免费额度',
    apiEndpoint: 'https://api.moonshot.cn/v1/chat/completions',
    defaultModel: 'moonshot-v1-8k',
    freeModel: 'moonshot-v1-8k',
    registerUrl: 'https://platform.moonshot.cn',
    supportsStreaming: true,
  },
  groq: {
    name: 'Groq',
    description: '超快推理 — Llama 系列模型免费',
    apiEndpoint: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
    freeModel: 'llama-3.1-8b-instant',
    registerUrl: 'https://console.groq.com',
    supportsStreaming: true,
  },
};

/**
 * Get API key from localStorage.
 * Keys are stored as: ai_key_<provider>
 * 出厂兜底：默认服务商未配置用户 Key 时，回落到构建时注入的出厂 Key。
 */
export function getAPIKey(provider: AIProvider): string | null {
  try {
    const stored = localStorage.getItem(`ai_key_${provider}`);
    if (stored) return stored;
  } catch {
    return null;
  }
  if (provider === FACTORY_PROVIDER && FACTORY_API_KEY) return FACTORY_API_KEY;
  return null;
}

/** Event dispatched whenever AI config changes — hooks listen to refresh UI state */
export const AI_CONFIG_CHANGED_EVENT = 'nativethink-ai-config-changed';

function notifyConfigChanged(): void {
  try { window.dispatchEvent(new Event(AI_CONFIG_CHANGED_EVENT)); } catch { /* ignore */ }
}

export function setAPIKey(provider: AIProvider, key: string): void {
  localStorage.setItem(`ai_key_${provider}`, key);
  notifyConfigChanged();
}

export function clearAPIKey(provider: AIProvider): void {
  localStorage.removeItem(`ai_key_${provider}`);
  notifyConfigChanged();
}

/**
 * Get the current active provider preference.
 * Defaults to 'deepseek' if not set.
 */
export function getActiveProvider(): AIProvider {
  try {
    const stored = localStorage.getItem('ai_active_provider');
    if (stored && (ALL_PROVIDERS as string[]).includes(stored)) {
      return stored as AIProvider;
    }
  } catch {
    // ignore
  }
  return 'glm';
}

export function setActiveProvider(provider: AIProvider): void {
  localStorage.setItem('ai_active_provider', provider);
}

/**
 * Get all configured providers (those with API keys set).
 */
export function getConfiguredProviders(): AIProvider[] {
  return ALL_PROVIDERS.filter((p) => getAPIKey(p));
}
