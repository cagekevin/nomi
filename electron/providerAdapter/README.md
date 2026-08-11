# electron/providerAdapter

可扩展供应商适配器框架：让用户/生态接入自定义供应商并校验。

- `service.ts` / `store.ts`：适配器服务与存储。
- `compiler.ts`：适配器编译。
- `validator.ts` / `verifier.ts`：校验与验证。
- `docsDiscovery.ts`：文档发现。
- `liveHarness.ts`：实时调用验证 harness。
- `redaction.ts`：敏感信息脱敏。
- `ipc.ts` / `types.ts`：IPC 与类型。
- `architecture.test.ts`：架构说明测试。

> 与 `electron/catalog/` 的内置厂商接入互补：catalog 是官方内置，providerAdapter 是用户可扩展。
