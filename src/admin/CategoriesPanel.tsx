import { useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { CategoryRow, ProductRow } from '../lib/db'
import { byOrder, createCategory, deleteCategory, updateCategory } from './api'
import { useT } from './i18n'
import { ConfirmDialog, Spinner, useToast } from './ui'

interface Props {
  categories: CategoryRow[]
  setCategories: Dispatch<SetStateAction<CategoryRow[]>>
  products: ProductRow[]
  setProducts: Dispatch<SetStateAction<ProductRow[]>>
}

export default function CategoriesPanel({ categories, setCategories, products, setProducts }: Props) {
  const { t, categoryName, errorText } = useT()
  const toast = useToast()
  const [reordering, setReordering] = useState(false)
  const [toDelete, setToDelete] = useState<CategoryRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const usage = (id: string) => products.filter((p) => p.category_id === id).length

  const replace = (row: CategoryRow) =>
    setCategories((list) => list.map((c) => (c.id === row.id ? row : c)).sort(byOrder))

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= categories.length) return
    const ordered = [...categories]
    ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
    // Renumber 1..n so the order is unambiguous, and only write rows that changed.
    const changes = ordered
      .map((c, i) => ({ c, order: i + 1 }))
      .filter(({ c, order }) => c.sort_order !== order)
    setReordering(true)
    const results = await Promise.allSettled(
      changes.map(({ c, order }) => updateCategory(c.id, { sort_order: order })),
    )
    // Keep whatever was saved, even if one of the updates failed.
    const byId = new Map<string, CategoryRow>()
    for (const result of results) if (result.status === 'fulfilled') byId.set(result.value.id, result.value)
    setCategories((list) => list.map((c) => byId.get(c.id) ?? c).sort(byOrder))
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failed) toast.error(t.orderFailed(errorText(failed.reason)))
    setReordering(false)
  }

  async function confirmDelete() {
    if (!toDelete) return
    const name = categoryName(toDelete)
    setDeleting(true)
    try {
      await deleteCategory(toDelete.id)
      const id = toDelete.id
      setCategories((list) => list.filter((c) => c.id !== id))
      // The database clears category_id on its products (ON DELETE SET NULL); mirror that locally.
      setProducts((list) => list.map((p) => (p.category_id === id ? { ...p, category_id: null } : p)))
      toast.success(t.categoryDeleted(name))
      setToDelete(null)
    } catch (e) {
      toast.error(t.categoryDeleteFailed(name, errorText(e)))
    } finally {
      setDeleting(false)
    }
  }

  const deleteCount = toDelete ? usage(toDelete.id) : 0

  return (
    <div className="ad-page">
      <section className="ad-card" aria-labelledby="categories-title">
        <div className="ad-section-head">
          <div>
            <h1 id="categories-title">{t.categoriesTitle}</h1>
            <p className="ad-muted">{t.categoriesIntro}</p>
          </div>
        </div>

        {categories.length === 0 ? (
          <p className="ad-empty">{t.noCategories}</p>
        ) : (
          <ol className="ad-cat-list">
            {categories.map((c, index) => (
              <CategoryItem
                key={c.id}
                category={c}
                productCount={usage(c.id)}
                isFirst={index === 0}
                isLast={index === categories.length - 1}
                reordering={reordering}
                onMove={(direction) => void move(index, direction)}
                onDelete={() => setToDelete(c)}
                onSaved={replace}
              />
            ))}
          </ol>
        )}

        <AddCategory
          nextOrder={categories.reduce((max, c) => Math.max(max, c.sort_order), 0) + 1}
          onAdded={(row) =>
            setCategories((list) => (list.some((c) => c.id === row.id) ? list : [...list, row]).sort(byOrder))
          }
        />
      </section>

      {toDelete && (
        <ConfirmDialog
          title={t.deleteCategoryTitle}
          danger
          busy={deleting}
          confirmLabel={t.deleteCategoryButton}
          onCancel={() => setToDelete(null)}
          onConfirm={() => void confirmDelete()}
          message={
            <>
              <p>
                <strong>{t.deleteCategoryQuestion(categoryName(toDelete))}</strong> {t.cantUndo}
              </p>
              <p>{t.categoryUsage(deleteCount)}</p>
            </>
          }
        />
      )}
    </div>
  )
}

interface ItemProps {
  category: CategoryRow
  productCount: number
  isFirst: boolean
  isLast: boolean
  reordering: boolean
  onMove: (direction: -1 | 1) => void
  onDelete: () => void
  onSaved: (row: CategoryRow) => void
}

function CategoryItem({ category, productCount, isFirst, isLast, reordering, onMove, onDelete, onSaved }: ItemProps) {
  const { t, categoryName, errorText } = useT()
  const toast = useToast()
  const [nameEn, setNameEn] = useState(category.name_en)
  const [nameAr, setNameAr] = useState(category.name_ar)
  const [missingName, setMissingName] = useState(false)
  const [saving, setSaving] = useState(false)
  const name = categoryName(category)

  const dirty = nameEn !== category.name_en || nameAr !== category.name_ar

  // Follow live renames from other devices, but keep a field the user has already changed.
  const lastSeen = useRef({ en: category.name_en, ar: category.name_ar })
  useEffect(() => {
    const previous = lastSeen.current
    lastSeen.current = { en: category.name_en, ar: category.name_ar }
    setNameEn((current) => (current === previous.en ? category.name_en : current))
    setNameAr((current) => (current === previous.ar ? category.name_ar : current))
  }, [category.name_en, category.name_ar])

  const idEn = `cat-${category.id}-en`
  const idAr = `cat-${category.id}-ar`

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!nameEn.trim()) {
      setMissingName(true)
      return
    }
    setMissingName(false)
    setSaving(true)
    try {
      const row = await updateCategory(category.id, { name_en: nameEn.trim(), name_ar: nameAr.trim() })
      onSaved(row)
      setNameEn(row.name_en)
      setNameAr(row.name_ar)
      toast.success(t.categorySaved(categoryName(row)))
    } catch (e) {
      toast.error(t.categorySaveFailed(errorText(e)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="ad-cat">
      <form className="ad-cat-form" onSubmit={save} noValidate>
        <div className="ad-cat-order">
          <button
            type="button"
            className="ad-icon-btn ad-icon-btn--bordered"
            onClick={() => onMove(-1)}
            disabled={isFirst || reordering}
            aria-label={t.moveUp(name)}
          >
            <ArrowUp size={18} aria-hidden />
          </button>
          <button
            type="button"
            className="ad-icon-btn ad-icon-btn--bordered"
            onClick={() => onMove(1)}
            disabled={isLast || reordering}
            aria-label={t.moveDown(name)}
          >
            <ArrowDown size={18} aria-hidden />
          </button>
        </div>
        <div className="ad-cat-fields">
          <div className={`ad-field${missingName ? ' ad-field--error' : ''}`}>
            <label htmlFor={idEn}>{t.catNameEn}</label>
            <input
              id={idEn}
              dir="ltr"
              lang="en"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              disabled={saving}
              aria-invalid={missingName}
              aria-describedby={missingName ? `${idEn}-error` : undefined}
            />
            {missingName && (
              <p className="ad-field-error" id={`${idEn}-error`}>
                {t.nameRequired}
              </p>
            )}
          </div>
          <div className="ad-field">
            <label htmlFor={idAr}>{t.catNameAr}</label>
            <input id={idAr} dir="rtl" lang="ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} disabled={saving} />
          </div>
        </div>
        <div className="ad-cat-actions">
          <span className="ad-small ad-muted">{t.productCount(productCount)}</span>
          {dirty && (
            <>
              <button
                type="button"
                className="ad-btn ad-btn--ghost ad-btn--small"
                onClick={() => {
                  setNameEn(category.name_en)
                  setNameAr(category.name_ar)
                  setMissingName(false)
                }}
                disabled={saving}
              >
                {t.undo}
              </button>
              <button type="submit" className="ad-btn ad-btn--primary ad-btn--small" disabled={saving}>
                {saving && <Spinner size={14} />}
                {t.save}
              </button>
            </>
          )}
          <button
            type="button"
            className="ad-icon-btn ad-icon-btn--bordered ad-icon-btn--danger"
            onClick={onDelete}
            disabled={saving}
            aria-label={t.deleteNamed(name)}
          >
            <Trash2 size={18} aria-hidden />
          </button>
        </div>
      </form>
    </li>
  )
}

function AddCategory({ nextOrder, onAdded }: { nextOrder: number; onAdded: (row: CategoryRow) => void }) {
  const { t, categoryName, errorText } = useT()
  const toast = useToast()
  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [missingName, setMissingName] = useState(false)
  const [saving, setSaving] = useState(false)

  async function add(event: FormEvent) {
    event.preventDefault()
    if (!nameEn.trim()) {
      setMissingName(true)
      return
    }
    setMissingName(false)
    setSaving(true)
    try {
      const row = await createCategory({ name_en: nameEn.trim(), name_ar: nameAr.trim(), sort_order: nextOrder })
      onAdded(row)
      setNameEn('')
      setNameAr('')
      toast.success(t.categoryAdded(categoryName(row)))
    } catch (e) {
      toast.error(t.categoryAddFailed(errorText(e)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="ad-cat-add" onSubmit={add} noValidate>
      <h2>{t.addCategory}</h2>
      <div className="ad-cat-add-row">
        <div className={`ad-field${missingName ? ' ad-field--error' : ''}`}>
          <label htmlFor="new-cat-en">{t.catNameEn} *</label>
          <input
            id="new-cat-en"
            dir="ltr"
            lang="en"
            value={nameEn}
            onChange={(e) => {
              setNameEn(e.target.value)
              setMissingName(false)
            }}
            disabled={saving}
            aria-invalid={missingName}
            aria-describedby={missingName ? 'new-cat-en-error' : undefined}
          />
          {missingName && (
            <p className="ad-field-error" id="new-cat-en-error">
              {t.nameRequired}
            </p>
          )}
        </div>
        <div className="ad-field">
          <label htmlFor="new-cat-ar">{t.catNameAr}</label>
          <input id="new-cat-ar" dir="rtl" lang="ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} disabled={saving} />
        </div>
        <button type="submit" className="ad-btn ad-btn--primary" disabled={saving}>
          {saving ? <Spinner size={18} /> : <Plus size={18} aria-hidden />}
          {t.add}
        </button>
      </div>
    </form>
  )
}
