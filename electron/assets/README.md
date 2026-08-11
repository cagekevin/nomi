# electron/assets

本地素材（图片/视频/文件）的落盘、缓存、路径与导入。

- `assetPaths.ts` / `assetFolders.ts`：素材路径与目录规则。
- `localAssetFile.ts` / `localFileImport.ts` / `downloadAsset.ts`：本地文件导入与下载落地。
- `assetBytes.ts` / `assetEvents.ts` / `assetsIpc.ts`：字节读取、事件、IPC。
- `autoSaveAsset.ts` / `localizedAsset.ts`：自动保存与本地化（如 lovart=inline-base64）。
- `downloadPrefs.ts` / `projectAssetStore.ts` / `projectCacheFile.ts`：下载偏好、项目素材存储、缓存文件。
- `mediaTypes.ts` / `videoImportNormalize.ts`：媒体类型识别与视频导入归一化。
- `assetLocalization.ts`：素材本地化策略（供应商维度）。

> 带图聊天链路见 `docs/09-带图聊天链路排查.md`；本地素材导入见 `docs/10-本地素材导入链路.md`。
