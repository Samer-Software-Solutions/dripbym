// English / Arabic text for the admin panel, plus the language switch.
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import type { CategoryRow, ContentKey, ProductRow } from '../lib/db'
import { AdminError, ConflictError, StockError, errorMessage } from './api'
import { ImageError } from './image'
import { formatQar } from './format'

export type Lang = 'en' | 'ar'

const LANG_KEY = 'drip:admin-lang'

/* ---------- Plural helpers ---------- */

const enProducts = (n: number) => (n === 1 ? '1 product' : `${n} products`)

/** Arabic counting: 1 منتج واحد, 2 منتجان, 3–10 منتجات, 11+ منتجًا. */
function arProducts(n: number): string {
  if (n === 0) return 'لا توجد منتجات'
  if (n === 1) return 'منتج واحد'
  if (n === 2) return 'منتجان'
  if (n <= 10) return `${n} منتجات`
  return `${n} منتجًا`
}

/** 3–10 طلبات, 11+ طلبًا (1 and 2 are written out where used). */
const arOrders = (n: number) => (n <= 10 ? `${n} طلبات` : `${n} طلبًا`)

/** قطعة واحدة, قطعتان, 3–10 قطع, 11+ قطعة. */
function arItems(n: number): string {
  if (n === 1) return 'قطعة واحدة'
  if (n === 2) return 'قطعتان'
  if (n <= 10) return `${n} قطع`
  return `${n} قطعة`
}

/* ---------- English ---------- */

const en = {
  docTitle: 'Admin · Drip by M',
  adminLabel: 'Admin',
  switchLang: 'العربية',
  switchLangLabel: 'Switch to Arabic',
  currency: 'QAR',

  // Common
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  undo: 'Undo',
  close: 'Close',
  dismiss: 'Dismiss',
  delete: 'Delete',
  discard: 'Discard',
  tryAgain: 'Try again',
  loading: 'Loading…',
  untitled: 'Untitled',
  hidden: 'Hidden',
  visible: 'Visible',
  noPhoto: (name: string) => `${name}: no photo`,

  errors: {
    generic: 'Something went wrong. Please try again.',
    notConfigured: 'Supabase is not configured.',
    nothingSaved: "Nothing was saved. The item may have been removed, or this account isn't allowed to make changes.",
    deleted: 'This item was deleted on another device.',
    conflict: 'This was changed on another device.',
    notAllowed: "This account isn't allowed to do that.",
    productUnavailable: 'One of the products no longer exists.',
    insufficientStock: 'Not enough stock for this order.',
  },
  imageErrors: {
    notImage: 'That file is not an image. Please choose a JPG, PNG or WebP photo.',
    unreadable: "Couldn't read this image. Please use a JPG, PNG or WebP photo.",
    noCanvas: 'Your browser could not process this image.',
    tooLarge: 'This photo is too large even after resizing (max 5 MB).',
  },

  // Access / app shell
  checkingAccess: 'Checking access…',
  notConfiguredTitle: 'Supabase is not configured',
  notConfiguredNeeds: 'The admin panel needs these settings:',
  notConfiguredFix: 'Add them to the .env file (or the Vercel project settings) and rebuild the site.',
  noAccessTitle: "This account doesn't have admin access",
  signedInAs: 'You are signed in as',
  noAccessHint: "Please sign out and use the shop's admin account.",
  accessErrorTitle: "Couldn't check admin access",
  signOut: 'Sign out',
  signedOutLocally: (message: string) => `Signed out on this device only: ${message}`,
  viewShop: 'View shop',
  opensNewTab: '(opens in a new tab)',
  navLabel: 'Admin sections',
  openMenu: 'Open menu',
  closeMenu: 'Close menu',
  tabOrders: 'Orders',
  tabProducts: 'Products',
  tabCategories: 'Categories',
  tabSettings: 'Settings',
  pendingBadge: (n: number) => (n === 1 ? '1 pending order' : `${n} pending orders`),
  live: 'Live',
  offline: 'Offline',
  liveTitle: 'Changes from other devices appear here automatically.',
  offlineTitle: 'Not receiving live updates. Refresh the page to see the latest changes.',
  loadingData: 'Loading shop data…',
  loadErrorTitle: "Couldn't load the shop data",
  refreshFailed: (message: string) => `Couldn't refresh: ${message}`,

  // Login
  loginTitle: 'Admin sign in',
  email: 'Email',
  password: 'Password',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
  loginMissing: 'Please enter your email and password.',
  wrongCredentials: 'Wrong email or password. Please try again.',
  signIn: 'Sign in',
  signingIn: 'Signing in…',

  // Products page
  productsTitle: 'Products',
  productCount: enProducts,
  hiddenCount: (n: number) => `${n} hidden from the shop`,
  refreshList: 'Refresh list',
  addProduct: 'Add product',
  addFirstProduct: 'Add your first product',
  noProducts: 'No products yet.',
  noMatch: 'No products match your search.',
  clearFilters: 'Clear filters',
  searchLabel: 'Search products by name',
  searchPlaceholder: 'Search by name…',
  filterLabel: 'Filter by category',
  allCategories: 'All categories',
  noCategory: 'No category',
  colName: 'Name',
  colCategory: 'Category',
  colPrice: 'Price',
  colStock: 'Stock',
  colOnShop: 'On shop',
  wasPrice: 'was',
  showOnShop: (name: string) => `Show “${name}” on the shop`,
  nowVisible: (name: string) => `“${name}” is now visible on the shop`,
  nowHidden: (name: string) => `“${name}” is now hidden from the shop`,
  updateFailed: (name: string, message: string) => `Couldn't update “${name}”: ${message}`,
  deletedElsewhere: (name: string) => `“${name}” was deleted on another device.`,
  editProduct: (name: string) => `Edit “${name}”`,

  // Stock alerts
  stockAlerts: 'Stock alerts',
  allStocked: (n: number) => `All stocked. Nothing is at or below ${n}.`,
  soldOut: 'Sold out',
  runningLow: 'Running low',
  left: (n: number) => `${n} left`,

  // Quick stock control
  stockFor: (name: string) => `Stock for “${name}” (blank means unlimited)`,
  oneLess: (name: string) => `One less “${name}”`,
  oneMore: (name: string) => `One more “${name}”`,
  blankUnlimited: 'Leave blank for unlimited',
  unlimited: 'Unlimited',
  low: 'Low',
  stockInvalid: 'Stock must be a whole number (0 or more), or blank for unlimited.',
  stockSetUnlimited: (name: string) => `“${name}”: stock set to unlimited`,
  stockSet: (name: string, n: number) => `“${name}”: ${n} in stock`,
  stockFailed: (name: string, message: string) => `Couldn't update stock for “${name}”: ${message}`,
  stockConflict: (name: string, value: string) =>
    `Stock for “${name}” was just changed on another device to ${value}. Your change wasn't saved — please check and try again.`,

  // Product editor
  photo: 'Photo',
  uploadPhoto: 'Upload photo',
  replacePhoto: 'Replace photo',
  photoHint: 'Or drag a photo here. JPG, PNG or WebP; it is resized automatically. Square photos look best.',
  preparingPhoto: 'Preparing photo…',
  newPhotoReady: 'New photo ready. It will be uploaded when you save.',
  nameEn: 'Name (English)',
  nameAr: 'Name (Arabic)',
  descEn: 'Short description (English)',
  descAr: 'Short description (Arabic)',
  descEnHint: 'Shown under the name, e.g. "250 g".',
  descArHint: 'Shown under the Arabic name.',
  detailsEn: 'Details (English)',
  detailsAr: 'Details (Arabic)',
  detailsHint: 'Shown in the product details window.',
  category: 'Category',
  price: 'Price (QAR)',
  salePrice: 'Sale price (QAR)',
  saleHint: 'Optional. Leave empty when not on sale.',
  stock: 'Stock',
  stockHint: 'Leave empty for unlimited (not tracked).',
  visibleOnShop: 'Visible on shop',
  visibleHint: 'Customers can see and order this product.',
  hiddenHint: 'Hidden: customers will not see this product.',
  nameRequired: 'Please enter the English name.',
  priceRequired: 'Please enter a price.',
  priceInvalid: 'Price must be a number, 0 or more.',
  saleInvalid: 'Sale price must be a number, 0 or more.',
  saleTooHigh: 'Sale price must be lower than the regular price (leave empty if not on sale).',
  stockFieldInvalid: 'Stock must be a whole number, 0 or more (leave empty for unlimited).',
  uploadingPhoto: 'Uploading photo…',
  saveChanges: 'Save changes',
  savedProduct: (name: string) => `Saved “${name}”`,
  addedProduct: (name: string) => `Added “${name}”`,
  saveFailed: (message: string) => `Couldn't save: ${message}`,
  discardChanges: 'Discard your unsaved changes?',
  editorConflict: 'This product was changed on another device while you were editing. Your changes were not saved.',
  editorDeleted: 'This product was deleted on another device.',
  changedElsewhere: 'This product was just changed on another device.',
  loadLatestVersion: 'Load latest version',
  loadedLatest: 'Loaded the latest version.',
  deleteProductTitle: 'Delete product',
  deleteProductQuestion: (name: string) => `Delete ${name}?`,
  cantUndo: "This can't be undone.",
  deleteHideHint: 'If you only want to take it off the shop for now, choose “Hide instead”. You can show it again any time.',
  deleteAlreadyHidden: 'It is already hidden from the shop. Keep it hidden if you may sell it again later.',
  hideInstead: 'Hide instead',
  deletedProduct: (name: string) => `Deleted “${name}”`,
  deleteFailed: (name: string, message: string) => `Couldn't delete “${name}”: ${message}`,
  hideFailed: (name: string, message: string) => `Couldn't hide “${name}”: ${message}`,

  // Categories
  categoriesTitle: 'Categories',
  categoriesIntro: 'Group products on the shop. The order here is the order customers see.',
  noCategories: 'No categories yet. Add one below.',
  catNameEn: 'English name',
  catNameAr: 'Arabic name',
  moveUp: (name: string) => `Move “${name}” up`,
  moveDown: (name: string) => `Move “${name}” down`,
  deleteNamed: (name: string) => `Delete “${name}”`,
  orderFailed: (message: string) => `Couldn't change the order: ${message}`,
  categorySaved: (name: string) => `Saved category “${name}”`,
  categorySaveFailed: (message: string) => `Couldn't save the category: ${message}`,
  addCategory: 'Add a category',
  add: 'Add',
  categoryAdded: (name: string) => `Added category “${name}”`,
  categoryAddFailed: (message: string) => `Couldn't add the category: ${message}`,
  deleteCategoryTitle: 'Delete category',
  deleteCategoryButton: 'Delete category',
  deleteCategoryQuestion: (name: string) => `Delete “${name}”?`,
  categoryUsage: (n: number) =>
    n === 0
      ? 'No products use this category.'
      : n === 1
        ? '1 product uses this category. It will stay on the shop, but without a category.'
        : `${n} products use this category. They will stay on the shop, but without a category.`,
  categoryDeleted: (name: string) => `Deleted category “${name}”`,
  categoryDeleteFailed: (name: string, message: string) => `Couldn't delete “${name}”: ${message}`,

  // Settings
  settingsTitle: 'Settings',
  settingsIntro: 'Contact details, delivery fees and the text shown on the shop.',
  contact: 'Contact',
  whatsapp: 'WhatsApp number',
  whatsappHint: 'Country code + number, digits only. Example: 97451750557. Orders are sent here.',
  whatsappEmpty: "Empty: customers can't send orders on WhatsApp.",
  whatsappDigits: 'Use digits only, e.g. 97451750557.',
  whatsappCountry: (digits: string) => `Add the country code at the start, e.g. 974${digits}.`,
  whatsappLength: 'This number looks too short or too long. Example: 97451750557.',
  instagram: 'Instagram link',
  instagramHint: 'Full link, e.g. https://www.instagram.com/yourshop',
  instagramInvalid: 'Enter a full link, e.g. https://www.instagram.com/yourshop',
  delivery: 'Delivery fees',
  insideDoha: 'Inside Doha (QAR)',
  outsideDoha: 'Outside Doha (QAR)',
  freeHint: '0 for free delivery.',
  feeRequired: 'Please enter a fee (0 for free delivery).',
  feeInvalid: 'Fee must be a number, 0 or more.',
  stockSection: 'Stock',
  threshold: 'Low-stock threshold',
  thresholdHint: 'Products at or below this stock show “Only X left” to customers, and appear in Stock alerts here.',
  thresholdInvalid: 'Enter a whole number, 0 or more.',
  siteText: 'Site text',
  siteTextIntro: 'Text shown on the shop, in English and Arabic. If an Arabic field is empty, the English text is shown instead.',
  english: 'English',
  arabic: 'Arabic',
  contentLabels: {
    announcement: 'Announcement bar',
    heroTitleA: 'Homepage title (line 1)',
    heroTitleB: 'Homepage title (line 2, italic)',
    heroText: 'Homepage intro text',
    collectionTitle: 'Collection title',
    collectionText: 'Collection intro text',
    flavourTitle: '"Cup for every mood" title',
    flavourText: '"Cup for every mood" text',
    brewingTitle: 'Brewing corner title',
    brewingText: 'Brewing corner text',
    storyTitle: 'Our story title',
    storyText: 'Our story text',
    policyDelivery: 'Delivery policy',
    policyReturns: 'Returns policy',
    policyPrivacy: 'Privacy policy',
  } as Record<ContentKey, string>,
  fixFields: 'Please fix the highlighted fields.',
  settingsSavedLong: 'Settings saved. The shop shows the changes on the next page load.',
  settingsSaved: 'Settings saved',
  settingsSaveFailed: (message: string) => `Couldn't save settings: ${message}`,
  unsavedChanges: 'You have unsaved changes.',
  allSaved: 'All changes saved.',
  saveSettings: 'Save settings',
  settingsConflict: 'Settings were changed on another device. Load the latest version first.',
  settingsChangedElsewhere: 'Settings were just changed on another device.',
  loadLatest: 'Load latest',
  loadLatestConfirm: 'Load the latest settings? Your unsaved changes on this page will be lost.',
  settingsMissingTitle: 'Settings not found',
  settingsMissingText: 'The settings row (id 1) is missing from the database, so there is nothing to edit here.',

  // Orders
  ordersTitle: 'Orders',
  ordersWaiting: (n: number) =>
    n === 0 ? 'No orders waiting for approval.' : n === 1 ? '1 order waiting for approval' : `${n} orders waiting for approval`,
  ordersHint: 'Orders appear here when a customer continues to WhatsApp. Approve an order once it is paid to take it out of stock.',
  statusFilter: 'Show orders',
  statusPending: 'Pending',
  statusApproved: 'Approved',
  statusCancelled: 'Cancelled',
  statusAll: 'All',
  searchOrders: 'Search orders',
  searchOrdersPlaceholder: 'Order number, name or phone…',
  noOrders: 'No orders yet.',
  noOrdersHere: 'No orders here.',
  orderNumber: (n: number) => `Order #${n}`,
  itemCount: (n: number) => (n === 1 ? '1 item' : `${n} items`),
  removedIn: (hours: number) => (hours <= 1 ? 'Removed within the hour if not approved' : `Removed in ${hours} h if not approved`),
  notEnoughStock: 'Not enough stock',
  soundOnLabel: 'New-order sound is on. Turn it off',
  soundOffLabel: 'New-order sound is off. Turn it on',
  soundOn: 'New-order sound on',
  soundOff: 'New-order sound off',
  newOrder: (n: number, name: string) => `New order #${n} from ${name}`,
  pushLabel: 'Notifications on this device',
  pushOffHint: 'Turn on to get a notification for every new order, even when the admin panel is closed.',
  pushOnHint: 'You get a notification for every new order, even when the admin panel is closed.',
  pushBlocked: 'Notifications are blocked for this site. Allow them in your browser or phone settings, then try again.',
  pushNeedsInstall:
    'For order notifications on iPhone, tap Share → Add to Home Screen, then open the admin from the new icon (iOS 16.4 or later).',
  pushUnsupported: "This browser can't show order notifications.",
  pushEnabled: 'Notifications turned on for this device',
  pushDisabled: 'Notifications turned off for this device',
  pushFailed: (message: string) => `Couldn't change notifications: ${message}`,
  customer: 'Customer',
  phone: 'Phone',
  chatOnWhatsApp: 'Chat on WhatsApp',
  deliveryArea: 'Delivery',
  zoneInside: 'Inside Doha',
  zoneOutside: 'Outside Doha',
  placed: 'Placed',
  approvedOn: 'Approved',
  cancelledOn: 'Cancelled',
  status: 'Status',
  items: 'Items',
  each: (price: string) => `${price} each`,
  qtyFor: (name: string) => `Quantity of “${name}”`,
  oneLessItem: (name: string) => `One less “${name}”`,
  oneMoreItem: (name: string) => `One more “${name}”`,
  removeItem: (name: string) => `Remove “${name}” from the order`,
  addItemLabel: 'Add a product to the order',
  inOrder: (n: number) => `In order × ${n}`,
  inStockShort: (n: number) => `${n} in stock`,
  subtotal: 'Subtotal',
  deliveryFee: 'Delivery',
  total: 'Total',
  free: 'Free',
  problemShort: (stock: number, needed: number) =>
    stock === 0 ? `Out of stock. This order needs ${needed}.` : `Only ${stock} in stock. This order needs ${needed}.`,
  problemMissing: 'This product was deleted from the shop.',
  cantApproveTitle: "Can't approve yet",
  cantApproveHint: 'Lower the quantity, remove the item, or add stock on the Products page.',
  saveBeforeApprove: 'Save your changes before approving.',
  emptyOrder: 'An order needs at least one item. To drop the whole order, cancel it.',
  approve: 'Approve',
  approveTitle: (n: number) => `Approve order #${n}?`,
  approveText: 'Only approve once the customer has paid. These items will be taken out of stock:',
  stockChange: (from: number, to: number) => `${from} → ${to}`,
  stockNotTracked: 'Not tracked',
  orderApproved: (n: number) => `Order #${n} approved. Stock updated.`,
  approveFailed: (message: string) => `Couldn't approve: ${message}`,
  cancelOrder: 'Cancel order',
  keepOrder: 'Keep order',
  cancelOrderTitle: (n: number) => `Cancel order #${n}?`,
  cancelPendingText: 'It stays in the list as cancelled. Stock is not changed.',
  cancelApprovedText: 'Its items go back in stock.',
  orderCancelled: (n: number) => `Order #${n} cancelled.`,
  cancelFailed: (message: string) => `Couldn't cancel: ${message}`,
  orderSaved: (n: number) => `Order #${n} updated.`,
  orderSaveFailed: (message: string) => `Couldn't save the order: ${message}`,
  orderChangedElsewhere: 'This order was just changed on another device.',
  orderConflict: 'This order was changed on another device. The latest version is shown.',
  orderGone: 'This order no longer exists. Pending orders are removed after 60 hours.',
  undoApproval: 'Undo approval',
  undoApprovalTitle: (n: number) => `Undo approval of order #${n}?`,
  undoApprovalText: 'The order goes back to Pending and its items go back in stock:',
  undoCancel: 'Undo cancel',
  undoCancelTitle: (n: number) => `Reopen order #${n}?`,
  undoCancelText: 'The order goes back to Pending. Stock is not changed until you approve it.',
  orderReopened: (n: number) => `Order #${n} is pending again.`,
  reopenFailed: (message: string) => `Couldn't undo: ${message}`,
}

export type Dict = typeof en

/* ---------- Arabic ---------- */

const ar: Dict = {
  docTitle: 'لوحة التحكم · Drip by M',
  adminLabel: 'لوحة التحكم',
  switchLang: 'English',
  switchLangLabel: 'التبديل إلى الإنجليزية',
  currency: 'ر.ق',

  save: 'حفظ',
  saving: 'جارٍ الحفظ…',
  cancel: 'إلغاء',
  undo: 'تراجع',
  close: 'إغلاق',
  dismiss: 'إخفاء الإشعار',
  delete: 'حذف',
  discard: 'تجاهل',
  tryAgain: 'إعادة المحاولة',
  loading: 'جارٍ التحميل…',
  untitled: 'بدون اسم',
  hidden: 'مخفي',
  visible: 'ظاهر',
  noPhoto: (name) => `${name}: لا توجد صورة`,

  errors: {
    generic: 'حدث خطأ ما. يُرجى المحاولة مرة أخرى.',
    notConfigured: 'لم يتم إعداد Supabase.',
    nothingSaved: 'لم يُحفظ أي شيء. ربما حُذف العنصر، أو أن هذا الحساب لا يملك صلاحية التعديل.',
    deleted: 'تم حذف هذا العنصر من جهاز آخر.',
    conflict: 'تم تعديل هذا من جهاز آخر.',
    notAllowed: 'هذا الحساب لا يملك صلاحية القيام بذلك.',
    productUnavailable: 'أحد المنتجات لم يعد موجودًا.',
    insufficientStock: 'المخزون لا يكفي لهذا الطلب.',
  },
  imageErrors: {
    notImage: 'هذا الملف ليس صورة. يُرجى اختيار صورة JPG أو PNG أو WebP.',
    unreadable: 'تعذّرت قراءة هذه الصورة. يُرجى استخدام صورة JPG أو PNG أو WebP.',
    noCanvas: 'لم يتمكن المتصفح من معالجة هذه الصورة.',
    tooLarge: 'هذه الصورة كبيرة جدًا حتى بعد تصغيرها (الحد الأقصى 5 ميغابايت).',
  },

  checkingAccess: 'جارٍ التحقق من الصلاحيات…',
  notConfiguredTitle: 'لم يتم إعداد Supabase',
  notConfiguredNeeds: 'تحتاج لوحة التحكم إلى هذه الإعدادات:',
  notConfiguredFix: 'أضِفها إلى ملف ‎.env (أو إلى إعدادات مشروع Vercel) ثم أعِد بناء الموقع.',
  noAccessTitle: 'هذا الحساب لا يملك صلاحية الإدارة',
  signedInAs: 'أنت مسجّل الدخول بالحساب',
  noAccessHint: 'يُرجى تسجيل الخروج واستخدام حساب الإدارة الخاص بالمتجر.',
  accessErrorTitle: 'تعذّر التحقق من صلاحية الإدارة',
  signOut: 'تسجيل الخروج',
  signedOutLocally: (message) => `تم تسجيل الخروج من هذا الجهاز فقط: ${message}`,
  viewShop: 'عرض المتجر',
  opensNewTab: '(يفتح في علامة تبويب جديدة)',
  navLabel: 'أقسام لوحة التحكم',
  openMenu: 'فتح القائمة',
  closeMenu: 'إغلاق القائمة',
  tabOrders: 'الطلبات',
  tabProducts: 'المنتجات',
  tabCategories: 'التصنيفات',
  tabSettings: 'الإعدادات',
  pendingBadge: (n) => `طلبات بانتظار الموافقة: ${n}`,
  live: 'مباشر',
  offline: 'غير متصل',
  liveTitle: 'تظهر هنا التغييرات من الأجهزة الأخرى تلقائيًا.',
  offlineTitle: 'التحديثات المباشرة متوقفة. حدّث الصفحة لرؤية آخر التغييرات.',
  loadingData: 'جارٍ تحميل بيانات المتجر…',
  loadErrorTitle: 'تعذّر تحميل بيانات المتجر',
  refreshFailed: (message) => `تعذّر التحديث: ${message}`,

  loginTitle: 'تسجيل دخول الإدارة',
  email: 'البريد الإلكتروني',
  password: 'كلمة المرور',
  showPassword: 'إظهار كلمة المرور',
  hidePassword: 'إخفاء كلمة المرور',
  loginMissing: 'يُرجى إدخال البريد الإلكتروني وكلمة المرور.',
  wrongCredentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة. حاول مرة أخرى.',
  signIn: 'تسجيل الدخول',
  signingIn: 'جارٍ تسجيل الدخول…',

  productsTitle: 'المنتجات',
  productCount: arProducts,
  hiddenCount: (n) => `المخفية عن المتجر: ${n}`,
  refreshList: 'تحديث القائمة',
  addProduct: 'إضافة منتج',
  addFirstProduct: 'أضف أول منتج',
  noProducts: 'لا توجد منتجات بعد.',
  noMatch: 'لا توجد منتجات مطابقة لبحثك.',
  clearFilters: 'مسح التصفية',
  searchLabel: 'البحث عن المنتجات بالاسم',
  searchPlaceholder: 'ابحث بالاسم…',
  filterLabel: 'التصفية حسب التصنيف',
  allCategories: 'كل التصنيفات',
  noCategory: 'بدون تصنيف',
  colName: 'الاسم',
  colCategory: 'التصنيف',
  colPrice: 'السعر',
  colStock: 'المخزون',
  colOnShop: 'في المتجر',
  wasPrice: 'السعر السابق',
  showOnShop: (name) => `إظهار «${name}» في المتجر`,
  nowVisible: (name) => `أصبح «${name}» ظاهرًا في المتجر`,
  nowHidden: (name) => `أصبح «${name}» مخفيًا عن المتجر`,
  updateFailed: (name, message) => `تعذّر تحديث «${name}»: ${message}`,
  deletedElsewhere: (name) => `تم حذف «${name}» من جهاز آخر.`,
  editProduct: (name) => `تعديل «${name}»`,

  stockAlerts: 'تنبيهات المخزون',
  allStocked: (n) => `المخزون جيد. لا يوجد منتج وصل إلى ${n} أو أقل.`,
  soldOut: 'نفدت الكمية',
  runningLow: 'قارب على النفاد',
  left: (n) => `بقي ${n}`,

  stockFor: (name) => `مخزون «${name}» (اتركه فارغًا لكمية غير محدودة)`,
  oneLess: (name) => `إنقاص واحد من «${name}»`,
  oneMore: (name) => `زيادة واحد إلى «${name}»`,
  blankUnlimited: 'اتركه فارغًا لكمية غير محدودة',
  unlimited: 'غير محدود',
  low: 'منخفض',
  stockInvalid: 'يجب أن يكون المخزون عددًا صحيحًا (0 أو أكثر)، أو فارغًا لكمية غير محدودة.',
  stockSetUnlimited: (name) => `«${name}»: أصبح المخزون غير محدود`,
  stockSet: (name, n) => `«${name}»: الكمية المتوفرة ${n}`,
  stockFailed: (name, message) => `تعذّر تحديث مخزون «${name}»: ${message}`,
  stockConflict: (name, value) =>
    `تم تغيير مخزون «${name}» للتو من جهاز آخر إلى ${value}. لم يُحفظ تعديلك، يُرجى المراجعة والمحاولة مرة أخرى.`,

  photo: 'الصورة',
  uploadPhoto: 'رفع صورة',
  replacePhoto: 'تغيير الصورة',
  photoHint: 'أو اسحب صورة إلى هنا. JPG أو PNG أو WebP، ويتم تصغيرها تلقائيًا. الصور المربعة تبدو أفضل.',
  preparingPhoto: 'جارٍ تجهيز الصورة…',
  newPhotoReady: 'الصورة الجديدة جاهزة، وسيتم رفعها عند الحفظ.',
  nameEn: 'الاسم (بالإنجليزية)',
  nameAr: 'الاسم (بالعربية)',
  descEn: 'وصف قصير (بالإنجليزية)',
  descAr: 'وصف قصير (بالعربية)',
  descEnHint: 'يظهر تحت الاسم، مثل "250 g".',
  descArHint: 'يظهر تحت الاسم العربي.',
  detailsEn: 'التفاصيل (بالإنجليزية)',
  detailsAr: 'التفاصيل (بالعربية)',
  detailsHint: 'تظهر في نافذة تفاصيل المنتج.',
  category: 'التصنيف',
  price: 'السعر (ر.ق)',
  salePrice: 'سعر التخفيض (ر.ق)',
  saleHint: 'اختياري. اتركه فارغًا إذا لم يكن هناك تخفيض.',
  stock: 'المخزون',
  stockHint: 'اتركه فارغًا لكمية غير محدودة (بدون تتبّع).',
  visibleOnShop: 'ظاهر في المتجر',
  visibleHint: 'يمكن للعملاء رؤية هذا المنتج وطلبه.',
  hiddenHint: 'مخفي: لن يرى العملاء هذا المنتج.',
  nameRequired: 'يُرجى إدخال الاسم بالإنجليزية.',
  priceRequired: 'يُرجى إدخال السعر.',
  priceInvalid: 'يجب أن يكون السعر رقمًا، 0 أو أكثر.',
  saleInvalid: 'يجب أن يكون سعر التخفيض رقمًا، 0 أو أكثر.',
  saleTooHigh: 'يجب أن يكون سعر التخفيض أقل من السعر الأصلي (اتركه فارغًا إذا لم يكن هناك تخفيض).',
  stockFieldInvalid: 'يجب أن يكون المخزون عددًا صحيحًا، 0 أو أكثر (اتركه فارغًا لكمية غير محدودة).',
  uploadingPhoto: 'جارٍ رفع الصورة…',
  saveChanges: 'حفظ التغييرات',
  savedProduct: (name) => `تم حفظ «${name}»`,
  addedProduct: (name) => `تمت إضافة «${name}»`,
  saveFailed: (message) => `تعذّر الحفظ: ${message}`,
  discardChanges: 'هل تريد تجاهل التغييرات غير المحفوظة؟',
  editorConflict: 'تم تعديل هذا المنتج من جهاز آخر أثناء تعديلك. لم تُحفظ تغييراتك.',
  editorDeleted: 'تم حذف هذا المنتج من جهاز آخر.',
  changedElsewhere: 'تم تعديل هذا المنتج للتو من جهاز آخر.',
  loadLatestVersion: 'تحميل أحدث نسخة',
  loadedLatest: 'تم تحميل أحدث نسخة.',
  deleteProductTitle: 'حذف المنتج',
  deleteProductQuestion: (name) => `هل تريد حذف «${name}»؟`,
  cantUndo: 'لا يمكن التراجع عن ذلك.',
  deleteHideHint: 'إذا كنت تريد إزالته من المتجر مؤقتًا فقط، اختر «إخفاء بدلًا من ذلك». يمكنك إظهاره مجددًا في أي وقت.',
  deleteAlreadyHidden: 'هذا المنتج مخفي عن المتجر بالفعل. أبقِه مخفيًا إذا كنت قد تبيعه لاحقًا.',
  hideInstead: 'إخفاء بدلًا من ذلك',
  deletedProduct: (name) => `تم حذف «${name}»`,
  deleteFailed: (name, message) => `تعذّر حذف «${name}»: ${message}`,
  hideFailed: (name, message) => `تعذّر إخفاء «${name}»: ${message}`,

  categoriesTitle: 'التصنيفات',
  categoriesIntro: 'جمّع المنتجات في المتجر. الترتيب هنا هو الترتيب الذي يراه العملاء.',
  noCategories: 'لا توجد تصنيفات بعد. أضف تصنيفًا بالأسفل.',
  catNameEn: 'الاسم بالإنجليزية',
  catNameAr: 'الاسم بالعربية',
  moveUp: (name) => `نقل «${name}» إلى الأعلى`,
  moveDown: (name) => `نقل «${name}» إلى الأسفل`,
  deleteNamed: (name) => `حذف «${name}»`,
  orderFailed: (message) => `تعذّر تغيير الترتيب: ${message}`,
  categorySaved: (name) => `تم حفظ التصنيف «${name}»`,
  categorySaveFailed: (message) => `تعذّر حفظ التصنيف: ${message}`,
  addCategory: 'إضافة تصنيف',
  add: 'إضافة',
  categoryAdded: (name) => `تمت إضافة التصنيف «${name}»`,
  categoryAddFailed: (message) => `تعذّرت إضافة التصنيف: ${message}`,
  deleteCategoryTitle: 'حذف التصنيف',
  deleteCategoryButton: 'حذف التصنيف',
  deleteCategoryQuestion: (name) => `هل تريد حذف «${name}»؟`,
  categoryUsage: (n) =>
    n === 0
      ? 'لا توجد منتجات في هذا التصنيف.'
      : n === 1
        ? 'يوجد منتج واحد في هذا التصنيف. سيبقى في المتجر ولكن بدون تصنيف.'
        : `يوجد ${arProducts(n)} في هذا التصنيف. ستبقى في المتجر ولكن بدون تصنيف.`,
  categoryDeleted: (name) => `تم حذف التصنيف «${name}»`,
  categoryDeleteFailed: (name, message) => `تعذّر حذف «${name}»: ${message}`,

  settingsTitle: 'الإعدادات',
  settingsIntro: 'بيانات التواصل ورسوم التوصيل والنصوص المعروضة في المتجر.',
  contact: 'التواصل',
  whatsapp: 'رقم واتساب',
  whatsappHint: 'رمز الدولة ثم الرقم، أرقام فقط. مثال: 97451750557. تُرسل الطلبات إلى هذا الرقم.',
  whatsappEmpty: 'فارغ: لن يتمكن العملاء من إرسال الطلبات عبر واتساب.',
  whatsappDigits: 'استخدم الأرقام فقط، مثل 97451750557.',
  whatsappCountry: (digits) => `أضف رمز الدولة في البداية، مثل 974${digits}.`,
  whatsappLength: 'يبدو هذا الرقم قصيرًا جدًا أو طويلًا جدًا. مثال: 97451750557.',
  instagram: 'رابط إنستغرام',
  instagramHint: 'الرابط كاملًا، مثل https://www.instagram.com/yourshop',
  instagramInvalid: 'أدخل الرابط كاملًا، مثل https://www.instagram.com/yourshop',
  delivery: 'رسوم التوصيل',
  insideDoha: 'داخل الدوحة (ر.ق)',
  outsideDoha: 'خارج الدوحة (ر.ق)',
  freeHint: 'أدخل 0 للتوصيل المجاني.',
  feeRequired: 'يُرجى إدخال الرسوم (0 للتوصيل المجاني).',
  feeInvalid: 'يجب أن تكون الرسوم رقمًا، 0 أو أكثر.',
  stockSection: 'المخزون',
  threshold: 'حد انخفاض المخزون',
  thresholdHint: 'المنتجات التي يصل مخزونها إلى هذا العدد أو أقل تظهر للعملاء بعبارة «تبقى X فقط»، وتظهر هنا في تنبيهات المخزون.',
  thresholdInvalid: 'أدخل عددًا صحيحًا، 0 أو أكثر.',
  siteText: 'نصوص الموقع',
  siteTextIntro: 'النصوص المعروضة في المتجر بالإنجليزية والعربية. إذا كان الحقل العربي فارغًا، يُعرض النص الإنجليزي بدلًا منه.',
  english: 'بالإنجليزية',
  arabic: 'بالعربية',
  contentLabels: {
    announcement: 'شريط الإعلانات',
    heroTitleA: 'عنوان الصفحة الرئيسية (السطر 1)',
    heroTitleB: 'عنوان الصفحة الرئيسية (السطر 2، مائل)',
    heroText: 'النص التعريفي في الصفحة الرئيسية',
    collectionTitle: 'عنوان المجموعة',
    collectionText: 'النص التعريفي للمجموعة',
    flavourTitle: 'عنوان «فنجان لكل مزاج»',
    flavourText: 'نص «فنجان لكل مزاج»',
    brewingTitle: 'عنوان ركن التحضير',
    brewingText: 'نص ركن التحضير',
    storyTitle: 'عنوان «قصتنا»',
    storyText: 'نص «قصتنا»',
    policyDelivery: 'سياسة التوصيل',
    policyReturns: 'سياسة الإرجاع',
    policyPrivacy: 'سياسة الخصوصية',
  },
  fixFields: 'يُرجى تصحيح الحقول المحددة.',
  settingsSavedLong: 'تم حفظ الإعدادات. ستظهر التغييرات في المتجر عند إعادة تحميل الصفحة.',
  settingsSaved: 'تم حفظ الإعدادات',
  settingsSaveFailed: (message) => `تعذّر حفظ الإعدادات: ${message}`,
  unsavedChanges: 'لديك تغييرات غير محفوظة.',
  allSaved: 'تم حفظ جميع التغييرات.',
  saveSettings: 'حفظ الإعدادات',
  settingsConflict: 'تم تعديل الإعدادات من جهاز آخر. حمّل أحدث نسخة أولًا.',
  settingsChangedElsewhere: 'تم تعديل الإعدادات للتو من جهاز آخر.',
  loadLatest: 'تحميل الأحدث',
  loadLatestConfirm: 'هل تريد تحميل أحدث الإعدادات؟ ستفقد التغييرات غير المحفوظة في هذه الصفحة.',
  settingsMissingTitle: 'الإعدادات غير موجودة',
  settingsMissingText: 'صف الإعدادات (id 1) غير موجود في قاعدة البيانات، لذا لا يوجد ما يمكن تعديله هنا.',

  ordersTitle: 'الطلبات',
  ordersWaiting: (n) =>
    n === 0
      ? 'لا توجد طلبات بانتظار الموافقة.'
      : n === 1
        ? 'طلب واحد بانتظار الموافقة'
        : n === 2
          ? 'طلبان بانتظار الموافقة'
          : `${arOrders(n)} بانتظار الموافقة`,
  ordersHint: 'تظهر الطلبات هنا عندما يتابع العميل إلى واتساب. وافق على الطلب بعد الدفع ليُخصم من المخزون.',
  statusFilter: 'عرض الطلبات',
  statusPending: 'بانتظار الموافقة',
  statusApproved: 'تمت الموافقة',
  statusCancelled: 'ملغي',
  statusAll: 'الكل',
  searchOrders: 'البحث في الطلبات',
  searchOrdersPlaceholder: 'رقم الطلب أو الاسم أو الجوال…',
  noOrders: 'لا توجد طلبات بعد.',
  noOrdersHere: 'لا توجد طلبات هنا.',
  orderNumber: (n) => `الطلب #${n}`,
  itemCount: arItems,
  removedIn: (hours) => (hours <= 1 ? 'يُحذف خلال ساعة إن لم تتم الموافقة' : `يُحذف بعد ${hours} ساعة إن لم تتم الموافقة`),
  notEnoughStock: 'المخزون لا يكفي',
  soundOnLabel: 'صوت الطلبات الجديدة مفعّل. اضغط لإيقافه',
  soundOffLabel: 'صوت الطلبات الجديدة متوقف. اضغط لتفعيله',
  soundOn: 'تم تفعيل صوت الطلبات الجديدة',
  soundOff: 'تم إيقاف صوت الطلبات الجديدة',
  newOrder: (n, name) => `طلب جديد #${n} من ${name}`,
  pushLabel: 'الإشعارات على هذا الجهاز',
  pushOffHint: 'فعّلها ليصلك إشعار بكل طلب جديد، حتى عندما تكون لوحة التحكم مغلقة.',
  pushOnHint: 'يصلك إشعار بكل طلب جديد، حتى عندما تكون لوحة التحكم مغلقة.',
  pushBlocked: 'الإشعارات محظورة لهذا الموقع. اسمح بها من إعدادات المتصفح أو الجوال، ثم حاول مرة أخرى.',
  pushNeedsInstall:
    'لتصلك إشعارات الطلبات على iPhone، اضغط مشاركة ← إضافة إلى الشاشة الرئيسية، ثم افتح لوحة التحكم من الأيقونة الجديدة (iOS 16.4 أو أحدث).',
  pushUnsupported: 'هذا المتصفح لا يدعم إشعارات الطلبات.',
  pushEnabled: 'تم تفعيل الإشعارات على هذا الجهاز',
  pushDisabled: 'تم إيقاف الإشعارات على هذا الجهاز',
  pushFailed: (message) => `تعذّر تغيير الإشعارات: ${message}`,
  customer: 'العميل',
  phone: 'الجوال',
  chatOnWhatsApp: 'محادثة على واتساب',
  deliveryArea: 'التوصيل',
  zoneInside: 'داخل الدوحة',
  zoneOutside: 'خارج الدوحة',
  placed: 'تاريخ الطلب',
  approvedOn: 'تاريخ الموافقة',
  cancelledOn: 'تاريخ الإلغاء',
  status: 'الحالة',
  items: 'المنتجات',
  each: (price) => `${price} للقطعة`,
  qtyFor: (name) => `كمية «${name}»`,
  oneLessItem: (name) => `إنقاص واحد من «${name}»`,
  oneMoreItem: (name) => `زيادة واحد إلى «${name}»`,
  removeItem: (name) => `إزالة «${name}» من الطلب`,
  addItemLabel: 'إضافة منتج إلى الطلب',
  inOrder: (n) => `في الطلب × ${n}`,
  inStockShort: (n) => `المتوفر ${n}`,
  subtotal: 'المجموع الفرعي',
  deliveryFee: 'التوصيل',
  total: 'الإجمالي',
  free: 'مجاني',
  problemShort: (stock, needed) =>
    stock === 0 ? `نفدت الكمية. يحتاج هذا الطلب إلى ${needed}.` : `المتوفر ${stock} فقط. يحتاج هذا الطلب إلى ${needed}.`,
  problemMissing: 'تم حذف هذا المنتج من المتجر.',
  cantApproveTitle: 'لا يمكن الموافقة بعد',
  cantApproveHint: 'قلّل الكمية، أو أزل المنتج، أو أضف مخزونًا من صفحة المنتجات.',
  saveBeforeApprove: 'احفظ تغييراتك قبل الموافقة.',
  emptyOrder: 'يجب أن يحتوي الطلب على منتج واحد على الأقل. لإلغاء الطلب بالكامل، استخدم «إلغاء الطلب».',
  approve: 'موافقة',
  approveTitle: (n) => `الموافقة على الطلب #${n}؟`,
  approveText: 'وافق فقط بعد أن يدفع العميل. سيتم خصم هذه المنتجات من المخزون:',
  stockChange: (from, to) => `${from} ← ${to}`,
  stockNotTracked: 'غير متتبَّع',
  orderApproved: (n) => `تمت الموافقة على الطلب #${n} وتحديث المخزون.`,
  approveFailed: (message) => `تعذّرت الموافقة: ${message}`,
  cancelOrder: 'إلغاء الطلب',
  keepOrder: 'إبقاء الطلب',
  cancelOrderTitle: (n) => `إلغاء الطلب #${n}؟`,
  cancelPendingText: 'سيبقى في القائمة كطلب ملغي. لن يتغير المخزون.',
  cancelApprovedText: 'ستعود منتجاته إلى المخزون.',
  orderCancelled: (n) => `تم إلغاء الطلب #${n}.`,
  cancelFailed: (message) => `تعذّر الإلغاء: ${message}`,
  orderSaved: (n) => `تم تحديث الطلب #${n}.`,
  orderSaveFailed: (message) => `تعذّر حفظ الطلب: ${message}`,
  orderChangedElsewhere: 'تم تعديل هذا الطلب للتو من جهاز آخر.',
  orderConflict: 'تم تعديل هذا الطلب من جهاز آخر. تُعرض الآن أحدث نسخة.',
  orderGone: 'هذا الطلب لم يعد موجودًا. تُحذف الطلبات المعلّقة بعد 60 ساعة.',
  undoApproval: 'التراجع عن الموافقة',
  undoApprovalTitle: (n) => `التراجع عن الموافقة على الطلب #${n}؟`,
  undoApprovalText: 'سيعود الطلب إلى «بانتظار الموافقة» وستعود منتجاته إلى المخزون:',
  undoCancel: 'التراجع عن الإلغاء',
  undoCancelTitle: (n) => `إعادة فتح الطلب #${n}؟`,
  undoCancelText: 'سيعود الطلب إلى «بانتظار الموافقة». لن يتغير المخزون حتى توافق عليه.',
  orderReopened: (n) => `أصبح الطلب #${n} بانتظار الموافقة مجددًا.`,
  reopenFailed: (message) => `تعذّر التراجع: ${message}`,
}

const dictionaries: Record<Lang, Dict> = { en, ar }

/* ---------- Provider ---------- */

function initialLang(): Lang {
  try {
    const saved = window.localStorage.getItem(LANG_KEY)
    if (saved === 'en' || saved === 'ar') return saved
  } catch {
    // Storage can be blocked (private mode); fall back to the browser language.
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ar') ? 'ar' : 'en'
}

interface I18nApi {
  t: Dict
  lang: Lang
  dir: 'ltr' | 'rtl'
  setLang: (lang: Lang) => void
  toggleLang: () => void
  /** Arabic name in Arabic mode when it isn't empty, otherwise the English name. */
  productName: (p: Pick<ProductRow, 'name_en' | 'name_ar'>) => string
  categoryName: (c: Pick<CategoryRow, 'name_en' | 'name_ar'>) => string
  /** Readable, translated text for anything thrown by api.ts / image.ts / Supabase. */
  errorText: (error: unknown) => string
  money: (value: number) => string
}

const I18nContext = createContext<I18nApi | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const t = dictionaries[lang]
  const dir = lang === 'ar' ? 'rtl' : 'ltr'

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      window.localStorage.setItem(LANG_KEY, next)
    } catch {
      // Not saved; the choice still applies until the page is closed.
    }
  }, [])

  // A layout effect, so it runs before the panel's own (passive) effect that adds the
  // pending-orders count to the title; that one wins.
  useLayoutEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
    document.title = t.docTitle
  }, [lang, dir, t])

  const api = useMemo<I18nApi>(() => {
    const pick = (en: string, ar: string) => (lang === 'ar' && ar.trim() ? ar : en)
    return {
      t,
      lang,
      dir,
      setLang,
      toggleLang: () => setLang(lang === 'ar' ? 'en' : 'ar'),
      productName: (p) => pick(p.name_en, p.name_ar) || t.untitled,
      categoryName: (c) => pick(c.name_en, c.name_ar),
      errorText: (error) => {
        if (error instanceof AdminError) return t.errors[error.code]
        if (error instanceof ConflictError) return t.errors.conflict
        if (error instanceof StockError) return t.errors.insufficientStock
        if (error instanceof ImageError) return t.imageErrors[error.code]
        return errorMessage(error) || t.errors.generic
      },
      money: (value) => formatQar(value, t.currency),
    }
  }, [t, lang, dir, setLang])

  return <I18nContext.Provider value={api}>{children}</I18nContext.Provider>
}

export function useT(): I18nApi {
  const api = useContext(I18nContext)
  if (!api) throw new Error('useT must be used inside I18nProvider')
  return api
}
