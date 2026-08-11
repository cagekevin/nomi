# electron/ai

Agent 对话与生成的核心运行时（基于 Vercel AI SDK）。

- `agentChatV2.ts` / `agentChatV2Ipc.ts`：带图聊天主流程（断点 B/C 所在）。
- `agentUserContent.ts`：用户内容（含附件）序列化（带图链路断点 D/E）。
- `agentLoop.ts` / `agentSessionStore.ts`：Agent 循环与会话存储。
- `agentStreamConsumer.ts` / `textStreamIpc.ts`：流式消费与 IPC。
- `canvasTools.ts` / `documentTools.ts`：Agent 可调用的画布/文档工具。
- `buildAiSdkModel.ts` / `vendorLanguageModel.ts`：构建 AI SDK 模型与厂商语言模型适配器。
- `modelProfiles.ts` / `requestPipeline.ts` / `promptSanitize.ts`：模型配置、请求管线、提示词清洗。
- `streamTextTask.ts` / `agentChatHarness.ts` / `agentError.ts`：任务封装、测试 harness、错误处理。
- `onboarding/`：Agent 新手引导相关。
