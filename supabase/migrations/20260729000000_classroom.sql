-- =============================================================================
-- PensiónFlow - Migración: Módulo Classroom (inducción y onboarding)
-- =============================================================================
-- PROBLEMA
-- La inducción a la plataforma se da hoy de viva voz: cada aliado nuevo aprende
-- los conceptos (Ley 73 vs 97, Modalidad 40, el pipeline de 6 etapas, el
-- expediente) preguntando por WhatsApp. No hay un lugar donde vivan las
-- inducciones ni el material de apoyo que se sube constantemente, así que las
-- mismas dudas se responden una y otra vez y la persona nueva no sabe por dónde
-- empezar.
--
-- SOLUCIÓN
-- Cuatro tablas nuevas que sostienen un "Classroom" al estilo Skool:
--   · classroom_courses    — el curso: portada, título, descripción, audiencia
--   · classroom_lessons    — las lecciones ordenadas de cada curso (video + texto)
--   · classroom_resources  — material de apoyo (PDF, hoja, link) por curso o lección
--   · classroom_progress   — qué lección terminó cada usuario (para el % de avance)
--
-- La Dirección (roles 'admin'/'director') es la única que escribe contenido;
-- cualquier usuario autenticado LEE lo publicado y marca SU propio avance. La
-- audiencia de cada curso permite publicar material solo para aliados o solo
-- para el equipo interno (dirección + account managers).
--
-- Todo es puramente ADITIVA e IDEMPOTENTE: crea tablas nuevas, no altera ni
-- borra ninguna estructura ni dato existente. No toca `profiles` (en producción
-- esa tabla NO tiene columna `is_active`, así que nada aquí la referencia).
--
-- REVERSIÓN: DROP TABLE public.classroom_progress, public.classroom_resources,
--            public.classroom_lessons, public.classroom_courses CASCADE;
-- =============================================================================

BEGIN;

-- 1) CURSOS -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.classroom_courses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  title        text NOT NULL,
  description  text,
  -- Portada. Si viene NULL la UI pinta un degradado 3D generado con `accent`.
  cover_url    text,
  accent       text NOT NULL DEFAULT 'emerald',
  emoji        text,
  -- Cinta diagonal de la esquina ("CURSO", "NUEVO"…). NULL = sin cinta.
  badge        text,
  -- Quién ve el curso: todos, solo aliados, o solo el equipo interno.
  audience     text NOT NULL DEFAULT 'todos'
               CHECK (audience IN ('todos', 'aliados', 'equipo')),
  sort_order   int  NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at   timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2) LECCIONES ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.classroom_lessons (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    uuid NOT NULL REFERENCES public.classroom_courses(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text,
  -- YouTube / Vimeo / Loom / Drive / .mp4 directo. La UI resuelve el embed.
  video_url    text,
  duration_min int,
  -- Notas de apoyo en texto plano (se renderiza respetando saltos de línea).
  body         text,
  sort_order   int  NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at   timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_classroom_lessons_course
  ON public.classroom_lessons(course_id, sort_order);

-- 3) MATERIAL DE APOYO --------------------------------------------------------
-- Cuelga de una lección o del curso completo (al menos uno de los dos).
CREATE TABLE IF NOT EXISTS public.classroom_resources (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id  uuid REFERENCES public.classroom_courses(id) ON DELETE CASCADE,
  lesson_id  uuid REFERENCES public.classroom_lessons(id) ON DELETE CASCADE,
  title      text NOT NULL,
  url        text NOT NULL,
  kind       text NOT NULL DEFAULT 'link'
             CHECK (kind IN ('pdf', 'link', 'sheet', 'slides', 'video', 'other')),
  sort_order int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT classroom_resources_owner_required
    CHECK (course_id IS NOT NULL OR lesson_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_classroom_resources_course ON public.classroom_resources(course_id);
CREATE INDEX IF NOT EXISTS idx_classroom_resources_lesson ON public.classroom_resources(lesson_id);

-- 4) AVANCE POR USUARIO -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.classroom_progress (
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lesson_id    uuid NOT NULL REFERENCES public.classroom_lessons(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_classroom_progress_user ON public.classroom_progress(user_id);

-- 5) updated_at automático ----------------------------------------------------
-- Función PROPIA del Classroom, a propósito.
--
-- `schema.sql` define update_updated_at_column(), pero ese archivo base no está
-- aplicado por completo en el proyecto de producción: la función NO existe allá
-- (ERROR 42883 al intentar usarla). Y tampoco conviene crearla con ese nombre
-- compartido: si algún día existe con otro cuerpo, un CREATE OR REPLACE la
-- sobrescribiría y afectaría al trigger update_prospects_updated_at. Con un
-- nombre propio esta migración es autosuficiente y no puede romper nada ajeno.
CREATE OR REPLACE FUNCTION public.classroom_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_classroom_courses_updated_at ON public.classroom_courses;
CREATE TRIGGER update_classroom_courses_updated_at
  BEFORE UPDATE ON public.classroom_courses
  FOR EACH ROW EXECUTE FUNCTION public.classroom_set_updated_at();

DROP TRIGGER IF EXISTS update_classroom_lessons_updated_at ON public.classroom_lessons;
CREATE TRIGGER update_classroom_lessons_updated_at
  BEFORE UPDATE ON public.classroom_lessons
  FOR EACH ROW EXECUTE FUNCTION public.classroom_set_updated_at();

-- 6) RLS ----------------------------------------------------------------------
ALTER TABLE public.classroom_courses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_lessons   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_progress  ENABLE ROW LEVEL SECURITY;

-- Helper: ¿el que llama es Dirección? El rol de director se guarda como 'admin'
-- o 'director' en profiles (ver mapProfileToDB en AppContext).
CREATE OR REPLACE FUNCTION public.is_classroom_editor()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'director')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_classroom_editor() TO authenticated, anon;

-- --- Cursos ---
-- Lectura: autenticados ven lo publicado; Dirección ve también los borradores.
DROP POLICY IF EXISTS "classroom_courses lectura autenticados" ON public.classroom_courses;
CREATE POLICY "classroom_courses lectura autenticados"
  ON public.classroom_courses FOR SELECT TO public
  USING (
    auth.uid() IS NOT NULL
    AND (is_published OR public.is_classroom_editor())
  );

DROP POLICY IF EXISTS "classroom_courses escritura direccion" ON public.classroom_courses;
CREATE POLICY "classroom_courses escritura direccion"
  ON public.classroom_courses FOR ALL TO public
  USING (public.is_classroom_editor())
  WITH CHECK (public.is_classroom_editor());

-- --- Lecciones ---
DROP POLICY IF EXISTS "classroom_lessons lectura autenticados" ON public.classroom_lessons;
CREATE POLICY "classroom_lessons lectura autenticados"
  ON public.classroom_lessons FOR SELECT TO public
  USING (
    auth.uid() IS NOT NULL
    AND (is_published OR public.is_classroom_editor())
  );

DROP POLICY IF EXISTS "classroom_lessons escritura direccion" ON public.classroom_lessons;
CREATE POLICY "classroom_lessons escritura direccion"
  ON public.classroom_lessons FOR ALL TO public
  USING (public.is_classroom_editor())
  WITH CHECK (public.is_classroom_editor());

-- --- Material de apoyo ---
DROP POLICY IF EXISTS "classroom_resources lectura autenticados" ON public.classroom_resources;
CREATE POLICY "classroom_resources lectura autenticados"
  ON public.classroom_resources FOR SELECT TO public
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "classroom_resources escritura direccion" ON public.classroom_resources;
CREATE POLICY "classroom_resources escritura direccion"
  ON public.classroom_resources FOR ALL TO public
  USING (public.is_classroom_editor())
  WITH CHECK (public.is_classroom_editor());

-- --- Avance ---
-- Cada usuario lee y escribe SOLO su propio avance; Dirección lee el de todos
-- (para poder auditar quién completó la inducción).
DROP POLICY IF EXISTS "classroom_progress lectura propia" ON public.classroom_progress;
CREATE POLICY "classroom_progress lectura propia"
  ON public.classroom_progress FOR SELECT TO public
  USING (user_id = auth.uid() OR public.is_classroom_editor());

DROP POLICY IF EXISTS "classroom_progress insert propia" ON public.classroom_progress;
CREATE POLICY "classroom_progress insert propia"
  ON public.classroom_progress FOR INSERT TO public
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "classroom_progress delete propia" ON public.classroom_progress;
CREATE POLICY "classroom_progress delete propia"
  ON public.classroom_progress FOR DELETE TO public
  USING (user_id = auth.uid());

-- 7) SIEMBRA: los cursos de arranque -----------------------------------------
-- Sin lecciones todavía: la Dirección las agrega desde la UI del módulo. Los
-- cursos entran con `cover_url` NULL para que la UI pinte el degradado 3D hasta
-- que se suban las portadas definitivas.
INSERT INTO public.classroom_courses
  (slug, title, description, accent, emoji, badge, audience, sort_order)
VALUES
  ('empieza-aqui',
   'Empieza Aquí',
   'Ya estás dentro. Este es el primer curso que tienes que ver: qué es Pensión Perfecta, cómo se gana y cuál es tu primer paso.',
   'emerald', '➡️', NULL, 'todos', 10),

  ('conceptos-de-pension',
   'Conceptos de Pensión',
   'Ley 73 vs Ley 97, Modalidad 40, semanas cotizadas, salario promedio y AFORE. Los cimientos que necesitas para hablar con un cliente.',
   'blue', '📘', 'CURSO', 'todos', 20),

  ('pipeline-del-cliente',
   'El Pipeline del Cliente',
   'Las 6 etapas por las que pasa un expediente, qué significa cada una y quién mueve qué en cada momento.',
   'indigo', '🔀', 'CURSO', 'todos', 30),

  ('sube-tu-primer-cliente',
   'Sube tu Primer Cliente',
   'De cero a expediente cargado: cómo registrar un prospecto, qué datos son obligatorios y cómo evitar duplicados.',
   'teal', '🚀', 'CURSO', 'aliados', 40),

  ('expediente-y-documentos',
   'Expediente y Documentos',
   'Qué documento pide cada tipo de financiamiento, cómo se sube y por qué un expediente incompleto frena la aprobación.',
   'amber', '📁', 'CURSO', 'todos', 50),

  ('tipos-de-financiamiento',
   'Tipos de Financiamiento',
   'Modalidad 40, Ley 10 y crédito de nómina: cuándo aplica cada uno y cómo se decide la modalidad de aprobación.',
   'cyan', '💳', 'CURSO', 'todos', 60),

  ('portal-de-aliados',
   'Portal de Aliados',
   'Tu panel por dentro: dashboard, Mis Clientes, filtros, la línea de tiempo y cómo agendar la asesoría.',
   'rose', '🧭', 'CURSO', 'aliados', 70),

  ('preguntas-frecuentes',
   'Preguntas Frecuentes',
   'El material de apoyo que se sube constantemente para aclarar dudas. Revísalo antes de preguntar.',
   'slate', '❓', NULL, 'todos', 80)
ON CONFLICT (slug) DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFICACIÓN (correr después, debe devolver 8 cursos y 0 errores)
-- =============================================================================
-- SELECT slug, title, audience, sort_order, is_published
--   FROM public.classroom_courses ORDER BY sort_order;
--
-- SELECT tablename, policyname, cmd
--   FROM pg_policies
--  WHERE tablename LIKE 'classroom%'
--  ORDER BY tablename, policyname;
--
-- SELECT to_regclass('public.classroom_courses')   AS courses,
--        to_regclass('public.classroom_lessons')   AS lessons,
--        to_regclass('public.classroom_resources') AS resources,
--        to_regclass('public.classroom_progress')  AS progress;
