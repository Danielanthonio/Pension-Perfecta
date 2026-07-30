-- =============================================================================
-- PensiónFlow - Migración: portadas CGI del Classroom
-- =============================================================================
-- Asigna la portada definitiva a cada uno de los 8 cursos sembrados por
-- 20260729000000_classroom.sql, que entraron con `cover_url` NULL para que la UI
-- pintara un degradado provisional.
--
-- Las imágenes son renders CGI hiperrealistas del director (Raúl) generados con
-- Nano Banana Pro a 2752x1536 y optimizadas a 1280x714 JPEG (~140 KB cada una).
-- Viven en el repo, en `public/classroom/`, así que las rutas son RELATIVAS y
-- las sirve la propia app: no dependen de ningún CDN externo ni de un bucket de
-- Storage, y no hay que tocar `remotePatterns` (next.config.js ya trae
-- `images: { unoptimized: true }` y la UI usa <img> crudo).
--
-- ⚠️ ORDEN: esta migración va DESPUÉS de desplegar el código. Si se corre antes
-- del push, las rutas apuntan a archivos que aún no existen en el servidor y las
-- tarjetas mostrarían la imagen rota en vez del degradado. Al revés no pasa
-- nada: con el código desplegado y sin esta migración, simplemente se sigue
-- viendo el degradado provisional.
--
-- Es ADITIVA e IDEMPOTENTE: solo hace UPDATE de una columna que estaba en NULL,
-- filtrando por slug. Re-correrla no cambia nada.
--
-- REVERSIÓN: UPDATE public.classroom_courses SET cover_url = NULL
--            WHERE slug IN (...);  -- vuelve al degradado provisional
-- =============================================================================

BEGIN;

UPDATE public.classroom_courses SET cover_url = v.cover_url
FROM (VALUES
  ('empieza-aqui',            '/classroom/01-empieza-aqui.jpg'),
  ('conceptos-de-pension',    '/classroom/02-conceptos-de-pension.jpg'),
  ('pipeline-del-cliente',    '/classroom/03-pipeline-del-cliente.jpg'),
  ('sube-tu-primer-cliente',  '/classroom/04-sube-tu-primer-cliente.jpg'),
  ('expediente-y-documentos', '/classroom/05-expediente-y-documentos.jpg'),
  ('tipos-de-financiamiento', '/classroom/06-tipos-de-financiamiento.jpg'),
  ('portal-de-aliados',       '/classroom/07-portal-de-aliados.jpg'),
  ('preguntas-frecuentes',    '/classroom/08-preguntas-frecuentes.jpg')
) AS v(slug, cover_url)
WHERE public.classroom_courses.slug = v.slug;

COMMIT;

-- =============================================================================
-- VERIFICACIÓN (debe devolver 8 filas, todas con su ruta)
-- =============================================================================
-- SELECT slug, cover_url FROM public.classroom_courses
--  WHERE cover_url IS NOT NULL ORDER BY sort_order;
