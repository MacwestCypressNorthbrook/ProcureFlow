-- 019 — say what an attachment IS, instead of guessing from its name
--
-- An invoice arrives in this system as a file. Engineers and Supply Chain both
-- upload them, and nothing on the row said which files were invoices, so the
-- Invoices report had to guess from the filename. That guess is precise but
-- deaf: it caught every file with "invoice" in its name and none of the 44
-- invoices photographed and saved as `IMG_0985.png`, `ADA SHS 209.jpeg` or
-- `Kob-Mens Enterprise.jpeg`. Two thirds of the invoices in the system were
-- invisible to the page built to show them.
--
-- `is_invoice` replaces the guess with a statement. The uploader ticks a box,
-- and from then on the report asks the row, not the name.
--
-- Three states, and the difference matters:
--   TRUE  — someone said this is an invoice.
--   FALSE — someone said it is not. Never reconsidered, never guessed at.
--   NULL  — nobody has said. Only legacy rows, and only until someone looks;
--           the report falls back to the filename for these, so nothing that
--           used to appear disappears on the day this is applied.
--
-- Additive and idempotent: safe before OR after the code, and safe to re-run.
-- Code that predates it keeps working, because the filename fallback is still
-- there for NULL.

ALTER TABLE public.request_attachments
    ADD COLUMN IF NOT EXISTS is_invoice BOOLEAN;

COMMENT ON COLUMN public.request_attachments.is_invoice IS
    'Did the uploader say this file is a supplier invoice? NULL = never stated (legacy row); the Invoices report then falls back to the filename.';

-- Partial index: the report only ever asks for the true ones.
CREATE INDEX IF NOT EXISTS idx_request_attachments_is_invoice
    ON public.request_attachments (request_id) WHERE is_invoice IS TRUE;

-- ---------------------------------------------------------------------------
-- Backfill 1: every file whose name already says "invoice".
--
-- The same rule the report used before this column existed, so applying this
-- migration changes nothing about which of these rows appear — it only makes
-- the answer explicit and stops it depending on the name from here on.
-- `IS NULL` guards it: a decision already recorded is never overwritten.
-- ---------------------------------------------------------------------------
UPDATE public.request_attachments
   SET is_invoice = TRUE
 WHERE is_invoice IS NULL
   AND file_name ~* 'invoice|\yinv[[:space:]._-]*[0-9]';

-- ---------------------------------------------------------------------------
-- Backfill 2: the image attachments, classified by reading each one.
--
-- 52 images whose names gave nothing away were opened and looked at. These 44
-- are invoices, receipts or priced waybills from a supplier — real money owed
-- or paid, every one of them invisible to the Invoices report until now.
-- ---------------------------------------------------------------------------
UPDATE public.request_attachments SET is_invoice = TRUE
 WHERE is_invoice IS NULL AND id IN (
    'ef1ef4b9-3241-45a7-9517-01b53b9a2c3b',  -- Kob-Mens Enterprise.jpeg
    '654d0892-4162-472f-8105-bf7e7c49b942',  -- backhoe rental.jpeg
    'a2902106-b1ae-4b13-9b8f-dfc514fb8b68',  -- IMG_0985.png
    '91497ff6-3fc7-4024-accd-b18783d594a8',  -- IMG_20261012_113039_651.jpg
    '66085c63-07e7-411e-9faf-8a850c6ca878',  -- IMG_20261012_112047_736.jpg
    '0a8138bb-55ac-4d28-b81b-4c5511332e9a',  -- hollow blocks anloga.jpeg
    'e697d832-7471-4716-8a4c-817f5f836855',  -- 65835654-9dfd-4efa-936c-e7c8a41ee9f0.jpeg
    '6b30de23-2a32-4b65-8301-804f446e07d9',  -- IMG_3137.jpeg
    '8530862a-25f3-4703-a5f2-4c80adf2651a',  -- KULFUO PROJECT.jpeg
    'c3bbbc7b-a285-42de-83d6-c12e6db776b9',  -- 9a5a8c05-365b-471f-94ef-28176737a7fc.jpeg
    'bbef1c3e-a22e-4ee7-b397-5496a7a92296',  -- 92a648a9-8c37-4420-b0d3-e64536bf1bbf.jpeg
    '18956821-0cda-40bc-b29a-91ba21838652',  -- 4264639e-b013-486b-8ead-445d75918b1a.jpeg
    '531432cf-20a2-4cc8-afdc-c4c5c69137b4',  -- 98d651ac-f9e3-4272-abcf-15890673cf61.jpeg
    '15fa727a-e78e-4317-a70f-9498ccf0cf69',  -- IMG_6759.jpeg
    '192ea3ea-e421-4374-8d21-32fec970abd8',  -- 5fcf1e70-647c-46b0-887a-a7e7a6d67a36.jpeg
    '25e78af7-b970-4f9a-aa3f-1113d31ae867',  -- allotey door.jpeg
    'fa2d553b-519f-4e82-a7e4-64cf3a3ee8cc',  -- PHOTO-2026-10-08-09-14-06.jpg
    'c5139a80-96d5-4503-83f3-07d69ea2e1b0',  -- Pump materials .jpeg
    '76ea3458-5bf9-420a-bda8-baae016a349b',  -- IMG-20261005-WA0009.jpg
    '905faf37-6b30-4bb7-affa-f371b12d4809',  -- IMG-20261005-WA0008.jpg
    '19796f14-4a97-4a7e-af89-50a8a3d7324b',  -- IMG_0888.png
    'cd3de73c-096b-483a-a0a8-b3c1acdb41da',  -- b3dfb92d-1f84-40ef-983a-d773773fc0ef.jpeg
    'f1c72fa7-a5c0-43f6-808f-76075691fb77',  -- 654889af-c092-4d2e-ac24-dded5316920f.jpeg
    '91dd000a-b6ee-496d-b232-c050081c27c2',  -- e597d1ef-ee54-410f-be23-969ce4955849.jpeg
    'd5f46119-8819-4411-a121-ff276e1f6209',  -- IMG_0131.jpeg
    'b88d57c8-ce5a-4108-8768-9fc8e8839352',  -- ADA SHS 209.jpeg
    '030e0c5e-9c24-4be5-8e64-c094ab2d3ee7',  -- ADA SHTS REBAR 17.jpeg
    '16a6ecd0-f6a4-4ccf-90e8-2aa7bd6ea909',  -- ADA SHS 219.jpeg
    'f836e085-9e03-47ae-9aee-58b72f50f636',  -- ADA SHS 170.jpeg
    '1fa4f289-428b-4889-ac43-956e3a757bcf',  -- cement Adede 60,000.jpeg
    '90f81f3d-12dc-453f-bdf9-dd40352c4821',  -- cement AK wonder 54,000.jpeg
    'e8fe8088-ef5f-4407-809f-e10a7f27750a',  -- IMG-20261005-WA0009.jpg
    '38906cf2-8e3b-4419-b534-a434d9c2006c',  -- 17912153983565264210910387385491.jpg
    '44f2be24-1caa-4a67-8fe9-99316aedcb0b',  -- alhaji chippings.jpeg
    '75ae38a9-34af-4d18-aead-baf09b85d642',  -- kanbunli.jpeg
    '9456c74a-f84d-471c-8820-8cadec2c7622',  -- Plumbing items phase 1.jpeg
    'c748bbe1-54a5-4bad-8fdb-c3df0bfa2d64',  -- Elecrical .jpeg
    '7f42c95a-e1ab-4f4b-b333-4aca3ff71da0',  -- P PM.jpeg
    '6a7bc1e7-92f8-4771-a3b3-7e6d9006d5f6',  -- Raw Matls .jpeg
    'a90c8fc8-0fbd-41fa-b209-7adb9fd20cea',  -- ADA SHTS.jpeg
    'ea444dc2-15de-4958-b79d-3fa0acce8d1a',  -- 34f7a7c2-ef7e-4a26-b944-2adc4923df87.jpeg
    '8f6e5754-c815-475c-b707-927a4c22b6af',  -- MUSLENE CHIPPINGS.jpeg
    'ae4dadbb-5796-4d38-a681-3eadb5dbb3eb',  -- MUSLENE BLOCKS.jpeg
    '6d3f7fe9-e29c-477a-a6ef-02fa68e25946'  -- Receipt.PNG
);

-- ---------------------------------------------------------------------------
-- Backfill 3: the images that are NOT invoices.
--
-- Recorded as FALSE rather than left NULL so the question is settled: these
-- were looked at and ruled out, and nothing should offer them up again.
--
-- The estimates are the judgement call. Each is written on a supplier's
-- invoice pad and carries a total, but the customer line reads "Estimate" —
-- a quotation for work not yet billed. They are excluded on the grounds that
-- an estimate is not money owed. Flip any of them to TRUE if the business
-- treats them as invoices.
-- ---------------------------------------------------------------------------
UPDATE public.request_attachments SET is_invoice = FALSE
 WHERE is_invoice IS NULL AND id IN (
    '347261c1-8f47-47ca-9b2a-b15381a5ccc0',  -- IMG_0905.jpeg — a plumbing layout drawing
    '7905ebd3-58cb-4cd2-bb1b-09f2b639443c',  -- roller compactor picture.jpeg — a photograph of a roller compactor
    'd9cca073-a25c-48c4-916f-cc2ade63a4c3',  -- Services Material quantities.jpeg — a handwritten materials list, no prices
    'fe3df5f2-3d9a-4219-bbba-35673ded4621',  -- 829d3d90-0e9c-452e-8b83-2bfadc5a70c8.jpeg — Willago Motors, marked "Estimate"
    'b846fe1a-bf12-43a3-8e0f-7a8043227329',  -- IMG_20261006_181233_079.jpg — Abess Hardware, marked "Estimate"
    '3d8fd57d-6be6-46b5-842c-019380271c70',  -- IMG_20261007_100304_233.jpg — Abess Hardware, marked "Estimate"
    'f796ba2f-6ae4-4bee-958b-88fd407c7cf1',  -- IMG_20261006_181233_079.jpg — Abess Hardware, marked "Estimate"
    '4e961374-6945-4eb2-a9e4-c6d65f83bfff'  -- IMG_20261006_181233_079.jpg — Abess Hardware, marked "Estimate"
);
