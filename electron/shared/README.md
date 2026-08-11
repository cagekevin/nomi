# electron/shared

主进程 ↔ 渲染进程共享契约（类型与通道常量，前端 `src/desktop/` 引用）。

- `bridgeContract.ts`：桥接契约（与 `src/desktop/*.bridgeTypes.ts` 对应）。
- `ipcChannels.ts`：IPC 通道名常量。
