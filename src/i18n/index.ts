import type { LanguageCode } from '@/types'
import enLocale from './en.json'
import esLocale from './es.json'
import frLocale from './fr.json'
import jaLocale from './ja.json'
import koLocale from './ko.json'
import ruLocale from './ru.json'
import zhLocale from './zh.json'
import zhTWLocale from './zh-TW.json'

export type Lang = LanguageCode

export interface LanguageOption {
  code: Lang
  label: string
  htmlLang: string
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'zh', label: '简体中文', htmlLang: 'zh-CN' },
  { code: 'zh-TW', label: '繁體中文', htmlLang: 'zh-Hant' },
  { code: 'en', label: 'English', htmlLang: 'en' },
  { code: 'ja', label: '日本語', htmlLang: 'ja' },
  { code: 'ko', label: '한국어', htmlLang: 'ko' },
  { code: 'fr', label: 'Français', htmlLang: 'fr' },
  { code: 'es', label: 'Español', htmlLang: 'es' },
  { code: 'ru', label: 'Русский', htmlLang: 'ru' },
]

const locales: Record<Lang, Record<string, any>> = {
  zh: zhLocale,
  'zh-TW': zhTWLocale,
  en: enLocale,
  ja: jaLocale,
  ko: koLocale,
  fr: frLocale,
  es: esLocale,
  ru: ruLocale,
}

let currentLang: Lang = 'zh'
let localeData: Record<string, any> = locales.zh

/** Type guard for persisted/user-provided language codes. */
export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && Object.keys(locales).includes(value)
}

export function setLanguage(lang: Lang) {
  currentLang = lang
  localeData = locales[lang] || locales.zh
  localStorage.setItem('mythpen-ui-lang', lang)
  if (typeof document !== 'undefined') {
    const htmlLang = LANGUAGES.find((item) => item.code === lang)?.htmlLang || lang
    document.documentElement.setAttribute('lang', htmlLang)
    document.title = `mythpen — ${t('app.tagline')}`
  }
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

/**
 * Prefixes of auto-generated session titles ("New Session 1699…") across all
 * locales. Used to decide whether the AI should replace the placeholder title.
 */
export function getSessionTitlePlaceholders(): string[] {
  const prefixes = new Set<string>(['新对话', '对话 '])
  for (const locale of Object.values(locales)) {
    const template = locale?.ai?.newSessionTemplate
    if (typeof template === 'string') {
      const prefix = template.split('{ts}')[0].trim()
      if (prefix) prefixes.add(prefix)
    }
  }
  return Array.from(prefixes)
}

// Init
const stored = localStorage.getItem('mythpen-ui-lang')
const settingsStored = localStorage.getItem('mythpen-settings')
let initLang: Lang = 'zh'
if (settingsStored) {
  try {
    const parsed = JSON.parse(settingsStored)
    if (isLang(parsed.uiLanguage)) {
      initLang = parsed.uiLanguage
    }
  } catch {
    /* ignore */
  }
} else if (isLang(stored)) {
  initLang = stored
}
setLanguage(initLang)
