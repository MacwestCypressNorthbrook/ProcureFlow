-- MacWest project sites (28), names only.
--
-- All created as `active` so engineers can raise requisitions against them
-- immediately. Codes, site locations and clients are left blank to be filled in
-- from Admin -> Projects.
--
-- Idempotent: `projects.name` has no unique constraint, so this guards on name
-- rather than using ON CONFLICT.

INSERT INTO public.projects (name, status, created_by)
SELECT v.name, 'active',
       (SELECT id FROM public.users WHERE lower(email) = 'geniusben24@gmail.com')
FROM (VALUES
  ('Model Farm'),
  ('24 HR Market'),
  ('Provision of Support Services for local development projects and ESAP'),
  ('ADA 2 - SHS -32 - Two Storey Dormitory block & 3 number 4 unit two bedroom teachers bungalow'),
  ('ADA 3 - SHTS -33 - Two number two storey 12 Unit Classroom & 2KM fence wall'),
  ('ANLOGA (Science block & Staff bungalow constructions'),
  ('ADA 1 - SHS - 31- 3 storey 18 Unit Classroom & Rehabilation of Science lab - Lot 31'),
  ('CONFERENCE HALL'),
  ('Asasetre - Lot 2 - Dormitory'),
  ('Asasetre - Lot 1 - Classroom'),
  ('MDF Tano South'),
  ('MDF Salaga'),
  ('MDF Cape Coast'),
  ('MDF Bolebamboi'),
  ('MDF Ho'),
  ('MDF Ellembelle'),
  ('SHEAR FARM'),
  ('Construction of 1 No. 6 unit classroom block at Ofankor (St Peter''s Anglican) Ofankor'),
  ('GOIL PLC'),
  ('Construction of 6- unit classroom block for Nkroful Agricultural Secondary School - NASS SCHOOL'),
  ('ESIAMAH MARKET'),
  ('Construction of fence wall for Ghana Geological Survey Authority in Sunyani'),
  ('Bodi District Assembly'),
  ('RENOVATION WORKS'),
  ('Bakanta Road'),
  ('Warehouse retrofitting'),
  ('Optimisation of Pilot camp accommodation'),
  ('Kulfuo Project - 3 no 12 unit WC blocks')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.projects p WHERE lower(p.name) = lower(v.name)
);
