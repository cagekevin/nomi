# src（前端 / 渲染进程）

Nomi 的 React 渲染进程代码。整体为 Electron + React 18 + Tailwind 3 + Zustand + Vercel AI SDK。

## 直接子目录

| 目录 | 职责 |
|---|---|
| `api/` | 桌面端 IPC 调用客户端封装 |
| `assets/` | 静态资源（图片/3D 模型等） |
| `config/` | 模型/厂商目录前端配置与展示映射 |
| `design/` | 设计系统组件（已有独立 README） |
| `desktop/` | 前端 ↔ 主进程桥接层与类型契约 |
| `dev/` | 开发期专用入口 |
| `devlab/` | 内部实验/预演页面 |
| `i18n/` | 国际化资源（i18next） |
| `lib/` | 通用前端库（如去背景） |
| `media/` | 媒体播放/时长探测/诊断 |
| `styles/` | 全局样式与动画 |
| `theme/` | 光暗双模式主题与 token |
| `ui/` | 通用 UI 组件与外壳 |
| `utils/` | 纯工具函数 |
| `vendor/` | 第三方库前端适配 |
| `workbench/` | 创作工作台（核心业务区） |

## 根级文件

- `main.tsx`：渲染进程入口。
- `NomiAppProviders.tsx` / `NomiRouterApp.tsx` / `NomiStudioRoute.tsx`：Provider、路由、工作台路由。
- `*.test.ts`：桥接/资源 URL 边界等单测。

> 架构分层见 `docs/05-架构三层探索.md`；开发上手见 `docs/02-开发上手-2026-08-10.md`。
