-- 0014: listing authorization kept separate from ownership, availability and publication (BRD §22.2).

alter table public.properties
  add column listing_authorization text not null default 'none'
    check (listing_authorization in ('none', 'verbal', 'non_exclusive', 'exclusive', 'client_owned')),
  add column authorization_expires_on date,
  add column authorization_notes text;
