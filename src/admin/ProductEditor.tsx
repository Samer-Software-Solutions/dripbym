import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { AlertTriangle, ImageOff, RefreshCw, Trash2, Upload } from 'lucide-react'
import type { CategoryRow, ProductRow } from '../lib/db'
import {
  AdminError,
  ConflictError,
  createProduct,
  deleteProduct,
  removeStorageImage,
  updateProduct,
  uploadProductImage,
  type ProductInput,
} from './api'
import { prepareImage } from './image'
import { numberToField, parseNumber, randomId, roundMoney } from './format'
import { useT } from './i18n'
import { ConfirmDialog, Field, Modal, Spinner, Switch, describedBy, useToast } from './ui'

interface Props {
  /** The product as it was when the editor opened; null when adding a new product. */
  product: ProductRow | null
  /** The current version in the list (live updates), or null if it has disappeared. */
  liveProduct: ProductRow | null
  categories: CategoryRow[]
  products: ProductRow[]
  onClose: () => void
  onSaved: (row: ProductRow) => void
  /** A newer version was loaded into the editor; update the list row too. */
  onLatest: (row: ProductRow) => void
  /** The product turned out to be deleted elsewhere; drop it from the list. */
  onRemoved: (id: string) => void
  onDeleted: (id: string) => void
}

interface FormState {
  name_en: string
  name_ar: string
  description_en: string
  description_ar: string
  details_en: string
  details_ar: string
  category_id: string
  price: string
  discount_price: string
  stock: string
  active: boolean
}

type ErrorKey = 'nameRequired' | 'priceRequired' | 'priceInvalid' | 'saleInvalid' | 'saleTooHigh' | 'stockFieldInvalid'
type FormErrors = Partial<Record<'name_en' | 'price' | 'discount_price' | 'stock', ErrorKey>>
type ProductFields = Omit<ProductInput, 'image_url' | 'sort_order'>

type FormProblem =
  | { kind: 'conflict'; latest: ProductRow }
  | { kind: 'deleted' }
  | { kind: 'other'; error: unknown }

interface PendingImage {
  blob: Blob
  ext: string
  preview: string
}

function initialForm(product: ProductRow | null, categories: CategoryRow[]): FormState {
  return {
    name_en: product?.name_en ?? '',
    name_ar: product?.name_ar ?? '',
    description_en: product?.description_en ?? '',
    description_ar: product?.description_ar ?? '',
    details_en: product?.details_en ?? '',
    details_ar: product?.details_ar ?? '',
    category_id: product ? product.category_id ?? '' : categories[0]?.id ?? '',
    price: numberToField(product?.price),
    discount_price: numberToField(product?.discount_price),
    stock: numberToField(product?.stock),
    active: product?.active ?? true,
  }
}

function validate(form: FormState): { errors: FormErrors; fields?: ProductFields } {
  const errors: FormErrors = {}
  if (!form.name_en.trim()) errors.name_en = 'nameRequired'

  const price = parseNumber(form.price)
  if (price === null) errors.price = 'priceRequired'
  else if (Number.isNaN(price) || price < 0) errors.price = 'priceInvalid'

  const sale = parseNumber(form.discount_price)
  if (sale !== null) {
    if (Number.isNaN(sale) || sale < 0) errors.discount_price = 'saleInvalid'
    else if (price !== null && !Number.isNaN(price) && sale >= price) errors.discount_price = 'saleTooHigh'
  }

  const stock = parseNumber(form.stock)
  if (stock !== null && (!Number.isInteger(stock) || stock < 0)) errors.stock = 'stockFieldInvalid'

  if (Object.keys(errors).length) return { errors }

  return {
    errors,
    fields: {
      name_en: form.name_en.trim(),
      name_ar: form.name_ar.trim(),
      description_en: form.description_en.trim(),
      description_ar: form.description_ar.trim(),
      details_en: form.details_en.trim(),
      details_ar: form.details_ar.trim(),
      category_id: form.category_id || null,
      price: roundMoney(price!),
      discount_price: sale === null ? null : roundMoney(sale),
      stock,
      active: form.active,
    },
  }
}

export default function ProductEditor(props: Props) {
  const { product, liveProduct, categories, products, onClose, onSaved, onLatest, onRemoved, onDeleted } = props
  const { t, productName, categoryName, errorText } = useT()
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // The version of the product this form was filled from (changes with "Load latest version").
  const [base, setBase] = useState<ProductRow | null>(product)
  const [initial, setInitial] = useState(() => initialForm(product, categories))
  const [form, setForm] = useState<FormState>(initial)
  const [errors, setErrors] = useState<FormErrors>({})
  const [problem, setProblem] = useState<FormProblem | null>(null)
  const [gone, setGone] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'' | 'upload' | 'save'>('')

  const [image, setImage] = useState<PendingImage | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [imageError, setImageError] = useState<unknown>(null)
  const [dragOver, setDragOver] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Free the preview's memory when it is replaced or the editor closes.
  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image.preview)
    },
    [image],
  )

  const busy = saving || deleting
  const dirty = image !== null || JSON.stringify(form) !== JSON.stringify(initial)
  const currentImage = image?.preview ?? base?.image_url ?? ''
  const removedElsewhere = gone || (product !== null && liveProduct === null && !busy)
  const changedElsewhere =
    !busy && !removedElsewhere && base !== null && liveProduct !== null && liveProduct.updated_at !== base.updated_at

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function requestClose() {
    if (busy || preparing) return
    if (dirty && !removedElsewhere && !window.confirm(t.discardChanges)) return
    onClose()
  }

  function loadLatest(row: ProductRow) {
    const next = initialForm(row, categories)
    setBase(row)
    setInitial(next)
    setForm(next)
    setErrors({})
    setProblem(null)
    onLatest(row)
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    setImageError(null)
    setPreparing(true)
    try {
      const prepared = await prepareImage(file)
      setImage({ blob: prepared.blob, ext: prepared.ext, preview: URL.createObjectURL(prepared.blob) })
    } catch (e) {
      setImageError(e)
    } finally {
      setPreparing(false)
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragOver(false)
    if (busy || preparing) return
    void handleFile(event.dataTransfer.files?.[0])
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy || preparing || removedElsewhere) return
    const result = validate(form)
    setErrors(result.errors)
    setProblem(null)
    if (!result.fields) {
      // Move focus to the first field that needs fixing.
      window.setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }

    setSaving(true)
    const oldUrl = base?.image_url ?? ''
    let uploadedUrl: string | null = null
    try {
      let imageUrl = oldUrl
      if (image) {
        setStatus('upload')
        uploadedUrl = await uploadProductImage(image.blob, base?.id ?? randomId(), image.ext)
        imageUrl = uploadedUrl
      }
      setStatus('save')
      let saved: ProductRow
      if (base) {
        const guard = base.updated_at ? { updated_at: base.updated_at } : undefined
        saved = await updateProduct(base.id, { ...result.fields, image_url: imageUrl }, guard)
      } else {
        const maxOrder = products.reduce((max, p) => Math.max(max, p.sort_order), 0)
        saved = await createProduct({ ...result.fields, image_url: imageUrl, sort_order: maxOrder + 1 })
      }
      // The new photo is safely saved; remove the one it replaced (only if it lives in our bucket).
      if (uploadedUrl && oldUrl && oldUrl !== uploadedUrl) void removeStorageImage(oldUrl)
      toast.success(base ? t.savedProduct(productName(saved)) : t.addedProduct(productName(saved)))
      onSaved(saved)
    } catch (e) {
      // Nothing was saved, so the photo we just uploaded isn't used anywhere.
      if (uploadedUrl) void removeStorageImage(uploadedUrl)
      if (e instanceof ConflictError) {
        setProblem({ kind: 'conflict', latest: e.latest as ProductRow })
      } else if (e instanceof AdminError && e.code === 'deleted') {
        setGone(true)
        setProblem({ kind: 'deleted' })
        if (base) onRemoved(base.id)
      } else {
        setProblem({ kind: 'other', error: e })
        toast.error(t.saveFailed(errorText(e)))
      }
      setSaving(false)
      setStatus('')
    }
  }

  async function doDelete() {
    if (!base) return
    setDeleting(true)
    try {
      await deleteProduct(base.id)
      void removeStorageImage(base.image_url)
      toast.success(t.deletedProduct(productName(base)))
      onDeleted(base.id)
    } catch (e) {
      toast.error(t.deleteFailed(productName(base), errorText(e)))
      setDeleting(false)
    }
  }

  async function hideInstead() {
    if (!base) return
    setDeleting(true)
    try {
      const row = await updateProduct(base.id, { active: false })
      toast.success(t.nowHidden(productName(row)))
      onSaved(row)
    } catch (e) {
      if (e instanceof AdminError && e.code === 'deleted') {
        toast.error(t.deletedElsewhere(productName(base)))
        onDeleted(base.id)
      } else {
        toast.error(t.hideFailed(productName(base), errorText(e)))
        setDeleting(false)
      }
    }
  }

  const title = product ? t.editProduct(productName(product)) : t.addProduct
  const errorFor = (key: keyof FormErrors) => (errors[key] ? t[errors[key]!] : undefined)

  return (
    <Modal
      title={title}
      onClose={requestClose}
      size="large"
      closeOnBackdrop={false}
      locked={busy}
      footer={
        <>
          {base && !removedElsewhere && (
            <button
              type="button"
              className="ad-btn ad-btn--danger-ghost ad-foot-start"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
            >
              <Trash2 size={18} aria-hidden /> {t.delete}
            </button>
          )}
          {status && <span className="ad-foot-status">{status === 'upload' ? t.uploadingPhoto : t.saving}</span>}
          <button type="button" className="ad-btn ad-btn--ghost" onClick={requestClose} disabled={busy}>
            {t.cancel}
          </button>
          <button
            type="submit"
            form="product-form"
            className="ad-btn ad-btn--primary"
            disabled={busy || preparing || removedElsewhere}
          >
            {saving && <Spinner size={18} />}
            {saving ? t.saving : product ? t.saveChanges : t.addProduct}
          </button>
        </>
      }
    >
      <form id="product-form" ref={formRef} className="ad-form" onSubmit={save} noValidate>
        {removedElsewhere ? (
          <div className="ad-notice ad-notice--error" role="alert">
            <AlertTriangle size={18} aria-hidden />
            <p>{t.editorDeleted}</p>
          </div>
        ) : problem?.kind === 'conflict' ? (
          <div className="ad-notice ad-notice--error" role="alert">
            <AlertTriangle size={18} aria-hidden />
            <p>{t.editorConflict}</p>
            <button type="button" className="ad-btn ad-btn--secondary ad-btn--small" onClick={() => loadLatest(problem.latest)}>
              <RefreshCw size={16} aria-hidden /> {t.loadLatestVersion}
            </button>
          </div>
        ) : (
          changedElsewhere &&
          liveProduct && (
            <div className="ad-notice" role="status">
              <AlertTriangle size={18} aria-hidden />
              <p>{t.changedElsewhere}</p>
              <button type="button" className="ad-btn ad-btn--secondary ad-btn--small" onClick={() => loadLatest(liveProduct)}>
                <RefreshCw size={16} aria-hidden /> {t.loadLatestVersion}
              </button>
            </div>
          )
        )}

        {/* Photo */}
        <div
          className={`ad-drop${dragOver ? ' is-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <button
            type="button"
            className="ad-drop-preview"
            onClick={() => fileRef.current?.click()}
            disabled={busy || preparing}
            aria-label={currentImage ? t.replacePhoto : t.uploadPhoto}
          >
            {preparing ? (
              <Spinner size={24} />
            ) : currentImage ? (
              <img src={currentImage} alt="" />
            ) : (
              <ImageOff size={32} aria-hidden />
            )}
          </button>
          <div className="ad-drop-text">
            <p className="ad-label-text">{t.photo}</p>
            <button
              type="button"
              className="ad-btn ad-btn--secondary ad-btn--small"
              onClick={() => fileRef.current?.click()}
              disabled={busy || preparing}
            >
              <Upload size={16} aria-hidden /> {currentImage ? t.replacePhoto : t.uploadPhoto}
            </button>
            <p className="ad-field-hint">{t.photoHint}</p>
            {preparing && <p className="ad-field-hint">{t.preparingPhoto}</p>}
            {image && !preparing && (
              <p className="ad-field-hint ad-note">
                {t.newPhotoReady}{' '}
                <button type="button" className="ad-link-btn" onClick={() => setImage(null)} disabled={busy}>
                  {t.undo}
                </button>
              </p>
            )}
            {imageError != null && (
              <p className="ad-field-error" role="alert">
                {errorText(imageError)}
              </p>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="ad-sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              void handleFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>

        <div className="ad-grid-2">
          <Field label={`${t.nameEn} *`} htmlFor="p-name-en" error={errorFor('name_en')}>
            <input
              id="p-name-en"
              dir="ltr"
              lang="en"
              value={form.name_en}
              onChange={(e) => set('name_en', e.target.value)}
              aria-invalid={!!errors.name_en}
              aria-describedby={describedBy('p-name-en', errors.name_en)}
              disabled={busy}
              data-autofocus
            />
          </Field>
          <Field label={t.nameAr} htmlFor="p-name-ar">
            <input
              id="p-name-ar"
              dir="rtl"
              lang="ar"
              value={form.name_ar}
              onChange={(e) => set('name_ar', e.target.value)}
              disabled={busy}
            />
          </Field>

          <Field label={t.descEn} htmlFor="p-desc-en" hint={t.descEnHint}>
            <input
              id="p-desc-en"
              dir="ltr"
              lang="en"
              value={form.description_en}
              onChange={(e) => set('description_en', e.target.value)}
              aria-describedby="p-desc-en-hint"
              disabled={busy}
            />
          </Field>
          <Field label={t.descAr} htmlFor="p-desc-ar" hint={t.descArHint}>
            <input
              id="p-desc-ar"
              dir="rtl"
              lang="ar"
              value={form.description_ar}
              onChange={(e) => set('description_ar', e.target.value)}
              aria-describedby="p-desc-ar-hint"
              disabled={busy}
            />
          </Field>

          <Field label={t.detailsEn} htmlFor="p-details-en" hint={t.detailsHint}>
            <textarea
              id="p-details-en"
              dir="ltr"
              lang="en"
              rows={4}
              value={form.details_en}
              onChange={(e) => set('details_en', e.target.value)}
              aria-describedby="p-details-en-hint"
              disabled={busy}
            />
          </Field>
          <Field label={t.detailsAr} htmlFor="p-details-ar">
            <textarea
              id="p-details-ar"
              rows={4}
              dir="rtl"
              lang="ar"
              value={form.details_ar}
              onChange={(e) => set('details_ar', e.target.value)}
              disabled={busy}
            />
          </Field>
        </div>

        <div className="ad-grid-3">
          <Field label={t.category} htmlFor="p-category" className="ad-span-3">
            <select
              id="p-category"
              value={form.category_id}
              onChange={(e) => set('category_id', e.target.value)}
              disabled={busy}
            >
              <option value="">{t.noCategory}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryName(c)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={`${t.price} *`} htmlFor="p-price" error={errorFor('price')}>
            <input
              id="p-price"
              type="text"
              inputMode="decimal"
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
              aria-invalid={!!errors.price}
              aria-describedby={describedBy('p-price', errors.price)}
              disabled={busy}
            />
          </Field>
          <Field label={t.salePrice} htmlFor="p-sale" error={errorFor('discount_price')} hint={t.saleHint}>
            <input
              id="p-sale"
              type="text"
              inputMode="decimal"
              value={form.discount_price}
              onChange={(e) => set('discount_price', e.target.value)}
              aria-invalid={!!errors.discount_price}
              aria-describedby={describedBy('p-sale', errors.discount_price, true)}
              disabled={busy}
            />
          </Field>
          <Field label={t.stock} htmlFor="p-stock" error={errorFor('stock')} hint={t.stockHint}>
            <input
              id="p-stock"
              type="text"
              inputMode="numeric"
              placeholder={t.unlimited}
              value={form.stock}
              onChange={(e) => set('stock', e.target.value)}
              aria-invalid={!!errors.stock}
              aria-describedby={describedBy('p-stock', errors.stock, true)}
              disabled={busy}
            />
          </Field>
        </div>

        <div className="ad-switch-row">
          <Switch
            id="p-active"
            checked={form.active}
            onChange={(v) => set('active', v)}
            label={t.visibleOnShop}
            disabled={busy}
          />
          <p className="ad-field-hint">{form.active ? t.visibleHint : t.hiddenHint}</p>
        </div>

        {problem?.kind === 'other' && (
          <p className="ad-form-error" role="alert">
            {errorText(problem.error)}
          </p>
        )}
      </form>

      {confirmDelete && base && (
        <ConfirmDialog
          title={t.deleteProductTitle}
          danger
          busy={deleting}
          confirmLabel={t.delete}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void doDelete()}
          secondary={base.active ? { label: t.hideInstead, onClick: () => void hideInstead() } : undefined}
          message={
            <>
              <p>
                <strong>{t.deleteProductQuestion(productName(base))}</strong> {t.cantUndo}
              </p>
              <p>{base.active ? t.deleteHideHint : t.deleteAlreadyHidden}</p>
            </>
          }
        />
      )}
    </Modal>
  )
}
