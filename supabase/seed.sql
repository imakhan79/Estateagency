-- Sample listings for development. Safe to re-run (skips existing slugs).
do $$
declare
  r record;
  v_id uuid;
  img text;
  i int;
  f text;
begin
  for r in select * from (values
    ('dha-phase-6-1-kanal-house', '1 Kanal modern house in DHA Phase 6', 'residential', 'house', 'sale', 95000000, 'Lahore', 'DHA Phase 6', 'Block C, DHA Phase 6', 1, 'kanal', 5, 6, 2, 'semi_furnished', true, 'available',
      'Brand-new double-storey house on a wide road close to the main boulevard. Five bedrooms with attached baths, a double-height lounge, an imported kitchen, a drawing and dining room, a basement home cinema and a servant quarter. Solar system installed and gas connection available.',
      array['parking','security','gas','solar','basement','servant-quarter','lawn','air-conditioning'],
      array['https://images.unsplash.com/photo-1600596542815-ffad4c1539a9','https://images.unsplash.com/photo-1600585154340-be6161a56a0c','https://images.unsplash.com/photo-1600607687939-ce8a6c25118c']),
    ('bahria-town-10-marla-house', '10 Marla house in Bahria Town, Sector C', 'residential', 'house', 'sale', 42500000, 'Lahore', 'Bahria Town', 'Sector C, Bahria Town', 10, 'marla', 5, 5, 2, 'unfurnished', true, 'available',
      'Well-built 10 marla house facing a park in a gated sector. Five bedrooms, two kitchens, a TV lounge on each floor and a lawn at the front. Close to the mosque, school and commercial area, with 24-hour security.',
      array['parking','security','gas','park-facing','lawn','gated'],
      array['https://images.unsplash.com/photo-1568605114967-8130f3a36994','https://images.unsplash.com/photo-1564013799919-ab600027ffc6']),
    ('gulberg-2-bed-apartment', '2 bed apartment in Gulberg III', 'residential', 'apartment', 'sale', 28000000, 'Lahore', 'Gulberg III', 'MM Alam Road, Gulberg III', 1350, 'sqft', 2, 2, 1, 'furnished', true, 'available',
      'Furnished apartment on the 8th floor of a secure building with a lift, backup generator and covered parking. Open-plan lounge and kitchen, two bedrooms with attached baths and a balcony with city views. Walking distance to MM Alam Road.',
      array['parking','lift','security','backup-power','cctv','air-conditioning'],
      array['https://images.unsplash.com/photo-1545324418-cc1a3fa10c00','https://images.unsplash.com/photo-1502672260266-1c1ef2d93688','https://images.unsplash.com/photo-1522708323590-d24dbb6b0267']),
    ('e-11-islamabad-upper-portion-rent', 'Upper portion for rent in E-11', 'residential', 'upper-portion', 'rent', 150000, 'Islamabad', 'E-11', 'E-11/2', 12, 'marla', 3, 3, 1, 'unfurnished', true, 'available',
      'Upper portion with a separate entrance, three bedrooms with attached baths, a lounge, kitchen and a terrace with Margalla views. Gas, electricity and water included in a separate meter. Suitable for a small family.',
      array['gas','electricity','water','parking'],
      array['https://images.unsplash.com/photo-1580587771525-78b9dba3b914','https://images.unsplash.com/photo-1493809842364-78817add7ffb']),
    ('clifton-sea-view-apartment-rent', '3 bed sea-view apartment for rent in Clifton', 'residential', 'apartment', 'rent', 350000, 'Karachi', 'Clifton', 'Block 2, Clifton', 2100, 'sqft', 3, 3, 1, 'semi_furnished', true, 'available',
      'Spacious apartment with uninterrupted sea views, three bedrooms, a large lounge and a modern kitchen. Building has lifts, standby generator, a gym and reserved parking. Available immediately.',
      array['parking','lift','security','backup-power','air-conditioning','cctv'],
      array['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267','https://images.unsplash.com/photo-1502672260266-1c1ef2d93688']),
    ('blue-area-office-rent', 'Furnished office in Blue Area', 'commercial', 'office', 'rent', 450000, 'Islamabad', 'Blue Area', 'Jinnah Avenue, Blue Area', 2400, 'sqft', null, 2, null, 'furnished', false, 'available',
      'Ready-to-move-in office on Jinnah Avenue with reception, 20 workstations, two manager rooms, a meeting room and a kitchenette. Building has lifts, generator backup and basement parking.',
      array['parking','lift','backup-power','air-conditioning','security'],
      array['https://images.unsplash.com/photo-1497366216548-37526070297c']),
    ('dha-phase-8-commercial-plot', '4 Marla commercial plot in DHA Phase 8', 'land', 'commercial-plot', 'sale', 65000000, 'Lahore', 'DHA Phase 8', 'Broadway Commercial, DHA Phase 8', 4, 'marla', null, null, null, null, true, 'reserved',
      'Commercial plot on Broadway in a fast-developing area of DHA Phase 8. Possession available and all dues clear. Ideal for a plaza with shops on the ground floor and offices above.',
      array['main-boulevard','corner'],
      array['https://images.unsplash.com/photo-1500382017468-9049fed747ef']),
    ('bahria-enclave-residential-plot', '1 Kanal residential plot in Bahria Enclave', 'land', 'residential-plot', 'sale', 18500000, 'Islamabad', 'Bahria Enclave', 'Sector H, Bahria Enclave', 1, 'kanal', null, null, null, null, false, 'available',
      'Level plot in a developed sector, close to the park and mosque. Possession and utility charges paid. Good location to build a family home with hill views.',
      array['park-facing','gated'],
      array['https://images.unsplash.com/photo-1500382017468-9049fed747ef'])
  ) as t(slug, title, cat, typ, listing, price, city, area, address, size, unit, beds, baths, floors, furnishing, featured, availability, description, feats, imgs)
  loop
    continue when exists (select 1 from public.properties where slug = r.slug);

    insert into public.properties (slug, title, description, category_id, type_id, listing_type, price, city, area,
                                   address, public_address, size, size_unit, bedrooms, bathrooms, floors, furnishing,
                                   featured, availability, publication)
    values (r.slug, r.title, r.description,
            (select id from public.property_categories where slug = r.cat),
            (select id from public.property_types where slug = r.typ),
            r.listing, r.price, r.city, r.area, r.address, r.area || ', ' || r.city, r.size, r.unit,
            r.beds, r.baths, r.floors, r.furnishing, r.featured, r.availability, 'draft')
    returning id into v_id;

    i := 0;
    foreach img in array r.imgs loop
      insert into public.property_media (property_id, kind, external_url, alt, sort)
      values (v_id, 'image', img || '?w=1600&q=80&auto=format&fit=crop', r.title, i);
      i := i + 1;
    end loop;

    foreach f in array r.feats loop
      insert into public.property_features (property_id, feature_id)
      select v_id, id from public.features where slug = f;
    end loop;

    update public.properties set publication = 'published' where id = v_id;
  end loop;
end;
$$;
