import { useState } from 'react'
import { brewingCategoryId } from './data/store'
import type { ProductRow } from './lib/db'
import { useShop } from './state'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { Collection } from './components/Collection'
import { BrewingCorner, Flavours, Footer, Policies, Story } from './components/Sections'
import { CartSheet } from './components/CartSheet'
import { ProductDialog } from './components/ProductDialog'
import { AddToast } from './components/Toast'

export default function App() {
  const { isRtl } = useShop()
  const [category, setCategory] = useState('all')
  const [openProduct, setOpenProduct] = useState<ProductRow | null>(null)

  return (
    <main className="storefront" dir={isRtl ? 'rtl' : 'ltr'}>
      <Header />
      <Hero />
      <Collection category={category} onCategoryChange={setCategory} onOpenProduct={setOpenProduct} />
      <Flavours />
      <BrewingCorner onExplore={() => setCategory(brewingCategoryId)} />
      <Story />
      <Policies />
      <Footer />
      <CartSheet />
      <ProductDialog product={openProduct} onClose={() => setOpenProduct(null)} />
      <AddToast />
    </main>
  )
}
