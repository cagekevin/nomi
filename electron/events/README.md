# electron/events

事件总线与事件日志（运行期可观测性）。

- `eventBus.ts`：进程内事件总线。
- `eventsIpc.ts`：事件 IPC。
- `eventLogRepository.ts`：事件日志落盘仓储。
- `agentChatTrace.ts` / `vendorCallTrace.ts`：Agent 聊天 / 厂商调用的链路追踪。
- `redact.ts` / `secretsProvider.ts`：敏感信息脱敏与密钥提供。
- `types.ts`：事件类型定义。

> 事件/状态同步设计见 `docs/06-事件总线设计.md`。
