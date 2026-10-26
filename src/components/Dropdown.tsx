import { Check, ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface DropdownOption<T extends string> {
  value: T
  label: string
  /** Right-aligned secondary text in the menu (e.g. a locale code). */
  meta?: string
}

/** `xs`/`form` cover plain form controls; `sm`/`md` are for rich triggers. */
export type SelectSize = 'sm' | 'xs' | 'md' | 'form'

interface DropdownProps<T extends string> {
  value: T | null
  options: DropdownOption<T>[]
  onChange: (value: T) => void
  ariaLabel: string
  /** Badge or icon shown before the label in the trigger. */
  renderLeading?: (selected: DropdownOption<T> | undefined) => React.ReactNode
  /** Secondary content shown between the trigger label and the chevron. */
  renderTriggerMeta?: (selected: DropdownOption<T> | undefined) => React.ReactNode
  placeholder?: string
  size?: SelectSize
  disabled?: boolean
  className?: string
  menuClassName?: string
  /** Keep the menu at least this wide (px) when labels are longer than the trigger. */
  menuMinWidth?: number
}

const TRIGGER_SIZE: Record<SelectSize, string> = {
  sm: 'h-[28px] gap-2 px-2 text-[12px] rounded-[var(--radius-sm)]',
  xs: 'h-[30px] gap-2 px-2.5 text-[13px] rounded-[var(--radius-sm)]',
  md: 'h-[38px] gap-2.5 pl-2 pr-3 text-[13px] rounded-[var(--radius-md)]',
  form: 'h-9 gap-2 px-3 text-[15px] rounded-lg',
}

const ITEM_SIZE: Record<SelectSize, string> = {
  sm: 'px-2 py-[5px] text-[12px]',
  xs: 'px-2 py-[6px] text-[13px]',
  md: 'px-2 py-[7px] text-[13px]',
  form: 'px-2 py-[7px] text-[15px]',
}

const MENU_GAP = 6
const VIEWPORT_MARGIN = 8
const MENU_MAX_HEIGHT = 320
/** Below this, a menu opens upwards when there is more room above. */
const MENU_MIN_HEIGHT_BELOW = 180

/**
 * Custom listbox-style dropdown (no native <select>) that matches the app's
 * paper-and-ink styling. Supports mouse, keyboard (arrows / Home / End /
 * Enter / Escape) and screen readers.
 *
 * The menu renders in a portal so it is not clipped by scrollable panels
 * (settings drawer, dialogs) or stacked behind them.
 */
export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  renderLeading,
  renderTriggerMeta,
  placeholder = '—',
  size = 'md',
  disabled = false,
  className = '',
  menuClassName = '',
  menuMinWidth = 0,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()

  const selectedIndex = options.findIndex((option) => option.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined

  const openMenu = () => {
    if (disabled) return
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }

  const closeMenu = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true })
  }

  const choose = (optionValue: T) => {
    if (optionValue !== value) onChange(optionValue)
    closeMenu(true)
  }

  // Anchor the portaled menu to the trigger, flipping up when the viewport
  // bottom is close. Re-measure on resize and on scrolls of any container.
  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP - VIEWPORT_MARGIN
    const spaceAbove = rect.top - MENU_GAP - VIEWPORT_MARGIN
    const openUp = spaceBelow < MENU_MIN_HEIGHT_BELOW && spaceAbove > spaceBelow
    const width = Math.min(Math.max(rect.width, menuMinWidth), window.innerWidth - VIEWPORT_MARGIN * 2)
    const left = Math.min(Math.max(rect.left, VIEWPORT_MARGIN), window.innerWidth - width - VIEWPORT_MARGIN)

    setMenuStyle({
      position: 'fixed',
      left,
      width,
      maxHeight: Math.min(MENU_MAX_HEIGHT, Math.max(0, openUp ? spaceAbove : spaceBelow)),
      ...(openUp ? { bottom: window.innerHeight - rect.top + MENU_GAP } : { top: rect.bottom + MENU_GAP }),
    })
  }, [menuMinWidth])

  useLayoutEffect(() => {
    if (!open) return
    updateMenuPosition()
    const handleResize = () => updateMenuPosition()
    const handleScroll = (event: Event) => {
      // Scrolling inside the menu itself doesn't move its anchor.
      if (menuRef.current?.contains(event.target as Node)) return
      updateMenuPosition()
    }
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [open, updateMenuPosition])

  // Move focus into the list so arrow keys / Enter / Escape are handled there.
  useEffect(() => {
    if (open) menuRef.current?.focus({ preventScroll: true })
  }, [open])

  // Keep the keyboard-highlighted option in view.
  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  // Close if the options disappear (e.g. the active session was deleted).
  useEffect(() => {
    if (open && options.length === 0) setOpen(false)
  }, [open, options.length])

  const handleMenuKeyDown = (event: React.KeyboardEvent) => {
    const last = options.length - 1
    if (last < 0) return
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((index) => (index >= last ? 0 : index + 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((index) => (index <= 0 ? last : index - 1))
        break
      case 'Home':
        event.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        event.preventDefault()
        setActiveIndex(last)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        choose(options[activeIndex].value)
        break
      case 'Escape':
        event.preventDefault()
        closeMenu(true)
        break
      case 'Tab':
        closeMenu()
        break
    }
  }

  const menu = open
    ? createPortal(
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="fixed inset-0 z-[400] cursor-default border-none bg-transparent p-0"
            onClick={() => closeMenu(true)}
          />
          <div
            ref={menuRef}
            id={menuId}
            role="listbox"
            aria-label={ariaLabel}
            aria-activedescendant={activeIndex >= 0 ? `${menuId}-${activeIndex}` : undefined}
            tabIndex={-1}
            style={menuStyle}
            className={`custom-scrollbar z-[401] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--hairline-light)] bg-[var(--canvas-elevated)] p-1.5 shadow-[var(--shadow-pop)] outline-none ${menuClassName}`}
            onKeyDown={handleMenuKeyDown}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value
              return (
                <button
                  key={option.value}
                  id={`${menuId}-${index}`}
                  data-index={index}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={isSelected}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border-none text-left transition-colors ${ITEM_SIZE[size]} ${
                    index === activeIndex
                      ? 'bg-[var(--canvas-mid)]'
                      : isSelected
                        ? 'bg-[var(--accent-gold-soft-bg)]'
                        : 'bg-transparent'
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option.value)}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--accent-gold)]">
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span
                    className={`flex-1 truncate ${
                      isSelected ? 'font-medium text-[var(--accent-gold)]' : 'text-[var(--ink-secondary)]'
                    }`}
                  >
                    {option.label}
                  </span>
                  {option.meta && (
                    <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--ink-mute)] uppercase">
                      {option.meta}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </>,
        document.body,
      )
    : null

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={ariaLabel}
        disabled={disabled}
        className={`flex w-full items-center border bg-[var(--canvas-elevated)] text-left transition-colors ${TRIGGER_SIZE[size]} ${
          open
            ? 'border-[var(--accent-gold)] bg-[var(--canvas-mid)]'
            : 'border-[var(--hairline)] enabled:hover:border-[var(--hairline-light)] enabled:hover:bg-[var(--canvas-mid)]'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault()
            openMenu()
          }
        }}
      >
        {renderLeading?.(selected)}
        <span className={`flex-1 truncate ${selected ? 'text-[var(--ink)]' : 'text-[var(--ink-mute)]'}`}>
          {selected ? selected.label : placeholder}
        </span>
        {renderTriggerMeta?.(selected)}
        <ChevronDown
          className={`shrink-0 text-[var(--ink-mute)] transition-transform duration-150 ${
            size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'
          } ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {menu}
    </div>
  )
}
