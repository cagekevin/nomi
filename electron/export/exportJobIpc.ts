import { ipcMain, webContents as electronWebContents } from "electron";
import type { WebContents } from "electron";
import { EventChannels, IpcChannels } from "../shared/ipcChannels";

const exportJobEventSubscriptions = new Map<number, () => void>();
let exportJobsPromise: Promise<typeof import("./exportJobs")> | null = null;

function loadExportJobs(): Promise<typeof import("./exportJobs")> {
  exportJobsPromise ??= import("./exportJobs");
  return exportJobsPromise;
}

export function registerExportJobIpc(): void {
  ipcMain.handle(IpcChannels.exportsStartJob, async (event, payload) => {
    const jobs = await loadExportJobs();
    await registerExportJobEventForwarding(event.sender);
    return jobs.startExportJob(payload);
  });
  ipcMain.handle(IpcChannels.exportsWriteTempInput, async (event, payload) => {
    const jobs = await loadExportJobs();
    await registerExportJobEventForwarding(event.sender);
    return jobs.writeExportTempInput(payload);
  });
  ipcMain.handle(IpcChannels.exportsFinishTempInput, async (event, payload) => {
    const jobs = await loadExportJobs();
    await registerExportJobEventForwarding(event.sender);
    return jobs.finishExportTempInput(payload);
  });
  ipcMain.handle(IpcChannels.exportsStatus, async (event, jobId) => {
    const jobs = await loadExportJobs();
    await registerExportJobEventForwarding(event.sender);
    return jobs.getExportJobStatus(jobId);
  });
  ipcMain.handle(IpcChannels.exportsCancel, async (event, jobId) => {
    const jobs = await loadExportJobs();
    await registerExportJobEventForwarding(event.sender);
    return jobs.cancelExportJob(jobId);
  });
  ipcMain.handle(IpcChannels.exportsShowInFolder, async (_event, payload) => {
    const { showExportInFolder } = await loadExportJobs();
    return showExportInFolder(payload);
  });
}

export async function registerExportJobEventForwarding(contents: WebContents): Promise<void> {
  if (exportJobEventSubscriptions.has(contents.id)) return;
  const { subscribeExportJobEvents } = await loadExportJobs();
  const unsubscribe = subscribeExportJobEvents((payload) => {
    const target = electronWebContents.fromId(contents.id);
    if (!target || target.isDestroyed()) return;
    target.send(EventChannels.exportsEvent, payload);
  });
  exportJobEventSubscriptions.set(contents.id, unsubscribe);
  contents.once("destroyed", () => {
    exportJobEventSubscriptions.get(contents.id)?.();
    exportJobEventSubscriptions.delete(contents.id);
  });
}
