import { useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { AlertTriangle, RefreshCw, Save, ShieldAlert } from 'lucide-react'
import { CONTENT_FIELDS, type LocalizedText, type SettingsRow, type SiteContent } from '../lib/db'
import { ConflictError, saveSettings } from './api'
import { normalizeDigits, numberToField, parseNumber, roundMoney } from './format'
import { useT, type Dict } from './i18n'
import { Field, Spinner, describedBy, useToast } from './ui'

interface Props {
  settings: SettingsRow | null
  setSettings: Dispatch<SetStateAction<SettingsRow | null>>
}

interface FormState {
  whatsapp: string
  instagram: string
  delivery_inside_fee: string
  delivery_outside_fee: string
  low_stock_threshold: string
  content: Record<string, LocalizedText>
}

type FieldKey = 'whatsapp' | 'instagram' | 'delivery_inside_fee' | 'delivery_outside_fee' | 'low_stock_threshold'
/** Errors are stored as functions of the dictionary so they follow a language switch. */
type FormErrors = Partial<Record<FieldKey, (t: Dict) => string>>

type Result = { kind: 'success' } | { kind: 'fix' } | { kind: 'conflict' } | { kind: 'error'; error: unknown }

function readText(content: unknown, key: string): LocalizedText {
  const value = content && typeof content === 'object' ? (content as Record<string, unknown>)[key] : undefined
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>
    return { en: typeof v.en === 'string' ? v.en : '', ar: typeof v.ar === 'string' ? v.ar : '' }
  }
  return { en: '', ar: '' }
}

function toForm(settings: SettingsRow): FormState {
  return {
    whatsapp: settings.whatsapp ?? '',
    instagram: settings.instagram ?? '',
    delivery_inside_fee: numberToField(settings.delivery_inside_fee),
    delivery_outside_fee: numberToField(settings.delivery_outside_fee),
    low_stock_threshold: numberToField(settings.low_stock_threshold),
    content: Object.fromEntries(CONTENT_FIELDS.map((f) => [f.key, readText(settings.content, f.key)])),
  }
}

function normalizeWhatsapp(value: string): string {
  let digits = normalizeDigits(value).replace(/[\s+\-().]/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  return digits
}

function normalizeInstagram(value: string): string {
  const v = value.trim()
  if (!v) return ''
  if (v.startsWith('@')) return `https://www.instagram.com/${v.slice(1)}`
  if (/^(www\.)?instagram\.com\//i.test(v)) return `https://${v}`
  return v
}

function validate(form: FormState) {
  const errors: FormErrors = {}

  const whatsapp = normalizeWhatsapp(form.whatsapp)
  if (whatsapp && !/^\d+$/.test(whatsapp)) {
    errors.whatsapp = (t) => t.whatsappDigits
  } else if (whatsapp && whatsapp.length === 8) {
    errors.whatsapp = (t) => t.whatsappCountry(whatsapp)
  } else if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 15)) {
    errors.whatsapp = (t) => t.whatsappLength
  }

  const instagram = normalizeInstagram(form.instagram)
  if (instagram) {
    let ok = false
    try {
      const url = new URL(instagram)
      ok = url.protocol === 'https:' || url.protocol === 'http:'
    } catch {
      ok = false
    }
    if (!ok) errors.instagram = (t) => t.instagramInvalid
  }

  const fee = (key: 'delivery_inside_fee' | 'delivery_outside_fee') => {
    const n = parseNumber(form[key])
    if (n === null) errors[key] = (t) => t.feeRequired
    else if (Number.isNaN(n) || n < 0) errors[key] = (t) => t.feeInvalid
    return n ?? 0
  }
  const inside = fee('delivery_inside_fee')
  const outside = fee('delivery_outside_fee')

  const threshold = parseNumber(form.low_stock_threshold)
  if (threshold === null || !Number.isInteger(threshold) || threshold < 0) {
    errors.low_stock_threshold = (t) => t.thresholdInvalid
  }

  return {
    errors,
    values: { whatsapp, instagram, inside: roundMoney(inside), outside: roundMoney(outside), threshold: threshold ?? 0 },
  }
}

export default function SettingsPage({ settings, setSettings }: Props) {
  const { t } = useT()
  if (!settings) {
    return (
      <div className="ad-card ad-message">
        <ShieldAlert size={32} aria-hidden />
        <h1>{t.settingsMissingTitle}</h1>
        <p>{t.settingsMissingText}</p>
      </div>
    )
  }
  return <SettingsForm settings={settings} setSettings={setSettings} />
}

function SettingsForm({ settings, setSettings }: { settings: SettingsRow; setSettings: Props['setSettings'] }) {
  const { t, errorText } = useT()
  const toast = useToast()
  // The settings row this form was loaded from: its updated_at guards the save, and its
  // content is the base for keys this page doesn't edit.
  const [baseRow, setBaseRow] = useState(settings)
  const [baseline, setBaseline] = useState(() => toForm(settings))
  const [form, setForm] = useState(baseline)
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline)
  const changedElsewhere = !saving && settings.updated_at !== baseRow.updated_at

  const reset = (row: SettingsRow) => {
    const next = toForm(row)
    setBaseRow(row)
    setBaseline(next)
    setForm(next)
    setErrors({})
  }

  // Live updates: follow newer settings unless the user has unsaved edits.
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    if (dirtyRef.current) return
    const next = toForm(settings)
    setBaseRow(settings)
    setBaseline(next)
    setForm(next)
  }, [settings])

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const set = (key: FieldKey, value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
    setResult((r) => (r?.kind === 'conflict' ? r : null))
  }

  const setText = (key: string, lang: keyof LocalizedText, value: string) => {
    setForm((f) => ({ ...f, content: { ...f.content, [key]: { ...f.content[key], [lang]: value } } }))
    setResult((r) => (r?.kind === 'conflict' ? r : null))
  }

  function loadLatest() {
    if (dirty && !window.confirm(t.loadLatestConfirm)) return
    reset(settings)
    setResult(null)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const { errors: found, values } = validate(form)
    setErrors(found)
    if (Object.keys(found).length) {
      setResult({ kind: 'fix' })
      window.setTimeout(() => document.querySelector<HTMLElement>('.admin [aria-invalid="true"]')?.focus())
      return
    }

    // Keep any content keys (or languages) this page doesn't know about.
    const original = (baseRow.content ?? {}) as unknown as Record<string, unknown>
    const content: Record<string, unknown> = { ...original }
    for (const field of CONTENT_FIELDS) {
      const previous = original[field.key]
      const base = previous && typeof previous === 'object' ? (previous as Record<string, unknown>) : {}
      content[field.key] = { ...base, en: form.content[field.key].en.trim(), ar: form.content[field.key].ar.trim() }
    }

    setSaving(true)
    setResult(null)
    try {
      const saved = await saveSettings(
        {
          whatsapp: values.whatsapp,
          instagram: values.instagram,
          delivery_inside_fee: values.inside,
          delivery_outside_fee: values.outside,
          low_stock_threshold: values.threshold,
          content: content as unknown as SiteContent,
        },
        baseRow.updated_at,
      )
      reset(saved)
      setSettings(saved)
      setResult({ kind: 'success' })
      toast.success(t.settingsSaved)
    } catch (e) {
      if (e instanceof ConflictError) {
        // Show the newest settings to the rest of the app; this form keeps the user's edits.
        setSettings(e.latest as SettingsRow)
        setResult({ kind: 'conflict' })
        toast.error(t.settingsConflict)
      } else {
        setResult({ kind: 'error', error: e })
        toast.error(t.settingsSaveFailed(errorText(e)))
      }
    } finally {
      setSaving(false)
    }
  }

  const whatsappEmpty = !normalizeWhatsapp(form.whatsapp)
  const err = (key: FieldKey) => errors[key]?.(t)

  let statusText = dirty ? t.unsavedChanges : t.allSaved
  if (result?.kind === 'success') statusText = t.settingsSavedLong
  else if (result?.kind === 'fix') statusText = t.fixFields
  else if (result?.kind === 'conflict') statusText = t.settingsConflict
  else if (result?.kind === 'error') statusText = t.settingsSaveFailed(errorText(result.error))
  const statusTone = result ? (result.kind === 'success' ? 'success' : 'error') : ''

  return (
    <form className="ad-page ad-settings" onSubmit={save} noValidate>
      <div className="ad-section-head ad-section-head--bare">
        <div>
          <h1>{t.settingsTitle}</h1>
          <p className="ad-muted">{t.settingsIntro}</p>
        </div>
      </div>

      {(result?.kind === 'conflict' || changedElsewhere) && (
        <div className={`ad-notice${result?.kind === 'conflict' ? ' ad-notice--error' : ''}`} role="alert">
          <AlertTriangle size={18} aria-hidden />
          <p>{result?.kind === 'conflict' ? t.settingsConflict : t.settingsChangedElsewhere}</p>
          <button type="button" className="ad-btn ad-btn--secondary ad-btn--small" onClick={loadLatest} disabled={saving}>
            <RefreshCw size={16} aria-hidden /> {t.loadLatest}
          </button>
        </div>
      )}

      <section className="ad-card" aria-labelledby="s-contact">
        <h2 id="s-contact">{t.contact}</h2>
        <div className="ad-grid-2">
          <Field
            label={t.whatsapp}
            htmlFor="s-whatsapp"
            error={err('whatsapp')}
            hint={whatsappEmpty ? <span className="ad-warn">{t.whatsappEmpty}</span> : t.whatsappHint}
          >
            <input
              id="s-whatsapp"
              type="text"
              dir="ltr"
              inputMode="tel"
              autoComplete="off"
              value={form.whatsapp}
              onChange={(e) => set('whatsapp', e.target.value)}
              onBlur={() => form.whatsapp && set('whatsapp', normalizeWhatsapp(form.whatsapp))}
              aria-invalid={!!errors.whatsapp}
              aria-describedby={describedBy('s-whatsapp', err('whatsapp'), true)}
              disabled={saving}
            />
          </Field>
          <Field label={t.instagram} htmlFor="s-instagram" error={err('instagram')} hint={t.instagramHint}>
            <input
              id="s-instagram"
              type="url"
              dir="ltr"
              inputMode="url"
              autoComplete="off"
              value={form.instagram}
              onChange={(e) => set('instagram', e.target.value)}
              onBlur={() => form.instagram && set('instagram', normalizeInstagram(form.instagram))}
              aria-invalid={!!errors.instagram}
              aria-describedby={describedBy('s-instagram', err('instagram'), true)}
              disabled={saving}
            />
          </Field>
        </div>
      </section>

      <section className="ad-card" aria-labelledby="s-delivery">
        <h2 id="s-delivery">{t.delivery}</h2>
        <div className="ad-grid-2">
          <Field label={t.insideDoha} htmlFor="s-inside" error={err('delivery_inside_fee')} hint={t.freeHint}>
            <input
              id="s-inside"
              type="text"
              inputMode="decimal"
              value={form.delivery_inside_fee}
              onChange={(e) => set('delivery_inside_fee', e.target.value)}
              aria-invalid={!!errors.delivery_inside_fee}
              aria-describedby={describedBy('s-inside', err('delivery_inside_fee'), true)}
              disabled={saving}
            />
          </Field>
          <Field label={t.outsideDoha} htmlFor="s-outside" error={err('delivery_outside_fee')} hint={t.freeHint}>
            <input
              id="s-outside"
              type="text"
              inputMode="decimal"
              value={form.delivery_outside_fee}
              onChange={(e) => set('delivery_outside_fee', e.target.value)}
              aria-invalid={!!errors.delivery_outside_fee}
              aria-describedby={describedBy('s-outside', err('delivery_outside_fee'), true)}
              disabled={saving}
            />
          </Field>
        </div>
      </section>

      <section className="ad-card" aria-labelledby="s-stock">
        <h2 id="s-stock">{t.stockSection}</h2>
        <div className="ad-grid-2">
          <Field label={t.threshold} htmlFor="s-threshold" error={err('low_stock_threshold')} hint={t.thresholdHint}>
            <input
              id="s-threshold"
              type="text"
              inputMode="numeric"
              value={form.low_stock_threshold}
              onChange={(e) => set('low_stock_threshold', e.target.value)}
              aria-invalid={!!errors.low_stock_threshold}
              aria-describedby={describedBy('s-threshold', err('low_stock_threshold'), true)}
              disabled={saving}
            />
          </Field>
        </div>
      </section>

      <section className="ad-card" aria-labelledby="s-text">
        <h2 id="s-text">{t.siteText}</h2>
        <p className="ad-muted ad-section-intro">{t.siteTextIntro}</p>
        <div className="ad-content-list">
          {CONTENT_FIELDS.map((field) => {
            const value = form.content[field.key]
            const idEn = `c-${field.key}-en`
            const idAr = `c-${field.key}-ar`
            return (
              <fieldset key={field.key} className="ad-content-item">
                <legend>{t.contentLabels[field.key]}</legend>
                <div className="ad-grid-2">
                  <div className="ad-field">
                    <label htmlFor={idEn}>{t.english}</label>
                    {field.multiline ? (
                      <textarea
                        id={idEn}
                        dir="ltr"
                        lang="en"
                        rows={4}
                        value={value.en}
                        onChange={(e) => setText(field.key, 'en', e.target.value)}
                        disabled={saving}
                      />
                    ) : (
                      <input
                        id={idEn}
                        dir="ltr"
                        lang="en"
                        value={value.en}
                        onChange={(e) => setText(field.key, 'en', e.target.value)}
                        disabled={saving}
                      />
                    )}
                  </div>
                  <div className="ad-field">
                    <label htmlFor={idAr}>{t.arabic}</label>
                    {field.multiline ? (
                      <textarea
                        id={idAr}
                        rows={4}
                        dir="rtl"
                        lang="ar"
                        value={value.ar}
                        onChange={(e) => setText(field.key, 'ar', e.target.value)}
                        disabled={saving}
                      />
                    ) : (
                      <input
                        id={idAr}
                        dir="rtl"
                        lang="ar"
                        value={value.ar}
                        onChange={(e) => setText(field.key, 'ar', e.target.value)}
                        disabled={saving}
                      />
                    )}
                  </div>
                </div>
              </fieldset>
            )
          })}
        </div>
      </section>

      <div className="ad-savebar">
        <p
          className={`ad-savebar-status${statusTone ? ` is-${statusTone}` : ''}`}
          role={statusTone === 'error' ? 'alert' : 'status'}
        >
          {statusText}
        </p>
        <div className="ad-savebar-buttons">
          {dirty && (
            <button
              type="button"
              className="ad-btn ad-btn--ghost"
              onClick={() => {
                // Nothing to keep, so go straight to the newest saved settings.
                reset(settings)
                setResult(null)
              }}
              disabled={saving}
            >
              {t.discard}
            </button>
          )}
          <button type="submit" className="ad-btn ad-btn--primary" disabled={saving || !dirty}>
            {saving ? <Spinner size={18} /> : <Save size={18} aria-hidden />}
            {saving ? t.saving : t.saveSettings}
          </button>
        </div>
      </div>
    </form>
  )
}
