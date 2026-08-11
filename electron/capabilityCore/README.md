# electron/capabilityCore

能力内核：MCP 应用/工具协议、网关、RPC 与内核安全。

- `core.ts` / `dispatcher.ts` / `gateway.ts` / `host.ts`：能力内核、分发、网关、宿主。
- `mcp*.ts`（mcpConfig / mcpProtocol / mcpStdioServer / mcpAppWidget / mcpVerify）：MCP 配置、协议、stdio 服务、应用微件、校验。
- `canvasGraph.ts` / `rendererBridge.ts`：画布图与渲染进程桥。
- `rpcServer.ts`：RPC 服务。
- `security.ts` / `securityMcpClient.ts`：安全策略与 MCP 客户端安全。
- `lockfile.ts` / `appIntegration.ts`：锁文件与 App 集成。
- `nomiMcp*.ts`：Nomi 内置 MCP（apps / elicitation / productionRuns / skills）测试。
