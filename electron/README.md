# electron（主进程）

Nomi 的 Electron 主进程代码（TypeScript，经 `pnpm build` 的 tsc 编译）。承载 AI 运行时、厂商接入、素材/项目/工作区管理、导出、事件总线等。

## 直接子目录

| 目录 | 职责 |
|---|---|
| `ai/` | Agent 对话与生成核心运行时 |
| `assets/` | 本地素材落盘/缓存/导入 |
| `browser/` | 内嵌浏览器/捕获 |
| `capabilityCore/` | 能力内核（MCP/网关/RPC/安全） |
| `catalog/` | 官方内置厂商与模型目录 |
| `conversations/` | 对话历史存储 |
| `events/` | 事件总线与事件日志 |
| `export/` | 导出 MP4（FFmpeg 编排） |
| `files/` | 文件文本抽取 |
| `image/` | 图像高级处理（图层分解等） |
| `memory/` | 项目级记忆 |
| `onboarding/` | 新手引导服务端支撑 |
| `productionRun/` | 生产运行编排/预算/审核/提交 |
| `projects/` | 项目仓储 |
| `promptLibrary/` | 提示词库 |
| `protocol/` | 本地自定义协议 |
| `providerAdapter/` | 用户可扩展供应商适配器框架 |
| `review/` | 生成结果审查/技术校验 |
| `screenshot/` | 截图能力 |
| `settings/` | 应用设置 |
| `shared/` | 主进程↔渲染进程共享契约 |
| `skills/` | 技能系统 |
| `tasks/` | 生成任务执行/缓存/查询 |
| `testSupport/` | 测试支撑 |
| `update/` | 自动更新 |
| `vendor/` | 厂商 HTTP 传输与溯源底座 |
| `video/` | 视频底层处理（抽帧/合成） |
| `workspace/` | 工作区与项目文件管理 |

## 根级关键文件

- `main.ts`：主进程入口。
- `preload.ts`：预加载脚本。
- `runtime.ts`：运行时主服务（聚合各子系统，含大量 `runtime.*.test.ts`）。
- `logger.ts` / `logIpc.ts`：日志系统（scope=agent，DEBUG 级，`NOMI_LOG_LEVEL` 控制）。
- `comfyui*.ts`：ComfyUI 本地集成（探测/模板/进度 socket/IPC）。
- `proxy*.ts` / `socksDispatcher.ts` / `hardenedFetch.ts`：代理与网络。
- `mainProcessLifecycle.ts` / `window*.ts` / `parentProcessWatchdog.ts`：生命周期与窗口管理。
- `vendorEndpoint.ts` / `spendGrant.ts` / `submissionLedger.ts` / `crashLog.ts`：厂商端点、额度、提交账本、崩溃日志。

> 运行期日志系统见 `docs/08-运行期日志系统设计.md`；带图聊天链路见 `docs/09-带图聊天链路排查.md`。
