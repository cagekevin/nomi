import { contextBridge, ipcRenderer } from "electron";
import { EventChannels, IpcChannels } from "./shared/ipcChannels";

type SyncResult<T> = { ok: true; value: T } | { ok: false; error: string };
type ProductionDeepLinkPayload = { projectId: string; runId: string; artifactId?: string };
let queuedProductionDeepLink: ProductionDeepLinkPayload | null = null;
const productionDeepLinkListeners = new Set<(payload: ProductionDeepLinkPayload) => void>();
ipcRenderer.on(EventChannels.productionDeepLink, (_event, payload: ProductionDeepLinkPayload) => {
  queuedProductionDeepLink = payload;
  for (const listener of productionDeepLinkListeners) listener(payload);
  if (productionDeepLinkListeners.size > 0) queuedProductionDeepLink = null;
});

function invokeSync<T>(channel: string, ...args: unknown[]): T {
  const result = ipcRenderer.sendSync(channel, ...args) as SyncResult<T>;
  if (!result || result.ok !== true) {
    throw new Error(result?.error || `Desktop IPC failed: ${channel}`);
  }
  return result.value;
}

contextBridge.exposeInMainWorld("nomiDesktop", {
  platform: process.platform,
  i18n: {
    setLocale: (locale: "zh-CN" | "en") => ipcRenderer.send(IpcChannels.i18nSetLocale, locale),
    // 首启探测系统语言用；拿不到就返回 ""（渲染层据此回落默认语言，绝不抛断首帧）。
    // 测试铁律：E2E/走查默认关探测（否则跟随 CI 机器系统语言 → 全批中文选择器测试崩），
    // 回落默认中文；仅「首启语言探测」专项走查显式 NOMI_TEST_SYSTEM_LOCALE=1 才真探测。
    getSystemLocale: (): string => {
      if (process.env.NOMI_E2E === "1" && process.env.NOMI_TEST_SYSTEM_LOCALE !== "1") return "";
      try {
        return invokeSync<string>(IpcChannels.i18nGetSystemLocale);
      } catch {
        return "";
      }
    },
  },
  // 窗口控制（Windows 自绘标题栏用；mac 原生 chrome 不调用）。窄面：仅 min/max/close + 最大化态订阅。
  window: {
    minimize: () => ipcRenderer.invoke(IpcChannels.windowMinimize),
    maximize: () => ipcRenderer.invoke(IpcChannels.windowMaximize),
    close: () => ipcRenderer.invoke(IpcChannels.windowClose),
    confirmClose: (requestId: string) =>
      ipcRenderer.send(IpcChannels.windowCloseResponse, { requestId, confirmed: true }),
    cancelClose: (requestId: string) =>
      ipcRenderer.send(IpcChannels.windowCloseResponse, { requestId, confirmed: false }),
    onCloseRequest: (cb: (payload: { requestId: string }) => void) => {
      const listener = (_: unknown, payload: { requestId: string }) => cb(payload);
      ipcRenderer.on(EventChannels.windowCloseRequest, listener);
      return () => ipcRenderer.removeListener(EventChannels.windowCloseRequest, listener);
    },
    onMaximized: (cb: (maximized: boolean) => void) => {
      const listener = (_: unknown, v: boolean) => cb(v);
      ipcRenderer.on(EventChannels.windowMaximized, listener);
      return () => ipcRenderer.removeListener(EventChannels.windowMaximized, listener);
    },
    onCanvasZoomShortcut: (cb: (direction: -1 | 1) => void) => {
      const listener = (_: unknown, direction: -1 | 1) => cb(direction);
      ipcRenderer.on(EventChannels.canvasZoomShortcut, listener);
      return () => ipcRenderer.removeListener(EventChannels.canvasZoomShortcut, listener);
    },
  },
  logRendererCrash: (message: unknown) => ipcRenderer.send(IpcChannels.logRendererCrash, message),
  // 运行期日志（诊断）：渲染层上送 + 级别开关 + 崩溃/运行合并预览/导出。fire-and-forget 上送不阻塞渲染。
  log: (level: unknown, scope: unknown, msg: unknown, meta?: unknown) =>
    ipcRenderer.send(IpcChannels.logSend, { level, scope, msg, meta }),
  diagnostics: {
    getLevel: () => ipcRenderer.invoke(IpcChannels.logLevelGet) as Promise<string>,
    setLevel: (level: unknown) => ipcRenderer.invoke(IpcChannels.logLevelSet, level) as Promise<string>,
    get: () =>
      ipcRenderer.invoke(IpcChannels.logDiagnosticsGet) as Promise<{
        logLevel: string;
        crash: string;
        run: string;
        meta: string;
      }>,
    export: () =>
      ipcRenderer.invoke(IpcChannels.logDiagnosticsExport) as Promise<{
        meta: string;
        crash: string;
        run: string;
      }>,
  },
  app: {
    reopenLibraryWindow: () => ipcRenderer.send(IpcChannels.appReopenLibraryWindow),
    hardReloadWindow: () => ipcRenderer.send(IpcChannels.appHardReloadWindow),
    onProductionDeepLink: (cb: (payload: ProductionDeepLinkPayload) => void) => {
      productionDeepLinkListeners.add(cb);
      if (queuedProductionDeepLink) {
        const pending = queuedProductionDeepLink;
        queueMicrotask(() => cb(pending));
        queuedProductionDeepLink = null;
      }
      return () => productionDeepLinkListeners.delete(cb);
    },
  },
  settings: {
    projectLocation: {
      get: () => ipcRenderer.invoke(IpcChannels.settingsProjectLocationGet),
      pick: () => ipcRenderer.invoke(IpcChannels.settingsProjectLocationPick),
      reset: () => ipcRenderer.invoke(IpcChannels.settingsProjectLocationReset),
      reveal: () => ipcRenderer.invoke(IpcChannels.settingsProjectLocationReveal),
    },
    automationPolicy: {
      get: () => ipcRenderer.invoke(IpcChannels.settingsAutomationPolicyGet),
      set: (payload: unknown) => ipcRenderer.invoke(IpcChannels.settingsAutomationPolicySet, payload),
    },
  },
  browserChromeMenu: {
    select: (id: unknown) => ipcRenderer.send(IpcChannels.browserChromeMenuSelect, id),
    cancel: () => ipcRenderer.send(IpcChannels.browserChromeMenuCancel),
  },
  proxy: {
    get: () => ipcRenderer.invoke(IpcChannels.proxyGet),
    set: (payload: unknown) => ipcRenderer.invoke(IpcChannels.proxySet, payload),
    test: () => ipcRenderer.invoke(IpcChannels.proxyTest),
  },
  workspace: {
    selectFolder: () => ipcRenderer.invoke(IpcChannels.workspaceSelectFolder),
    openFolder: (payload: unknown) => ipcRenderer.invoke(IpcChannels.workspaceOpenFolder, payload),
    listFiles: (payload: unknown) => ipcRenderer.invoke(IpcChannels.workspaceListFiles, payload),
    revealFile: (payload: unknown) => ipcRenderer.invoke(IpcChannels.workspaceRevealFile, payload),
    deleteFiles: (payload: unknown) => ipcRenderer.invoke(IpcChannels.workspaceDeleteFiles, payload),
    revealProjectFolder: (payload: unknown) => ipcRenderer.invoke(IpcChannels.workspaceRevealProjectFolder, payload),
  },
  // 系统通知：任务跑完且窗口失焦时才发（判失焦在渲染层，主进程只负责发+点击拉回窗口）。
  notifications: {
    show: (payload: unknown) => ipcRenderer.invoke(IpcChannels.notificationsShow, payload),
  },
  projects: {
    list: () => invokeSync(IpcChannels.projectsList),
    listAsync: () => ipcRenderer.invoke(IpcChannels.projectsListAsync),
    create: (record: unknown) => invokeSync(IpcChannels.projectsCreate, record),
    read: (projectId: string) => invokeSync(IpcChannels.projectsRead, projectId),
    readAsync: (projectId: string) => ipcRenderer.invoke(IpcChannels.projectsReadAsync, projectId),
    diagnose: (projectId: string) => ipcRenderer.invoke(IpcChannels.projectsDiagnose, projectId),
    recover: (projectId: string) => ipcRenderer.invoke(IpcChannels.projectsRecover, projectId),
    save: (projectId: string, record: unknown) => invokeSync(IpcChannels.projectsSave, projectId, record),
    saveAsync: (projectId: string, record: unknown) =>
      ipcRenderer.invoke(IpcChannels.projectsSaveAsync, projectId, record),
    delete: (projectId: string) => invokeSync(IpcChannels.projectsDelete, projectId),
  },
  productionRuns: {
    list: (projectId: string) => ipcRenderer.invoke(IpcChannels.productionRunsList, { projectId }),
    read: (projectId: string, runId: string) => ipcRenderer.invoke(IpcChannels.productionRunsRead, { projectId, runId }),
    createDraft: (payload: unknown) => ipcRenderer.invoke(IpcChannels.productionRunsCreateDraft, payload),
    command: (projectId: string, runId: string, command: unknown) =>
      ipcRenderer.invoke(IpcChannels.productionRunsCommand, { projectId, runId, command }),
    events: (projectId: string, runId: string, afterCursor: number) =>
      ipcRenderer.invoke(IpcChannels.productionRunsEvents, { projectId, runId, afterCursor }),
  },
  assets: {
    list: (payload: unknown) => ipcRenderer.invoke(IpcChannels.assetsList, payload),
    // 素材文件夹（素材面收敛 2026-07-22 转正）：per-project 落盘,素材库唯一消费者。
    foldersGet: (payload: unknown) => ipcRenderer.invoke(IpcChannels.assetsFoldersGet, payload),
    foldersSave: (payload: unknown) => ipcRenderer.invoke(IpcChannels.assetsFoldersSave, payload),
    // 素材写入层（writeAsset/moveAssetFile）落盘即广播——素材库面板/素材盒徽章的统一回流信号，
    // 任何导入路径（浏览器捕捞/拖拽/上传/agent）免费获得刷新（M0 捕捞窗私有 onImported 的接任者）。
    onUpdated: (cb: (payload: unknown) => void) => {
      const listener = (_: unknown, v: unknown) => cb(v);
      ipcRenderer.on(EventChannels.assetsUpdated, listener);
      return () => ipcRenderer.removeListener(EventChannels.assetsUpdated, listener);
    },
    importRemoteUrl: (payload: unknown) => ipcRenderer.invoke(IpcChannels.assetsImportRemoteUrl, payload),
    importFile: (payload: unknown) => ipcRenderer.invoke(IpcChannels.assetsImportFile, payload),
    // 播放懒自愈：nomi-local 视频解不了（HEVC 存量/供应商 HEVC 产物）→ 主进程转码出新 MP4 资产。
    ensurePlayable: (payload: unknown) => ipcRenderer.invoke(IpcChannels.assetsEnsurePlayable, payload),
    // 引导示例项目：把随包成图落成项目资产，回 clientId → nomi-local URL（渲染侧算不出稳定地址）。
    seedOnboardingDemo: (payload: unknown) => ipcRenderer.invoke(IpcChannels.assetsSeedOnboardingDemo, payload),
    download: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.assetsDownload, payload) as Promise<{
        ok: boolean;
        canceled?: boolean;
        path?: string;
      }>,
    // 自动另存（生成完成即调，best-effort）+ 集中设置页读写/选目录。
    autoSave: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.assetsAutoSave, payload) as Promise<{ ok: boolean; path?: string }>,
    getAutoSavePrefs: () =>
      ipcRenderer.invoke(IpcChannels.settingsAutoSaveGet) as Promise<{ enabled: boolean; dir: string }>,
    setAutoSavePrefs: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.settingsAutoSaveSet, payload) as Promise<{ enabled: boolean; dir: string }>,
    pickSaveDir: () => ipcRenderer.invoke(IpcChannels.settingsPickDir) as Promise<{ dir: string }>,
  },
  browser: {
    createView: (payload: unknown) => ipcRenderer.invoke(IpcChannels.browserViewCreate, payload) as Promise<{ viewId: number }>,
    destroyView: (payload: unknown) => ipcRenderer.send(IpcChannels.browserViewDestroy, payload),
    navigate: (payload: unknown) => ipcRenderer.send(IpcChannels.browserViewNavigate, payload),
    back: (payload: unknown) => ipcRenderer.send(IpcChannels.browserViewBack, payload),
    forward: (payload: unknown) => ipcRenderer.send(IpcChannels.browserViewForward, payload),
    reload: (payload: unknown) => ipcRenderer.send(IpcChannels.browserViewReload, payload),
    resize: (payload: unknown) => ipcRenderer.send(IpcChannels.browserViewResize, payload),
    show: (payload: unknown) => ipcRenderer.send(IpcChannels.browserViewShow, payload),
    hide: (payload: unknown) => ipcRenderer.send(IpcChannels.browserViewHide, payload),
    importMedia: (payload: unknown) => ipcRenderer.invoke(IpcChannels.browserViewImportMedia, payload),
    capturePromptImage: (payload: unknown) => ipcRenderer.invoke(IpcChannels.browserViewCapturePromptImage, payload),
    selectPromptScreenshot: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.browserViewSelectPromptScreenshot, payload),
    capturePromptScreenshot: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.browserViewCapturePromptScreenshot, payload),
    readPromptExtractionSettings: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.browserPromptExtractionSettingsRead, payload),
    writePromptExtractionSettings: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.browserPromptExtractionSettingsWrite, payload),
    setResourceCapture: (payload: unknown) => ipcRenderer.send(IpcChannels.browserViewSetResourceCapture, payload),
    captureResource: (payload: unknown) => ipcRenderer.send(IpcChannels.browserViewCaptureResource, payload),
    showChromeMenu: (payload: unknown) => ipcRenderer.invoke(IpcChannels.browserChromeMenuShow, payload),
    assetOverlay: {
      open: (payload: unknown) => ipcRenderer.send(IpcChannels.browserAssetOverlayOpen, payload),
      updateHost: (payload: unknown) => ipcRenderer.send(IpcChannels.browserAssetOverlayUpdateHost, payload),
      close: () => ipcRenderer.send(IpcChannels.browserAssetOverlayClose),
      captureRequest: (payload: unknown) => ipcRenderer.send(IpcChannels.browserAssetOverlayCaptureRequest, payload),
      ready: () => ipcRenderer.send(IpcChannels.browserAssetOverlayReady),
      setInteractive: (payload: unknown) => ipcRenderer.send(IpcChannels.browserAssetOverlaySetInteractive, payload),
      finishDrag: () => ipcRenderer.send(IpcChannels.browserAssetOverlayFinishDrag),
      setState: (payload: unknown) => ipcRenderer.send(IpcChannels.browserAssetOverlaySetState, payload),
      importToCanvas: (payload: unknown) => ipcRenderer.send(IpcChannels.browserAssetOverlayImportToCanvas, payload),
      canvasImportAvailable: () => ipcRenderer.invoke(IpcChannels.browserAssetOverlayCanvasImportAvailable),
      onConfig: (callback: (event: unknown) => void) => {
        const listener = (_event: unknown, payload: unknown) => callback(payload);
        ipcRenderer.on(EventChannels.browserAssetOverlayConfig, listener as never);
        return () => {
          ipcRenderer.removeListener(EventChannels.browserAssetOverlayConfig, listener as never);
        };
      },
      onState: (callback: (event: unknown) => void) => {
        const listener = (_event: unknown, payload: unknown) => callback(payload);
        ipcRenderer.on(EventChannels.browserAssetOverlayState, listener as never);
        return () => {
          ipcRenderer.removeListener(EventChannels.browserAssetOverlayState, listener as never);
        };
      },
      onImportToCanvas: (callback: (event: unknown) => void) => {
        const listener = (_event: unknown, payload: unknown) => callback(payload);
        ipcRenderer.on(EventChannels.browserAssetOverlayImportToCanvas, listener as never);
        return () => {
          ipcRenderer.removeListener(EventChannels.browserAssetOverlayImportToCanvas, listener as never);
        };
      },
    },
    onPromptCapture: (callback: (event: unknown) => void) => {
      const listener = (_event: unknown, payload: unknown) => callback(payload);
      ipcRenderer.on(EventChannels.browserViewPromptCapture, listener as never);
      return () => {
        ipcRenderer.removeListener(EventChannels.browserViewPromptCapture, listener as never);
      };
    },
    onTextPromptSave: (callback: (event: unknown) => void) => {
      const listener = (_event: unknown, payload: unknown) => callback(payload);
      ipcRenderer.on(EventChannels.browserViewTextPromptSave, listener as never);
      return () => {
        ipcRenderer.removeListener(EventChannels.browserViewTextPromptSave, listener as never);
      };
    },
    onResourceCapture: (callback: (event: unknown) => void) => {
      const listener = (_event: unknown, payload: unknown) => callback(payload);
      ipcRenderer.on(EventChannels.browserViewResourceCapture, listener as never);
      return () => {
        ipcRenderer.removeListener(EventChannels.browserViewResourceCapture, listener as never);
      };
    },
    onState: (callback: (event: unknown) => void) => {
      const listener = (_event: unknown, payload: unknown) => callback(payload);
      ipcRenderer.on(EventChannels.browserViewState, listener as never);
      return () => {
        ipcRenderer.removeListener(EventChannels.browserViewState, listener as never);
      };
    },
  },
  video: {
    extractFrame: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.videoExtractFrame, payload) as Promise<{ url: string }>,
    extractFilmstrip: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.videoExtractFilmstrip, payload) as Promise<{ url: string; tiles: number; tileHeight: number }>,
    detectShotCuts: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.videoDetectShotCuts, payload) as Promise<unknown>,
  },
  screenshot: {
    get: () => ipcRenderer.invoke(IpcChannels.screenshotGet) as Promise<unknown>,
    set: (payload: unknown) => ipcRenderer.invoke(IpcChannels.screenshotSet, payload) as Promise<unknown>,
    openPermissionSettings: () => ipcRenderer.invoke(IpcChannels.screenshotOpenPermissionSettings) as Promise<unknown>,
    setProjectId: (projectId: string) => ipcRenderer.invoke(IpcChannels.screenshotSetProject, projectId) as Promise<unknown>,
    // 走查专用：对应的 handler 只在主进程 NOMI_E2E=1 时注册，生产环境这里会直接 reject（门禁在主进程侧）。
    e2eCapture: () => ipcRenderer.invoke(IpcChannels.screenshotE2eCapture) as Promise<unknown>,
    onCaptured: (cb: (payload: { url: string; width: number; height: number }) => void) => {
      const listener = (_: unknown, value: { url: string; width: number; height: number }) => cb(value);
      ipcRenderer.on(EventChannels.screenshotCaptured, listener);
      return () => ipcRenderer.removeListener(EventChannels.screenshotCaptured, listener);
    },
    onDenied: (cb: (payload: { screenAccess: string }) => void) => {
      const listener = (_: unknown, value: { screenAccess: string }) => cb(value);
      ipcRenderer.on(EventChannels.screenshotDenied, listener);
      return () => ipcRenderer.removeListener(EventChannels.screenshotDenied, listener);
    },
    onFailed: (cb: (payload: { reason: string }) => void) => {
      const listener = (_: unknown, value: { reason: string }) => cb(value);
      ipcRenderer.on(EventChannels.screenshotFailed, listener);
      return () => ipcRenderer.removeListener(EventChannels.screenshotFailed, listener);
    },
  },
  image: {
    decomposeLayers: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.imageDecomposeLayers, payload) as Promise<{ layers: string[] }>,
  },
  dreamina: {
    status: () => ipcRenderer.invoke(IpcChannels.dreaminaStatus),
    loginStart: () => ipcRenderer.invoke(IpcChannels.dreaminaLoginStart),
    loginPoll: (deviceCode: string) => ipcRenderer.invoke(IpcChannels.dreaminaLoginPoll, deviceCode),
    logout: () => ipcRenderer.invoke(IpcChannels.dreaminaLogout),
    install: () => ipcRenderer.invoke(IpcChannels.dreaminaInstall),
  },
  scene3d: {
    framesToVideo: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.scene3dFramesToVideo, payload) as Promise<{ url: string; assetId?: string }>,
  },
  exports: {
    startJob: (payload: unknown) => ipcRenderer.invoke(IpcChannels.exportsStartJob, payload),
    writeTempInput: (payload: unknown) => ipcRenderer.invoke(IpcChannels.exportsWriteTempInput, payload),
    finishTempInput: (payload: unknown) => ipcRenderer.invoke(IpcChannels.exportsFinishTempInput, payload),
    status: (jobId: string) => ipcRenderer.invoke(IpcChannels.exportsStatus, jobId),
    cancel: (jobId: string) => ipcRenderer.invoke(IpcChannels.exportsCancel, jobId),
    onEvent: (callback: (event: unknown) => void) => {
      const listener = (_event: unknown, payload: unknown) => callback(payload);
      ipcRenderer.on(EventChannels.exportsEvent, listener as never);
      return () => {
        ipcRenderer.removeListener(EventChannels.exportsEvent, listener as never);
      };
    },
    showInFolder: (payload: unknown) => ipcRenderer.invoke(IpcChannels.exportsShowInFolder, payload),
  },
  tasks: {
    run: (payload: unknown) => ipcRenderer.invoke(IpcChannels.tasksRun, payload),
    result: (payload: unknown) => ipcRenderer.invoke(IpcChannels.tasksResult, payload),
    // 付费守卫：真人确认后铸一次性令牌（绑 nodeIds），返回不透明 grantId 随生成请求下传。
    grantSpend: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.tasksGrantSpend, payload) as Promise<{ grantId: string }>,
    // 文本任务流式（逐 token）：start 返回 streamId，onTextEvent 收 delta/done/error。
    runTextStream: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.tasksTextStream, payload) as Promise<{ streamId: string }>,
    cancelTextStream: (streamId: string) => ipcRenderer.invoke(IpcChannels.tasksTextCancel, { streamId }),
    onTextEvent: (streamId: string, callback: (event: unknown) => void) => {
      const listener = (_event: unknown, payload: { streamId: string; event: unknown }) => {
        if (payload && payload.streamId === streamId) callback(payload.event);
      };
      ipcRenderer.on(EventChannels.tasksTextEvent, listener as never);
      return () => {
        ipcRenderer.removeListener(EventChannels.tasksTextEvent, listener as never);
      };
    },
    // ComfyUI ws 进度桥（P 轨）：watch 登记 → 主进程推 progress/preview/queue/done；interrupt=取消。
    comfyuiWatch: (payload: unknown) => ipcRenderer.invoke(IpcChannels.tasksComfyuiWatch, payload),
    comfyuiUnwatch: (promptId: string) => ipcRenderer.invoke(IpcChannels.tasksComfyuiUnwatch, promptId),
    comfyuiInterrupt: (promptId: string) => ipcRenderer.invoke(IpcChannels.tasksComfyuiInterrupt, promptId),
    onComfyuiProgress: (callback: (event: unknown) => void) => {
      const listener = (_event: unknown, payload: unknown) => callback(payload);
      ipcRenderer.on(EventChannels.tasksComfyuiProgress, listener as never);
      return () => {
        ipcRenderer.removeListener(EventChannels.tasksComfyuiProgress, listener as never);
      };
    },
  },
  events: {
    append: (projectId: string, events: unknown[]) =>
      ipcRenderer.invoke(IpcChannels.eventsAppend, { projectId, events }) as Promise<{
        ok: boolean;
        count: number;
        lastSeq: number;
      }>,
    read: (projectId: string, fromSeq: number) =>
      ipcRenderer.invoke(IpcChannels.eventsRead, { projectId, fromSeq }) as Promise<{ ok: boolean; events: unknown[] }>,
  },
  memory: {
    get: (projectId: string) =>
      ipcRenderer.invoke(IpcChannels.memoryGet, { projectId }) as Promise<{ ok: boolean; facts: unknown[] }>,
    update: (projectId: string, factId: string, patch: { text?: string; pinned?: boolean }) =>
      ipcRenderer.invoke(IpcChannels.memoryUpdate, { projectId, factId, patch }) as Promise<{
        ok: boolean;
        facts: unknown[];
      }>,
    remove: (projectId: string, factId: string) =>
      ipcRenderer.invoke(IpcChannels.memoryRemove, { projectId, factId }) as Promise<{ ok: boolean; facts: unknown[] }>,
    add: (projectId: string, text: string, kind?: string) =>
      ipcRenderer.invoke(IpcChannels.memoryAdd, { projectId, text, kind }) as Promise<{ ok: boolean; facts: unknown[] }>,
  },
  promptLibrary: {
    list: () =>
      ipcRenderer.invoke(IpcChannels.promptLibraryList) as Promise<{ ok: boolean; prompts: unknown[]; error?: string }>,
    textBrain: () =>
      ipcRenderer.invoke(IpcChannels.promptLibraryTextBrain) as Promise<{
        ok: boolean;
        brain: { vendor: string; modelKey: string } | null;
      }>,
    userList: () =>
      ipcRenderer.invoke(IpcChannels.promptLibraryUserList) as Promise<{
        ok: boolean;
        prompts: unknown[];
        error?: string;
      }>,
    userAdd: (input: { title?: string; prompt: string; promptType: "image" | "video"; tags?: string[]; referenceImages?: { url: string; title?: string; sourceUrl?: string }[] }) =>
      ipcRenderer.invoke(IpcChannels.promptLibraryUserAdd, input) as Promise<{
        ok: boolean;
        prompts: unknown[];
        error?: string;
      }>,
    userUpdate: (id: string, patch: { title?: string; prompt?: string; promptType?: "image" | "video" }) =>
      ipcRenderer.invoke(IpcChannels.promptLibraryUserUpdate, { id, patch }) as Promise<{
        ok: boolean;
        prompts: unknown[];
        error?: string;
      }>,
    userDelete: (id: string) =>
      ipcRenderer.invoke(IpcChannels.promptLibraryUserDelete, { id }) as Promise<{
        ok: boolean;
        prompts: unknown[];
        error?: string;
      }>,
  },
  review: {
    onEvent: (callback: (payload: unknown) => void) => {
      const listener = (_event: unknown, payload: unknown) => callback(payload);
      ipcRenderer.on(EventChannels.reviewEvent, listener as never);
      return () => ipcRenderer.removeListener(EventChannels.reviewEvent, listener as never);
    },
  },
  conversations: {
    read: (projectId: string) => ipcRenderer.invoke(IpcChannels.conversationsRead, { projectId }),
    write: (projectId: string, payload: { creation: unknown; generation: unknown; committedProposal?: unknown }) =>
      ipcRenderer.invoke(IpcChannels.conversationsWrite, { projectId, ...payload }),
  },
  agents: {
    chatV2Start: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.agentsChatV2Start, payload) as Promise<{ sessionId: string }>,
    confirmTool: (sessionId: string, toolCallId: string, decision: unknown) =>
      ipcRenderer.invoke(IpcChannels.agentsChatV2ConfirmTool, { sessionId, toolCallId, decision }),
    cancelChatV2: (sessionId: string) => ipcRenderer.invoke(IpcChannels.agentsChatV2Cancel, { sessionId }),
    clearChatV2Session: (sessionKey: string) => ipcRenderer.invoke(IpcChannels.agentsChatV2ClearSession, { sessionKey }),
    seedChatV2Session: (sessionKey: string, messages: Array<{ role: string; content: string }>) =>
      ipcRenderer.invoke(IpcChannels.agentsChatV2SeedSession, { sessionKey, messages }),
    chatV2SessionAlive: (sessionKey: string) =>
      ipcRenderer.invoke(IpcChannels.agentsChatV2SessionAlive, { sessionKey }) as Promise<{ alive: boolean }>,
    onChatV2Event: (sessionId: string, callback: (event: unknown) => void) => {
      const listener = (_event: unknown, payload: { sessionId: string; event: unknown }) => {
        if (payload && payload.sessionId === sessionId) callback(payload.event);
      };
      ipcRenderer.on(EventChannels.agentsChatV2Event, listener as never);
      return () => {
        ipcRenderer.removeListener(EventChannels.agentsChatV2Event, listener as never);
      };
    },
  },
  onboarding: {
    adapterStart: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.providerAdapterStart, payload),
    adapterGet: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.providerAdapterGet, payload),
    adapterLatest: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.providerAdapterLatest, payload),
    manualCommit: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.onboardingManualCommit, payload) as Promise<{
        ok: boolean;
        vendorKey?: string;
        committed?: Array<{ modelKey: string; displayName: string }>;
        error?: string;
      }>,
    guessKinds: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.onboardingGuessKinds, payload) as Promise<{
        kinds: Record<string, "text" | "image" | "video" | "audio">;
      }>,
    testConnection: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.onboardingTestConnection, payload) as Promise<{
        ok: boolean;
        status?: number;
        error?: string;
      }>,
    listModels: (payload: unknown) =>
      ipcRenderer.invoke(IpcChannels.onboardingListModels, payload) as Promise<{
        ok: boolean;
        models?: string[];
        status?: number;
        error?: string;
      }>,
  },
  update: {
    appInfo: () => ipcRenderer.invoke(IpcChannels.appVersion),
    check: () => ipcRenderer.invoke(IpcChannels.updateCheck),
    download: () => ipcRenderer.invoke(IpcChannels.updateDownload),
    install: () => ipcRenderer.invoke(IpcChannels.updateInstall),
    openRelease: () => ipcRenderer.invoke(IpcChannels.updateOpenRelease),
    onEvent: (callback: (event: unknown) => void) => {
      const listener = (_event: unknown, payload: unknown) => callback(payload);
      ipcRenderer.on(EventChannels.updateEvent, listener as never);
      return () => {
        ipcRenderer.removeListener(EventChannels.updateEvent, listener as never);
      };
    },
  },
  modelCatalog: {
    listVendors: () => invokeSync(IpcChannels.modelCatalogVendorsList),
    listModels: (params?: unknown) => invokeSync(IpcChannels.modelCatalogModelsList, params),
    listMappings: (params?: unknown) => invokeSync(IpcChannels.modelCatalogMappingsList, params),
    health: () => invokeSync(IpcChannels.modelCatalogHealth),
    upsertVendor: (payload: unknown) => invokeSync(IpcChannels.modelCatalogVendorUpsert, payload),
    deleteVendor: (key: string) => invokeSync(IpcChannels.modelCatalogVendorDelete, key),
    upsertVendorApiKey: (vendorKey: string, payload: unknown) =>
      invokeSync(IpcChannels.modelCatalogVendorApiKeyUpsert, vendorKey, payload),
    clearVendorApiKey: (vendorKey: string) => invokeSync(IpcChannels.modelCatalogVendorApiKeyClear, vendorKey),
    upsertModel: (payload: unknown) => invokeSync(IpcChannels.modelCatalogModelUpsert, payload),
    customCallContract: () => invokeSync(IpcChannels.customCallContract),
    customCallAiInstruction: (payload: unknown) => invokeSync(IpcChannels.customCallAiInstruction, payload),
    customCallTestRun: (payload: unknown) => ipcRenderer.invoke(IpcChannels.customCallTestRun, payload),
    deleteModel: (vendorKey: string, modelKey: string) =>
      invokeSync(IpcChannels.modelCatalogModelDelete, vendorKey, modelKey),
    deleteModels: (targets: { vendorKey: string; modelKey: string }[]) =>
      invokeSync(IpcChannels.modelCatalogModelsDelete, targets),
    upsertMapping: (payload: unknown) => invokeSync(IpcChannels.modelCatalogMappingUpsert, payload),
    deleteMapping: (id: string) => invokeSync(IpcChannels.modelCatalogMappingDelete, id),
    exportPackage: (params?: unknown) => invokeSync(IpcChannels.modelCatalogExport, params),
    importPackage: (payload: unknown) => invokeSync(IpcChannels.modelCatalogImport, payload),
    testMapping: (id: string, payload: unknown) => ipcRenderer.invoke(IpcChannels.modelCatalogMappingTest, id, payload),
    fetchDocs: (payload: unknown) => ipcRenderer.invoke(IpcChannels.modelCatalogDocsFetch, payload),
    probeComfyui: (baseUrl?: string) => ipcRenderer.invoke(IpcChannels.modelCatalogComfyuiProbe, baseUrl),
    analyzeComfyWorkflow: (text: string) => invokeSync(IpcChannels.modelCatalogComfyuiAnalyzeWorkflow, text),
    reconcileComfyWorkflow: (text: string, vendorKey?: string) =>
      ipcRenderer.invoke(IpcChannels.modelCatalogComfyuiReconcileWorkflow, text, vendorKey),
    // T1：贴什么格式都吃（界面格式借 ComfyUI 前端自动转 API）。
    analyzeComfyWorkflowSmart: (text: string, vendorKey?: string) =>
      ipcRenderer.invoke(IpcChannels.modelCatalogComfyuiAnalyzeWorkflowSmart, text, vendorKey),
    // T2：读用户自己 ComfyUI 里的官方模板库。
    listComfyuiTemplates: (vendorKey?: string) =>
      ipcRenderer.invoke(IpcChannels.modelCatalogComfyuiTemplates, vendorKey),
    getComfyuiTemplateDetail: (name: string, vendorKey?: string) =>
      ipcRenderer.invoke(IpcChannels.modelCatalogComfyuiTemplateDetail, name, vendorKey),
    listComfyuiPresets: () => invokeSync(IpcChannels.modelCatalogComfyuiPresets),
    importComfyWorkflow: (payload: { text: string; binding: unknown; labelZh: string; enumOptions?: unknown }) =>
      invokeSync(IpcChannels.modelCatalogComfyuiImportWorkflow, payload),
    updateComfyWorkflow: (payload: { modelKey: string; text: string; binding: unknown; labelZh: string; enumOptions?: unknown }) =>
      invokeSync(IpcChannels.modelCatalogComfyuiUpdateWorkflow, payload),
  },
  skill: {
    list: () => invokeSync(IpcChannels.skillList),
    exportPackage: (dirName: string) => invokeSync(IpcChannels.skillExport, dirName),
    importPackage: (payload: unknown) => invokeSync(IpcChannels.skillImport, payload),
    deleteByDir: (dirName: string) => invokeSync(IpcChannels.skillDelete, dirName),
  },
  // 能力核：上报当前窗口打开的项目，供外部调用的 A/B 路由（决定走渲染层网关还是磁盘网关）。
  capability: {
    setActiveProject: (projectId: string) => ipcRenderer.send(IpcChannels.capabilityActiveProject, projectId),
    // 「接入 AI 编程助手」卡：读状态/配置 + 一键写入/撤销 ~/.claude.json。
    mcpInfo: () => invokeSync(IpcChannels.capabilityMcpInfo),
    installMcp: (client?: string) => invokeSync(IpcChannels.capabilityMcpInstall, client),
    uninstallMcp: (client?: string) => invokeSync(IpcChannels.capabilityMcpUninstall, client),
    // 实连验证（异步）：真起一次配置里那条命令握手，用来分辨「配置里有这行字」和「还真连得上」。
    verifyMcp: (client?: string) => ipcRenderer.invoke(IpcChannels.capabilityMcpVerify, client),
    // A 模式实时桥：主进程把外部 MCP 的画布读/写/付费确认转发到这里，渲染层处理后回结果（按 id 配对）。
    onApply: (handler: (op: string, payload: unknown) => unknown | Promise<unknown>) => {
      const listener = (_event: unknown, message: { id?: number; op?: string; payload?: unknown }) => {
        const id = message?.id;
        void (async () => {
          try {
            const result = await handler(String(message?.op || ""), message?.payload);
            ipcRenderer.send(IpcChannels.capabilityApplyReply, { id, ok: true, result });
          } catch (error) {
            ipcRenderer.send(IpcChannels.capabilityApplyReply, {
              id,
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })();
      };
      ipcRenderer.on(IpcChannels.capabilityApply, listener);
      return () => ipcRenderer.removeListener(IpcChannels.capabilityApply, listener);
    },
  },
});
