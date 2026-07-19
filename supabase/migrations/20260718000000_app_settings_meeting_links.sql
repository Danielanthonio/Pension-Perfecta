-- =============================================================================
-- PensiónFlow - Migración: Links de reunión configurables (Modalidad 40 / 10)
-- =============================================================================
-- Antes, la agenda de asesoría comercial abría un único link de LeadConnector
-- HARDCODEADO en el código (prospectos/[id] y dashboard/clientes). Esos links
-- cambian con el tiempo y ahora hay DOS agendas distintas según la modalidad.
--
-- Esta migración crea una tabla de configuración global de una sola fila
-- (`app_settings`) donde la Dirección escribe manualmente ambos links. Cualquier
-- usuario autenticado los puede LEER (el aliado los necesita al agendar); solo la
-- Dirección (roles 'admin'/'director') los puede ACTUALIZAR.
--
-- Todo es ADITIVO e IDEMPOTENTE: no altera ni borra datos existentes. La fila se
-- siembra con el link de LeadConnector vigente para no romper el flujo actual.
-- =============================================================================

-- 1) Tabla de configuración global (fila única, id = 1) -----------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  id                int PRIMARY KEY DEFAULT 1,
  meeting_link_m40  text,
  meeting_link_m10  text,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_single_row CHECK (id = 1)
);

-- 2) Siembra de la fila única con el link vigente -----------------------------
INSERT INTO public.app_settings (id, meeting_link_m40, meeting_link_m10)
VALUES (
  1,
  'https://api.leadconnectorhq.com/widget/booking/tTynbYT83ugTjMBmwCf5',
  'https://api.leadconnectorhq.com/widget/booking/tTynbYT83ugTjMBmwCf5'
)
ON CONFLICT (id) DO NOTHING;

-- 3) RLS ----------------------------------------------------------------------
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado (el aliado necesita el link al agendar).
DROP POLICY IF EXISTS "app_settings lectura autenticados" ON public.app_settings;
CREATE POLICY "app_settings lectura autenticados"
  ON public.app_settings
  FOR SELECT
  TO public
  USING (auth.uid() IS NOT NULL);

-- Escritura (update): solo Dirección. El rol de director se guarda como
-- 'admin' o 'director' en profiles (ver mapProfileToDB en AppContext).
DROP POLICY IF EXISTS "app_settings update direccion" ON public.app_settings;
CREATE POLICY "app_settings update direccion"
  ON public.app_settings
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'director')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'director')
    )
  );
