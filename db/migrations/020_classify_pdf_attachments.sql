-- 020 — classify the remaining PDF attachments by reading them
--
-- Migration 019 settled the 25 files named "invoice" and the 52 images, and
-- left 31 PDFs unjudged on the assumption they were labour paperwork. Each has
-- now been opened, and that assumption was partly wrong: 7 are genuine
-- third-party bills, six of them NEMS Construction Solutions invoices hiding
-- behind names like "MDF PROJECT-BLOCKS.pdf" — one for GHS 135,100.
--
-- After this, no attachment in the system is unjudged. Every row says what it
-- is, and the filename fallback in `invoiceAttachmentSql` governs only files
-- uploaded from here on by a client too old to ask the question.

-- ---------------------------------------------------------------------------
-- Genuine supplier bills.
-- ---------------------------------------------------------------------------
UPDATE public.request_attachments SET is_invoice = TRUE
 WHERE is_invoice IS NULL AND id IN (
    'bafa5f36-a98f-4afb-bb5f-041622636f9d',  -- MDF PROJECT-WATER HOSE.pdf — NEMS Construction Solutions invoice — water hose, GHS 500
    'b21b18e0-c099-4b24-be2a-ca63748e6a91',  -- MDF PROJECT-CYBER WOOD.pdf — NEMS Construction Solutions invoice — cyber board, GHS 8,800
    '08630ff3-6efd-4c12-b5c2-8e3f5f7bba34',  -- Macwest Aug-sept.pdf — Amilcar Cabral School utility bill — electricity + water, GHS 1,340
    '1665616b-a205-4898-bf0d-0ef4755fdf8b',  -- MDF PROJECT-BLOCKS.pdf — NEMS Construction Solutions invoice — 4000 blocks, GHS 48,000
    '67924bd9-8b15-47f5-9065-76b9356f3d09',  -- MDF PROJECT-NAILS .pdf — NEMS Construction Solutions invoice — nails, GHS 1,200
    '67b50060-9216-4480-9c9d-1d6a3e6a181f',  -- 200bgs CEMENT MDF PROJECT-30TH SEPT.pdf — NEMS Construction Solutions invoice — 200 bags cement, GHS 22,000
    '6e319774-e63c-4be3-9e9b-64ba195180f0'  -- MDF PROJECT-KUMGBUNLII.pdf — NEMS Construction Solutions invoice — cement/BRC/DPM, GHS 135,100
);

-- ---------------------------------------------------------------------------
-- Macwest's own requisition forms, and forward quotations.
--
-- Neither is a bill from a supplier: a requisition form is the ASK, and a
-- proforma or a budget is a PRICE, not money owed.
-- ---------------------------------------------------------------------------
UPDATE public.request_attachments SET is_invoice = FALSE
 WHERE is_invoice IS NULL AND id IN (
    '80efffd4-0973-48aa-8212-e31c43df9414',  -- Labour payment for six unit foundation concrete casting day 2.pdf — Macwest requisition form (MCWL-IMS-A-RF-001)
    'ab95c6e9-2caa-435a-a139-05087ff40e93',  -- REQUEST ARTISANS PAYMENTS FOR COLUMN, MATS SETTING OUT CONCRETING_092114.pdf — Macwest requisition form
    '951e6f44-bf8b-4cdf-beab-7b2600689b44',  -- NANANOM MONEY_012145.pdf — Macwest requisition form
    '67672c4f-2c39-4f39-b578-83845481199f',  -- LABOUR COST FOR SIX UNIT FOUNDATION CONCRETE CASTING_day 1.pdf — Macwest requisition form
    '35f17e4c-b9c0-4bb9-a145-d8258c1a38e6',  -- Payment for transporting concrete mixer to site.pdf — Macwest requisition form
    'f7a5c031-6ee7-4181-bb9b-057f5e32e16b',  -- PAYMENT REQUEST FOR CHIPPING.pdf — Macwest requisition form
    'b75cba22-3ee5-4060-adfa-ea7ceef0c005',  -- Labour payment for column reinforcement.pdf — Macwest requisition form
    'b1ed5707-ba89-4d6a-97df-840db97d11ae',  -- roller compactor.pdf — Raiders Ltd PROFORMA invoice — a quotation, "prices valid for 14 days"
    '6c527afe-15c3-487b-8b00-42f80522d018',  -- File_71_2.pdf — CWSA letter — a budget for pipeline diversion, not a bill
    '885e62fd-8ca5-461b-acfd-c4c05364df7e'  -- Fast Scan 01-09-2026 1041.pdf — CWSA cost breakdown — the budget attached to that letter
);

-- ---------------------------------------------------------------------------
-- Payment certificates — excluded, by decision.
--
-- Each is Macwest's own certification that a named tradesman is owed for work
-- done, signed by the Quantity Surveyor, Cost Control and the Technical Head.
-- It is the labour equivalent of an invoice, but it is not a bill from a
-- supplier, and the Invoices report is a supplier-spend ledger.
--
-- The practical half of the argument: twelve of these fourteen sit on
-- requisitions with no supplier on any line, so they could never be recorded
-- as supplier invoices anyway — they would sit on the page for good as
-- "Supplier not identified" rows that nobody can action.
--
-- Recorded as FALSE rather than left NULL so the decision is durable: these
-- were read, considered and ruled out, and nothing should raise them again.
-- ---------------------------------------------------------------------------
UPDATE public.request_attachments SET is_invoice = FALSE
 WHERE is_invoice IS NULL AND id IN (
    'f44e5850-d3d6-4818-9e80-2b5e13a9127f',  -- Compaction of washroom and staff quarters hardcore filling.pdf — Samuel Cudjoe, mason — GHS 400
    '6f99157b-9c7b-4fea-b0e4-125d8af0a8e0',  -- Washroom and staff quarters plumbing works phase 1.pdf — Patrick Nelson Andoh, plumber — GHS 3,000
    '0f730a64-6d41-4511-bfc0-505c966bf32f',  -- macwest ipc KULFUO.pdf — Zuby Plumbing Enterprise — GHS 1,400
    '3243b7f5-aa7c-49a0-9b53-730ded6ef244',  -- macwest kulfuo ipc.pdf — Luaru Aziz Bojo — GHS 3,100
    'ca08b622-a935-40bf-bd1b-005b98719183',  -- MDF BOLEBAMBOI IPC.pdf — Laminu Alimah — GHS 16,000
    '4ee4013c-35bd-494c-8cd8-d2b7c6d225bb',  -- Payment for water tanker services for watering of  staff quarters hardcore filling.pdf — Francis A. Anlimah, water tanker — GHS 1,000
    '026ee872-968b-43e3-995f-0981f2609a1f',  -- Payment for staff quarters hardcore filling works.pdf — Samuel Cudjoe, mason — GHS 3,400
    'c9595e53-e897-41ef-9e0e-6095eeb1b32b',  -- Payment for setting out of starter columns for 6 unit classroom.pdf — Ishmael Abotsi, mason — GHS 1,200
    '862cb6ba-a2a7-421d-9443-067e8577f1e5',  -- payment for casting of staff quarters starter columns concrete.pdf — Samuel Cudjoe, mason — GHS 1,000
    'd54f848d-0216-4e63-b9f3-ae615fec93b5',  -- Shuttering and de-shuttering of washrooms and staff quaters starter columns.pdf — Ishmael Antwi, carpenter — GHS 1,500
    '60598646-b565-4721-a748-704a3feec63b',  -- Labour payment for casting of washrooms starter columns.pdf — Samuel Cudjoe, mason — GHS 800
    'c58b2785-c24b-4b59-ab25-5328071b07e1',  -- Labour payment for staff quarters foundation blockwork.pdf — Ishmael Abotsi, mason — GHS 2,880
    '5da353af-6859-4205-8b8c-44e00ba81233',  -- Labour payment for washrooms footing walls.pdf — Samuel Cudjoe, mason — GHS 2,070
    '6150593e-7c68-4c9a-8fa8-a6464b505544'  -- Labour cost for welding of galvanized plates and spraying works.pdf — Alfred Akpor, welder — GHS 1,000
);
