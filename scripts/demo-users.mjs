// Creates (or resets) one demo staff account per role. For demos only — the passwords are public.
// Usage: npm run db:demo-users            npm run db:demo-users -- --remove
import pg from "pg";

export const DEMO_USERS = [
  { email: "superadmin@demo.local", name: "Demo Super Admin", role: "super_admin" },
  { email: "manager@demo.local", name: "Demo Manager", role: "management" },
  { email: "property@demo.local", name: "Demo Property Manager", role: "property_manager" },
  { email: "agent@demo.local", name: "Demo Agent", role: "agent" },
  { email: "finance@demo.local", name: "Demo Finance Officer", role: "finance" },
  { email: "legal@demo.local", name: "Demo Legal Officer", role: "legal" },
];
export const DEMO_PASSWORD = "Demo@2026!";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("begin");
  if (process.argv.includes("--remove")) {
    const emails = DEMO_USERS.map((u) => u.email);
    // Deleting the auth user cascades to staff. Records they created keep a null author.
    const { rowCount } = await client.query("delete from auth.users where email = any($1)", [emails]);
    console.log(`Removed ${rowCount} demo accounts.`);
  } else {
    for (const u of DEMO_USERS) {
      const { rows } = await client.query(
        `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                                 raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                                 confirmation_token, recovery_token, email_change_token_new, email_change)
         values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1,
                 extensions.crypt($2, extensions.gen_salt('bf')), now(),
                 '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', $3::text), now(), now(), '', '', '', '')
         on conflict (email) where is_sso_user = false do update
           set encrypted_password = excluded.encrypted_password, email_confirmed_at = now(), updated_at = now()
         returning id`,
        [u.email, DEMO_PASSWORD, u.name],
      );
      const id = rows[0].id;
      await client.query(
        `insert into auth.identities (id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
         values (gen_random_uuid(), $1::uuid, 'email', $2::text, jsonb_build_object('sub', $2::text, 'email', $3::text, 'email_verified', true), now(), now(), now())
         on conflict (provider_id, provider) do nothing`,
        [id, String(id), u.email],
      );
      await client.query(
        `insert into public.staff (id, full_name, email, role) values ($1, $2, $3, $4)
         on conflict (id) do update set role = excluded.role, active = true, full_name = excluded.full_name`,
        [id, u.name, u.email, u.role],
      );
      console.log(`${u.role.padEnd(17)} ${u.email}`);
    }
    console.log(`Password for all: ${DEMO_PASSWORD}`);
  }
  await client.query("commit");
} catch (err) {
  await client.query("rollback");
  throw err;
} finally {
  await client.end();
}
