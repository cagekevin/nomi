import { describe, expect, it } from 'vitest'

import { DEFAULT_AUTOMATION_POLICY_SETTINGS } from '../../../electron/settings/automationPolicySettings'
import { buildAutomationSettingsView, buildProviderHealthView } from './settingsAutomationView'

describe('settings automation view', () => {
  it('defaults to Balanced and exposes only known initiators', () => {
    const view = buildAutomationSettingsView(DEFAULT_AUTOMATION_POLICY_SETTINGS)

    expect(view.mode).toBe('balanced')
    expect(view.hosts).toEqual([
      { key: 'nomi', enabled: true, locked: true },
      { key: 'claude', enabled: true, locked: false },
      { key: 'codex', enabled: true, locked: false },
      { key: 'cursor', enabled: false, locked: false },
    ])
    expect(view.mandatoryGates).toEqual(['first-spend', 'irreversible'])
  })

  it('derives provider health from the real catalog state', () => {
    expect(buildProviderHealthView([
      { key: 'openai', name: 'OpenAI Compatible', enabled: true, authType: 'bearer', hasApiKey: true },
      { key: 'comfy', name: 'Local ComfyUI', enabled: true, authType: 'none' },
      { key: 'anthropic', name: 'Anthropic', enabled: true, authType: 'bearer', hasApiKey: false },
      { key: 'off', name: 'Disabled', enabled: false, authType: 'bearer', hasApiKey: true },
    ])).toEqual([
      { key: 'openai', name: 'OpenAI Compatible', state: 'connected' },
      { key: 'comfy', name: 'Local ComfyUI', state: 'local' },
      { key: 'anthropic', name: 'Anthropic', state: 'needs-key' },
      { key: 'off', name: 'Disabled', state: 'disabled' },
    ])
  })
})
