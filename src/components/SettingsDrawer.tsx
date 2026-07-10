import { Bot, Download, Eye, EyeOff, Globe, Palette, Pen, RotateCw, SwatchBook, X, Zap } from 'lucide-react'
import { useState } from 'react'
import { useT } from '@/hooks/useT'
import { refreshAllData } from '@/lib/dataEvents'
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
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'upToDate' | 'available' | 'error'>('idle')
  const [latestVersion, setLatestVersion] = useState('')
  const [releaseUrl, setReleaseUrl] = useState('')

  const checkForUpdates = async () => {
    setUpdateStatus('checking')
    try {
      const res = await fetch('https://api.github.com/repos/niyongsheng/mythpen/releases/latest')
      if (!res.ok) {
        setUpdateStatus('error')
        return
      }
      const data = await res.json()
      const latestTag = (data.tag_name || '').replace(/^v/, '')
      setLatestVersion(latestTag)
      setReleaseUrl(data.html_url || `https://github.com/niyongsheng/mythpen/releases/tag/${data.tag_name}`)
      setUpdateStatus(compareVersions(latestTag, __APP_VERSION__) > 0 ? 'available' : 'upToDate')
    } catch {
      setUpdateStatus('error')
    }
  }

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
            <SettingRow
              label={t('settings.autoSave')}
              desc={
                settings.autoSaveInterval > 0
                  ? t('settings.autoSaveEnabled', { seconds: settings.autoSaveInterval })
                  : t('settings.autoSaveDisabled')
              }
            >
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
              <SwatchBook className="w-3.5 h-3.5 inline-block mr-1" /> {t('settings.accentColor')}
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
            <SettingRow label={t('settings.apiType')} desc={t('settings.apiTypeDesc')}>
              <select
                className="h-[30px] px-2.5 bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-[var(--radius-sm)] text-[var(--ink)] text-[13px] outline-none cursor-pointer focus:border-[var(--accent-gold)] w-[120px]"
                value={settings.apiType}
                onChange={(e) => updateSetting('apiType', e.target.value as 'openai' | 'claude')}
              >
                <option value="openai">OpenAI</option>
                <option value="claude">Anthropic</option>
              </select>
            </SettingRow>
            <SettingRow label={t('settings.apiBaseUrl')}>
              <input
                type="url"
                className="h-[30px] px-2 bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-[var(--radius-sm)] text-[var(--ink)] text-[12px] font-mono outline-none focus:border-[var(--accent-gold)] w-[200px]"
                value={settings.apiBaseUrl}
                onChange={(e) => updateSetting('apiBaseUrl', e.target.value)}
                placeholder="https://api.deepseek.com/v1"
              />
            </SettingRow>
            <SettingRow label={t('settings.model')}>
              <div className="flex gap-1.5 items-center">
                <input
                  type="text"
                  className="h-[30px] px-2 bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-[var(--radius-sm)] text-[var(--ink)] text-[12px] font-mono outline-none focus:border-[var(--accent-gold)] w-[200px]"
                  value={settings.apiModel}
                  onChange={(e) => updateSetting('apiModel', e.target.value)}
                  placeholder="deepseek-v4-flash"
                />
              </div>
            </SettingRow>
            <SettingRow label={t('settings.apiKey')}>
              <div className="flex gap-1 items-center">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  className="h-[30px] px-2 bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-[var(--radius-sm)] text-[var(--ink)] text-[12px] font-mono outline-none focus:border-[var(--accent-gold)] w-[180px]"
                  value={settings.apiKey}
                  onChange={(e) => updateSetting('apiKey', e.target.value)}
                />
                <button
                  className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] border-none bg-none text-[var(--ink-tertiary)] cursor-pointer hover:text-[var(--ink)] transition-colors shrink-0"
                  onClick={() => setShowApiKey(!showApiKey)}
                  title={showApiKey ? t('settings.hideKey') : t('settings.showKey')}
                >
                  {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </SettingRow>
            <div className="pt-2.5 flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5">
                <button
                  className="h-[30px] px-4 rounded-lg border border-[var(--hairline-light)] bg-[var(--canvas-elevated)] text-[var(--ink)] text-[13px] cursor-pointer transition-colors hover:bg-[var(--canvas-mid)] disabled:opacity-50 flex items-center gap-1.5"
                  onClick={handleTestConnection}
                  disabled={testStatus === 'testing'}
                >
                  <Zap className="w-3.5 h-3.5" />
                  {testStatus === 'testing' ? t('settings.testing') : t('settings.testConnection')}
                </button>
                <a
                  href={
                    settings.apiType === 'claude'
                      ? 'https://console.anthropic.com/'
                      : settings.apiBaseUrl.includes('openai')
                        ? 'https://platform.openai.com/api-keys'
                        : 'https://platform.deepseek.com/api_keys'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-[12px] text-[var(--accent-gold)] no-underline hover:underline"
                >
                  {t('settings.getApiKey')}
                </a>
              </div>
              {testStatus === 'ok' && (
                <span className="text-[12px] text-[var(--success)] pl-1">
                  {t('settings.connectionSuccess', { time: testTime })}
                </span>
              )}
              {testStatus === 'fail' && (
                <span className="text-[12px] text-[var(--error)] pl-1">{t('settings.connectionFailed')}</span>
              )}
            </div>
          </div>

          {/* ── Check for Updates ── */}
          <div className="mb-7">
            <div className="text-[11px] font-medium text-[var(--ink-mute)] tracking-[0.06em] uppercase mb-3">
              <Download className="w-3.5 h-3.5 inline-block mr-1" /> {t('settings.checkUpdates')}
            </div>
            <SettingRow
              label={t('settings.checkForUpdates')}
              desc={t('settings.currentVersion', { version: __APP_VERSION__ })}
            >
              <button
                className="h-[32px] px-4 rounded-lg border border-[var(--hairline-light)] bg-[var(--canvas-elevated)] text-[var(--ink)] text-[13px] cursor-pointer transition-colors hover:bg-[var(--canvas-mid)] disabled:opacity-50 flex items-center gap-1.5"
                onClick={checkForUpdates}
                disabled={updateStatus === 'checking'}
              >
                <Download className="w-3.5 h-3.5" />
                {updateStatus === 'checking' ? t('settings.checkingUpdates') : t('settings.checkForUpdates')}
              </button>
            </SettingRow>
            {updateStatus === 'upToDate' && (
              <div className="text-[12px] text-[var(--success)] mt-2 flex items-center gap-1">
                <span>{t('settings.upToDate')}</span>
              </div>
            )}
            {updateStatus === 'available' && (
              <div className="text-[12px] text-[var(--accent-gold)] mt-2 flex items-center gap-1">
                <span>{t('settings.updateAvailable', { version: latestVersion })}</span>
                <span className="text-[var(--ink-mute)]">·</span>
                <a
                  href={releaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent-gold)] hover:underline no-underline cursor-pointer"
                >
                  {t('settings.downloadUpdate')}
                </a>
              </div>
            )}
            {updateStatus === 'error' && (
              <div className="text-[12px] text-[var(--error)] mt-2 flex items-center gap-1">
                <span>{t('settings.updateCheckFailed')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--hairline)] flex items-center shrink-0 gap-2">
          <button
            className="w-6 h-6 flex items-center justify-center rounded-[var(--radius-sm)] border-none text-[var(--ink-mute)] cursor-pointer hover:text-[var(--accent-ember)] hover:bg-[var(--canvas-mid)] transition-colors shrink-0"
            onClick={() => refreshAllData()}
            title={t('settings.forceRefreshDesc')}
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
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

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number),
    pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0,
      nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
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
