-- =============================================================================
-- PensiónFlow - Migración: endurecer la visibilidad del Classroom
-- =============================================================================
-- PROBLEMA
-- La regla es "solo se ve lo que la Dirección publica", pero la implementación
-- original dejaba dos huecos que no se notan usando la app y sí existen a nivel
-- de API (el navegador habla directo con Supabase con la anon key):
--
--   1. `classroom_resources` se leía con solo estar autenticado, sin mirar si su
--      lección o curso padre estaban publicados. El material de apoyo (PDFs,
--      links) de una lección en BORRADOR era legible por cualquiera.
--
--   2. La `audience` del curso ('todos' / 'aliados' / 'equipo') se filtraba
--      únicamente en el cliente (courseVisibleFor en classroomTypes.ts). Un
--      aliado no veía los cursos de "solo equipo interno" en pantalla, pero
--      podía leer su título y descripción consultando la tabla.
--
--   3. Derivado: las lecciones se filtraban por su propio is_published, pero no
--      comprobaban que el CURSO al que pertenecen fuera visible para quien pide.
--
-- SOLUCIÓN
-- Una función `classroom_course_visible(uuid)` que concentra la regla de
-- visibilidad de un curso (publicado + audiencia compatible con el rol de quien
-- llama), y reescribir las tres políticas de SELECT para apoyarse en ella.
--
-- Es SECURITY DEFINER, igual que la ya existente is_classroom_editor(): corre
-- como el dueño de las tablas, así que no vuelve a entrar por RLS y no puede
-- provocar la recursión que ya mordió en este proyecto (ver
-- 20260723000001_fix_rls_recursion_profiles_prospects.sql).
--
-- NO cambia la interfaz ni requiere desplegar código: el filtro que ya hace el
-- cliente sigue siendo correcto y ahora es una segunda capa redundante. La
-- Dirección (roles 'admin'/'director') sigue viéndolo absolutamente todo,
-- borradores incluidos.
--
-- Es ADITIVA e IDEMPOTENTE: solo redefine políticas de SELECT (DROP ... IF
-- EXISTS + CREATE). No toca datos, ni columnas, ni las políticas de escritura.
--
-- REVERSIÓN: volver a crear las tres políticas tal como están en
--            20260729000000_classroom.sql y hacer DROP FUNCTION
--            public.classroom_course_visible(uuid);
-- =============================================================================

BEGIN;

-- 1) Regla única de visibilidad de un curso ----------------------------------
-- Devuelve true si el curso está publicado Y su audiencia corresponde al rol de
-- quien llama. El rol de director se guarda como 'admin' o 'director'.
CREATE OR REPLACE FUNCTION public.classroom_course_visible(target uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.classroom_courses c
    LEFT JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = target
      AND c.is_published
      AND (
        c.audience = 'todos'
        OR (c.audience = 'aliados' AND p.role = 'aliado')
        OR (c.audience = 'equipo'  AND p.role IN ('admin', 'director', 'account_manager'))
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.classroom_course_visible(uuid) TO authenticated, anon;

-- 2) Cursos: publicado + audiencia --------------------------------------------
DROP POLICY IF EXISTS "classroom_courses lectura autenticados" ON public.classroom_courses;
CREATE POLICY "classroom_courses lectura autenticados"
  ON public.classroom_courses FOR SELECT TO public
  USING (
    public.is_classroom_editor()
    OR (auth.uid() IS NOT NULL AND public.classroom_course_visible(id))
  );

-- 3) Lecciones: publicada Y su curso visible -----------------------------------
DROP POLICY IF EXISTS "classroom_lessons lectura autenticados" ON public.classroom_lessons;
CREATE POLICY "classroom_lessons lectura autenticados"
  ON public.classroom_lessons FOR SELECT TO public
  USING (
    public.is_classroom_editor()
    OR (
      auth.uid() IS NOT NULL
      AND is_published
      AND public.classroom_course_visible(course_id)
    )
  );

-- 4) Material de apoyo: hereda la visibilidad de su padre ----------------------
DROP POLICY IF EXISTS "classroom_resources lectura autenticados" ON public.classroom_resources;
CREATE POLICY "classroom_resources lectura autenticados"
  ON public.classroom_resources FOR SELECT TO public
  USING (
    public.is_classroom_editor()
    OR (
      auth.uid() IS NOT NULL
      AND (
        -- Material de una lección: la lección debe estar publicada y su curso visible.
        (lesson_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.classroom_lessons l
          WHERE l.id = classroom_resources.lesson_id
            AND l.is_published
            AND public.classroom_course_visible(l.course_id)
        ))
        -- Material general del curso: basta con que el curso sea visible.
        OR (lesson_id IS NULL AND course_id IS NOT NULL
            AND public.classroom_course_visible(course_id))
      )
    )
  );

COMMIT;

-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================
-- Las tres políticas de SELECT deben aparecer redefinidas:
-- SELECT tablename, policyname, cmd FROM pg_policies
--  WHERE tablename LIKE 'classroom%' AND cmd = 'SELECT'
--  ORDER BY tablename;
--
-- Como Dirección debes seguir viendo los 9 cursos (borradores incluidos):
-- SELECT count(*) FROM public.classroom_courses;
--
-- Prueba real: pon un curso en Borrador desde la UI, entra con un usuario
-- aliado y confirma que desaparece de su rejilla.
