import { Dropdown, type DropdownOption, type SelectSize } from '@/components/Dropdown'

export type SelectOption<T extends string> = DropdownOption<T>
export type { SelectSize }

interface SelectProps<T extends string> {
  value: T | null | undefined
  options: SelectOption<T>[]
  onChange: (value: T) => void
  ariaLabel: string
  placeholder?: string
  size?: SelectSize
  disabled?: boolean
  /** Width/layout classes for the trigger wrapper. */
  className?: string
  menuClassName?: string
  menuMinWidth?: number
}

/**
 * Form-control wrapper around the shared Dropdown. Use this everywhere a
 * native <select> would normally go: the OS renders native selects with
 * unreadable contrast in Linux dark mode.
 */
export function Select<T extends string>({ value, size = 'xs', ...props }: SelectProps<T>) {
  return <Dropdown<T> value={value ?? null} size={size} {...props} />
}
