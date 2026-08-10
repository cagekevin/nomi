// Lovart 本地网关文本模型（创作助手 / 拆镜头「大脑」）的 curated 种子。
// 网关是 OpenAI 兼容 chat（main.py /v1/chat/completions，同步标准形状；模型 id 用网关返回的 lovart-chat）。
// 故不需要 create/query mapping：agent 走 electron/ai/vendorLanguageModel.ts 的
// buildLanguageModelForVendor（lovart 默认 providerKind=openai-compatible → baseURL=/v1 → AI SDK 自动补
// /chat/completions）。catalog 只需一条 kind="text" 的 Model 记录，modelKey 即 chat model id。

export type LovartTextModel = {
  modelKey: string;
  labelZh: string;
  meta?: unknown;
};

/** Lovart 网关的 curated 文本模型（单源）。网关 /v1/models 里 chat 模型的 id 就是 lovart-chat。
 *  meta.supportsImageInput=true：Lovart 网关 /v1/chat/completions 支持多模态图输入，显式声明
 *  否则 modelSupportsImageInput 走 VISION_MODEL_RE 正则匹配不到 lovart-chat → 返回 false →
 *  聊天图片被 agentUserContent.ts:69 静默丢弃（"一直提示没有图片"根因）。 */
export const LOVART_TEXT_MODELS: LovartTextModel[] = [
  { modelKey: "lovart-chat", labelZh: "Lovart Chat", meta: { supportsImageInput: true } },
];
