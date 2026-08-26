-- =============================================================================
-- PensiónFlow — TRAER a la bitácora las notas que el equipo dejó en GoHighLevel.
-- =============================================================================
-- El seguimiento comercial del cliente vive HOY en dos sitios: la bitácora del
-- proyecto (`prospect_notas`, migración 20260825000000) y el portal de GHL, que
-- es donde se agenda la asesoría y donde el equipo viene anotando desde antes de
-- que existiera la bitácora. Quien abre un expediente aquí ve «Sin notas»
-- aunque en GHL haya once, y actúa creyendo que nadie ha tocado al cliente.
--
-- Esta migración no trae las notas —eso lo hace /api/ghl/sincronizar— sino
-- que prepara la tabla para RECIBIRLAS sin estropear lo que ya hay:
--
--   1) `origen` distingue la nota escrita aquí de la traída de GHL. Sin esto,
--      una nota importada sería indistinguible de una que alguien tecleó, y la
--      bitácora dejaría de decir la verdad sobre quién hizo qué.
--   2) `ghl_nota_id` es la LLAVE para no duplicar. La importación se va a
--      repetir —cada vez que alguien pulse el botón, y sobre clientes que ya se
--      trajeron antes— y sin una llave estable cada pulsación clonaría la
--      bitácora entera. GHL da a cada nota un id propio y estable; ese es.
--
-- Sobre la FECHA y el AUTOR de lo importado: el trigger `sella_autor_nota` ya
-- respeta lo que trae el INSERT cuando `auth.uid()` es NULL, que es el caso de
-- la `service_role` con la que entra la importación. O sea que las notas de GHL
-- conservan SU fecha real, no la del día que se importaron. Eso es lo que hace
-- que «Último seguimiento» siga significando algo después de importar: si se
-- sellaran con now(), un cliente abandonado tres semanas aparecería como
-- recién atendido.
--
-- Aditiva: dos columnas nuevas con DEFAULT, un índice y el retoque del trigger
-- de UPDATE para que también proteja lo nuevo. No toca ninguna política, ni el
-- trigger de INSERT, ni `notas_resumen()`. Nada de lo que ya funciona cambia de
-- comportamiento.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) De dónde salió la nota
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.prospect_notas
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'plataforma';

ALTER TABLE public.prospect_notas
  ADD COLUMN IF NOT EXISTS ghl_nota_id text NULL;

-- Se acota a mano (y no con un enum) para poder sumar orígenes más adelante sin
-- una migración de tipo. Hoy son dos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.prospect_notas'::regclass
      AND conname  = 'prospect_notas_origen_valido'
  ) THEN
    ALTER TABLE public.prospect_notas
      ADD CONSTRAINT prospect_notas_origen_valido
      CHECK (origen IN ('plataforma', 'ghl'));
  END IF;
END $$;

COMMENT ON COLUMN public.prospect_notas.origen IS
  'Dónde se escribió: ''plataforma'' (aquí) o ''ghl'' (traída de GoHighLevel por /api/ghl/sincronizar).';
COMMENT ON COLUMN public.prospect_notas.ghl_nota_id IS
  'Id de la nota en GoHighLevel. Llave de deduplicación: impide que reimportar clone la bitácora. NULL en todo lo escrito aquí.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) La llave que impide duplicar
-- ─────────────────────────────────────────────────────────────────────────────
-- Parcial (`WHERE ... IS NOT NULL`) para que las miles de notas escritas aquí,
-- que no tienen id de GHL, no compitan por un valor único. Es lo que permite
-- que la importación use ON CONFLICT DO NOTHING y sea repetible sin miedo.
CREATE UNIQUE INDEX IF NOT EXISTS prospect_notas_ghl_id_unico
  ON public.prospect_notas (ghl_nota_id)
  WHERE ghl_nota_id IS NOT NULL;

-- Buscar «las notas de GHL de este proyecto» es la consulta de la importación
-- (para saber qué falta) y la del panel. Va por el índice.
CREATE INDEX IF NOT EXISTS prospect_notas_origen_idx
  ON public.prospect_notas (prospect_id, origen);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Corregir una nota tampoco puede cambiar su procedencia
-- ─────────────────────────────────────────────────────────────────────────────
-- El trigger de UPDATE ya congelaba autor, fecha y proyecto. Ahora congela
-- también `origen` y `ghl_nota_id`: si se pudieran editar, cualquiera podría
-- tomar una nota traída de GHL y hacerla pasar por propia (o al revés, romper
-- la llave de deduplicación y provocar duplicados en la siguiente importación).
--
-- Se reescribe entera la función porque CREATE OR REPLACE sustituye el cuerpo;
-- el resto es idéntico a 20260825000000.
CREATE OR REPLACE FUNCTION public.protege_nota_editada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.id           := OLD.id;
  NEW.prospect_id  := OLD.prospect_id;
  NEW.autor_id     := OLD.autor_id;
  NEW.autor_nombre := OLD.autor_nombre;
  NEW.autor_rol    := OLD.autor_rol;
  NEW.created_at   := OLD.created_at;
  NEW.origen       := OLD.origen;
  NEW.ghl_nota_id  := OLD.ghl_nota_id;
  NEW.edited_at    := CASE
                        WHEN NEW.texto IS DISTINCT FROM OLD.texto THEN now()
                        ELSE OLD.edited_at
                      END;

  RETURN NEW;
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) PostgREST tiene que ver las columnas nuevas
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Verificación (informativa; sale en los NOTICE del editor SQL)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_col   int;
  n_idx   int;
  n_notas bigint;
BEGIN
  SELECT count(*) INTO n_col FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'prospect_notas'
     AND column_name IN ('origen', 'ghl_nota_id');
  SELECT count(*) INTO n_idx FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'prospect_notas_ghl_id_unico';
  SELECT count(*) INTO n_notas FROM public.prospect_notas;
  RAISE NOTICE 'Notas desde GHL listas: % de 2 columnas, % de 1 índice único. La bitácora conserva sus % notas, todas marcadas origen=plataforma.',
    n_col, n_idx, n_notas;
END $$;
