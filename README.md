# Cravn' Go — website

A static site (HTML, CSS, JS) for Cravn' Go Italian Restaurant. Accounts, bookings
(reserve a table, pick-up, delivery) and the newsletter are stored in **Supabase**
(hosted Postgres), so the site deploys to **Vercel** with no server code.

## 1. Set up the database (once)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the dashboard, open **SQL Editor → New query**, paste the whole of
   [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
3. Open **Project Settings → API** and copy the **Project URL** and the
   **anon / publishable key** into [`config.js`](config.js).
   Never paste the `service_role` / secret key into the website.
4. **Authentication → Sign In / Providers → Email**:
   - For the simplest setup, turn **off "Confirm email"** so new customers are signed in right away.
   - If you keep it on, add your own SMTP under **Authentication → Emails**. Supabase's built-in
     sender is only for testing and is heavily rate-limited.
5. **Authentication → URL Configuration**: set **Site URL** to your live address
   (e.g. `https://cravngo.vercel.app` or your own domain).

## 2. Deploy to Vercel

1. Put this folder in a GitHub repository.
2. In Vercel, **Add New → Project**, import the repository.
   Framework preset: **Other**. Leave the build command empty. Output directory: `.` (the root).
3. Click **Deploy**. Add your own domain under **Project → Settings → Domains**.

## Running the restaurant

- **New bookings** appear in Supabase → **Table Editor → `bookings`** (food is in `booking_items`).
  Change `status` to `confirmed`, `completed` or `cancelled`; customers see it in **My account**.
- **Newsletter sign-ups** are in the `subscribers` table.

## Changing prices or opening hours

Update both places so the site and the database agree:

| What  | Website                                                   | Database (`supabase/schema.sql`, then run it again) |
| ----- | --------------------------------------------------------- | --------------------------------------------------- |
| Price | the dish's `data-price` and price label in `index.html`   | `menu_items`                                        |
| Hours | the hours table in `index.html` (and the JSON-LD at the top) | `opening_hours`                                  |

The database always has the final say on prices: totals are recalculated from `menu_items`.
