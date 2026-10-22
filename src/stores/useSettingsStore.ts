import { create } from 'zustand'
import { type Lang, setLanguage } from '@/i18n'
import { settingsApi } from '@/lib/api'
import type { AppSettings } from '@/types'

interface SettingsState {
  settings: AppSettings
  langVersion: number
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  loadFromServer: () => Promise<void>
}

const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  apiKeyDeepseek: '',
  apiKeyAnthropic: '',
  apiKeyOpenai: '',
  apiBaseUrl: 'https://api.deepseek.com',
  apiModel: 'deepseek-flash',
  apiType: 'openai',
  uiLanguage: 'zh',
  theme: 'dark',
  editorFontSize: 17,
  editorFontFamily: "'Noto Serif SC', 'Source Han Serif SC', 'STSong', Georgia, serif",
  autoSaveInterval: 30,
  backupEnabled: true,
  accentColor: '#c9a96e',
  maxOutputTokens: 8192,
  httpTimeout: 300,
}

const STORAGE_KEY = 'mythpen-settings'

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      const restored: AppSettings = { ...DEFAULT_SETTINGS, ...parsed }
      // If the active apiKey is empty, fall back to per-provider slot
      if (!restored.apiKey) {
        if (restored.apiBaseUrl.includes('deepseek') && restored.apiKeyDeepseek)
          restored.apiKey = restored.apiKeyDeepseek
        else if (restored.apiBaseUrl.includes('anthropic') && restored.apiKeyAnthropic)
          restored.apiKey = restored.apiKeyAnthropic
        else if (restored.apiBaseUrl.includes('openai') && restored.apiKeyOpenai)
          restored.apiKey = restored.apiKeyOpenai
      }
      return restored
    }
  } catch {
    /* ignore parse errors */
  }
  return { ...DEFAULT_SETTINGS }
}

const initialSettings = loadSettings()

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: initialSettings,
  langVersion: 0,

  loadFromServer: async () => {
    try {
      const serverSettings = await settingsApi.get()
      const merged = { ...DEFAULT_SETTINGS }
      // Override defaults with server values
      merged.apiKey = serverSettings.api_key ?? ''
      merged.apiBaseUrl = serverSettings.api_base_url || DEFAULT_SETTINGS.apiBaseUrl
      merged.apiModel = serverSettings.api_model || DEFAULT_SETTINGS.apiModel
      merged.maxOutputTokens = Number(serverSettings.max_output_tokens) || DEFAULT_SETTINGS.maxOutputTokens
      // If server has no API key, fall back to current provider's per-provider slot
      if (!merged.apiKey) {
        const cur = get().settings
        if (merged.apiBaseUrl.includes('deepseek')) merged.apiKey = cur.apiKeyDeepseek || ''
        else if (merged.apiBaseUrl.includes('anthropic')) merged.apiKey = cur.apiKeyAnthropic || ''
        else if (merged.apiBaseUrl.includes('openai')) merged.apiKey = cur.apiKeyOpenai || ''
      }
      // Keep UI preferences from local storage
      merged.uiLanguage = get().settings.uiLanguage
      merged.theme = get().settings.theme
      merged.editorFontSize = get().settings.editorFontSize
      merged.editorFontFamily = get().settings.editorFontFamily
      merged.accentColor = get().settings.accentColor
      // Preserve per-provider API keys from local state (server only has one api_key slot)
      merged.apiKeyDeepseek = get().settings.apiKeyDeepseek || DEFAULT_SETTINGS.apiKeyDeepseek
      merged.apiKeyAnthropic = get().settings.apiKeyAnthropic || DEFAULT_SETTINGS.apiKeyAnthropic
      merged.apiKeyOpenai = get().settings.apiKeyOpenai || DEFAULT_SETTINGS.apiKeyOpenai
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
      set({ settings: merged })
    } catch (e) {
      // server not reachable, keep local defaults
    }
  },

  updateSetting: (key, value) =>
    set((s) => {
      const newSettings = { ...s.settings, [key]: value }
      // When the active apiKey changes, also sync to the matching per-provider slot
      if (key === 'apiKey') {
        const keyStr = String(value)
        if (s.settings.apiBaseUrl.includes('deepseek')) newSettings.apiKeyDeepseek = keyStr
        else if (s.settings.apiBaseUrl.includes('anthropic')) newSettings.apiKeyAnthropic = keyStr
        else if (s.settings.apiBaseUrl.includes('openai')) newSettings.apiKeyOpenai = keyStr
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings))

      // Also sync to the backend server
      const keyMap: Record<string, string> = {
        apiKey: 'api_key',
        apiBaseUrl: 'api_base_url',
        apiModel: 'api_model',
        apiType: 'api_type',
        maxOutputTokens: 'max_output_tokens',
        uiLanguage: 'ui_language',
        theme: 'theme',
        editorFontSize: 'editor_font_size',
        editorFontFamily: 'editor_font_family',
        autoSaveInterval: 'auto_save_interval',
        backupEnabled: 'backup_enabled',
        accentColor: 'accent_color',
      }
      const dbKey = keyMap[key]
      if (dbKey) {
        settingsApi.update(dbKey, String(value)).catch(() => {})
      }

      const extra: Partial<SettingsState> = {}
      // When uiLanguage changes, sync the i18n module so t() returns correct locale
      if (key === 'uiLanguage') {
        setLanguage(value as Lang)
        extra.langVersion = s.langVersion + 1
      }
      return { settings: newSettings, ...extra }
    }),
}))
