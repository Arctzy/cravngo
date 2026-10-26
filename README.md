# Cravn' Go — website

A static website (HTML, CSS, JavaScript) for Cravn' Go Italian Restaurant.
Customer accounts, bookings (reserve a table, pick-up, delivery) and the newsletter
are stored in **Supabase** (a hosted database), so the site deploys to **Vercel**
with no server code.

There are **no logins or passwords**. A customer creates an account with a username
and email, and each of those can only be registered once. They then book by typing
that username or email.

## Files

| Page / file          | What it is                                                        |
| -------------------- | ----------------------------------------------------------------- |
| `index.html`         | Home: hero, highlights, customer favorites, newsletter            |
| `about.html`         | Our story and why choose us                                       |
| `menu.html`          | Full menu with filters and "Add" buttons                          |
| `book.html`          | Reserve a table, order for pick-up, or order for delivery         |
| `gallery.html`       | Photo gallery                                                     |
| `contact.html`       | Address, hours, map, message form, newsletter                     |
| `register.html`      | Create an account (no duplicate usernames or emails)              |
| `css/styles.css`     | All the styling                                                   |
| `js/config.js`       | Your Supabase URL and key                                         |
| `js/data.js`         | Dishes, prices, photos and opening hours                          |
| `js/main.js`         | Shared by every page: header, order drawer, newsletter            |
| `js/menu.js`, `js/book.js`, `js/register.js`, `js/gallery.js`, `js/contact.js` | One script per page |
| `supabase/schema.sql`| The database: tables, rules and functions                         |

The header, footer and order drawer are repeated in every `.html` page. If you change
the navigation, change it in all seven pages.

## 1. Set up the database (once)

1. Create a free project at [supabase.com](https://supabase.com).
2. In your project, open **SQL Editor → New query**, paste the whole of
   [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
3. Copy your **Project URL** and **public key** into [`js/config.js`](js/config.js). Either:
   - click **Connect** at the top of your project dashboard, or
   - open **Project Settings** (the gear icon). The Project URL is under **Data API**,
     and the key is under **API Keys**: the **Publishable** key, or **anon public** under
     "Legacy API keys".

   The URL looks like `https://abcdefghijklmnop.supabase.co`. The key starts with
   `sb_publishable_…` or `eyJ…`. **Never** use the **secret** / **service_role** key.

## 2. Deploy to Vercel

1. Put this folder in a GitHub repository.
2. In Vercel, **Add New → Project**, import the repository.
   Framework preset: **Other**. Leave the build command empty. Output directory: `.` (the root).
3. Click **Deploy**. Add your own domain under **Project → Settings → Domains**.

## Running the restaurant

In Supabase → **Table Editor**:

- **`customers`**: everyone who created an account.
- **`bookings`**: new reservations and orders, with the customer's name and phone.
  The food is in **`booking_items`**. Change `status` to `confirmed`, `completed` or `cancelled`.
- **`subscribers`**: newsletter sign-ups.

## Changing prices or opening hours

Update both places so the website and the database agree:

| What  | Website                                  | Database (`supabase/schema.sql`, then run it again) |
| ----- | ---------------------------------------- | --------------------------------------------------- |
| Price | `js/data.js`                              | `menu_items`                                        |
| Hours | `js/data.js` (and the JSON-LD block at the top of `index.html`) | `opening_hours`              |

The database always has the final say on prices: totals are recalculated from `menu_items`.
