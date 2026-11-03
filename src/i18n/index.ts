import type { LanguageCode, UiLanguage } from '@/types'
import deLocale from './de.json'
import enLocale from './en.json'
import esLocale from './es.json'
import frLocale from './fr.json'
import itLocale from './it.json'
import jaLocale from './ja.json'
import koLocale from './ko.json'
import ptLocale from './pt.json'
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
  { code: 'de', label: 'Deutsch', htmlLang: 'de' },
  { code: 'it', label: 'Italiano', htmlLang: 'it' },
  { code: 'pt', label: 'Português', htmlLang: 'pt-BR' },
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
  de: deLocale,
  it: itLocale,
  pt: ptLocale,
}

let currentLang: Lang = 'zh'
let localeData: Record<string, any> = locales.zh

export const SYSTEM_LANGUAGE = 'system' as const

/** Type guard for persisted/user-provided language codes. */
export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && Object.keys(locales).includes(value)
}

/** A UI language is either a concrete locale or "follow the system". */
export function isUiLanguage(value: unknown): value is UiLanguage {
  return value === SYSTEM_LANGUAGE || isLang(value)
}

const PRIMARY_LANGUAGE: Record<string, Lang> = {
  en: 'en',
  ja: 'ja',
  ko: 'ko',
  fr: 'fr',
  es: 'es',
  ru: 'ru',
  de: 'de',
  it: 'it',
  pt: 'pt',
}

/** Map the OS/WebView locale (BCP 47) onto a bundled UI locale. */
export function detectSystemLanguage(): Lang {
  if (typeof navigator === 'undefined') return 'en'
  const candidates = [...(navigator.languages || []), navigator.language].filter(Boolean)
  for (const raw of candidates) {
    const tag = raw.toLowerCase().replace(/_/g, '-')
    if (tag.startsWith('zh')) {
      return /(hant|tw|hk|mo)/.test(tag) ? 'zh-TW' : 'zh'
    }
    const primary = PRIMARY_LANGUAGE[tag.split('-')[0]]
    if (primary) return primary
  }
  return 'en'
}

/** Resolve the persisted preference to the locale actually rendered. */
export function resolveUiLanguage(value: UiLanguage): Lang {
  return value === SYSTEM_LANGUAGE ? detectSystemLanguage() : value
}

export function setLanguage(lang: Lang) {
  currentLang = lang
  localeData = locales[lang] || locales.zh
  localStorage.setItem('mythpen-ui-lang', lang)
  if (typeof document !== 'undefined') {
    const htmlLang = LANGUAGES.find((item) => item.code === lang)?.htmlLang || lang
    document.documentElement.setAttribute('lang', htmlLang)
    document.title = `Mythpen — ${t('app.tagline')}`
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
let initUiLanguage: UiLanguage = SYSTEM_LANGUAGE
if (settingsStored) {
  try {
    const parsed = JSON.parse(settingsStored)
    if (isUiLanguage(parsed.uiLanguage)) {
      initUiLanguage = parsed.uiLanguage
    }
  } catch {
    /* ignore */
  }
} else if (isLang(stored)) {
  initUiLanguage = stored
}
setLanguage(resolveUiLanguage(initUiLanguage))
