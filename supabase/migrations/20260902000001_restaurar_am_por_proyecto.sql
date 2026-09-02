-- =============================================================================
-- PensiónFlow — Devuelve el Account Manager de cada PROYECTO al lunes 31-ago 09:00
-- =============================================================================
-- Acompaña a 20260902000000 (que restauró la LÓGICA del AM por proyecto). Esta
-- restaura el DATO: el backfill de 20260831000001 reescribió
-- `prospects.account_manager_id` con el AM del aliado dueño, y con él se movieron
-- las métricas por Account Manager. Aquí vuelve cada proyecto a quien lo tenía.
--
-- DE DÓNDE SALE CADA VALOR (el anterior no quedó guardado en ninguna columna, así
-- que se reconstruyó de cuatro fuentes y se validó):
--   · Respaldo local del 2026-08-09 15:05 → los 307 proyectos que ya existían.
--   · Campanas "La ruleta te asignó el proyecto de X" (trigger de 20260723000000;
--     152 desde el 23-jul) → los nacidos entre el 9 y el 31 de agosto.
--   · `prospects.created_by` cuando lo capturó un AM (el proyecto quedaba suyo y
--     por eso no se emitía campana); Dirección → mesa.
--   · Campanas "Se te asignó como Account Manager el proyecto de X" → las 5
--     reasignaciones manuales por proyecto de esa ventana.
--
-- VALIDACIÓN: de los 517 proyectos vivos anteriores al corte, 373 ya coinciden con
-- lo reconstruido y solo 1 no tiene rastro (se deja como está). De las 26 VENTAS
-- del periodo la reconstrucción coincide en las 26 — lo esperable, porque
-- 20260831000001 las excluyó a propósito de su backfill. Por eso ninguna de las
-- 143 filas de abajo es una venta, y el libro de comisiones no se toca: su último
-- movimiento es del 27-ago, anterior a todo esto.
--
-- SEGURIDAD: cada fila solo se escribe si el proyecto CONSERVA el valor que tenía
-- al hacerse la lectura (2026-09-02). Si alguien lo cambió a mano entre medias, esa
-- fila se salta sola en vez de pisar la decisión de una persona. Idempotente:
-- correrla dos veces no hace nada la segunda.
-- Las filas van solo con identificadores: el nombre del cliente es PII y no entra
-- en el repositorio.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _restaurar_am (
  prospecto_id uuid PRIMARY KEY,
  am_hoy       uuid,
  am_lunes     uuid
) ON COMMIT DROP;

-- (prospecto, AM que tiene HOY, AM que tenía el lunes 31-ago 09:00)
INSERT INTO _restaurar_am (prospecto_id, am_hoy, am_lunes) VALUES
  ('7a7fa25a-7701-4450-9c4d-cab4063444e8'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('a84c965c-f9b1-4ac2-9d0d-e23625023051'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('583c5cfd-66ae-4aaf-bd9b-bb00382325ad'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('8e4817ea-58e9-4be1-bd77-12d388c9c6cb'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('ae295f2c-7416-4ae4-97cb-ae64dc9323ac'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('769648b3-ce28-4fa4-902b-699fc16c6081'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('600fde51-33f9-4100-9a2c-2977f4503e23'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('5cfdf08e-ced3-45c1-be3a-943b92b839a9'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('08730c2a-928b-4d69-9c7a-811067198298'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('721b1a3d-4a90-4876-86c7-5cf82c8a92a0'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('0c354e35-3c30-4280-9175-e58b5d3b3f44'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('0ef8e472-72fa-4a49-80bd-25ebcf9efade'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('0f165293-7e69-4d06-8609-0addc62802ee'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('202a7b66-83bf-49f6-8b82-f89e263ae66f'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('28dc3ed4-a191-4743-96f9-536840a32e52'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('39239c75-26c1-47b9-abb0-a19b210f6660'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('74368314-179e-4a06-aa49-c0bdb4e36d3c'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('7561ef8a-f481-477f-9a5a-28c4a2c78644'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('54f96cc6-1533-4419-8662-c2f8030cd8a6'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('79cfdc62-6c86-4ac8-89e0-d100847548a6'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('7bd57dcc-fd66-4b07-8fee-2a47c6b963d7'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('7c0081c2-1579-4b25-85c0-635110214fd0'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('7d6b57ac-d8e3-4920-98c0-79317e0722c2'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('f4202b6d-203a-4ac0-9aa4-367fba735268'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('7ecd74c2-98bf-4c1a-bfef-e7bd24eecc75'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('88fa288c-21ff-4ff5-a8a6-a4dee272005e'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('8e36c30b-10a3-461a-9d13-1c03a82d1446'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('952f8a65-8e47-4438-993e-8689116301d7'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('983d06d8-5307-4959-b77c-b6c01cb58f7a'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('9580e4cc-0ffa-44b5-aab6-3193f39e11b7'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('a9d3fbb6-8369-43ad-8a91-e0790e9e2778'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('9c31c33c-0701-4da4-86dc-a0170b3a2ef8'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('58fc99fc-5e3d-4b24-b9d3-94d2e762b517'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('044d3e5b-7d3b-4335-8df3-06755bc77905'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('3926af5f-26c4-4014-9cf8-f8c58d277911'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('9e3c3783-7508-4312-b566-8a5933c61f41'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('a3875a0f-3a14-468d-824b-12571490ced0'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('a4d6815b-865c-42c8-860d-00cf86f16d37'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('a0059fde-a4c7-41b2-872a-9d57c9365d51'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('a1324292-c5c5-4cb6-ae3d-6fe27008a9bc'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('a900462b-f303-4558-83ef-874fecf53151'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('ad3d31ad-db83-4f6b-9248-c2d16c35a820'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('ad7cdf53-2c1d-4efa-ba7c-ac94604fc3e7'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('adb36287-2c1d-4141-93ff-16b8cc4655e5'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('71df33d0-7b65-471d-ad24-45978afb59db'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('ad1e87d2-4ee0-433b-99a9-af1f362666f6'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('788a2fc2-6a54-4da2-8c6b-73b1ce19a342'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('33384257-a14a-4343-84da-411e5157a3c6'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('adcc7dd9-a731-4c17-a38b-74d1cd294a40'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('b06bbc81-8863-4450-b264-2c9c4b5b4a6c'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('b19cabb4-7ccf-4b32-a18b-e3bf5740fac8'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('b2e7864e-f908-4db1-9bf9-ae4095994c08'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('b5f0b5c5-61c2-4596-9e35-eb0fa6f0de2c'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('b6272a2d-4283-4e24-89d7-4b0e6fb2d948'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('b7e7be1d-cf20-4bdf-acfa-964ba6d5893e'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('896645d2-f809-4b61-b2d4-96c2a7ccd7b5'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('6282c23c-f135-465e-88d5-33ba324523d1'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('1bf98cf0-b191-4a99-8f8e-8bdb15593ad3'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('631bd43d-a111-4345-9709-04a7a370e5fa'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('cbf76be5-315b-4b2b-98bd-6038f06f268d'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('63655677-5873-47e0-85aa-17509c49424d'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('b943df55-2c37-4635-9684-841707180583'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('ba8f5f85-e5e3-4efd-9ff7-a7e50fccfb96'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('c15a965e-a546-412b-b157-f53240cc51bd'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('bc41a64f-50df-4c3d-a050-b493ead5e639'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('c522aeb3-ee78-439b-a17c-7890305677e4'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('c6a88875-5a5c-436f-9255-486d08d3705a'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('cb65c5e7-80ed-4bef-a807-84539c67f996'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('ccbb709e-2218-4a99-b1e9-77607516bb4d'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('d78401bd-8420-4527-a75b-616f372405eb'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('da25928a-8432-4cde-b634-340bcaedfe75'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('dd8351a4-b7ed-4f4f-aa4e-0dc056e11c53'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('dfd90416-078a-44ba-b316-9e3ca6457cdf'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('55ae0921-63bb-4520-a1d0-82b465812095'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('c3e53eb2-9537-42e6-9697-8a9a85c51dc7'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('a075b429-8e65-466a-a5e5-67088a70ae4e'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('0bbf65ce-3211-430b-ad25-be348645e4d3'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('d3fafbf0-f0d3-45ff-9b2f-ebe767413cdf'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('7ca45ecf-4675-4780-9dca-28bf71cd3c64'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('2cc4b4dd-ef4b-40a9-b95c-9bacc43805b2'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('10e9f8d2-47fb-42b8-920f-026a3dc645e6'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('e01f2303-7bfe-4dbe-a219-ab839064515a'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('341ca92b-e81b-4783-bab5-a7513a0f25f0'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('eff2a79b-8e0f-4ff9-8aa0-f1cb8625553d'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('e42a284d-064a-4b83-8968-c3b3072c0f76'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('e4f160dc-36b1-4212-9f2a-43ed80ffa3c8'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('3b56f8d1-ff2f-4e44-b531-a7f52b045a19'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('e7653c0b-bc67-45dc-ba2b-90171c5b5702'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('eb33f3c9-e9f2-4233-916d-33b54569684c'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('1f4b9d83-4288-4c59-95c3-9cf560d3d1bf'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('23334cda-1a7b-4d3c-9a8d-0b2385f446d4'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('49dee13c-2169-4237-acca-dec588499d59'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('ecee4593-f570-4bc9-8726-e24e96016628'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('b09432ae-073e-45c7-9fe6-f7dc512afc0a'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('ecae9b28-5e68-48ba-b81d-16101018a4ae'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('ed6d75c9-d3f3-4fd7-9c23-86d15dadc3fd'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('edb02dd2-cce1-4c90-86c5-baa1ae9eff1f'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('eed7c347-f6b7-420d-b396-9e5ec0d975c7'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('f249a978-2e92-41a6-91c4-9f8cd8e1a7ec'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('fa52613c-879c-4c8f-a39f-76d1d76caca3'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('dda333f1-555f-4bbd-bbfa-32dbaccf4b5e'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('03546be0-e26b-4cf0-8001-31302274ee00'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('0f08eade-b5b8-4fbd-81c8-c3b0d999af53'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('e264e650-5780-4430-a5e6-88afdb3238aa'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('314c2075-56cc-42f4-b7c8-766bedbbc657'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('501e61d4-5024-4169-8d0d-2e4aaafbcef7'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('345662b8-0e78-4788-9e64-9a4f2f38acc6'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('b07287fb-972e-43bf-86ca-471ace0f53da'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('faf04344-a9fb-477d-b2d0-77659f4226cb'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('37116d4d-7aba-4fc1-b809-93b3bf3c37a7'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('06798305-1f18-418d-8e40-3d7e2ff9e387'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('400153ca-84fa-4a89-ba4c-1a7b01ac5652'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('648f67a4-71b6-46f8-bd1e-5a6c2d6a69cd'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('2c3a7498-af81-4ee2-9a0f-ebd300ff21cc'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('43523a61-722b-45f6-b37f-47b231dedd40'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('1ee86da4-330c-49fb-bf16-d58c76484a56'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('0146ff5c-fe94-42ff-a9ff-4ffc7c575e3b'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('9ced8dba-24f7-477f-bb0d-d8139df2bb84'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('424c2e2a-0694-4744-96aa-1e74a6fd8f8c'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('f04c4b84-3083-4b18-b1e6-a9a6ac85c244'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('e0a9f07e-8173-4082-8c61-807640671ce0'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('c2df6251-e2e7-466b-98cf-d7e2af7bbaf3'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('07bd0e0b-7772-4efe-8fa7-e070f4e737ab'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('34c6475b-b301-4b5d-b9cb-fd845c236b6f'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('442210fa-5e28-43a0-8dd6-8e020afe3bb1'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('476928c1-2a19-48f1-9ccc-bcf9712c02e3'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('4da7b29b-59ab-44ef-a14c-2c7f7fa84668'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('7a410069-a46e-4f83-a6cd-e063e1704f52'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('676522a3-4633-49ac-9fec-4c1fc2d397d0'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('683bf6be-0376-4821-91a7-7ccb1ecbaed3'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('80788094-245f-4b1a-9bce-d715114652fc'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('ca1efe42-2c23-42f5-b83b-a72f05bcec11'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid),
  ('6f7b0aa0-08c5-4a0b-9abf-146fae4380ea'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('6fedb5bc-cb77-49d1-bf8d-4f75b5b3c5ec'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('4f8334e3-4d47-423e-b6b2-46f3d6d1e6db'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '6af82c2b-0f55-42d4-ac14-7120e0ddf897'::uuid),
  ('ff02ddbd-57b6-473d-9fc0-b18972a2baed'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid, '2b09a24e-e9f8-438d-8c4d-44421bcdaf83'::uuid),
  ('87172912-de89-40a0-9dcf-fd1b43a76d8c'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('96b9f67c-3537-48c4-b5e6-ea1510858042'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('9bc7183e-e3cf-4774-a71b-33dc8ee2f284'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('b4db2c2d-e2c2-4bc6-8207-e65e2209d20b'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('d996205b-0271-47f3-b919-514360d097d8'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '6720af82-26c8-4ea3-9cb0-3338dc3bbee0'::uuid),
  ('fc9e5b26-2eea-4689-b8a7-ff488e887880'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid),
  ('fd470ac6-1af2-453c-a8cd-9dcf1746608a'::uuid, '7f72228b-be00-4148-9ddc-f57f1d75ca0d'::uuid, '2cd62363-2ffa-4025-8015-eec9f1494ce3'::uuid);

UPDATE public.prospects p
   SET account_manager_id = r.am_lunes
  FROM _restaurar_am r
 WHERE p.id = r.prospecto_id
   AND p.account_manager_id IS NOT DISTINCT FROM r.am_hoy;

DO $$
DECLARE
  v_total  int;
  v_ok     int;
  v_ventas int;
BEGIN
  SELECT count(*) INTO v_total FROM _restaurar_am;
  SELECT count(*) INTO v_ok
    FROM public.prospects p JOIN _restaurar_am r ON r.prospecto_id = p.id
   WHERE p.account_manager_id IS NOT DISTINCT FROM r.am_lunes;
  SELECT count(*) INTO v_ventas
    FROM public.prospects p JOIN _restaurar_am r ON r.prospecto_id = p.id
   WHERE p.status = ANY (public.fin_estados_venta());

  RAISE NOTICE 'Proyectos devueltos a su Account Manager del lunes: % de %', v_ok, v_total;
  RAISE NOTICE 'Saltados por haber cambiado desde la lectura: %', v_total - v_ok;
  RAISE NOTICE 'Ventas entre ellos (tiene que ser 0): %', v_ventas;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
