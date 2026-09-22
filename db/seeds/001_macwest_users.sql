-- MacWest site team.
--
-- Profiles are created ahead of first sign-in: auth_id holds a `pending:` placeholder
-- until the person signs in with this email, at which point provisionUser() in
-- src/lib/auth/server.ts claims the row and their role carries over.
--
-- Idempotent: re-running refreshes name and role but never overwrites a real auth_id.

INSERT INTO public.users (auth_id, email, name, role) VALUES
  ('pending:samuel.nketiah@macwest.com.gh',    'samuel.nketiah@macwest.com.gh',    'Samuel Nketiah', 'engineer'),
  ('pending:akwei.allotey@macwest.com.gh',     'akwei.allotey@macwest.com.gh',     'Akwei Allotey',  'engineer'),
  ('pending:prince.barnes@macwest.com.gh',     'prince.barnes@macwest.com.gh',     'Prince Barnes',  'engineer'),
  ('pending:stephen.dogbe@macwest.com.gh',     'stephen.dogbe@macwest.com.gh',     'Steven Dogbe',   'engineer'),
  ('pending:daniel.gyakye@macwest.com.gh',     'daniel.gyakye@macwest.com.gh',     'Daniel Gyakye',  'project_lead'),
  ('pending:mandela.aduko@macwest.com.gh',     'mandela.aduko@macwest.com.gh',     'Mandela Aduko',  'engineer'),
  ('pending:timothy.aflo@macwest.com.gh',      'timothy.aflo@macwest.com.gh',      'Timothy Aflo',   'engineer'),
  ('pending:abdulai.zulkifulu@macwest.com.gh', 'abdulai.zulkifulu@macwest.com.gh', 'Abdullah',       'engineer'),
  ('pending:richard.agyei@macwest.com.gh',     'richard.agyei@macwest.com.gh',     'Richard Agyei',  'engineer'),
  ('pending:vincent.mewen@macwest.com.gh',     'vincent.mewen@macwest.com.gh',     'Vincent Mewen',  'engineer'),
  ('pending:eric.andoh@macwest.com.gh',        'eric.andoh@macwest.com.gh',        'Eric Andoh',     'engineer')
ON CONFLICT (email) DO UPDATE
  SET name = EXCLUDED.name,
      role = EXCLUDED.role,
      updated_at = now();
