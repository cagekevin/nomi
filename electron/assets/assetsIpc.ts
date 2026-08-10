// 素材域 IPC 注册器（2026-07-22 素材面收敛时从 main.ts 抽出,R9 巨壳门岗）：
// 文件夹读写 + 本地文件导入 + 素材下载 + 自动另存/设置（集中设置页「文件与保存」）。
import { dialog, ipcMain } from "electron";
import { getAutoSavePrefs, setAutoSavePrefs, type AutoSavePrefs } from "./downloadPrefs";
import { IpcChannels } from "../shared/ipcChannels";

export function registerAssetsIpc(): void {
  ipcMain.handle(IpcChannels.assetsFoldersGet, async (_event, payload) => {
    const { getAssetFolders } = await import("./assetFolders");
    return getAssetFolders(payload);
  });
  ipcMain.handle(IpcChannels.assetsFoldersSave, async (_event, payload) => {
    const { saveAssetFolders } = await import("./assetFolders");
    return saveAssetFolders(payload);
  });
  ipcMain.handle(IpcChannels.assetsImportFile, async (_event, payload) => {
    const { importLocalFile } = await import("./localFileImport");
    return importLocalFile(payload);
  });
  ipcMain.handle(IpcChannels.assetsEnsurePlayable, async (_event, payload) => {
    const { ensurePlayableAsset } = await import("./localFileImport");
    return ensurePlayableAsset(payload);
  });
  // 引导示例项目的预置成图 → 真项目资产（拿稳定 nomi-local URL；构建产物 URL 不配写进用户数据）。
  ipcMain.handle(IpcChannels.assetsSeedOnboardingDemo, async (_event, payload) => {
    const { seedOnboardingDemoAssets } = await import("../onboarding/demoAssetSeed");
    return seedOnboardingDemoAssets(payload);
  });
  ipcMain.handle(IpcChannels.assetsDownload, async (_event, payload) => {
    const { downloadAssetToDisk } = await import("./downloadAsset");
    return downloadAssetToDisk(payload);
  });
  // 自动另存：生成完成时渲染层调这里，把生成物静默复制一份到用户目录（best-effort，关/失败不打断生成）。
  ipcMain.handle(IpcChannels.assetsAutoSave, async (_event, payload) => {
    const { autoSaveAssetToDisk } = await import("./autoSaveAsset");
    const p = (payload || {}) as { url?: unknown; suggestedName?: unknown };
    return autoSaveAssetToDisk(String(p.url || ""), String(p.suggestedName || ""));
  });
  // 集中设置页「文件与保存」：读/写自动另存开关+目录、选目录。
  ipcMain.handle(IpcChannels.settingsAutoSaveGet, () => getAutoSavePrefs());
  ipcMain.handle(IpcChannels.settingsAutoSaveSet, (_event, payload) => {
    const p = (payload || {}) as Partial<AutoSavePrefs>;
    setAutoSavePrefs({ enabled: Boolean(p.enabled), dir: String(p.dir || "") });
    return getAutoSavePrefs();
  });
  ipcMain.handle(IpcChannels.settingsPickDir, async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
    return { dir: result.canceled || !result.filePaths[0] ? "" : result.filePaths[0] };
  });
}
