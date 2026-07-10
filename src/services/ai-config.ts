/**
 * AI Provider Configuration
 *
 * All providers support OpenAI-compatible chat completions API.
 * Free tiers available for all listed providers.
 */

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
    description: '智谱 AI — GLM-4-Flash 免费',
    apiEndpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    defaultModel: 'glm-4-flash',
    freeModel: 'glm-4-flash',
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
 */
export function getAPIKey(provider: AIProvider): string | null {
  try {
    return localStorage.getItem(`ai_key_${provider}`);
  } catch {
    return null;
  }
}

export function setAPIKey(provider: AIProvider, key: string): void {
  localStorage.setItem(`ai_key_${provider}`, key);
}

export function clearAPIKey(provider: AIProvider): void {
  localStorage.removeItem(`ai_key_${provider}`);
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
  return 'deepseek';
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
