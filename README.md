# Real estate platform

Public property website plus the database for a CMS/CRM covering leads, customers, sale and purchase transactions, rental contracts, payment schedules, receipts and reminders. Requirements are in [docs/BRD.md](docs/BRD.md).

**Stack:** Vite, React, TypeScript, Tailwind CSS v4, Supabase (Postgres, Auth, Storage, pg_cron).

## Status

| Part | State |
|---|---|
| Database: all modules, roles and permissions, row level security, audit log, reminders, dashboard figures | Done (`supabase/migrations`) |
| Public website: home, buy, rent, search and filters, property details, enquiry and viewing forms, sell your property, about, contact, privacy, terms | Done |
| Staff admin portal (CMS, CRM, contracts, payments, receipts, reports, user management) | Next |
| Email, SMS and WhatsApp reminder delivery | Needs provider accounts (reminders are queued in `reminder_log`) |

## Setup

```sh
npm install
cp .env.example .env       # fill in the anon key and database password
npm run db:setup -- --seed # applies migrations, loads sample listings
npm run dev
```

`DATABASE_URL` must use the Supabase **session pooler** host (`aws-0-eu-west-1.pooler.supabase.com`, user `postgres.<project-ref>`); the direct `db.<ref>.supabase.co` host is IPv6-only. It is only used by `db:setup` and must never get a `VITE_` prefix.

## How access works

- **Website visitors** read published listings (public columns only) and reference data, and write only through `submit_inquiry()`, which validates input, flags repeat enquiries by mobile number, creates a CRM lead and alerts staff with `leads.assign`.
- **Staff** are Supabase Auth users with a row in `staff`. Each role (`super_admin`, `management`, `property_manager`, `agent`, `finance`, `legal`) maps to permissions in `role_permissions`; extra grants per person go in `staff_permissions`. Every table checks `has_permission()` in its RLS policies.
- Sensitive actions need their own permission: publishing, archiving, deleting, approving and cancelling transactions, cancelling contracts, reversing payments (`payments.adjust`), deleting records (`records.delete`).

## Key rules enforced in the database

- Listings can only be published with a price, size, description, photo, and bedrooms/bathrooms for residential types.
- Properties with transactions, contracts or payment schedules cannot be deleted; archive them instead.
- Payments are never edited or deleted. They are reversed with a type and reason, and receipts come from recorded payments.
- Contract status changes follow `contract_status_transitions`. Renewals create a new linked contract; old terms are kept.
- A transaction can only be marked Completed once it has a buyer, a seller, a signed contract and approval, with nothing outstanding.
- `run_daily_reminders()` runs at 08:00 PKT through pg_cron. Intervals and recipients are rows in `reminder_rules`.

## Make the first administrator

Create the user in Supabase → Authentication, then run in the SQL editor:

```sql
insert into public.staff (id, full_name, email, role)
select id, 'Your Name', email, 'super_admin' from auth.users where email = 'you@example.com';
```
