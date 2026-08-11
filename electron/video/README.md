# electron/video

视频底层处理：抽帧、镜头检测、帧转视频。

- `extractVideoFrame.ts`：抽帧。
- `detectShotCuts.ts` / `buildFilmstripArgs.ts`：镜头检测与胶片条参数构建。
- `framesToVideo.ts` / `framesToVideoArgs.ts`：帧序列合成视频。
