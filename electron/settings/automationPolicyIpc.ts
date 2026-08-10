import { ipcMain } from "electron";
import { IpcChannels } from "../shared/ipcChannels";

import {
  readAutomationPolicySettings,
  writeAutomationPolicySettings,
  type AutomationPolicySettings,
} from "./automationPolicySettings";

export type AutomationPolicySettingsStore = {
  read: () => AutomationPolicySettings;
  write: (value: unknown) => AutomationPolicySettings;
};

export function registerAutomationPolicyIpc(
  store: AutomationPolicySettingsStore = {
    read: readAutomationPolicySettings,
    write: writeAutomationPolicySettings,
  },
): void {
  ipcMain.handle(IpcChannels.settingsAutomationPolicyGet, async () => store.read());
  ipcMain.handle(IpcChannels.settingsAutomationPolicySet, async (_event, payload: unknown) => store.write(payload));
}
