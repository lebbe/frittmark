import { CFG } from './config'

type CfgKey = keyof typeof CFG
type CfgOverrides = Partial<Record<CfgKey, number>>

type ConfigModalOptions = {
  onRestart: () => void
}

const CFG_STORAGE_KEY = 'frittmark.config.overrides.v1'
const CFG_DEFAULTS = Object.freeze({ ...CFG }) as Record<CfgKey, number>

export const CONFIG_MODAL_HTML = `
<div id="config-modal">
  <div id="config-modal-box">
    <div id="config-modal-head">
      <span id="cfg-title">RUN CONFIG</span>
      <button id="config-modal-close">✕</button>
    </div>
    <div id="config-modal-body">
      <p id="cfg-note">Tune values, then save. Changes are applied when you restart the simulation.</p>
      <div id="cfg-grid"></div>
      <div id="cfg-actions">
        <button class="btn" id="cfg-reset-defaults">Reset Defaults</button>
        <button class="btn" id="cfg-save">Save Overrides</button>
        <button class="btn on" id="cfg-save-restart">Save + Restart</button>
      </div>
    </div>
  </div>
</div>
`

function formatCfgLabel(key: CfgKey): string {
  return key
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

function cfgInputStep(defaultValue: number): string {
  return Number.isInteger(defaultValue) ? '1' : '0.001'
}

function readCfgOverrides(): CfgOverrides {
  try {
    const raw = window.localStorage.getItem(CFG_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const result: CfgOverrides = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (!(k in CFG_DEFAULTS)) continue
      if (typeof v !== 'number' || !Number.isFinite(v)) continue
      result[k as CfgKey] = v
    }
    return result
  } catch {
    return {}
  }
}

function writeCfgOverrides(overrides: CfgOverrides): void {
  window.localStorage.setItem(CFG_STORAGE_KEY, JSON.stringify(overrides))
}

function applyCfgOverrides(overrides: CfgOverrides): void {
  for (const key of Object.keys(CFG_DEFAULTS) as CfgKey[]) {
    const nextValue = overrides[key] ?? CFG_DEFAULTS[key]
    if (Number.isFinite(nextValue)) CFG[key] = Math.max(0, nextValue)
  }
}

function collectOverridesFromInputs(): CfgOverrides {
  const overrides: CfgOverrides = {}
  const host = document.getElementById('cfg-grid')
  if (!host) return overrides
  const inputs = host.querySelectorAll<HTMLInputElement>('input[data-cfg-key]')
  for (const input of inputs) {
    const key = input.dataset.cfgKey as CfgKey | undefined
    if (!key || !(key in CFG_DEFAULTS)) continue
    const parsed = Number(input.value)
    if (!Number.isFinite(parsed)) {
      input.value = String(CFG[key])
      continue
    }
    const safe = Math.max(0, parsed)
    input.value = String(safe)
    if (safe !== CFG_DEFAULTS[key]) overrides[key] = safe
  }
  return overrides
}

function renderCfgInputs(): void {
  const host = document.getElementById('cfg-grid')
  if (!host) throw new Error('Missing #cfg-grid')
  host.innerHTML = ''

  for (const key of Object.keys(CFG_DEFAULTS) as CfgKey[]) {
    const row = document.createElement('label')
    row.className = 'cfg-row'
    const currentValue = CFG[key]
    const defaultValue = CFG_DEFAULTS[key]
    row.innerHTML = `
      <span class="cfg-key">${formatCfgLabel(key)}</span>
      <input
        class="cfg-input"
        type="number"
        min="0"
        step="${cfgInputStep(defaultValue)}"
        data-cfg-key="${key}"
        value="${currentValue}"
      >
      <span class="cfg-default">default ${defaultValue}</span>
    `
    host.appendChild(row)
  }
}

export function applyPersistedCfgOverrides(): void {
  applyCfgOverrides(readCfgOverrides())
}

export function initConfigModal(options: ConfigModalOptions): void {
  const btnConfig = document.getElementById('btn-config')
  const configModal = document.getElementById('config-modal')
  const configModalClose = document.getElementById('config-modal-close')
  const cfgResetDefaults = document.getElementById('cfg-reset-defaults')
  const cfgSave = document.getElementById('cfg-save')
  const cfgSaveRestart = document.getElementById('cfg-save-restart')

  if (
    !btnConfig ||
    !configModal ||
    !configModalClose ||
    !cfgResetDefaults ||
    !cfgSave ||
    !cfgSaveRestart
  ) {
    throw new Error('Missing run config controls')
  }

  const closeConfigModal = (): void => {
    configModal.style.display = 'none'
  }

  const openConfigModal = (): void => {
    renderCfgInputs()
    configModal.style.display = 'flex'
  }

  const saveOverrides = (restartAfterSave: boolean): void => {
    const overrides = collectOverridesFromInputs()
    writeCfgOverrides(overrides)
    applyCfgOverrides(overrides)
    renderCfgInputs()
    if (restartAfterSave) {
      closeConfigModal()
      options.onRestart()
    }
  }

  btnConfig.addEventListener('click', openConfigModal)
  configModalClose.addEventListener('click', closeConfigModal)
  configModal.addEventListener('click', (e) => {
    if (e.target === configModal) closeConfigModal()
  })

  cfgResetDefaults.addEventListener('click', () => {
    applyCfgOverrides({})
    writeCfgOverrides({})
    renderCfgInputs()
  })
  cfgSave.addEventListener('click', () => saveOverrides(false))
  cfgSaveRestart.addEventListener('click', () => saveOverrides(true))
}
