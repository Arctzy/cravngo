-- =====================================================================
-- Cravn' Go — Supabase database
--
-- How to use: Supabase dashboard → SQL Editor → New query → paste this
-- whole file → Run. Safe to run again later (it updates menu, hours and
-- functions without deleting customers, bookings or subscribers).
--
-- There are no logins. Customers create an account with a username and
-- email that must both be unique, then book with that username or email.
--
-- The website never reads or writes tables directly. It calls the
-- functions at the bottom (register_customer, account_available,
-- create_booking, subscribe), which validate everything and price orders
-- from menu_items. Customer details and bookings can't be read from the
-- website at all; view them in the Supabase Table Editor.
-- =====================================================================

create schema if not exists private;

-- ---------- Upgrading from the first version (which used Supabase logins) ----------
-- That version's bookings were tied to login accounts, so its booking tables
-- (test data only) are rebuilt here. Nothing happens on a fresh project.
drop function if exists public.my_bookings();
drop function if exists public.cancel_booking(uuid);
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'bookings' and column_name = 'user_id') then
    drop table if exists public.booking_items;
    drop table public.bookings;
  end if;
end;
$$;

-- ---------- Menu: the prices the database trusts (pesos) ----------
create table if not exists public.menu_items (
  id     text primary key,
  name   text not null,
  price  integer not null check (price >= 0),
  active boolean not null default true
);

insert into public.menu_items (id, name, price) values
  ('carbonara',       'Carbonara',       120),
  ('lasagna',         'Lasagna',         150),
  ('chicken-alfredo', 'Chicken Alfredo', 300),
  ('chicken-piccata', 'Chicken Piccata', 250),
  ('tiramisu',        'Tiramisu',        150),
  ('limonata',        'Limonata',         95)
on conflict (id) do update set name = excluded.name, price = excluded.price;

-- ---------- Opening hours (0 = Sunday … 6 = Saturday, Philippine time) ----------
create table if not exists public.opening_hours (
  weekday smallint primary key check (weekday between 0 and 6),
  opens   time not null,
  closes  time not null
);

insert into public.opening_hours (weekday, opens, closes) values
  (0, '15:00', '23:00'),
  (1, '11:00', '21:00'), (2, '11:00', '21:00'), (3, '11:00', '21:00'), (4, '11:00', '21:00'),
  (5, '11:00', '23:00'), (6, '11:00', '23:00')
on conflict (weekday) do update set opens = excluded.opens, closes = excluded.closes;

-- ---------- Customers: one per username and one per email ----------
create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  username   text not null,             -- stored in lowercase
  full_name  text not null,
  email      text not null,             -- as typed (lowercase)
  email_key  text not null,             -- for duplicate checks: Gmail dots and +tags ignored
  phone      text not null,             -- 09XXXXXXXXX
  created_at timestamptz not null default now()
);
create unique index if not exists customers_username_key on public.customers (username);
create unique index if not exists customers_email_key    on public.customers (email_key);

-- ---------- Bookings: table reservations, pick-up and delivery orders ----------
create table if not exists public.bookings (
  id               uuid primary key default gen_random_uuid(),
  ref              text not null unique,
  customer_id      uuid not null references public.customers (id) on delete cascade,
  type             text not null check (type in ('reserve', 'pickup', 'delivery')),
  status           text not null default 'pending'
                   check (status in ('pending', 'confirmed', 'completed', 'cancelled')),
  scheduled_at     timestamptz not null,
  guests           smallint check (guests between 1 and 20),
  occasion         text,
  contact_name     text not null,
  contact_phone    text not null,
  address_street   text,
  address_barangay text,
  address_city     text,
  address_landmark text,
  notes            text,
  total            integer not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists bookings_customer_idx on public.bookings (customer_id, created_at desc);

create table if not exists public.booking_items (
  booking_id   uuid not null references public.bookings (id) on delete cascade,
  menu_item_id text not null references public.menu_items (id),
  name         text not null,
  price        integer not null,
  qty          smallint not null check (qty between 1 and 50),
  primary key (booking_id, menu_item_id)
);

-- ---------- Newsletter ----------
create table if not exists public.subscribers (
  id         bigint generated always as identity primary key,
  name       text not null,
  email      text not null unique,
  created_at timestamptz not null default now()
);

-- ---------- Row Level Security ----------
-- Menu and hours are public. Everything else has no policy, so the website
-- can't read it; only the functions below (and you, in the dashboard) can.
alter table public.menu_items    enable row level security;
alter table public.opening_hours enable row level security;
alter table public.customers     enable row level security;
alter table public.bookings      enable row level security;
alter table public.booking_items enable row level security;
alter table public.subscribers   enable row level security;

drop policy if exists "menu is public" on public.menu_items;
create policy "menu is public" on public.menu_items
  for select to anon, authenticated using (true);

drop policy if exists "hours are public" on public.opening_hours;
create policy "hours are public" on public.opening_hours
  for select to anon, authenticated using (true);

-- =====================================================================
-- Private helpers (not reachable from the website)
-- =====================================================================

-- PH mobile numbers: "0917 123 4567", "+63 917 123 4567", "9171234567" → "09171234567"
create or replace function private.normalize_ph_mobile(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d ~ '^09\d{9}$'  then d
    when d ~ '^639\d{9}$' then '0' || substr(d, 3)
    when d ~ '^9\d{9}$'   then '0' || d
  end
  from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) s;
$$;

-- Email for duplicate checks. Gmail ignores dots and anything after "+",
-- so j.uan+food@gmail.com and juan@gmail.com count as the same address.
create or replace function private.email_key(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(e, '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(e, '@', 1), '+', 1), '.', '') || '@gmail.com'
    else e
  end
  from (select lower(btrim(coalesce(p_email, ''))) as e) s;
$$;

-- The customer with this username or email, if any
create or replace function private.find_customer(p_account text)
returns public.customers
language sql
stable
set search_path = ''
as $$
  select c.*
  from public.customers c
  where c.username = lower(btrim(coalesce(p_account, '')))
     or c.email_key = private.email_key(p_account)
  limit 1;
$$;

-- One booking as JSON, with date/time in Philippine time
create or replace function private.booking_json(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id',       b.id,
    'ref',      b.ref,
    'type',     b.type,
    'status',   b.status,
    'date',     to_char(b.scheduled_at at time zone 'Asia/Manila', 'YYYY-MM-DD'),
    'time',     to_char(b.scheduled_at at time zone 'Asia/Manila', 'HH24:MI'),
    'guests',   b.guests,
    'occasion', b.occasion,
    'name',     b.contact_name,
    'phone',    b.contact_phone,
    'address',  case when b.type = 'delivery' then jsonb_build_object(
                  'street',   b.address_street,
                  'barangay', b.address_barangay,
                  'city',     b.address_city,
                  'landmark', b.address_landmark) end,
    'notes',    b.notes,
    'total',    b.total,
    'items',    coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'id', i.menu_item_id, 'name', i.name, 'price', i.price, 'qty', i.qty)
                         order by i.name)
                  from public.booking_items i
                  where i.booking_id = b.id), '[]'::jsonb),
    'created_at', b.created_at
  )
  from public.bookings b
  where b.id = p_id;
$$;

-- =====================================================================
-- Functions the website calls
-- =====================================================================

-- Is this username / email still free? → { "username_taken": bool, "email_taken": bool }
create or replace function public.account_available(p_username text default null, p_email text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'username_taken', exists (select 1 from public.customers where username = lower(btrim(coalesce(p_username, '')))),
    'email_taken',    exists (select 1 from public.customers where email_key = private.email_key(p_email))
  );
$$;

-- Create an account. Usernames: 3–20 letters, numbers, dots or underscores.
-- Errors carry the form field to highlight in their hint.
create or replace function public.register_customer(p_username text, p_full_name text, p_email text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_name     text := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_phone    text := private.normalize_ph_mobile(p_phone);
  v_index    text;
begin
  if v_username !~ '^[a-z0-9._]{3,20}$' then
    raise exception 'Usernames are 3–20 letters, numbers, dots or underscores.' using hint = 'username';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'Please enter your full name.' using hint = 'full_name';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address.' using hint = 'email';
  end if;
  if v_phone is null then
    raise exception 'Please enter a valid mobile number, e.g. 0917 123 4567.' using hint = 'phone';
  end if;

  if exists (select 1 from public.customers where username = v_username) then
    raise exception 'That username is already taken. Please choose another.' using hint = 'username';
  end if;
  if exists (select 1 from public.customers where email_key = private.email_key(v_email)) then
    raise exception 'That email is already registered. Use your existing username to book.' using hint = 'email';
  end if;

  begin
    insert into public.customers (username, full_name, email, email_key, phone)
    values (v_username, v_name, v_email, private.email_key(v_email), v_phone);
  exception when unique_violation then
    -- Two people grabbed the same username/email at the same moment
    get stacked diagnostics v_index = constraint_name;
    if v_index = 'customers_username_key' then
      raise exception 'That username is already taken. Please choose another.' using hint = 'username';
    end if;
    raise exception 'That email is already registered. Use your existing username to book.' using hint = 'email';
  end;

  return jsonb_build_object('username', v_username, 'full_name', v_name, 'email', v_email, 'phone', v_phone);
end;
$$;

-- Newsletter sign-up. Returns 'subscribed' or 'already'.
create or replace function public.subscribe(p_name text, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name  text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if char_length(v_name) not between 1 and 80 then
    raise exception 'Please enter your name (up to 80 characters).' using hint = 'name';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address.' using hint = 'email';
  end if;

  insert into public.subscribers (name, email) values (v_name, v_email)
  on conflict (email) do nothing;

  return case when found then 'subscribed' else 'already' end;
end;
$$;

-- Create a reservation, pick-up or delivery for a registered customer.
-- booking = { account: username or email, type, date: 'YYYY-MM-DD', time: 'HH:MM', notes,
--             guests, occasion,                      -- reserve
--             address, barangay, city, landmark,     -- delivery
--             items: [{ id, qty }] }                 -- required for pickup/delivery
-- Contact name and phone come from the customer's account.
create or replace function public.create_booking(booking jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers;
  v_type     text := booking ->> 'type';
  v_date     date;
  v_time     time;
  v_when     timestamptz;
  v_hours    record;
  v_guests   int;
  v_occasion text := nullif(btrim(booking ->> 'occasion'), '');
  v_street   text := nullif(btrim(booking ->> 'address'), '');
  v_barangay text := nullif(btrim(booking ->> 'barangay'), '');
  v_city     text := nullif(btrim(booking ->> 'city'), '');
  v_landmark text := nullif(btrim(booking ->> 'landmark'), '');
  v_notes    text := nullif(btrim(booking ->> 'notes'), '');
  v_bad      int;
  v_items    jsonb;
  v_total    int;
  v_ref      text;
  v_id       uuid;
begin
  -- Who: a registered username or email
  if nullif(btrim(booking ->> 'account'), '') is null then
    raise exception 'Please enter your username or email.' using hint = 'account';
  end if;
  v_customer := private.find_customer(booking ->> 'account');
  if v_customer.id is null then
    raise exception 'We couldn’t find an account with that username or email. Create one first — it only takes a minute.'
      using hint = 'account';
  end if;

  if v_type is null or v_type not in ('reserve', 'pickup', 'delivery') then
    raise exception 'Choose reserve, pick-up or delivery.' using hint = 'type';
  end if;

  -- When: a listed slot, within opening hours, 30 min to 60 days from now
  begin
    v_date := (booking ->> 'date')::date;
    v_time := (booking ->> 'time')::time;
  exception when others then
    raise exception 'Please choose a valid date and time.' using hint = 'date';
  end;
  if v_date is null or v_time is null then
    raise exception 'Please choose a date and time.' using hint = 'date';
  end if;

  v_when := (v_date + v_time) at time zone 'Asia/Manila';
  if v_when < now() + interval '30 minutes' then
    raise exception 'Please pick a time at least 30 minutes from now.' using hint = 'time';
  end if;
  if v_date > (now() at time zone 'Asia/Manila')::date + 60 then
    raise exception 'We take bookings up to 60 days ahead.' using hint = 'date';
  end if;

  select opens, closes into v_hours
  from public.opening_hours
  where weekday = extract(dow from v_date);
  if not found then
    raise exception 'Sorry, we’re closed that day.' using hint = 'date';
  end if;
  if v_time < v_hours.opens
     or v_time > v_hours.closes - interval '30 minutes'
     or extract(minute from v_time)::int % 30 <> 0
     or extract(second from v_time) <> 0 then
    raise exception 'Please pick one of the listed times (we’re open % – % that day).',
      to_char(v_date + v_hours.opens, 'FMHH12:MI AM'), to_char(v_date + v_hours.closes, 'FMHH12:MI AM')
      using hint = 'time';
  end if;

  -- Table details
  if v_type = 'reserve' then
    begin
      v_guests := (booking ->> 'guests')::int;
    exception when others then
      v_guests := null;
    end;
    if v_guests is null or v_guests not between 1 and 20 then
      raise exception 'Please choose the number of guests (1–20).' using hint = 'guests';
    end if;
    if v_occasion is not null
       and v_occasion not in ('Birthday', 'Anniversary', 'Date night', 'Business', 'Other') then
      v_occasion := 'Other';
    end if;
  else
    v_guests := null;
    v_occasion := null;
  end if;

  -- Delivery address
  if v_type = 'delivery' then
    if v_street is null or char_length(v_street) > 160 then
      raise exception 'Please enter your house number and street.' using hint = 'address';
    end if;
    if v_barangay is null or char_length(v_barangay) > 80 then
      raise exception 'Please enter your barangay.' using hint = 'barangay';
    end if;
    if v_city is null or char_length(v_city) > 80 then
      raise exception 'Please enter your city or municipality.' using hint = 'city';
    end if;
    if char_length(v_landmark) > 160 then
      raise exception 'Please keep the landmark under 160 characters.' using hint = 'landmark';
    end if;
  else
    v_street := null; v_barangay := null; v_city := null; v_landmark := null;
  end if;

  if char_length(v_notes) > 500 then
    raise exception 'Please keep notes under 500 characters.' using hint = 'notes';
  end if;

  -- Food: every dish must exist; duplicates are combined; prices come from menu_items
  if jsonb_typeof(coalesce(booking -> 'items', '[]'::jsonb)) <> 'array' then
    raise exception 'Your order looks wrong. Please refresh and try again.' using hint = 'items';
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(coalesce(booking -> 'items', '[]'::jsonb)) x
  left join public.menu_items m on m.id = x ->> 'id' and m.active
  where m.id is null or coalesce(x ->> 'qty', '') !~ '^\d{1,2}$';
  if v_bad > 0 then
    raise exception 'Your order has a dish we don’t recognise. Please refresh and try again.' using hint = 'items';
  end if;

  with picked as (
    select x ->> 'id' as id, sum((x ->> 'qty')::int) as qty
    from jsonb_array_elements(coalesce(booking -> 'items', '[]'::jsonb)) x
    group by x ->> 'id'
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'price', m.price, 'qty', p.qty)), '[]'::jsonb),
         coalesce(sum(m.price * p.qty), 0)
  into v_items, v_total
  from picked p
  join public.menu_items m on m.id = p.id;

  if exists (select 1 from jsonb_array_elements(v_items) e where (e ->> 'qty')::int not between 1 and 50) then
    raise exception 'Please order between 1 and 50 of each dish.' using hint = 'items';
  end if;
  if v_type <> 'reserve' and jsonb_array_length(v_items) = 0 then
    raise exception 'Add at least one dish for pick-up or delivery.' using hint = 'items';
  end if;

  -- Short reference customers can quote, e.g. CG-7K3M9Q (no 0/O or 1/I mix-ups)
  loop
    select 'CG-' || string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
    into v_ref
    from generate_series(1, 6);
    exit when not exists (select 1 from public.bookings where ref = v_ref);
  end loop;

  insert into public.bookings (
    ref, customer_id, type, scheduled_at, guests, occasion, contact_name, contact_phone,
    address_street, address_barangay, address_city, address_landmark, notes, total)
  values (
    v_ref, v_customer.id, v_type, v_when, v_guests, v_occasion, v_customer.full_name, v_customer.phone,
    v_street, v_barangay, v_city, v_landmark, v_notes, v_total)
  returning id into v_id;

  insert into public.booking_items (booking_id, menu_item_id, name, price, qty)
  select v_id, e ->> 'id', e ->> 'name', (e ->> 'price')::int, (e ->> 'qty')::int
  from jsonb_array_elements(v_items) e;

  return private.booking_json(v_id);
end;
$$;

-- ---------- Who may call what ----------
revoke all on schema private from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

grant execute on function public.account_available(text, text)               to anon, authenticated;
grant execute on function public.register_customer(text, text, text, text)  to anon, authenticated;
grant execute on function public.subscribe(text, text)                       to anon, authenticated;
grant execute on function public.create_booking(jsonb)                       to anon, authenticated;
