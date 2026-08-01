-- =============================================================================
-- PensiónFlow — Módulo de Finanzas y Comisiones (libro mayor + cortes + pagos)
-- =============================================================================
-- Cada peso que la empresa debe pagar nace aquí como un EVENTO individual con su
-- operación de origen. Ningún reporte suma un importe que no tenga detrás una
-- fila de `comision_eventos`; ése es el requisito central del §13 del brief.
--
--     Financiamiento ejecutado ──┬─→ comisión Director
--     (prospects → Cerrada Ganada)├─→ comisión Account Manager del proyecto
--                                 ├─→ comisión Closer (solo el 1.º de su aliado)
--                                 └─→ comisión Aliado (cuando existan sus tarifas)
--
--     Alta de aliado ────────────→ comisión de quien lo CERRÓ (closer o Dirección)
--     Fin de mes / trimestre ────→ salario fijo del AM + bonos por tramo
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISIONES DE MODELADO (y por qué)
-- ─────────────────────────────────────────────────────────────────────────────
-- · UN SOLO `estado` POR EVENTO, no `estado_revision` + `estado_pago`. El §7 del
--   brief define seis estados que forman una secuencia estricta
--   (pendiente_revision → aprobado → enviado_finanzas → pagado, más `observado` y
--   `revertido` como desvíos). Dos columnas independientes permitirían
--   combinaciones imposibles —"pendiente de revisión" y a la vez "pagado"— y
--   habría que defenderlas con un CHECK que reconstruyera precisamente esa
--   secuencia. Una columna la impone por construcción.
--
-- · EL DEVENGO SE RECONCILIA, NO SE DISPARA CON UN TRIGGER. Un trigger sobre
--   `prospects` correría dentro de la transacción de quien mueve el pipeline: un
--   error de cálculo dejaría a la Dirección sin poder cambiar el estado de un
--   proyecto — se rompería la operación diaria por un fallo en la contabilidad.
--   Además un trigger solo mira hacia adelante, y este módulo TAMBIÉN tiene que
--   detectar lo contrario (una venta que se cae y hay que revertir, §17).
--   `comisiones_sincronizar()` hace las dos cosas, es idempotente y la app la
--   llama al abrir el módulo, así que para el usuario es igual de automático.
--
-- · IDEMPOTENCIA POR `clave_unica`. Cada evento lleva una clave natural
--   determinista ('fin:<proyecto>:<usuario>', '1fin:<aliado>', 'bmen:<uid>:<mes>'…)
--   con un índice único parcial. Ese único índice implementa de golpe las tres
--   reglas antiduplicado del §18: no hay dos comisiones para la misma persona y
--   operación, ni dos primeros financiamientos del mismo aliado, ni dos bonos del
--   mismo período. El índice excluye los revertidos para que una operación que se
--   cae y vuelve pueda volver a devengarse.
--
-- · `comision_eventos.usuario_id` NO LLEVA FOREIGN KEY, y el evento guarda el
--   nombre del beneficiario. Un libro mayor no puede perder historia porque se
--   borre una cuenta, y una FK con RESTRICT rompería /api/admin/delete-user. Es
--   el mismo criterio que `closer_aliado_asignaciones.aliado_id`
--   (20260801000000). Deliberadamente NO se añade limpieza de estas filas al
--   endpoint de borrado: el §20 prohíbe eliminar eventos que formaron parte de un
--   corte.
--
-- · LAS TARIFAS SON DATOS, NO CÓDIGO (§16). Cambiar un importe cierra la vigencia
--   anterior y abre una nueva fila; los eventos ya devengados conservan el monto
--   que estaba vigente en su fecha porque apuntan a `tarifa_id`.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ ESTA MIGRACIÓN ES AUTOSUFICIENTE
-- ─────────────────────────────────────────────────────────────────────────────
-- `supabase/schema.sql` NO está aplicado completo en producción: helpers como
-- `update_updated_at_column()` no existen allá. Aquí no se invoca ninguno; todo
-- lo que se usa se define abajo con prefijo `fin_` / `comisiones_` para no pisar
-- nada. Tampoco se toca `profiles.is_active`, columna que NO EXISTE en prod
-- (ver 20260722000001 / 20260723000000).
--
-- Todo es ADITIVO e IDEMPOTENTE y va dentro de una transacción.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ZONA HORARIA
-- ─────────────────────────────────────────────────────────────────────────────
-- Los cortes de día, semana, mes y trimestre se calculan en UTC, igual que
-- Reportes, Gestión de Clientes y el módulo Closers (que comparan `created_at`
-- recortado a 10 caracteres). Es una desviación consciente de la hora de México:
-- si aquí se agrupara en America/Mexico_City, una venta ejecutada a las 19:00
-- caería en un día —y a veces en una semana— distinta de la que muestra el resto
-- de la app, y la Dirección vería dos cifras para el mismo rango. Si algún día se
-- cambia, hay que cambiarlo en TODOS los módulos a la vez.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) HELPERS DE ROL
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER a propósito: bypassan el RLS de `profiles`. Sin esto, una
-- política de `profiles` que consultara `profiles` se auto-dispararía → 42P17
-- "infinite recursion", el incidente que sacó a todos los usuarios de la app en
-- 20260723000001. Mismo patrón que `closers_my_role()`.
CREATE OR REPLACE FUNCTION public.fin_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- La app escribe 'admin' para la Dirección pero varias políticas comparan contra
-- 'director'. Se admiten ambos, como en el resto del sistema.
CREATE OR REPLACE FUNCTION public.fin_is_direccion()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.fin_my_role() IN ('admin', 'director');
$$;

-- Portero único de todas las RPC de escritura: una sola frase que cambiar si
-- algún día Finanzas deja de ser exclusivo de la Dirección.
CREATE OR REPLACE FUNCTION public.fin_require_direccion()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida.';
  END IF;
  IF NOT public.fin_is_direccion() THEN
    RAISE EXCEPTION 'El módulo de Finanzas y Comisiones es exclusivo de la Dirección.';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) QUIÉN CERRÓ AL ALIADO (§4.2)
-- ─────────────────────────────────────────────────────────────────────────────
-- El §4.2 es explícito: "el usuario que registra al aliado no necesariamente
-- debe considerarse como quien lo cerró". `closer_origen_id` (20260801000000) ya
-- responde eso cuando el cerrador es un closer, pero NO admite a la Dirección:
-- todo el módulo Closers filtra por `role = 'closer'`, así que apuntar ahí al
-- director contaminaría sus métricas de captación con aliados que no cerró
-- ningún closer.
--
-- Por eso una columna propia. La regla de lectura es
-- `COALESCE(aliado_cerrado_por_id, closer_origen_id)`, y el backfill de abajo
-- deja alineados a los aliados que ya tienen closer atribuido.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aliado_cerrado_por_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.aliado_cerrado_por_id IS
  'Quién CERRÓ a este aliado, para la comisión de cierre del §4.2. Puede ser un closer o la Dirección; `closer_origen_id` solo admite closers.';

UPDATE public.profiles
   SET aliado_cerrado_por_id = closer_origen_id
 WHERE role = 'aliado'
   AND closer_origen_id IS NOT NULL
   AND aliado_cerrado_por_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_aliado_cerrado_por
  ON public.profiles (aliado_cerrado_por_id) WHERE aliado_cerrado_por_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) CONFIGURACIÓN DEL MÓDULO
-- ─────────────────────────────────────────────────────────────────────────────
-- Fila única (el PK booleano con CHECK impide una segunda).
--
-- `director_beneficiario_id` existe porque el §5.1 habla de "el Director" en
-- singular pero `profiles` puede tener varias cuentas con rol admin/director
-- (soporte, respaldos). Sin señalar una, cada venta multiplicaría la comisión de
-- dirección por el número de cuentas. Si queda en NULL se usa la cuenta de
-- dirección más antigua, que es la del titular real en esta instalación.
--
-- `arranque` acota el devengo hacia atrás: sin él, la primera sincronización
-- fabricaría comisiones y salarios de todo el histórico del CRM. 2026-07-01 es
-- la fecha en que entran en vigor las tarifas del brief.
CREATE TABLE IF NOT EXISTS public.comision_config (
  id                       boolean PRIMARY KEY DEFAULT true CHECK (id),
  director_beneficiario_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  moneda                   text NOT NULL DEFAULT 'MXN',
  arranque                 date NOT NULL DEFAULT DATE '2026-07-01',
  updated_by               uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at               timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.comision_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fin_director_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT c.director_beneficiario_id FROM public.comision_config c WHERE c.id),
    (SELECT p.id FROM public.profiles p
      WHERE p.role IN ('admin', 'director')
      ORDER BY p.created_at NULLS LAST, p.id
      LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.fin_arranque()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT c.arranque FROM public.comision_config c WHERE c.id), DATE '2026-07-01');
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) TARIFAS VERSIONADAS (§16)
-- ─────────────────────────────────────────────────────────────────────────────
-- `umbral_min` es lo que permite guardar bonos por tramo como datos en vez de
-- como una escalera de `CASE` en el código: un bono es una tarifa con umbral, y
-- se cobra el tramo MÁS ALTO alcanzado (§5.1, §5.3). Las comisiones planas usan
-- umbral 0.
--
-- `producto` NULL = "no depende del producto" (cierre de aliado, salario, bonos).
CREATE TABLE IF NOT EXISTS public.comision_tarifas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rol_beneficiario text NOT NULL
                     CHECK (rol_beneficiario IN ('director', 'account_manager', 'closer', 'aliado')),
  concepto         text NOT NULL
                     CHECK (concepto IN ('comision_financiamiento', 'comision_cierre_aliado',
                                         'comision_primer_financiamiento', 'comision_aliado',
                                         'salario_fijo', 'bono_mensual', 'bono_trimestral')),
  producto         text
                     CHECK (producto IS NULL OR producto IN ('mod_40', 'mod_10', 'credito_nomina')),
  umbral_min       integer NOT NULL DEFAULT 0 CHECK (umbral_min >= 0),
  monto            numeric(14,2) NOT NULL CHECK (monto >= 0),
  moneda           text NOT NULL DEFAULT 'MXN',
  vigente_desde    date NOT NULL,
  vigente_hasta    date,
  activo           boolean NOT NULL DEFAULT true,
  notas            text,
  creado_por       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at       timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);

COMMENT ON TABLE public.comision_tarifas IS
  'Tarifas con vigencia (§16). Cambiar un importe NO edita la fila: cierra la vigencia anterior y abre una nueva, para que las comisiones históricas conserven su monto.';
COMMENT ON COLUMN public.comision_tarifas.umbral_min IS
  'Producción mínima que activa el tramo. 0 = comisión plana. Los tramos no son acumulables: se paga solo el más alto alcanzado.';

-- Dos tarifas activas idénticas y con el mismo arranque serían un empate sin
-- desempate posible al resolver el monto.
CREATE UNIQUE INDEX IF NOT EXISTS uq_comision_tarifas_vigencia
  ON public.comision_tarifas (rol_beneficiario, concepto, COALESCE(producto, ''), umbral_min, vigente_desde)
  WHERE activo;

CREATE INDEX IF NOT EXISTS idx_comision_tarifas_busqueda
  ON public.comision_tarifas (rol_beneficiario, concepto, vigente_desde DESC);

-- ── Semilla: las tarifas del §5 ──────────────────────────────────────────────
-- Se insertan solo si la tabla está vacía, para que re-aplicar la migración no
-- resucite importes que la Dirección ya haya cambiado desde la interfaz.
INSERT INTO public.comision_tarifas
  (rol_beneficiario, concepto, producto, umbral_min, monto, vigente_desde, vigente_hasta, notas)
SELECT * FROM (VALUES
  -- §5.1 Director — comisiona por TODO financiamiento del equipo
  ('director', 'comision_financiamiento', 'mod_40',         0,   500.00, DATE '2026-07-01', NULL::date, 'Financiamiento Mod 40'),
  ('director', 'comision_financiamiento', 'mod_10',         0,   300.00, DATE '2026-07-01', NULL::date, 'Financiamiento Mod 10'),
  ('director', 'comision_financiamiento', 'credito_nomina', 0,   250.00, DATE '2026-07-01', NULL::date, 'Crédito de nómina'),
  ('director', 'comision_cierre_aliado',  NULL,             0,   300.00, DATE '2026-07-01', NULL::date, 'Solo por aliados que cierra él mismo; no cobra los que cierra un closer'),
  -- §5.1 Bono mensual del Director — vigente SOLO julio-septiembre 2026
  ('director', 'bono_mensual',            NULL,            20, 10000.00, DATE '2026-07-01', DATE '2026-09-30', '20 o más financiamientos del equipo en el mes'),
  ('director', 'bono_mensual',            NULL,            30, 15000.00, DATE '2026-07-01', DATE '2026-09-30', '30 o más financiamientos del equipo en el mes'),
  ('director', 'bono_mensual',            NULL,            40, 25000.00, DATE '2026-07-01', DATE '2026-09-30', '40 o más financiamientos del equipo en el mes'),

  -- §5.2 Closer — cierre de aliado + PRIMER financiamiento de ese aliado
  ('closer',   'comision_cierre_aliado',  NULL,             0,   300.00, DATE '2026-07-01', NULL::date, 'Por cada aliado que cierra'),
  ('closer',   'comision_primer_financiamiento', 'mod_40',  0,   500.00, DATE '2026-07-01', NULL::date, 'Una sola vez por aliado'),
  ('closer',   'comision_primer_financiamiento', 'mod_10',  0,   300.00, DATE '2026-07-01', NULL::date, 'Una sola vez por aliado'),
  ('closer',   'comision_primer_financiamiento', 'credito_nomina', 0, 250.00, DATE '2026-07-01', NULL::date, 'Una sola vez por aliado'),

  -- §5.3 Account Manager — salario fijo + comisión + bonos
  ('account_manager', 'salario_fijo',     NULL,             0,  8000.00, DATE '2026-07-01', NULL::date, 'Salario fijo mensual'),
  ('account_manager', 'comision_financiamiento', 'mod_40',  0,   600.00, DATE '2026-07-01', NULL::date, 'Financiamiento Mod 40 gestionado'),
  ('account_manager', 'comision_financiamiento', 'mod_10',  0,   300.00, DATE '2026-07-01', NULL::date, 'Financiamiento Mod 10 gestionado'),
  ('account_manager', 'comision_financiamiento', 'credito_nomina', 0, 300.00, DATE '2026-07-01', NULL::date, 'Crédito de nómina gestionado'),
  ('account_manager', 'bono_mensual',     NULL,            10,  7000.00, DATE '2026-07-01', NULL::date, '10 o más financiamientos en el mes'),
  ('account_manager', 'bono_mensual',     NULL,            20, 15000.00, DATE '2026-07-01', NULL::date, '20 o más financiamientos en el mes'),
  ('account_manager', 'bono_mensual',     NULL,            30, 25000.00, DATE '2026-07-01', NULL::date, '30 o más financiamientos en el mes'),
  ('account_manager', 'bono_trimestral',  NULL,           100, 10000.00, DATE '2026-07-01', DATE '2026-09-30', 'Q3 2026 · 100 o más financiamientos'),
  ('account_manager', 'bono_trimestral',  NULL,           150, 15000.00, DATE '2026-07-01', DATE '2026-09-30', 'Q3 2026 · 150 o más financiamientos'),
  ('account_manager', 'bono_trimestral',  NULL,           200, 20000.00, DATE '2026-07-01', DATE '2026-09-30', 'Q3 2026 · 200 o más financiamientos')

  -- §5.4 ALIADO: el brief NO define todavía su esquema económico (monto,
  -- productos, momento de devengo, elegibilidad, bonos ni reglas de reversión).
  -- Por eso NO se siembra ninguna tarifa suya: la arquitectura ya lo soporta
  -- —conceptos 'comision_aliado' y rol 'aliado' están admitidos por los CHECK, y
  -- `comisiones_sincronizar` los devenga en cuanto existan— pero no se inventa
  -- un importe. Alta desde el panel de Tarifas, sin tocar código ni esquema.
) AS t(rol_beneficiario, concepto, producto, umbral_min, monto, vigente_desde, vigente_hasta, notas)
WHERE NOT EXISTS (SELECT 1 FROM public.comision_tarifas);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) LIBRO MAYOR DE COMISIONES (§13)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comision_eventos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Beneficiario. Sin FK a propósito (ver cabecera); el nombre se congela para
  -- que el libro mayor siga siendo legible si la cuenta desaparece.
  usuario_id        uuid NOT NULL,
  usuario_nombre    text,
  rol_beneficiario  text NOT NULL
                      CHECK (rol_beneficiario IN ('director', 'account_manager', 'closer', 'aliado')),

  tipo_evento       text NOT NULL
                      CHECK (tipo_evento IN ('comision_financiamiento', 'comision_cierre_aliado',
                                             'comision_primer_financiamiento', 'comision_aliado',
                                             'salario_fijo', 'bono_mensual', 'bono_trimestral',
                                             'ajuste_positivo', 'ajuste_negativo', 'reversion')),

  -- Trazabilidad al origen. En esta app un "cliente" y un "proyecto" son la
  -- MISMA entidad (`prospects`), así que el §13 se cubre con una sola columna en
  -- vez de duplicar cliente_id y proyecto_id apuntando siempre a lo mismo.
  referencia_tipo   text NOT NULL
                      CHECK (referencia_tipo IN ('prospecto', 'aliado', 'periodo', 'evento')),
  referencia_id     uuid,
  prospecto_id      uuid REFERENCES public.prospects(id) ON DELETE SET NULL,
  aliado_id         uuid,
  tipo_producto     text CHECK (tipo_producto IS NULL OR tipo_producto IN ('mod_40', 'mod_10', 'credito_nomina')),

  monto             numeric(14,2) NOT NULL DEFAULT 0,
  moneda            text NOT NULL DEFAULT 'MXN',
  tarifa_id         uuid REFERENCES public.comision_tarifas(id) ON DELETE SET NULL,
  -- Producción que respalda el cálculo: cuántos financiamientos sostienen un
  -- bono. La tabla del §9 lo muestra en la columna "Producción".
  produccion        integer,

  fecha_devengo     timestamptz NOT NULL,
  -- Etiqueta del corte al que pertenece: '2026-W32' | '2026-08' | '2026-Q3'.
  periodo_corte     text NOT NULL,

  estado            text NOT NULL DEFAULT 'pendiente_revision'
                      CHECK (estado IN ('pendiente_revision', 'aprobado', 'enviado_finanzas',
                                        'pagado', 'observado', 'revertido')),
  motivo_observacion text,

  corte_id          uuid,
  -- Cuando este evento ES una reversión, apunta al evento que anula.
  evento_original_id uuid REFERENCES public.comision_eventos(id) ON DELETE SET NULL,

  -- Anulación de un evento YA REPORTADO a Finanzas o YA PAGADO. Su `estado` no
  -- se toca —el §17 prohíbe modificar el pago histórico y el §6.5 bloquea lo
  -- pagado—, así que la anulación se marca aquí y el descuento viaja en un
  -- evento `reversion` negativo del corte siguiente. Además retira la fila del
  -- índice único, para que la misma operación pueda volver a devengarse si el
  -- financiamiento se rehace.
  anulado_at        timestamptz,
  anulado_motivo    text,

  -- Clave natural determinista: el antiduplicado del §18 vive aquí.
  clave_unica       text NOT NULL,

  fecha_aprobacion      timestamptz,
  aprobado_por          uuid,
  fecha_envio_finanzas  timestamptz,
  enviado_por           uuid,
  fecha_pago            timestamptz,
  pagado_por            uuid,
  referencia_pago       text,
  observaciones         text,

  created_at        timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at        timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.comision_eventos IS
  'Libro mayor: un evento por cada peso devengado, con la operación que lo originó. Ningún reporte muestra un importe sin una fila aquí (§13).';
COMMENT ON COLUMN public.comision_eventos.clave_unica IS
  'Clave natural determinista. El índice único parcial implementa las tres reglas antiduplicado del §18; excluye revertidos y anulados para que una operación que se cae y vuelve pueda re-devengarse.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_comision_eventos_clave
  ON public.comision_eventos (clave_unica)
  WHERE estado <> 'revertido' AND anulado_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comision_eventos_usuario   ON public.comision_eventos (usuario_id, fecha_devengo DESC);
CREATE INDEX IF NOT EXISTS idx_comision_eventos_devengo   ON public.comision_eventos (fecha_devengo);
CREATE INDEX IF NOT EXISTS idx_comision_eventos_estado    ON public.comision_eventos (estado);
CREATE INDEX IF NOT EXISTS idx_comision_eventos_corte     ON public.comision_eventos (corte_id) WHERE corte_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comision_eventos_prospecto ON public.comision_eventos (prospecto_id) WHERE prospecto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comision_eventos_aliado    ON public.comision_eventos (aliado_id) WHERE aliado_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comision_eventos_periodo   ON public.comision_eventos (periodo_corte);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) CORTES (§14)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cortes_financieros (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_corte           text NOT NULL CHECK (tipo_corte IN ('semanal', 'mensual', 'trimestral', 'personalizado')),
  fecha_inicio         date NOT NULL,
  fecha_fin            date NOT NULL,
  moneda               text NOT NULL DEFAULT 'MXN',
  -- Totales congelados al generar el corte. No se recalculan al vuelo: el §6.3
  -- exige que después de aprobar nada cambie en silencio.
  total_produccion     integer NOT NULL DEFAULT 0,
  total_comisiones     numeric(14,2) NOT NULL DEFAULT 0,
  total_bonos          numeric(14,2) NOT NULL DEFAULT 0,
  -- Separado de los bonos aunque el §14 no lo pida: el salario fijo del Account
  -- Manager es nómina, no incentivo, y Finanzas los paga por vías distintas.
  -- Sumarlos en la misma casilla obligaría a deshacer el total a mano.
  total_salarios       numeric(14,2) NOT NULL DEFAULT 0,
  total_ajustes        numeric(14,2) NOT NULL DEFAULT 0,
  total_a_pagar        numeric(14,2) NOT NULL DEFAULT 0,
  total_pagado         numeric(14,2) NOT NULL DEFAULT 0,
  estado               text NOT NULL DEFAULT 'borrador'
                         CHECK (estado IN ('borrador', 'en_revision', 'aprobado', 'enviado_finanzas',
                                           'pagado_parcial', 'pagado', 'anulado')),
  creado_por           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  fecha_revision       timestamptz,
  revisado_por         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  fecha_aprobacion     timestamptz,
  aprobado_por         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  fecha_envio_finanzas timestamptz,
  enviado_por          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  fecha_pago           timestamptz,
  pagado_por           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  observaciones        text,
  created_at           timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at           timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CHECK (fecha_fin >= fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_cortes_periodo ON public.cortes_financieros (fecha_inicio DESC, fecha_fin DESC);
CREATE INDEX IF NOT EXISTS idx_cortes_estado  ON public.cortes_financieros (estado);

-- La FK de eventos → cortes se añade después de crear la tabla destino.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comision_eventos_corte_id_fkey'
      AND conrelid = 'public.comision_eventos'::regclass
  ) THEN
    ALTER TABLE public.comision_eventos
      ADD CONSTRAINT comision_eventos_corte_id_fkey
      FOREIGN KEY (corte_id) REFERENCES public.cortes_financieros(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) PAGOS (§15)
-- ─────────────────────────────────────────────────────────────────────────────
-- Tabla propia para poder registrar pagos PARCIALES sin tocar los eventos
-- originales: un depósito es un hecho aparte del devengo que lo justifica.
CREATE TABLE IF NOT EXISTS public.pagos_comisiones (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corte_id           uuid REFERENCES public.cortes_financieros(id) ON DELETE SET NULL,
  usuario_id         uuid NOT NULL,
  usuario_nombre     text,
  monto_pagado       numeric(14,2) NOT NULL CHECK (monto_pagado > 0),
  moneda             text NOT NULL DEFAULT 'MXN',
  fecha_pago         date NOT NULL,
  metodo_pago        text NOT NULL CHECK (metodo_pago IN ('transferencia', 'binance', 'efectivo', 'otro')),
  referencia_bancaria text,
  comprobante_url    text,
  registrado_por     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  observaciones      text,
  created_at         timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_pagos_corte   ON public.pagos_comisiones (corte_id);
CREATE INDEX IF NOT EXISTS idx_pagos_usuario ON public.pagos_comisiones (usuario_id, fecha_pago DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) AUDITORÍA (§20)
-- ─────────────────────────────────────────────────────────────────────────────
-- Append-only: sin políticas de UPDATE ni DELETE, ni siquiera para la Dirección.
CREATE TABLE IF NOT EXISTS public.comision_auditoria (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidad         text NOT NULL CHECK (entidad IN ('evento', 'corte', 'pago', 'tarifa', 'config')),
  entidad_id      uuid,
  accion          text NOT NULL,
  estado_anterior text,
  estado_nuevo    text,
  monto_anterior  numeric(14,2),
  monto_nuevo     numeric(14,2),
  comentario      text,
  actor_id        uuid,
  actor_nombre    text,
  created_at      timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_comision_auditoria_entidad ON public.comision_auditoria (entidad, entidad_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comision_auditoria_fecha   ON public.comision_auditoria (created_at DESC);

COMMENT ON TABLE public.comision_auditoria IS
  'Bitácora append-only del §20. Sin políticas UPDATE/DELETE: quién revisó, aprobó, envió o pagó no se reescribe.';

CREATE OR REPLACE FUNCTION public.fin_auditar(
  p_entidad text,
  p_entidad_id uuid,
  p_accion text,
  p_estado_anterior text DEFAULT NULL,
  p_estado_nuevo text DEFAULT NULL,
  p_monto_anterior numeric DEFAULT NULL,
  p_monto_nuevo numeric DEFAULT NULL,
  p_comentario text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.comision_auditoria
    (entidad, entidad_id, accion, estado_anterior, estado_nuevo, monto_anterior, monto_nuevo,
     comentario, actor_id, actor_nombre)
  VALUES
    (p_entidad, p_entidad_id, p_accion, p_estado_anterior, p_estado_nuevo, p_monto_anterior, p_monto_nuevo,
     p_comentario, auth.uid(), (SELECT full_name FROM public.profiles WHERE id = auth.uid()));
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) HELPERS DE NEGOCIO
-- ─────────────────────────────────────────────────────────────────────────────

-- Producto comisionable a partir de lo que el CRM ya modela. `tipo_financiamiento`
-- lo captura el aliado; `modalidad` (40 / 10) la fija la Dirección al aprobar.
-- Un financiamiento 40/10 aprobado SIN modalidad devuelve NULL: no se adivina, se
-- marca como observado (§18).
CREATE OR REPLACE FUNCTION public.fin_producto(p_tipo_financiamiento text, p_modalidad text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_tipo_financiamiento = 'credito_nomina' THEN 'credito_nomina'
    WHEN p_modalidad = '40' THEN 'mod_40'
    WHEN p_modalidad = '10' THEN 'mod_10'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.fin_producto_label(p_producto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_producto
    WHEN 'mod_40' THEN 'Financiamiento Mod 40'
    WHEN 'mod_10' THEN 'Financiamiento Mod 10'
    WHEN 'credito_nomina' THEN 'Crédito de nómina'
    ELSE 'Producto sin definir'
  END;
$$;

-- "Cerrada ganada" = financiamiento EJECUTADO. Espejo exacto de
-- FIN_OTORGADO_STAGE en src/app/admin/_pipelineBuckets.ts y de
-- `closers_stage('ventas')`: si allá cambia, aquí también.
CREATE OR REPLACE FUNCTION public.fin_estados_venta()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY['firma_programada', 'pagado_comision'];
$$;

-- Etiqueta del período de corte. Semana ISO (lunes a domingo, §11.1), mes o
-- trimestre, siempre en UTC (ver la nota de zona horaria de la cabecera).
CREATE OR REPLACE FUNCTION public.fin_periodo(p_fecha timestamptz, p_tipo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tipo
    WHEN 'semanal'    THEN to_char(p_fecha AT TIME ZONE 'UTC', 'IYYY') || '-W' || to_char(p_fecha AT TIME ZONE 'UTC', 'IW')
    WHEN 'mensual'    THEN to_char(p_fecha AT TIME ZONE 'UTC', 'YYYY-MM')
    WHEN 'trimestral' THEN to_char(p_fecha AT TIME ZONE 'UTC', 'YYYY') || '-Q' || to_char(p_fecha AT TIME ZONE 'UTC', 'Q')
    ELSE to_char(p_fecha AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  END;
$$;

-- Monto vigente de una tarifa en una fecha, aplicando el tramo MÁS ALTO
-- alcanzado. Devuelve la fila entera para que el evento pueda guardar `tarifa_id`
-- y quede trazable qué tarifa exacta lo calculó.
CREATE OR REPLACE FUNCTION public.fin_tarifa(
  p_rol text,
  p_concepto text,
  p_producto text,
  p_fecha date,
  p_produccion integer DEFAULT 0
)
RETURNS TABLE (tarifa_id uuid, monto numeric, moneda text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT t.id, t.monto, t.moneda
  FROM public.comision_tarifas t
  WHERE t.activo
    AND t.rol_beneficiario = p_rol
    AND t.concepto = p_concepto
    AND (t.producto IS NOT DISTINCT FROM p_producto)
    AND t.vigente_desde <= p_fecha
    AND (t.vigente_hasta IS NULL OR t.vigente_hasta >= p_fecha)
    AND t.umbral_min <= COALESCE(p_produccion, 0)
  -- Tramo más alto primero; a igualdad de tramo, la vigencia más reciente.
  ORDER BY t.umbral_min DESC, t.vigente_desde DESC
  LIMIT 1;
$$;

-- Ventas ejecutadas con su fecha de EJECUCIÓN REAL (§4.1): el primer instante en
-- que el proyecto entró a "Cerrada Ganada", tomado del historial de estados
-- (`prospect_status_history`, 20260705000003). NO se usa `created_at` ni
-- `updated_at`, que se mueven por motivos ajenos al financiamiento.
--
-- Se excluyen los proyectos en papelera y purgados: la app los marca prefijando
-- `notes_director`, no con una columna.
CREATE OR REPLACE FUNCTION public.fin_ventas(p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL)
RETURNS TABLE (
  prospecto_id       uuid,
  cliente_nombre     text,
  aliado_id          uuid,
  account_manager_id uuid,
  producto           text,
  fecha_ejecucion    timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    p.aliado_id,
    p.account_manager_id,
    public.fin_producto(p.tipo_financiamiento, p.modalidad),
    f.ejecutado_at
  FROM public.prospects p
  JOIN LATERAL (
    SELECT COALESCE(
      -- Primera entrada a Cerrada Ganada. Un proyecto que se cae y vuelve
      -- conserva la fecha de su PRIMERA ejecución, que es la que devengó.
      MIN(h.changed_at) FILTER (WHERE h.status = 'firma_programada'),
      MIN(h.changed_at) FILTER (WHERE h.status = 'pagado_comision'),
      p.updated_at,
      p.created_at
    ) AS ejecutado_at
    FROM public.prospect_status_history h
    WHERE h.prospect_id = p.id
  ) f ON true
  WHERE p.status = ANY (public.fin_estados_venta())
    AND COALESCE(p.notes_director, '') NOT LIKE '[DELETED:%'
    AND COALESCE(p.notes_director, '') NOT LIKE '[PURGED:%'
    AND (p_desde IS NULL OR (f.ejecutado_at AT TIME ZONE 'UTC')::date >= p_desde)
    AND (p_hasta IS NULL OR (f.ejecutado_at AT TIME ZONE 'UTC')::date <= p_hasta);
$$;

COMMIT;
