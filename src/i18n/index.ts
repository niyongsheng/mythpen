import enLocale from './en.json'
import i18n from './zh.json'

export type Lang = 'zh' | 'en'
let currentLang: Lang = 'zh'
let localeData: Record<string, any> = i18n

const locales: Record<Lang, Record<string, any>> = {
  zh: i18n,
  en: enLocale,
}

export function setLanguage(lang: Lang) {
  currentLang = lang
  localeData = locales[lang]
  localStorage.setItem('mythpen-ui-lang', lang)
}

export function getLanguage(): Lang {
  return currentLang
}

export function t(path: string, params?: Record<string, string | number>): string {
  const keys = path.split('.')
  let val: any = localeData
  for (const key of keys) {
    val = val?.[key]
  }
  if (typeof val !== 'string') return path
  if (params) {
    return val.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))
  }
  return val
}

// Init
const stored = localStorage.getItem('mythpen-ui-lang') as Lang | null
const settingsStored = localStorage.getItem('mythpen-settings')
let initLang: Lang = 'zh'
if (settingsStored) {
  try {
    const parsed = JSON.parse(settingsStored)
    if (parsed.uiLanguage === 'en' || parsed.uiLanguage === 'zh') {
      initLang = parsed.uiLanguage
    }
  } catch {
    /* ignore */
  }
} else if (stored && (stored === 'en' || stored === 'zh')) {
  initLang = stored
}
if (initLang !== 'zh') {
  setLanguage(initLang)
}
