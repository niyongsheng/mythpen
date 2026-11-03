import { Dropdown, type DropdownOption } from '@/components/Dropdown'
import { useT } from '@/hooks/useT'
import { LANGUAGES } from '@/i18n'
import type { UiLanguage } from '@/types'

/** Compact glyph shown in the trigger badge — keeps the control narrow. */
const BADGES: Record<UiLanguage, string> = {
  system: 'SYS',
  zh: '中',
  'zh-TW': '繁',
  en: 'EN',
  ja: '日',
  ko: '한',
  fr: 'FR',
  es: 'ES',
  ru: 'RU',
  de: 'DE',
  it: 'IT',
  pt: 'PT',
}

interface LanguageSelectProps {
  value: UiLanguage
  onChange: (lang: UiLanguage) => void
}

/** Language picker built on the shared Dropdown, with a locale badge trigger. */
export function LanguageSelect({ value, onChange }: LanguageSelectProps) {
  const { t } = useT()
  const options: DropdownOption<UiLanguage>[] = [
    { value: 'system', label: t('settings.followSystem'), meta: 'system' },
    ...LANGUAGES.map((language) => ({
      value: language.code,
      label: language.label,
      meta: language.code,
    })),
  ]
  return (
    <Dropdown<UiLanguage>
      value={value}
      options={options}
      onChange={onChange}
      ariaLabel={t('settings.uiLanguage')}
      renderLeading={(selected) =>
        selected && (
          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--accent-gold-soft-bg)] text-[11px] font-medium text-[var(--accent-gold)]">
            {BADGES[selected.value]}
          </span>
        )
      }
    />
  )
}
