# Drip by M — storefront + admin

Coffee beans & brewing essentials, Qatar. React + TypeScript + Vite, with Supabase for products,
stock, settings and images. Customers order through WhatsApp.

- Shop: `/`
- Admin panel: `/admin` (email + password, admins only)

## Run it

```bash
npm install
cp .env.example .env   # Windows PowerShell: Copy-Item .env.example .env
npm run dev            # http://localhost:5173 and http://localhost:5173/admin
npm run build          # production build into dist/
```

The Supabase connection comes from `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).
The publishable key is safe in the browser; never put the `service_role` / secret key in this project.

## Admin access

1. Supabase dashboard → **Authentication → Users → Add user** (email + password, tick "Auto confirm").
2. Make that user an admin (Supabase → SQL editor):
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```
3. Recommended: **Authentication → Sign In / Providers → turn off "Allow new users to sign up"**.
   (Non-admin accounts can't change anything anyway, but this keeps the user list clean.)

## How it fits together

| Where | What |
|---|---|
| `src/lib/db.ts` | Row types shared by the shop and admin, plus stock/price helpers |
| `src/lib/supabase.ts` | Supabase client |
| `src/state.tsx` | Shop state: live data, bag (capped at stock), checkout details, language |
| `src/components/` | Shop sections, bag + checkout, product window |
| `src/admin/` | Admin panel (loaded only on `/admin`) |
| `src/data/store.ts` | Built-in copy of the store used if Supabase can't be reached |
| `src/i18n.ts` | Fixed English/Arabic interface text |

### Database (Supabase)

- `products` — names/descriptions in EN + AR, category, price, sale price, image, stock (empty = unlimited), visible flag, order.
- `categories` — the filter tabs.
- `settings` — WhatsApp, Instagram, delivery fees (inside / outside Doha), low-stock threshold, and all editable site text.
- `admins` — who can edit. Row-level security: the public can only read visible products and settings; only admins can write.
- `orders` — orders from the WhatsApp checkout (number, customer, items as ordered, totals, status). Only admins can read them.
- Storage bucket `product-images` — uploaded product photos.

### Orders and stock

1. When a customer taps **Continue on WhatsApp**, the shop saves the order (`place_order()` in Supabase, which
   prices it from the database) and puts its number in the WhatsApp message, e.g. `Drip by M order #1042`.
2. It shows up in **Admin → Orders** as *Pending*, live, with a chime (can be turned off there).
3. You can change quantities, remove items or add products while it is pending.
4. Once the customer has paid, **Approve** it: its items are taken out of stock in one step. Approving is blocked,
   with the reason shown, while any product doesn't have enough stock.
5. **Cancel** a pending order to drop it, or an approved one to put its items back in stock.
6. **Undo**: an approved order can go back to Pending (its items go back in stock), and so can a cancelled one.
   Approving it again goes through the same stock check.

Pending orders are deleted automatically 60 hours after they became pending (`pg_cron` job `delete-abandoned-orders`).
Cancelled and approved orders are kept.

## Deploy (Vercel)

Import the GitHub repo in Vercel (framework preset: Vite), add the two `VITE_SUPABASE_*` environment
variables from `.env.example`, deploy. `vercel.json` routes `/admin` to the app.
