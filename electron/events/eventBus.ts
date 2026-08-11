// 事件总线（发送侧封装 · 2026-08-10 落地取向 1b）
//
// 不是新机制，是把「遍历窗口 webContents.send」和「定向 send」收成统一入口，
// 单一真相仍是 ipcChannels.ts 的 EventChannels 常量；这里只做两件事：
//   1) 发送侧消重复：broadcast 不再每个调用点手写 getAllWindows() 循环。
//   2) payload 类型化：EventMap 定义每个事件的 payload，发/收编译器可查。
//
// 纪律（对齐 docs/06-事件总线设计 §4.4）：事件=单向通知（后端→前端），
// 前端→后端要返回值走 IPC，不走这里。payload 类型「已知的精确化、未知的标 unknown 待补」，
// 禁止凭空编造类型。

import type { WebContents } from "electron";
import { EventChannels, type EventChannel } from "../shared/ipcChannels";

/** 每个单向事件的 payload 类型表。未知的先标 `unknown` + 待补注释，别编。 */
export interface EventMap {
  assetsUpdated: { projectId: string };
  windowCloseRequest: { requestId: string };
  windowMaximized: boolean;
  canvasZoomShortcut: -1 | 1;
  screenshotCaptured: { url: string; width: number; height: number };
  screenshotDenied: { screenAccess: string };
  screenshotFailed: { reason: string };
  /** @TODO 待补：来自 subscribeExportJobEvents 的真实导出 payload 类型。 */
  exportsEvent: unknown;
  /** 见 comfyuiProgressSocket.ts 的 ComfyuiProgressEvent。 */
  tasksComfyuiProgress: {
    promptId: string;
    nodeId: string;
    projectId: string;
    kind: "progress" | "preview" | "queue" | "done";
    percent?: number;
    currentClass?: string;
    startedNodes?: number;
    totalNodes?: number;
  };
  tasksTextEvent: { streamId: string; event: unknown };
  reviewEvent: { projectId: string; nodeId: string; verdict: unknown };
  productionDeepLink: { projectId: string; runId: string; artifactId?: string };
  /** @TODO 待补：来自 autoUpdater 的真实更新 payload 类型。 */
  updateEvent: unknown;
  agentsChatV2Event: { sessionId: string; event: unknown };
  // ── browser 域单向事件（2026-08-11 收编）。payload 类型与 src/desktop/bridge.ts 的
  // DesktopBrowser* 同形（electron/tsconfig rootDir 限制无法 import src 侧，如实转录）。
  browserViewState: {
    viewId: number;
    tabId: string;
    url: string;
    title: string;
    favicon?: string;
    canGoBack: boolean;
    canGoForward: boolean;
    loading: boolean;
  };
  browserAssetOverlayConfig: {
    opened: boolean;
    viewId: number | null;
    bounds: { x: number; y: number; width: number; height: number } | null;
    captureEnabled?: boolean;
    captureRequest?: unknown;
  };
  browserAssetOverlayState: {
    opened: boolean;
    dockMode?: unknown;
    popoverRect?: { x: number; y: number; width: number; height: number } | null;
    captureEnabled?: boolean;
  };
  browserViewPromptCapture:
    | {
        ok: true;
        viewId: number;
        tabId: string;
        url: string;
        title?: string;
        fileName?: string;
        pageUrl?: string;
        pageTitle?: string;
        extractionMode?: string;
        sourceRect?: unknown;
      }
    | { ok: false; viewId: number; tabId: string; reason: "empty" | "error"; message?: string };
  browserViewResourceCapture:
    | {
        ok: true;
        viewId: number;
        tabId: string;
        url: string;
        mediaType: "image" | "video";
        title?: string;
        fileName?: string;
        pageUrl?: string;
        pageTitle?: string;
        sourceRect?: unknown;
      }
    | { ok: false; viewId: number; tabId: string; reason: "empty" | "error"; message?: string };
  browserViewTextPromptSave:
    | {
        ok: true;
        viewId: number;
        tabId: string;
        prompt: string;
        promptType: string;
        pageUrl?: string;
        pageTitle?: string;
      }
    | { ok: false; viewId: number; tabId: string; reason: "error"; message?: string };
  browserAssetOverlayImportToCanvas: unknown;
}

/** 广播到所有非销毁窗口。payload 类型按 channel 校验。 */
export function publishBroadcast<C extends EventChannel>(
  channel: C,
  payload: EventMap[ChannelToKey<C>],
): void {
  // fire-and-forget：广播只是「通知窗口刷新」，环境不对就静默 no-op，绝不让它崩或报错。
  // vitest 纯 node / mock 缺 BrowserWindow 都会走到这里——import 本身可能 reject，
  // .then 回调里 BrowserWindow 也可能为 undefined；两种都 catch 掉，保证不进 unhandled rejection。
  void import("electron")
    .then(({ BrowserWindow }) => {
      if (!BrowserWindow) return;
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(channel, payload);
      }
    })
    .catch(() => {
      /* 环境不支持窗口广播时静默跳过（见 assetEvents.broadcastAssetsUpdated 注释）。 */
    });
}

/** 定向发送到指定 webContents。 */
export function publishTo<C extends EventChannel>(
  contents: WebContents,
  channel: C,
  payload: EventMap[ChannelToKey<C>],
): void {
  if (!contents || contents.isDestroyed()) return;
  contents.send(channel, payload);
}

/** 由 channel 字符串反查 EventMap key。 */
type ChannelToKey<C extends EventChannel> = {
  [K in keyof typeof EventChannels]: (typeof EventChannels)[K] extends C ? K : never;
}[keyof typeof EventChannels];
