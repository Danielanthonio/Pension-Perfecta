-- =============================================================================
-- PensiónFlow - Migración: curso "Miércoles de Pensiones" en el Classroom
-- =============================================================================
-- Alta del curso de la sesión semanal. No es un módulo aparte de la app: vive
-- DENTRO del Classroom como un curso más, porque encaja con su estructura — cada
-- miércoles se agrega una lección con la grabación de esa sesión (link de Loom),
-- y el archivo histórico queda ordenado y con el avance por persona.
--
-- Va en segunda posición (sort_order 15, justo detrás de "Empieza Aquí" que
-- tiene 10) por ser la serie recurrente insignia: quien entra ve primero por
-- dónde empezar y enseguida la sesión semanal.
--
-- La portada es un render CGI del director frente a un micrófono de podcast,
-- misma receta y composición que las otras ocho. Ruta RELATIVA servida por la
-- propia app desde public/classroom/.
--
-- ⚠️ ORDEN: correr DESPUÉS de desplegar el código, igual que la migración de
-- portadas. Si se corre antes del push, la ruta apunta a un archivo que aún no
-- está en el servidor y la tarjeta saldría con la imagen rota.
--
-- Es ADITIVA e IDEMPOTENTE: un solo INSERT con ON CONFLICT DO NOTHING sobre el
-- slug. Re-correrla no duplica nada ni toca los cursos existentes.
--
-- REVERSIÓN: DELETE FROM public.classroom_courses WHERE slug = 'miercoles-de-pensiones';
--            (arrastra sus lecciones y material por el ON DELETE CASCADE)
-- =============================================================================

BEGIN;

INSERT INTO public.classroom_courses
  (slug, title, description, cover_url, accent, emoji, badge, audience, sort_order)
VALUES (
  'miercoles-de-pensiones',
  'Miércoles de Pensiones',
  'La sesión semanal del equipo. Cada miércoles revisamos casos reales, resolvemos las dudas que trae cada quien y repasamos novedades de la ley. Aquí quedan todas las grabaciones, de la más reciente hacia atrás.',
  '/classroom/09-miercoles-de-pensiones.jpg',
  'rose',
  '🎙️',
  'SEMANAL',
  'todos',
  15
)
ON CONFLICT (slug) DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFICACIÓN (debe salir en segundo lugar, con su portada)
-- =============================================================================
-- SELECT sort_order, slug, title, badge, cover_url
--   FROM public.classroom_courses ORDER BY sort_order;
