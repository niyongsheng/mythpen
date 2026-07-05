import { getLanguage, t } from '@/i18n'
import { useSettingsStore } from '@/stores/useSettingsStore'

/**
 * Reactive i18n hook — subscribes to language changes from settings store.
 * Components calling useT() re-render when uiLanguage toggles.
 */
export function useT() {
  useSettingsStore((s) => s.langVersion)
  return { t, lang: getLanguage() }
}
