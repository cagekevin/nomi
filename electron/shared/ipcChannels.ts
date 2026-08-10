/**
 * Nomi IPC channel 单一真相源（R?：跨层通信解耦 · 改造 A）
 *
 * 目标：让 IPC channel 名从「四层散落的裸字符串」收敛为单一常量表。
 * - 注册层（electron/main.ts / 各子模块 *Ipc.ts 的 ipcMain.handle/on）
 * - 暴露层（electron/preload.ts 的 ipcRenderer.invoke/send/sendSync/on）
 * 都引用同一常量，杜绝「改名要手工翻多层、拼错编译器不查」。
 *
 * 命名纪律：`<域>:<动作>`（如 `projects:read`）。事件类 channel 统一走
 * `EventChannels`（单向推送，对应 webContents.send / ipcRenderer.on）。
 *
 * 维护：新增 channel 时在此表加一行 + 对应注册/暴露处引用常量（P1 加新删旧，
 * 不得在业务代码里另写裸字符串）。
 */
export const IpcChannels = {
  // ── app / 窗口 / 生命周期 ──────────────────────────────────────────────
  appVersion: "nomi:app:version",
  appReopenLibraryWindow: "nomi:app:reopen-library-window",
  appHardReloadWindow: "nomi:app:hard-reload-window",
  logRendererCrash: "nomi:log:renderer-crash",

  windowMinimize: "nomi:window:minimize",
  windowMaximize: "nomi:window:maximize",
  windowClose: "nomi:window:close",
  // window:close-request / window:maximized / canvas:zoom-shortcut 为单向事件，见 EventChannels。
  windowCloseResponse: "nomi:window:close-response",

  // ── i18n ────────────────────────────────────────────────────────────────
  i18nSetLocale: "nomi:i18n:set-locale",
  i18nGetSystemLocale: "nomi:i18n:get-system-locale",

  // ── projects ────────────────────────────────────────────────────────────
  projectsList: "nomi:projects:list",
  projectsListAsync: "nomi:projects:list-async",
  projectsCreate: "nomi:projects:create",
  projectsRead: "nomi:projects:read",
  projectsReadAsync: "nomi:projects:read-async",
  projectsDiagnose: "nomi:projects:diagnose",
  projectsRecover: "nomi:projects:recover",
  projectsSave: "nomi:projects:save",
  projectsSaveAsync: "nomi:projects:save-async",
  projectsDelete: "nomi:projects:delete",

  // ── workspace ───────────────────────────────────────────────────────────
  workspaceSelectFolder: "nomi:workspace:select-folder",
  workspaceOpenFolder: "nomi:workspace:open-folder",
  workspaceListFiles: "nomi:workspace:list-files",
  workspaceRevealFile: "nomi:workspace:reveal-file",
  workspaceRevealProjectFolder: "nomi:workspace:reveal-project-folder",
  workspaceDeleteFiles: "nomi:workspace:delete-files",

  // ── model-catalog ───────────────────────────────────────────────────────
  modelCatalogVendorsList: "nomi:model-catalog:vendors:list",
  modelCatalogModelsList: "nomi:model-catalog:models:list",
  modelCatalogMappingsList: "nomi:model-catalog:mappings:list",
  modelCatalogHealth: "nomi:model-catalog:health",
  modelCatalogVendorUpsert: "nomi:model-catalog:vendor:upsert",
  modelCatalogVendorDelete: "nomi:model-catalog:vendor:delete",
  modelCatalogVendorApiKeyUpsert: "nomi:model-catalog:vendor-api-key:upsert",
  modelCatalogVendorApiKeyClear: "nomi:model-catalog:vendor-api-key:clear",
  modelCatalogModelUpsert: "nomi:model-catalog:model:upsert",
  modelCatalogModelDelete: "nomi:model-catalog:model:delete",
  modelCatalogModelsDelete: "nomi:model-catalog:models:delete",
  modelCatalogMappingUpsert: "nomi:model-catalog:mapping:upsert",
  modelCatalogMappingDelete: "nomi:model-catalog:mapping:delete",
  modelCatalogMappingTest: "nomi:model-catalog:mapping:test",
  modelCatalogExport: "nomi:model-catalog:export",
  modelCatalogImport: "nomi:model-catalog:import",
  modelCatalogDocsFetch: "nomi:model-catalog:docs:fetch",
  modelCatalogComfyuiProbe: "nomi:model-catalog:comfyui:probe",
  modelCatalogComfyuiAnalyzeWorkflow: "nomi:model-catalog:comfyui:analyze-workflow",
  modelCatalogComfyuiAnalyzeWorkflowSmart: "nomi:model-catalog:comfyui:analyze-workflow-smart",
  modelCatalogComfyuiReconcileWorkflow: "nomi:model-catalog:comfyui:reconcile-workflow",
  modelCatalogComfyuiImportWorkflow: "nomi:model-catalog:comfyui:import-workflow",
  modelCatalogComfyuiUpdateWorkflow: "nomi:model-catalog:comfyui:update-workflow",
  modelCatalogComfyuiPresets: "nomi:model-catalog:comfyui:presets",
  modelCatalogComfyuiTemplates: "nomi:model-catalog:comfyui:templates",
  modelCatalogComfyuiTemplateDetail: "nomi:model-catalog:comfyui:template-detail",

  // ── 自定义调用 / skill / dreamina ────────────────────────────────────────
  customCallContract: "nomi:model-catalog:custom-call:contract",
  customCallAiInstruction: "nomi:model-catalog:custom-call:ai-instruction",
  customCallTestRun: "nomi:model-catalog:custom-call:test-run",
  skillList: "nomi:skill:list",
  skillExport: "nomi:skill:export",
  skillImport: "nomi:skill:import",
  skillDelete: "nomi:skill:delete",
  dreaminaStatus: "nomi:dreamina:status",
  dreaminaLoginStart: "nomi:dreamina:login-start",
  dreaminaLoginPoll: "nomi:dreamina:login-poll",
  dreaminaLogout: "nomi:dreamina:logout",
  dreaminaInstall: "nomi:dreamina:install",

  // ── assets / media ──────────────────────────────────────────────────────
  assetsList: "nomi:assets:list",
  assetsImportRemoteUrl: "nomi:assets:import-remote-url",
  assetsImportFile: "nomi:assets:import-file",
  assetsDownload: "nomi:assets:download",
  assetsAutoSave: "nomi:assets:auto-save",
  assetsFoldersGet: "nomi:assets:folders-get",
  assetsFoldersSave: "nomi:assets:folders-save",
  assetsEnsurePlayable: "nomi:assets:ensure-playable",
  assetsSeedOnboardingDemo: "nomi:assets:seed-onboarding-demo",
  videoExtractFrame: "nomi:video:extract-frame",
  videoExtractFilmstrip: "nomi:video:extract-filmstrip",
  videoDetectShotCuts: "nomi:video:detect-shot-cuts",
  imageDecomposeLayers: "nomi:image:decompose-layers",
  scene3dFramesToVideo: "nomi:scene3d:frames-to-video",

  // ── screenshot ──────────────────────────────────────────────────────────
  screenshotGet: "nomi:screenshot:get",
  screenshotSet: "nomi:screenshot:set",
  screenshotOpenPermissionSettings: "nomi:screenshot:open-permission-settings",
  screenshotSetProject: "nomi:screenshot:set-project",
  screenshotE2eCapture: "nomi:screenshot:e2e-capture",

  // ── tasks ───────────────────────────────────────────────────────────────
  tasksGrantSpend: "nomi:tasks:grant-spend",
  tasksRun: "nomi:tasks:run",
  tasksResult: "nomi:tasks:result",
  tasksTextStream: "nomi:tasks:text:stream",
  tasksTextCancel: "nomi:tasks:text:cancel",
  tasksComfyuiWatch: "nomi:tasks:comfyui:watch",
  tasksComfyuiUnwatch: "nomi:tasks:comfyui:unwatch",
  tasksComfyuiInterrupt: "nomi:tasks:comfyui:interrupt",
  // tasks:comfyui:progress / tasks:text:event 为单向事件，见 EventChannels。

  // ── capability / MCP ────────────────────────────────────────────────────
  capabilityActiveProject: "nomi:capability:active-project",
  capabilityMcpInfo: "nomi:capability:mcp-info",
  capabilityMcpInstall: "nomi:capability:mcp-install",
  capabilityMcpUninstall: "nomi:capability:mcp-uninstall",
  capabilityMcpVerify: "nomi:capability:mcp-verify",
  capabilityApply: "nomi:capability:apply",
  capabilityApplyReply: "nomi:capability:apply-reply",

  // ── agent chat / text stream ────────────────────────────────────────────
  agentsChat: "nomi:agents:chat",
  agentsChatV2Start: "nomi:agents:chatV2:start",
  agentsChatV2ConfirmTool: "nomi:agents:chatV2:confirmTool",
  agentsChatV2Cancel: "nomi:agents:chatV2:cancel",
  agentsChatV2ClearSession: "nomi:agents:chatV2:clearSession",
  agentsChatV2SeedSession: "nomi:agents:chatV2:seedSession",
  agentsChatV2SessionAlive: "nomi:agents:chatV2:sessionAlive",
  // agents:chatV2:event 为单向事件（后端推送 → 前端 on），见 EventChannels。

  // ── conversations / events / memory / prompt-library ─────────────────────
  conversationsRead: "nomi:conversations:read",
  conversationsWrite: "nomi:conversations:write",
  eventsAppend: "nomi:events:append",
  eventsRead: "nomi:events:read",
  memoryGet: "nomi:memory:get",
  memoryAdd: "nomi:memory:add",
  memoryUpdate: "nomi:memory:update",
  memoryRemove: "nomi:memory:remove",
  promptLibraryList: "nomi:prompt-library:list",
  promptLibraryTextBrain: "nomi:prompt-library:text-brain",
  promptLibraryUserList: "nomi:prompt-library:user-list",
  promptLibraryUserAdd: "nomi:prompt-library:user-add",
  promptLibraryUserUpdate: "nomi:prompt-library:user-update",
  promptLibraryUserDelete: "nomi:prompt-library:user-delete",

  // ── notifications / browser ─────────────────────────────────────────────
  notificationsShow: "nomi:notifications:show",

  // ── exports / production runs ───────────────────────────────────────────
  exportsStartJob: "nomi:exports:start-job",
  exportsWriteTempInput: "nomi:exports:write-temp-input",
  exportsFinishTempInput: "nomi:exports:finish-temp-input",
  exportsStatus: "nomi:exports:status",
  exportsCancel: "nomi:exports:cancel",
  exportsShowInFolder: "nomi:exports:show-in-folder",
  // exports:event 为单向事件，见 EventChannels。
  productionRunsList: "nomi:production-runs:list",
  productionRunsRead: "nomi:production-runs:read",
  productionRunsCreateDraft: "nomi:production-runs:create-draft",
  productionRunsCommand: "nomi:production-runs:command",
  productionRunsEvents: "nomi:production-runs:events",

  // ── onboarding / provider-adapter ───────────────────────────────────────
  onboardingListModels: "nomi:onboarding:list-models",
  onboardingTestConnection: "nomi:onboarding:test-connection",
  onboardingGuessKinds: "nomi:onboarding:guess-kinds",
  onboardingManualCommit: "nomi:onboarding:manual-commit",
  providerAdapterGet: "nomi:provider-adapter:get",
  providerAdapterLatest: "nomi:provider-adapter:latest",
  providerAdapterStart: "nomi:provider-adapter:start",

  // ── proxy / settings ────────────────────────────────────────────────────
  proxyGet: "nomi:proxy:get",
  proxySet: "nomi:proxy:set",
  proxyTest: "nomi:proxy:test",
  settingsProjectLocationGet: "nomi:settings:project-location-get",
  settingsProjectLocationPick: "nomi:settings:project-location-pick",
  settingsProjectLocationReset: "nomi:settings:project-location-reset",
  settingsProjectLocationReveal: "nomi:settings:project-location-reveal",
  settingsAutomationPolicyGet: "nomi:settings:automation-policy-get",
  settingsAutomationPolicySet: "nomi:settings:automation-policy-set",
  settingsAutoSaveGet: "nomi:settings:auto-save-get",
  settingsAutoSaveSet: "nomi:settings:auto-save-set",
  settingsPickDir: "nomi:settings:pick-dir",

  // ── update ──────────────────────────────────────────────────────────────
  updateCheck: "nomi:update:check",
  updateDownload: "nomi:update:download",
  updateInstall: "nomi:update:install",
  updateOpenRelease: "nomi:update:open-release",
} as const;

/**
 * 单向事件 channel（后端 webContents.send → 前端 ipcRenderer.on）。
 * 统一走这里，避免散落裸字符串 + 前端逐个 ipcRenderer.on 手工对齐。
 */
export const EventChannels = {
  assetsUpdated: "nomi:assets:updated",
  windowCloseRequest: "nomi:window:close-request",
  windowMaximized: "nomi:window:maximized",
  canvasZoomShortcut: "nomi:canvas:zoom-shortcut",
  screenshotCaptured: "nomi:screenshot:captured",
  screenshotDenied: "nomi:screenshot:denied",
  screenshotFailed: "nomi:screenshot:failed",
  exportsEvent: "nomi:exports:event",
  tasksComfyuiProgress: "nomi:tasks:comfyui:progress",
  tasksTextEvent: "nomi:tasks:text:event",
  reviewEvent: "nomi:review:event",
  productionDeepLink: "nomi:production-deep-link",
  updateEvent: "nomi:update:event",
  agentsChatV2Event: "nomi:agents:chatV2:event",
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];
export type EventChannel = (typeof EventChannels)[keyof typeof EventChannels];
