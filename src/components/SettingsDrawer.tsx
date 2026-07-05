import { Bot, Eye, EyeOff, Folder, Globe, Palette, Pen, X } from 'lucide-react'
import { useState } from 'react'
import { useT } from '@/hooks/useT'
import { useEditorStore } from '@/stores/useEditorStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useUIStore } from '@/stores/useUIStore'

const ACCENT_COLORS = ['#c9a96e', '#e06c75', '#61afef', '#98c379', '#c678dd', '#d4a040', '#56b6c2']

/** Apply accent color to CSS custom property so the UI updates immediately. */
function applyAccentColor(color: string) {
  document.documentElement.style.setProperty('--accent-gold', color)
  // The soft variant: lighten by adjusting transparency
  document.documentElement.style.setProperty('--accent-gold-soft', color + 'cc')
}

export function SettingsDrawer() {
  const { settingsOpen, closeSettings } = useUIStore()
  const { settings, updateSetting } = useSettingsStore()
  const { t } = useT()
  const [showApiKey, setShowApiKey] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testTime, setTestTime] = useState(0)

  const handleTestConnection = async () => {
    setTestStatus('testing')
    const start = Date.now()
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: '回复"ok"即可' }],
          temperature: 0,
          max_tokens: 10,
        }),
      })
      const ms = Date.now() - start
      setTestTime(ms)
      setTestStatus(res.ok ? 'ok' : 'fail')
    } catch {
      setTestTime(Date.now() - start)
      setTestStatus('fail')
    }
  }

  if (!settingsOpen) return null

  const handleAccentChange = (color: string) => {
    updateSetting('accentColor', color)
    applyAccentColor(color)
  }

  const handleFontSizeChange = (size: number) => {
    const clamped = Math.max(14, Math.min(24, size))
    updateSetting('editorFontSize', clamped)
    useEditorStore.getState().setFontSize(clamped)
  }

  const handleFontFamilyChange = (family: string) => {
    updateSetting('editorFontFamily', family)
    useEditorStore.getState().setFontFamily(family)
  }

  const handleApiProviderChange = (provider: string) => {
    // 1. Save current API key to current provider's slot before switching
    const curProvider = detectProvider(settings.apiBaseUrl)
    const curApiKey = settings.apiKey
    if (curProvider === 'deepseek') updateSetting('apiKeyDeepseek', curApiKey)
    else if (curProvider === 'anthropic') updateSetting('apiKeyAnthropic', curApiKey)
    else if (curProvider === 'openai') updateSetting('apiKeyOpenai', curApiKey)

    // 2. Update base URL, model, and restore target provider's API key
    if (provider === 'deepseek') {
      updateSetting('apiBaseUrl', 'https://api.deepseek.com/v1')
      updateSetting('apiModel', 'deepseek-chat')
      updateSetting('apiKey', useSettingsStore.getState().settings.apiKeyDeepseek || '')
    } else if (provider === 'anthropic') {
      updateSetting('apiBaseUrl', 'https://api.anthropic.com')
      updateSetting('apiModel', 'claude-sonnet-5-20250715')
      updateSetting('apiKey', useSettingsStore.getState().settings.apiKeyAnthropic || '')
    } else if (provider === 'openai') {
      updateSetting('apiBaseUrl', 'https://api.openai.com/v1')
      updateSetting('apiModel', 'gpt-4o')
      updateSetting('apiKey', useSettingsStore.getState().settings.apiKeyOpenai || '')
    }
    // For 'custom': leave current apiBaseUrl/apiKey as-is so the user can type freely
    // ProviderModelSelect handles auto-correction of model if current model doesn't match
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[200]" onClick={closeSettings} />
      <div className="fixed top-0 right-0 bottom-0 w-[380px] bg-[var(--canvas-card)] border-l border-[var(--hairline-light)] z-[210] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--hairline)] shrink-0">
          <h2 className="font-display text-[22px] font-medium text-[var(--ink)]">{t('settings.title')}</h2>
          <button
            className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] border-none bg-none text-[var(--ink-tertiary)] text-xl cursor-pointer hover:bg-[var(--canvas-mid)] hover:text-[var(--ink)] transition-colors"
            onClick={closeSettings}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 custom-scrollbar">
          {/* ── UI Language ── */}
          <div className="mb-7 mt-5">
            <div className="text-[11px] font-medium text-[var(--ink-mute)] tracking-[0.06em] uppercase mb-3">
              <Globe className="w-3.5 h-3.5 inline-block mr-1" /> {t('settings.uiLanguage')}
            </div>
            <SettingRow label={t('settings.uiLanguage')} desc={t('settings.uiLanguageDesc')}>
              <div className="flex gap-1">
                <button
                  className={`px-3 py-[5px] rounded-[var(--radius-sm)] border border-[var(--hairline)] text-[13px] cursor-pointer transition-colors
                    ${settings.uiLanguage === 'zh' ? 'bg-[var(--accent-gold)] text-[var(--canvas)] border-[var(--accent-gold)] font-medium' : 'bg-[var(--canvas-elevated)] text-[var(--ink-secondary)] hover:bg-[var(--canvas-mid)]'}`}
                  onClick={() => updateSetting('uiLanguage', 'zh')}
                >
                  中文
                </button>
                <button
                  className={`px-3 py-[5px] rounded-[var(--radius-sm)] border border-[var(--hairline)] text-[13px] cursor-pointer transition-colors
                    ${settings.uiLanguage === 'en' ? 'bg-[var(--accent-gold)] text-[var(--canvas)] border-[var(--accent-gold)] font-medium' : 'bg-[var(--canvas-elevated)] text-[var(--ink-secondary)] hover:bg-[var(--canvas-mid)]'}`}
                  onClick={() => updateSetting('uiLanguage', 'en')}
                >
                  English
                </button>
              </div>
            </SettingRow>
          </div>

          {/* ── Theme ── */}
          <div className="mb-7">
            <div className="text-[11px] font-medium text-[var(--ink-mute)] tracking-[0.06em] uppercase mb-3">
              <Palette className="w-3.5 h-3.5 inline-block mr-1" /> {t('settings.theme')}
            </div>
            <div className="flex gap-3">
              {(['dark', 'light'] as const).map((themeVal) => (
                <div
                  key={themeVal}
                  className="text-center cursor-pointer"
                  onClick={() => {
                    updateSetting('theme', themeVal)
                    document.documentElement.setAttribute('data-theme', themeVal)
                  }}
                >
                  <div
                    className={`w-9 h-9 rounded-[var(--radius-sm)] border-2 transition-colors
                      ${settings.theme === themeVal ? 'border-[var(--accent-gold)]' : 'border-[var(--hairline)] hover:border-[var(--ink-mute)]'}`}
                    style={{ background: themeVal === 'dark' ? '#0e0e10' : '#f5f0e8' }}
                  />
                  <div className="text-[11px] text-[var(--ink-tertiary)] mt-1">
                    {themeVal === 'dark' ? t('settings.dark') : t('settings.light')}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Editor ── */}
          <div className="mb-7">
            <div className="text-[11px] font-medium text-[var(--ink-mute)] tracking-[0.06em] uppercase mb-3">
              <Pen className="w-3.5 h-3.5 inline-block mr-1" /> {t('settings.editor')}
            </div>
            <SettingRow label={t('settings.fontSize')} desc={t('settings.fontSizeDesc')}>
              <div className="flex items-center gap-2">
                <button
                  className="px-2.5 py-[3px] rounded-[var(--radius-sm)] border border-[var(--hairline)] bg-[var(--canvas-elevated)] text-[var(--ink-secondary)] text-[13px] cursor-pointer hover:bg-[var(--canvas-mid)]"
                  onClick={() => handleFontSizeChange(settings.editorFontSize - 1)}
                >
                  −
                </button>
                <input
                  type="number"
                  className="w-[60px] h-[30px] text-center bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-[var(--radius-sm)] text-[var(--ink)] text-[13px] outline-none focus:border-[var(--accent-gold)]"
                  value={settings.editorFontSize}
                  min={14}
                  max={24}
                  onChange={(e) => handleFontSizeChange(parseInt(e.target.value) || 17)}
                />
                <button
                  className="px-2.5 py-[3px] rounded-[var(--radius-sm)] border border-[var(--hairline)] bg-[var(--canvas-elevated)] text-[var(--ink-secondary)] text-[13px] cursor-pointer hover:bg-[var(--canvas-mid)]"
                  onClick={() => handleFontSizeChange(settings.editorFontSize + 1)}
                >
                  +
                </button>
                <span className="text-[11px] text-[var(--ink-mute)]">px</span>
              </div>
            </SettingRow>
            <SettingRow label={t('settings.autoSave')} desc={t('settings.autoSaveDesc')}>
              <button
                className={`w-9 h-5 rounded-full border-none cursor-pointer relative transition-colors shrink-0
                  ${settings.autoSaveInterval > 0 ? 'bg-[var(--accent-gold)]' : 'bg-[var(--canvas-mid)]'}`}
                onClick={() => updateSetting('autoSaveInterval', settings.autoSaveInterval > 0 ? 0 : 30)}
              >
                <span
                  className={`absolute top-[2px] left-[2px] w-4 h-4 rounded-full bg-[var(--ink)] transition-transform ${settings.autoSaveInterval > 0 ? 'translate-x-4' : ''}`}
                />
              </button>
            </SettingRow>
            <SettingRow label={t('settings.fontFamily')}>
              <select
                className="h-[30px] px-2.5 bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-[var(--radius-sm)] text-[var(--ink)] text-[13px] outline-none cursor-pointer focus:border-[var(--accent-gold)]"
                value={settings.editorFontFamily}
                onChange={(e) => handleFontFamilyChange(e.target.value)}
              >
                <option value="'Noto Serif SC', 'Source Han Serif SC', serif">思源宋体</option>
                <option value="'Noto Sans SC', 'Source Han Sans SC', sans-serif">思源黑体</option>
                <option value="Georgia, 'Noto Serif SC', serif">Georgia</option>
              </select>
            </SettingRow>
          </div>

          {/* ── Accent Color ── */}
          <div className="mb-7">
            <div className="text-[11px] font-medium text-[var(--ink-mute)] tracking-[0.06em] uppercase mb-3">
              🎨 {t('settings.accentColor')}
            </div>
            <div className="flex gap-2 flex-wrap mb-2">
              {ACCENT_COLORS.map((c) => (
                <div
                  key={c}
                  className={`w-[30px] h-[30px] rounded-full border-2 cursor-pointer transition-all hover:scale-110 shrink-0
                    ${settings.accentColor === c ? 'border-[var(--ink)] shadow-[0_0_0_1px_var(--canvas)]' : 'border-transparent'}`}
                  style={{ background: c }}
                  onClick={() => handleAccentChange(c)}
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[var(--ink-mute)]">{t('settings.customColor')}</span>
              <input
                type="color"
                className="w-8 h-7 p-0 border border-[var(--hairline)] rounded-[var(--radius-sm)] bg-none cursor-pointer"
                value={settings.accentColor}
                onChange={(e) => handleAccentChange(e.target.value)}
              />
            </div>
          </div>

          {/* ── AI Service ── */}
          <div className="mb-7">
            <div className="text-[11px] font-medium text-[var(--ink-mute)] tracking-[0.06em] uppercase mb-3">
              <Bot className="w-3.5 h-3.5 inline-block mr-1" /> {t('settings.aiService')}
            </div>
            <SettingRow label={t('settings.apiProvider')} desc={t('settings.apiBaseUrlDesc')}>
              <select
                className="h-[30px] px-2.5 bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-[var(--radius-sm)] text-[var(--ink)] text-[13px] outline-none cursor-pointer focus:border-[var(--accent-gold)]"
                value={
                  settings.apiBaseUrl.includes('deepseek')
                    ? 'deepseek'
                    : settings.apiBaseUrl.includes('openai')
                      ? 'openai'
                      : settings.apiBaseUrl === 'https://api.anthropic.com'
                        ? 'anthropic'
                        : 'custom'
                }
                onChange={(e) => handleApiProviderChange(e.target.value)}
              >
                <option value="deepseek">DeepSeek</option>
                <option value="anthropic">Anthropic Claude</option>
                <option value="openai">OpenAI Compatible</option>
                <option value="custom">{t('settings.apiBaseUrl')}</option>
              </select>
            </SettingRow>
            <SettingRow label={t('settings.apiBaseUrl')}>
              <input
                type="url"
                className="h-[30px] px-2 bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-[var(--radius-sm)] text-[var(--ink)] text-[12px] font-mono outline-none focus:border-[var(--accent-gold)] w-[200px]"
                value={settings.apiBaseUrl}
                onChange={(e) => updateSetting('apiBaseUrl', e.target.value)}
              />
            </SettingRow>
            <SettingRow label="API Key">
              <div className="flex gap-1 items-center">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  className="h-[30px] px-2 bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-[var(--radius-sm)] text-[var(--ink)] text-[12px] font-mono outline-none focus:border-[var(--accent-gold)] w-[180px]"
                  value={settings.apiKey}
                  onChange={(e) => {
                    const newKey = e.target.value
                    updateSetting('apiKey', newKey)
                    // Sync to per-provider slot so it's remembered when switching back
                    const prov = detectProvider(settings.apiBaseUrl)
                    if (prov === 'deepseek') updateSetting('apiKeyDeepseek', newKey)
                    else if (prov === 'anthropic') updateSetting('apiKeyAnthropic', newKey)
                    else if (prov === 'openai') updateSetting('apiKeyOpenai', newKey)
                  }}
                />
                <button
                  className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] border-none bg-none text-[var(--ink-tertiary)] cursor-pointer hover:text-[var(--ink)] transition-colors shrink-0"
                  onClick={() => setShowApiKey(!showApiKey)}
                  title={showApiKey ? '隐藏' : '显示'}
                >
                  {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </SettingRow>
            <ProviderModelSelect
              apiBaseUrl={settings.apiBaseUrl}
              apiModel={settings.apiModel}
              onChange={(m) => updateSetting('apiModel', m)}
            />
            <div className="pt-2.5 flex items-center gap-2.5">
              <button
                className="h-[30px] px-4 rounded-lg border border-[var(--hairline-light)] bg-[var(--canvas-elevated)] text-[var(--ink)] text-[13px] cursor-pointer transition-colors hover:bg-[var(--canvas-mid)] disabled:opacity-50"
                onClick={handleTestConnection}
                disabled={testStatus === 'testing'}
              >
                {testStatus === 'testing' ? '测试中...' : t('settings.testConnection')}
              </button>
              {testStatus === 'ok' && (
                <span className="text-[12px] text-[var(--success)]">连接成功 ({testTime}ms)</span>
              )}
              {testStatus === 'fail' && <span className="text-[12px] text-[var(--error)]">连接失败</span>}
            </div>
          </div>

          {/* ── Conversation Compression ── */}
          <div className="mb-7">
            <div className="text-[11px] font-medium text-[var(--ink-mute)] tracking-[0.06em] uppercase mb-3">
              <Bot className="w-3.5 h-3.5 inline-block mr-1" /> 对话压缩
            </div>
            <SettingRow label="自动压缩" desc="占用上下文比例过高时，AI 自动总结旧对话为摘要">
              <button
                className={`w-9 h-5 rounded-full border-none cursor-pointer relative transition-colors shrink-0
                  ${settings.compressionEnabled ? 'bg-[var(--accent-gold)]' : 'bg-[var(--canvas-mid)]'}`}
                onClick={() => updateSetting('compressionEnabled', !settings.compressionEnabled)}
              >
                <span
                  className={`absolute top-[2px] left-[2px] w-4 h-4 rounded-full bg-[var(--ink)] transition-transform ${settings.compressionEnabled ? 'translate-x-4' : ''}`}
                />
              </button>
            </SettingRow>
            <SettingRow label="触发阈值" desc={`历史对话占用上下文超过 ${settings.compressionThreshold}% 时触发压缩`}>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={20}
                  max={80}
                  value={settings.compressionThreshold}
                  onChange={(e) => updateSetting('compressionThreshold', parseInt(e.target.value))}
                  className="w-[100px] accent-[var(--accent-gold)]"
                />
                <span className="text-[12px] text-[var(--ink)] font-mono w-[36px]">
                  {settings.compressionThreshold}%
                </span>
              </div>
            </SettingRow>
            <SettingRow label="压缩目标" desc={`压缩后历史对话占比降至 ${settings.compressionTarget}%`}>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={10}
                  max={50}
                  value={settings.compressionTarget}
                  onChange={(e) => updateSetting('compressionTarget', parseInt(e.target.value))}
                  className="w-[100px] accent-[var(--accent-gold)]"
                />
                <span className="text-[12px] text-[var(--ink)] font-mono w-[36px]">{settings.compressionTarget}%</span>
              </div>
            </SettingRow>
          </div>

          {/* ── Project ── */}
          <div className="mb-7">
            <div className="text-[11px] font-medium text-[var(--ink-mute)] tracking-[0.06em] uppercase mb-3">
              <Folder className="w-3.5 h-3.5 inline-block mr-1" /> {t('settings.project')}
            </div>
            <SettingRow label={t('settings.autoBackup')} desc={t('settings.autoBackupDesc')}>
              <button
                className={`w-9 h-5 rounded-full border-none cursor-pointer relative transition-colors shrink-0
                  ${settings.backupEnabled ? 'bg-[var(--accent-gold)]' : 'bg-[var(--canvas-mid)]'}`}
                onClick={() => updateSetting('backupEnabled', !settings.backupEnabled)}
              >
                <span
                  className={`absolute top-[2px] left-[2px] w-4 h-4 rounded-full bg-[var(--ink)] transition-transform ${settings.backupEnabled ? 'translate-x-4' : ''}`}
                />
              </button>
            </SettingRow>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--hairline)] flex items-center shrink-0">
          <span className="text-[11px] text-[var(--ink-mute)] flex-1">{t('settings.footer')}</span>
          <button
            className="h-[34px] px-5 rounded-lg border-none bg-[var(--accent-gold)] text-[var(--canvas)] font-medium text-[13px] cursor-pointer transition-colors hover:bg-[var(--accent-gold-soft)]"
            onClick={closeSettings}
          >
            {t('settings.done')}
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Provider-linked model selector ───
const PROVIDER_MODELS: Record<string, { label: string; options: { value: string; label: string }[] }> = {
  deepseek: {
    label: 'DeepSeek',
    options: [
      { value: 'deepseek-v4-flash', label: 'DeepSeek v4 Flash' },
      { value: 'deepseek-v4-pro', label: 'DeepSeek v4 Pro' },
    ],
  },
  anthropic: {
    label: 'Anthropic Claude',
    options: [
      { value: 'claude-sonnet-5-20250715', label: 'Claude Sonnet 5' },
      { value: 'claude-opus-4-8-20250715', label: 'Claude Opus 4.8' },
      { value: 'claude-haiku-4-5-20250715', label: 'Claude Haiku 4.5' },
      { value: 'claude-fable-5', label: 'Claude Fable 5' },
    ],
  },
  openai: {
    label: 'OpenAI Compatible',
    options: [
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'o3-mini', label: 'o3 Mini' },
    ],
  },
}

function detectProvider(apiBaseUrl: string): string {
  if (apiBaseUrl.includes('deepseek')) return 'deepseek'
  if (apiBaseUrl.includes('openai')) return 'openai'
  if (apiBaseUrl.includes('anthropic')) return 'anthropic'
  return 'custom'
}

function ProviderModelSelect({
  apiBaseUrl,
  apiModel,
  onChange,
}: {
  apiBaseUrl: string
  apiModel: string
  onChange: (m: string) => void
}) {
  const provider = detectProvider(apiBaseUrl)
  const models = PROVIDER_MODELS[provider]

  if (provider === 'custom') {
    return (
      <SettingRow label="模型">
        <div className="flex gap-1.5 items-center">
          <input
            type="text"
            className="h-[30px] px-2 bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-[var(--radius-sm)] text-[var(--ink)] text-[12px] font-mono outline-none focus:border-[var(--accent-gold)] w-[160px]"
            value={apiModel}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      </SettingRow>
    )
  }

  // Ensure current model is within the provider's model list; fallback to first option
  const validValues = models.options.map((o) => o.value)
  const currentValue = validValues.includes(apiModel) ? apiModel : models.options[0].value
  if (currentValue !== apiModel) {
    // schedule the correction; do it async to avoid render-side effects
    queueMicrotask(() => onChange(currentValue))
  }

  return (
    <SettingRow label="模型">
      <div className="flex gap-1.5 items-center">
        <select
          className="h-[30px] px-2.5 bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-[var(--radius-sm)] text-[var(--ink)] text-[13px] outline-none cursor-pointer focus:border-[var(--accent-gold)] w-[160px]"
          value={currentValue}
          onChange={(e) => onChange(e.target.value)}
        >
          {models.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </SettingRow>
  )
}

function SettingRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-t border-[var(--hairline)] first:border-t-0">
      <div className="flex-1">
        <div className="text-[13px] text-[var(--ink)]">{label}</div>
        {desc && <div className="text-[12px] text-[var(--ink-tertiary)] mt-0.5">{desc}</div>}
      </div>
      {children}
    </div>
  )
}
