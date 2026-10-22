import { Dropdown, type DropdownOption } from '@/components/Dropdown'
import { useT } from '@/hooks/useT'
import { LANGUAGES, type Lang } from '@/i18n'

/** Compact glyph shown in the trigger badge — keeps the control narrow. */
const BADGES: Record<Lang, string> = {
  zh: '中',
  'zh-TW': '繁',
  en: 'EN',
  ja: '日',
  ko: '한',
  fr: 'FR',
  es: 'ES',
  ru: 'RU',
}

const OPTIONS: DropdownOption<Lang>[] = LANGUAGES.map((language) => ({
  value: language.code,
  label: language.label,
  meta: language.code,
}))

interface LanguageSelectProps {
  value: Lang
  onChange: (lang: Lang) => void
}

/** Language picker built on the shared Dropdown, with a locale badge trigger. */
export function LanguageSelect({ value, onChange }: LanguageSelectProps) {
  const { t } = useT()
  return (
    <Dropdown<Lang>
      value={value}
      options={OPTIONS}
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
