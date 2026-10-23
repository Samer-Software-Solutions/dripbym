// Small helpers for showing and reading numbers in the admin forms.

/** Converts Arabic-Indic digits (٠-٩, ۰-۹) and Arabic decimal comma to plain ASCII. */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
}

/** '' -> null, '12.5' -> 12.5, 'abc' -> NaN. */
export function parseNumber(value: string): number | null {
  const clean = normalizeDigits(value).trim().replace(',', '.')
  if (clean === '') return null
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(clean)) return NaN
  return Number(clean)
}

export const roundMoney = (value: number) => Math.round(value * 100) / 100

/** Western digits in both languages; the unit comes from the dictionary ('QAR' / 'ر.ق'). */
export function formatQar(value: number, unit: string): string {
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2)
  return `${text} ${unit}`
}

export const numberToField = (value: number | null | undefined) => (value == null ? '' : String(value))

export function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().slice(0, 8)
  return Math.random().toString(36).slice(2, 10)
}
