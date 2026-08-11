# src/api

前端调用桌面（Electron 主进程）能力的 API 客户端层。

- `desktopClient.ts`：统一的桌面端 IPC 调用客户端封装。
- `desktopAgentsChatStream.ts`：带图/流式聊天的桌面端调用封装（带图链路断点 A 所在）。
- `*.test.ts`：对应单测。
