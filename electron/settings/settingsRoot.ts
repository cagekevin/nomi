import { app } from "electron";

/** 评测/测试隔离：覆盖固定设置根，防临时项目污染真实 userData。 */
export const SETTINGS_ROOT_ENV = "NOMI_SETTINGS_DIR";

/**
 * 应用设置的固定根目录。它不能依赖可自定义的项目位置，否则项目位置设置会形成自举环。
 */
export function getSettingsRoot(): string {
  const configured = String(process.env[SETTINGS_ROOT_ENV] || "").trim();
  return configured || app.getPath("userData");
}
