-- MacWest supplier directory (65 suppliers), imported from the cleaned sheet
-- dated 22-Sep-26. Payment terms, coverage and items supplied are preserved
-- verbatim in `notes`; phone numbers are stored exactly as supplied.
--
-- Idempotent: re-running refreshes the details of a supplier of the same name.

INSERT INTO public.suppliers (name, category, contact_name, phone, notes, created_by)
SELECT v.name, v.category, v.contact_name, v.phone, v.notes,
       (SELECT id FROM public.users WHERE lower(email) = 'geniusben24@gmail.com')
FROM (VALUES
  ('Fa Me Kɔ Eikwe Enterprise', 'Electrical', 'Madam Stella', '054 378 0352', 'Payment terms: Bi-weekly payments

Items supplied:
General / Other: General electrical materials'),
  ('Joack Construction', 'Building materials', NULL, '055 063 5465 / 055 063 6465', 'Payment terms: Invoice on 25th; account closes 24th; payment due 3rd of following month

Items supplied:
Aggregates: Chippings (per trip); Laterite (per trip); Normal Sand (per trip); Sand (per trip)
Blocks: Quarry Dust Blocks (each)
Consumables: Nails (per box)
Iron Rods: Foreign Iron Rods (per ton); Local Iron Rods (per ton)
Timber / Wood: Plywood (sheet)'),
  ('Josmagsons Enterprise / Everlasting Woods Co.', 'Timber & plumbing', 'Joseph Anlimah (hire purchase); Sylvester Anlimah (operations)', '024 292 4982 / 057 383 0476', 'Payment terms: To be agreed after reconciliation

Items supplied:
General / Other: Timber, wood products, plumbing materials'),
  ('Nems Construction Solutions', 'Building materials', 'Nathaniel Aboraborah', '+233 24 911 2614 / 0257446920', 'Items supplied:
Aggregates: Chippings (per trip); Laterite (per trip); Sand (per trip)
Blocks: Concrete Blocks (6”) (each)
Cement: Cement 32.5R (per bag); Cement 42.5R (per bag); Waterproof Cement (per bag)
Consumables: Binding Wire (roll); Concrete Cutting Disc (each); Nails (per box); Normal Cutting Disc (each)
Iron Rods: Iron Rods (High Tensile) (per ton); Iron Rods (Mild Steel) (per ton)'),
  ('Son of Ishallahu Ventures', 'Aggregates & equipment rental', 'Alhaji', '+233 24 268 0972 / 0594498012', 'Payment terms: Payments every 14 days

Coverage: Esiama, Anyinase, Sanzule, Eikwe

Items supplied:
Aggregates: Laterite Filling (per trip); Quarry Dust (per trip); River Sand (per trip); Sand (20 Cubic) (20 cubic); Stones (20 Cubic) (20 cubic)
Equipment Rental: Backhoe Rental (per day); Loader Rental (per day)'),
  ('AB Construction', 'Blocks', 'Albert Blay Nyanzo; Osagyefo George Allu', '+44 77 32 57 56 46 / 0557 88 43 88', 'Items supplied:
General / Other: Concrete blocks'),
  ('ADOM Blocks', 'Blocks', 'Joel Aluekeh (owner); Felix Abeka (factory overseer)', '054 959 6609 / 053 543 3966', 'Coverage: Transport included

Items supplied:
Blocks: Concrete Block (each)'),
  ('Alhaji Equipment Rentals', 'Equipment rental', NULL, '242680972', 'Items supplied:
Equipment rental'),
  ('Chafal Communication', NULL, NULL, '593970675', NULL),
  ('Crystal Vent West Ent', NULL, NULL, '247586464', NULL),
  ('DONWILL Enterprise', NULL, NULL, '247275750', 'Coverage: MDF Ho; MDF Tano South

Not specified (MoMo contact provided)'),
  ('Evergreen Ent.', NULL, 'Ernest Ahadzi', NULL, NULL),
  ('Joyce Prestige / Daniel Yormenu', NULL, NULL, '240546428', NULL),
  ('K. Ofori Limited — Oyarifa Branch', NULL, NULL, '205182234', 'Coverage: Oyarifa'),
  ('Kendah One Ventures', 'Tiles', NULL, NULL, 'Items supplied:
Tiles: 40×40 Polished (per box); 40×40 Rustic (per box); 60×60 Black (per box); 60×60 Polished (per box); Floor Tiles 120×20 (per box); Floor Tiles 30×80 (per box); Unpolished (per box); Wall Tiles 25×40 (per box); Wall Tiles 30×60 (per box)'),
  ('NAT Supplies', NULL, NULL, '249112614', NULL),
  ('Osman 477 Ent.', NULL, NULL, NULL, NULL),
  ('Paques Store', NULL, NULL, '548848998', NULL),
  ('Parity Investment', NULL, NULL, '542055613', NULL),
  ('Sammy Blocks Alabokaazo', 'Blocks', 'Samuel Alu', NULL, 'Coverage: All project locations (transport included)

Items supplied:
Blocks: 6-inch Quarry Dust Blocks (bulk >3,500/day) (each); 6-inch Quarry Dust Blocks (each)'),
  ('Scurry Block Factory', 'Blocks & pavement', 'Eugene Koranteng', '0502900314 / 055 349 7650', 'Payment terms: Payment threshold GH¢100,000

Coverage: Ayinase, Nzema East Municipal (delivery outside Ayinase +GH¢0.50–GH¢1/block)

Items supplied:
Blocks: 6” Solid Block (per WhatsApp) (each)
Blocks (Quarry Dust, delivered): 5 inch Hollow — delivered outside Ayinase (each); 5 inch Solid — delivered outside Ayinase (each); 6 inch Hollow — delivered outside Ayinase (each); 6 inch Solid — delivered outside Ayinase (each)
Blocks (Quarry Dust): 5 inch Hollow (each); 5 inch Solid (each); 6 inch Hollow (each); 6 inch Solid (each)
Blocks (Sand, delivered): 5 inch Hollow — delivered outside Ayinase (each); 5 inch Solid — delivered outside Ayinase (each); 6 inch Hollow — delivered outside Ayinase (each); 6 inch Solid — delivered outside Ayinase (each)
Blocks (Sand): 5 inch Hollow (each); 5 inch Solid (each); 6 inch Hollow (each); 6 inch Solid (each)
Pavement Blocks: 200x100mm Walkway Block — Colored (each); 200x100mm Walkway Block — Non-Colored (each); 40x40cm Pavement Slab — Colored (each); 40x40cm Pavement Slab — Non-Colored (each); 60mm Interlocking/Driveway — Colored (each); 60mm Interlocking/Driveway — Non-Colored (each); Garden Kerb (each)'),
  ('Technical Construction Ltd', NULL, NULL, '249909434', NULL),
  ('TT Future Help Enterprise', NULL, NULL, '241070721', 'Coverage: Pokrom, Eastern Region'),
  ('Tumu Market Square', NULL, NULL, '0208424981 / 0248149042', 'Coverage: Tumu'),
  ('Uncle Jah Ent', NULL, NULL, '24198921', NULL),
  ('Uprising El-Shaddai Trading Agency', NULL, NULL, '592845870', NULL),
  ('V&C Ventures', NULL, NULL, NULL, NULL),
  ('Wilago Motors', NULL, NULL, '244838506', NULL),
  ('Abdulai Dari', NULL, NULL, '248470325', 'Coverage: MDF Bolebamboi'),
  ('Adede Ocansey', NULL, NULL, '245163828', NULL),
  ('Aflo Timothy', NULL, NULL, NULL, NULL),
  ('AK Wonder', NULL, NULL, '549361097', NULL),
  ('Alfred Akpor', NULL, NULL, '548143121', NULL),
  ('Alhaji Korkor', 'Blocks', NULL, '249940169', 'Coverage: MDF Ho; MDF Tano South

Items supplied:
Blocks'),
  ('Anita Sekyim', NULL, NULL, 'O555956358', 'Items supplied:
Phone as supplied; verify number'),
  ('Aziz Bojo', NULL, NULL, '597916116', 'Items supplied:
MoMo contact'),
  ('Cephas Saka', NULL, NULL, '599575112', NULL),
  ('ChrisKoku Company Limited / Ventures', NULL, 'Anna Ocansay', '554529422', NULL),
  ('Christine Tetteh', NULL, NULL, '531389924', 'Items supplied:
MoMo contact'),
  ('Daniel Zoe', NULL, NULL, '532447652', NULL),
  ('Danwana Abdulai', NULL, NULL, '0243427115 / 024499642', 'Coverage: Kulfuor Project'),
  ('Frank Kabutey', NULL, NULL, '244880303', NULL),
  ('Gertrude Ocansay', NULL, NULL, NULL, NULL),
  ('Hassan', NULL, NULL, '024 795 3370', 'Coverage: Salaga'),
  ('Henry Boateng', NULL, NULL, '548212488', NULL),
  ('I love my wife', NULL, NULL, '249195743', NULL),
  ('Isaac Nortei', NULL, NULL, '244923254', NULL),
  ('Isaac Sablah', NULL, NULL, NULL, NULL),
  ('Ishmael Antwi', NULL, NULL, '054 913 6337', NULL),
  ('Joseph Ddzraku', NULL, NULL, NULL, NULL),
  ('Kornutsey Ricky (J''melo)', NULL, NULL, '246895172', NULL),
  ('Kportufe Waltrude Kwaku', NULL, NULL, NULL, NULL),
  ('Macwest Cement Team', 'Cement', 'Godfred Adusei', '257703623', 'Items supplied:
Cement'),
  ('Muslene Enterprise', NULL, 'Mustapha Nafiu', '055 222 2413', 'Coverage: Salaga'),
  ('Nasir', NULL, NULL, '055 103 5900', 'Coverage: Salaga'),
  ('OAK', NULL, NULL, '24492990', NULL),
  ('Omoot Enterprise', NULL, NULL, '024 041 1144', 'Coverage: Salaga'),
  ('Salomey Asantewaa Prempeh', NULL, NULL, '598527442', 'Coverage: MDF Ho; MDF Tano South'),
  ('Samgbor Elijah', 'Blocks', NULL, '534131878', 'Coverage: MDF Ho; MDF Tano South

Items supplied:
Blocks'),
  ('Solomon', 'Aggregates', NULL, '054 640 2664', 'Items supplied:
Aggregates: Rough sand (not engaged yet)'),
  ('Sualisu', NULL, NULL, '054 294 6072', NULL),
  ('Suro Nyame', NULL, NULL, '541431811', NULL),
  ('Waliyu Nambe', NULL, NULL, '242341464', NULL),
  ('Zaanizoyi', NULL, NULL, '024 361 5651', 'Coverage: Salaga'),
  ('Zack', NULL, NULL, '024 361 5651', 'Coverage: Salaga')
) AS v(name, category, contact_name, phone, notes)
ON CONFLICT (lower(name)) DO UPDATE
  SET category     = EXCLUDED.category,
      contact_name = EXCLUDED.contact_name,
      phone        = EXCLUDED.phone,
      notes        = EXCLUDED.notes,
      updated_at   = now();
