# src/desktop

前端 ↔ Electron 主进程桥接层（bridge）与类型契约。

- `bridge.ts` / `bridgeMedia.ts`：渲染进程侧桥接封装。
- `*.bridgeTypes.ts`：与各主进程模块（mcp / onboarding / productionRun / settings）通信的类型契约。
- `activeProject.ts`：当前激活项目状态。
- `providerKind.ts`：供应商类型枚举。

对应主进程实现见 `electron/shared/bridgeContract.ts`。
