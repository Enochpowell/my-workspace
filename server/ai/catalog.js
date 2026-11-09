'use strict';
/**
 * More AI services that speak the same "OpenAI-compatible" format, so one adapter runs them all.
 * Each needs its own API key (saved in Settings, AI, or in .env as <ID>_API_KEY). The ONE exception
 * is an aggregator such as OpenRouter or Together: a single key there reaches many models.
 *
 * Base URLs and default model names were written from memory and are NOT re-checked against each
 * provider's current docs. Model names especially change often. Both can be changed from Settings
 * (model) or .env (<ID>_BASE_URL, <ID>_MODEL) without touching code.
 */
const PRESETS = [
  { id: 'together', label: 'Together AI', baseUrl: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', aggregator: true },
  { id: 'fireworks', label: 'Fireworks AI', baseUrl: 'https://api.fireworks.ai/inference/v1', model: 'accounts/fireworks/models/llama-v3p3-70b-instruct' },
  { id: 'deepinfra', label: 'DeepInfra', baseUrl: 'https://api.deepinfra.com/v1/openai', model: 'meta-llama/Llama-3.3-70B-Instruct', aggregator: true },
  { id: 'mistral', label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'xai', label: 'xAI Grok', baseUrl: 'https://api.x.ai/v1', model: 'grok-3-mini' },
  { id: 'perplexity', label: 'Perplexity', baseUrl: 'https://api.perplexity.ai', model: 'sonar' },
  { id: 'cerebras', label: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', model: 'llama-3.3-70b' },
  { id: 'sambanova', label: 'SambaNova', baseUrl: 'https://api.sambanova.ai/v1', model: 'Meta-Llama-3.3-70B-Instruct' },
  { id: 'nvidia', label: 'NVIDIA NIM', baseUrl: 'https://integrate.api.nvidia.com/v1', model: 'meta/llama-3.3-70b-instruct' },
  { id: 'hyperbolic', label: 'Hyperbolic', baseUrl: 'https://api.hyperbolic.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct' },
  { id: 'novita', label: 'Novita AI', baseUrl: 'https://api.novita.ai/v3/openai', model: 'meta-llama/llama-3.3-70b-instruct' },
  { id: 'siliconflow', label: 'SiliconFlow', baseUrl: 'https://api.siliconflow.com/v1', model: 'Qwen/Qwen2.5-72B-Instruct' },
  { id: 'moonshot', label: 'Moonshot Kimi', baseUrl: 'https://api.moonshot.ai/v1', model: 'kimi-k2-0905-preview' },
  { id: 'qwen', label: 'Alibaba Qwen', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { id: 'zhipu', label: 'Zhipu GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { id: 'huggingface', label: 'Hugging Face', baseUrl: 'https://router.huggingface.co/v1', model: 'meta-llama/Llama-3.3-70B-Instruct', aggregator: true },
  { id: 'github', label: 'GitHub Models', baseUrl: 'https://models.github.ai/inference', model: 'openai/gpt-4o-mini' },
  { id: 'cohere', label: 'Cohere', baseUrl: 'https://api.cohere.ai/compatibility/v1', model: 'command-r-plus' },
  { id: 'lmstudio', label: 'LM Studio (this computer)', baseUrl: 'http://localhost:1234/v1', model: '', local: true },
];
module.exports = { PRESETS };
