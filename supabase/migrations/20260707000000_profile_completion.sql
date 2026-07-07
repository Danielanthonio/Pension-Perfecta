-- =============================================================================
-- PensiónFlow - Migración: Perfil completable (CURP/ciudad/país/foto) + verificación
-- =============================================================================
-- Esta zona de la app NO es un producto de suscripción: es donde cada usuario
-- (aliado / account manager / director) registra y completa sus datos para tener
-- una base de datos limpia. Se agregan campos y un bucket para la foto de perfil.
--
-- Todo es ADITIVO e IDEMPOTENTE: no altera ni borra datos existentes. Los perfiles
-- actuales simplemente quedan con estos campos en NULL (perfil incompleto), lo cual
-- NO limita su operación; solo alimenta el % de avance y los recordatorios in-app.
-- =============================================================================

-- 1) Campos nuevos en profiles ------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS curp       text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ciudad     text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pais       text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- La actualización de estos campos ya está cubierta por la política RLS de
-- auto-update de profiles (el cliente hace update().eq('id', auth.uid())).

-- 2) Bucket público para fotos de perfil --------------------------------------
-- Público = la foto se sirve por URL directa (getPublicUrl) para usarla en <img>.
-- Las imágenes se comprimen en el cliente (~256px, JPEG) antes de subir, así que
-- pesan decenas de KB. Ruta por usuario: avatars/{auth.uid()}/avatar.jpg
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 3) Políticas de acceso al bucket 'avatars' ----------------------------------
-- Lectura: pública (bucket público).
DROP POLICY IF EXISTS "Avatars lectura publica" ON storage.objects;
CREATE POLICY "Avatars lectura publica"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

-- Escritura (insert/update/delete): solo el propio usuario dentro de su carpeta
-- {auth.uid()}/..., para que nadie pueda sobrescribir la foto de otro.
DROP POLICY IF EXISTS "Avatars subir propio" ON storage.objects;
CREATE POLICY "Avatars subir propio"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Avatars actualizar propio" ON storage.objects;
CREATE POLICY "Avatars actualizar propio"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Avatars borrar propio" ON storage.objects;
CREATE POLICY "Avatars borrar propio"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
