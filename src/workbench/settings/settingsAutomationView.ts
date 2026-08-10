import {
  DEFAULT_AUTOMATION_POLICY_SETTINGS,
  type AutomationPolicySettings,
} from '../../../electron/settings/automationPolicyContract'

export type SettingsHostKey = 'nomi' | 'claude' | 'codex' | 'cursor'
export type ProviderHealthState = 'connected' | 'local' | 'needs-key' | 'disabled'

export type SettingsProviderInput = {
  key: string
  name: string
  enabled: boolean
  authType?: string
  hasApiKey?: boolean
}

const HOSTS: SettingsHostKey[] = ['nomi', 'claude', 'codex', 'cursor']

export function defaultAutomationPolicySettings(): AutomationPolicySettings {
  return {
    ...DEFAULT_AUTOMATION_POLICY_SETTINGS,
    trustedHosts: [...DEFAULT_AUTOMATION_POLICY_SETTINGS.trustedHosts],
    allowedProviders: [],
    allowedModels: [],
  }
}

export function buildAutomationSettingsView(settings: AutomationPolicySettings) {
  return {
    mode: settings.mode,
    hosts: HOSTS.map((key) => ({
      key,
      enabled: key === 'nomi' || settings.trustedHosts.includes(key),
      locked: key === 'nomi',
    })),
    mandatoryGates: ['first-spend', 'irreversible'] as const,
  }
}

export function buildProviderHealthView(providers: SettingsProviderInput[]) {
  return providers.map((provider) => {
    let state: ProviderHealthState = 'disabled'
    if (provider.enabled && provider.authType === 'none') state = 'local'
    else if (provider.enabled && provider.hasApiKey) state = 'connected'
    else if (provider.enabled) state = 'needs-key'
    return { key: provider.key, name: provider.name, state }
  })
}
