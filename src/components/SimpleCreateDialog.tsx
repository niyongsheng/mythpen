import { useState } from 'react'

interface Field {
  key: string
  label: string
  type?: 'text' | 'textarea' | 'select' | 'number'
  options?: { value: string; label: string }[]
  required?: boolean
  placeholder?: string
}

interface Props {
  title: string
  fields: Field[]
  onSubmit: (values: Record<string, string>) => Promise<void>
  onClose: () => void
}

export function SimpleCreateDialog({ title, fields, onSubmit, onClose }: Props) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const update = (key: string, val: string) => setValues((v) => ({ ...v, [key]: val }))

  const handleSubmit = async () => {
    // Check required
    for (const f of fields) {
      if (f.required && !values[f.key]?.trim()) {
        setError(`请填写「${f.label}」`)
        return
      }
    }
    setSubmitting(true)
    setError('')
    try {
      await onSubmit(values)
      onClose()
    } catch (e: any) {
      setError(e.message || '创建失败')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[300]" onClick={onClose}>
      <div
        className="bg-[var(--canvas-card)] border border-[var(--hairline-light)] rounded-xl p-6 w-[460px] max-w-[90vw] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-[20px] font-semibold mb-4">{title}</h3>

        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-[13px] text-red-500">
            {error}
          </div>
        )}

        <div className="space-y-3 mb-5">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-1">
                {f.label}
              </label>
              {f.type === 'textarea' ? (
                <textarea
                  className="w-full bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-[var(--radius-sm)] p-2.5 font-sans text-[13px] text-[var(--ink)] outline-none resize-vertical min-h-[60px] focus:border-[var(--accent-gold)]"
                  placeholder={f.placeholder}
                  value={values[f.key] || ''}
                  onChange={(e) => update(f.key, e.target.value)}
                />
              ) : f.type === 'select' && f.options ? (
                <select
                  className="w-full h-[34px] px-2.5 bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-[var(--radius-sm)] text-[var(--ink)] text-[13px] outline-none cursor-pointer focus:border-[var(--accent-gold)]"
                  value={values[f.key] || ''}
                  onChange={(e) => update(f.key, e.target.value)}
                >
                  <option value="">请选择...</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type === 'number' ? 'number' : 'text'}
                  className="w-full h-[34px] px-2.5 bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-[var(--radius-sm)] text-[var(--ink)] text-[13px] outline-none focus:border-[var(--accent-gold)]"
                  placeholder={f.placeholder}
                  value={values[f.key] || ''}
                  onChange={(e) => update(f.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 justify-end border-t border-[var(--hairline)] pt-4">
          <button
            className="h-[32px] px-4 rounded-lg border border-[var(--hairline-light)] bg-[var(--canvas-elevated)] text-[var(--ink)] text-[13px] cursor-pointer hover:bg-[var(--canvas-mid)]"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="h-[32px] px-4 rounded-lg border-none bg-[var(--accent-gold)] text-[var(--canvas)] font-medium text-[13px] cursor-pointer hover:bg-[var(--accent-gold-soft)] disabled:opacity-40"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? '创建中...' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}
