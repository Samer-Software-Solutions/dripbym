// Built-in copy of the store data. The live data comes from Supabase (managed in /admin);
// this copy is only used on a visitor's very first load before Supabase answers, or if
// Supabase can't be reached, so the shop never shows a blank page.

import type { CategoryRow, ProductRow, SettingsRow } from '../lib/db'

export type Lang = 'en' | 'ar'

export interface StoreData {
  products: ProductRow[]
  categories: CategoryRow[]
  settings: SettingsRow
}

/** The three products featured in the dark "A cup for every mood" section. */
export const featuredIds = ['tiramisu-crisis', 'wild-berry', 'sleepy']

/** Product shown in the "brewing corner" section, and the category its button filters to. */
export const brewingCornerId = 'denx'
export const brewingCategoryId = 'gear'

const categories: CategoryRow[] = [
  { id: 'factory', name_en: 'FACTORY', name_ar: 'فاكتوري', sort_order: 1 },
  { id: 'origins', name_en: 'Origins & Blends', name_ar: 'المناشئ والخلطات', sort_order: 2 },
  { id: 'baristro', name_en: 'THE BARISTRO', name_ar: 'ذا باريسترو', sort_order: 3 },
  { id: 'cofftail', name_en: 'COFFTAIL SERIES', name_ar: 'كوفتيل سيريز', sort_order: 4 },
  { id: 'gear', name_en: 'Brewing Gear', name_ar: 'أدوات التحضير', sort_order: 5 },
  { id: 'sarnies', name_en: 'SARNIES TH', name_ar: 'سارنيز', sort_order: 6 },
  { id: 'summer', name_en: 'THE SUMMER', name_ar: 'ذا سمر', sort_order: 7 },
  { id: 'filters', name_en: 'Filters', name_ar: 'الفلاتر', sort_order: 8 },
]

type Seed = [id: string, nameEn: string, nameAr: string, desc: string, category: string, price: number, image: string]

const seeds: Seed[] = [
  ['tiramisu-crisis', 'Tiramisu Crisis', 'تيراميسو كرايسس', '', 'factory', 105, 'tiramisu-crisis'],
  ['awesome-berry', 'Awesome Berry', 'أوسم بيري', '', 'factory', 95, 'awesome-berry'],
  ['rocky-road', 'Rocky Road', 'روكي رود', '', 'factory', 90, 'rocky-road'],
  ['thai-blend', 'Thailand · Laos · Brazil', 'تايلاند · لاوس · برازيل', '250 g', 'origins', 95, 'thai-blend'],
  ['myanmar', 'Myanmar', 'ميانمار', '', 'origins', 85, 'myanmar'],
  ['colombia-brazil', 'Colombia · Brazil', 'كولومبي · برازيلي', '250 g', 'origins', 95, 'colombia-brazil'],
  ['strawberry-100', 'Strawberry Cheesecake · 100 g', 'ستروبيري تشيزكيك · ١٠٠ غرام', '100 g', 'baristro', 80, 'strawberry-100'],
  ['strawberry', 'Strawberry Cheesecake', 'ستروبيري تشيزكيك', '', 'baristro', 140, 'strawberry'],
  ['vanilla', 'Vanilla Blend', 'فانيلا بلند', '', 'baristro', 140, 'vanilla'],
  ['wild-berry', 'Wild Berry', 'وايلد بيري', '', 'cofftail', 110, 'wild-berry'],
  ['creme-brulee', 'Creme Brulee', 'كريم بروليه', '', 'cofftail', 110, 'creme-brulee'],
  ['glass-server', 'Glass Coffee Server', 'سيرفر زجاجي', '300 ml · 01', 'gear', 28, 'glass-server'],
  ['sarnies', 'Sarnies · Tiramisu', 'سارنيز · تيراميسو', '', 'sarnies', 120, 'sarnies'],
  ['morning', 'Morning Person', 'مورنينغ بيرسون', '', 'summer', 90, 'morning'],
  ['sleepy', 'Sleepy Head', 'سليبي هيد', '', 'summer', 90, 'sleepy'],
  ['wbc', 'W.B.C', 'دبليو بي سي', '', 'summer', 95, 'wbc'],
  ['timemore', 'Timemore Filters · 01', 'فلاتر تايمور · ٠١', '01', 'filters', 35, 'timemore'],
  ['hario', 'Hario V60 Filters · 02', 'فلاتر هاريو V60 · ٠٢', '100 filters · 02', 'filters', 35, 'hario'],
  ['black-knight', 'Black Knight Filters · 155', 'فلاتر بلاك نايت · ١٥٥', '100 filters · 155', 'filters', 35, 'black-knight'],
  ['denx', 'DENX Coffee Kit · 14 in 1', 'طقم DENX للقهوة · ١٤ في ١', '14 in 1', 'gear', 260, 'denx'],
  ['sip', 'SIP B75 Smoky Set', 'طقم SIP B75 سموك', 'B75', 'gear', 100, 'sip'],
]

const products: ProductRow[] = seeds.map(([id, nameEn, nameAr, desc, category, price, image], i) => ({
  id,
  name_en: nameEn,
  name_ar: nameAr,
  description_en: desc,
  description_ar: desc,
  details_en: desc ? `${nameEn} · ${desc}` : nameEn,
  details_ar: desc ? `${nameAr} · ${desc}` : nameAr,
  category_id: category,
  price,
  discount_price: null,
  image_url: `/images/${image}.webp`,
  stock: null,
  active: true,
  sort_order: i + 1,
}))

const l = (en: string, ar: string) => ({ en, ar })

const settings: SettingsRow = {
  id: 1,
  whatsapp: '97451750557',
  instagram: '',
  delivery_inside_fee: 10,
  delivery_outside_fee: 25,
  low_stock_threshold: 5,
  content: {
    announcement: l('Coffee beans & brewing essentials · Qatar', 'حبوب القهوة وأدوات التحضير · قطر'),
    heroTitleA: l('A moment for you.', 'لحظة لك.'),
    heroTitleB: l('A brew of your own.', 'وفنجان على ذوقك.'),
    heroText: l(
      'Distinctive beans. Beautiful blends. Everything you need to make your daily cup a little more special.',
      'حبوب مختارة، خلطات مميزة وأدوات لقهوة تستمتع بكل تفاصيلها.',
    ),
    collectionTitle: l('Find your next favourite.', 'اكتشف قهوتك المفضلة.'),
    collectionText: l(
      'Coffee beans, distinctive blends, and the tools to bring every cup to life.',
      'حبوب قهوة وخلطات مميزة وأدوات تكمل تجربة كل فنجان.',
    ),
    flavourTitle: l('A cup for every mood.', 'فنجان لكل مزاج.'),
    flavourText: l(
      'Explore the collection, from Tiramisu Crisis to Wild Berry and Sleepy Head.',
      'اكتشف المجموعة من تيراميسو كرايسس إلى وايلد بيري وسليبي هيد.',
    ),
    brewingTitle: l('Everything for your next brew.', 'كل ما تحتاجه لفنجانك القادم.'),
    brewingText: l(
      'From paper filters and glass servers to complete coffee kits, build a setup that suits your routine.',
      'من الفلاتر الورقية والسيرفرات الزجاجية إلى أطقم القهوة الكاملة، اختر أدوات تناسب روتينك.',
    ),
    storyTitle: l('A little pause. A better cup.', 'لحظة هدوء. وفنجان أجمل.'),
    storyText: l(
      'Drip by M brings coffee beans, distinctive blends and brewing essentials together in one place. Explore the collection and make your coffee moment your own.',
      'يجمع دريب باي إم حبوب القهوة والخلطات المميزة وأساسيات التحضير في مكان واحد. اكتشف المجموعة واستمتع بلحظة قهوة على ذوقك.',
    ),
    policyDelivery: l(
      'Delivery availability, timing and fees will be confirmed before ordering.',
      'يتم تأكيد توفر التوصيل وموعده ورسومه قبل الطلب.',
    ),
    policyReturns: l(
      'Please confirm the return conditions before placing your order.',
      'يرجى تأكيد شروط الاسترجاع قبل إتمام الطلب.',
    ),
    policyPrivacy: l('Customer details are used to prepare and arrange orders.', 'تستخدم بيانات العميل لتجهيز الطلب وترتيبه.'),
  },
}

export const fallbackStore: StoreData = { products, categories, settings }
