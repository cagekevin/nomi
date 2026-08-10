// 提示词库 IPC(仿 memory/memoryIpc.ts)。renderer 一次取全量(缓存),过滤/分页在渲染层做。
// public 库只读;user(我的库)用户级 CRUD(跨项目)。
import { ipcMain } from "electron";
import { getPromptLibrary } from "./promptLibraryStore";
import { addUserPrompt, deleteUserPrompt, listUserPrompts, updateUserPrompt } from "./userPromptStore";
import { IpcChannels } from "../shared/ipcChannels";

export function registerPromptLibraryIpc(): void {
  ipcMain.handle(IpcChannels.promptLibraryList, async () => {
    try {
      const prompts = await getPromptLibrary();
      return { ok: true, prompts };
    } catch (error) {
      return { ok: false, prompts: [], error: error instanceof Error ? error.message : String(error) };
    }
  });

  // —— 我的库(用户级) ——
  ipcMain.handle(IpcChannels.promptLibraryUserList, async () => {
    try {
      return { ok: true, prompts: listUserPrompts() };
    } catch (error) {
      return { ok: false, prompts: [], error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannels.promptLibraryUserAdd, async (_e, input: { title?: string; prompt: string; promptType: "image" | "video"; tags?: string[]; referenceImages?: { url: string; title?: string; sourceUrl?: string }[] }) => {
    try {
      addUserPrompt(input);
      return { ok: true, prompts: listUserPrompts() };
    } catch (error) {
      return { ok: false, prompts: listUserPrompts(), error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannels.promptLibraryUserUpdate, async (_e, payload: { id: string; patch: { title?: string; prompt?: string; promptType?: "image" | "video" } }) => {
    try {
      return { ok: true, prompts: updateUserPrompt(payload.id, payload.patch) };
    } catch (error) {
      return { ok: false, prompts: listUserPrompts(), error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannels.promptLibraryUserDelete, async (_e, payload: { id: string }) => {
    try {
      return { ok: true, prompts: deleteUserPrompt(payload.id) };
    } catch (error) {
      return { ok: false, prompts: listUserPrompts(), error: error instanceof Error ? error.message : String(error) };
    }
  });

  // 节点提示词优化用的文本大脑(vendor/modelKey,不含 apiKey)——渲染层据此走现成文本流式管线。
  ipcMain.handle(IpcChannels.promptLibraryTextBrain, async () => {
    const { resolveTextBrainKeys } = await import("../ai/agentChatV2");
    const brain = resolveTextBrainKeys();
    return { ok: Boolean(brain), brain };
  });
}
