import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { ShopProvider } from './state'
import App from './App'
import './styles.css'

// The admin panel is a separate bundle, only downloaded when someone opens /admin.
const AdminApp = lazy(() => import('./admin/AdminApp'))
const isAdmin = window.location.pathname.startsWith('/admin')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdmin ? (
      <Suspense fallback={null}>
        <AdminApp />
      </Suspense>
    ) : (
      <ShopProvider>
        <App />
      </ShopProvider>
    )}
  </StrictMode>,
)
