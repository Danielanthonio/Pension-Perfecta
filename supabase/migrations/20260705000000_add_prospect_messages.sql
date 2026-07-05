-- =============================================================================
-- PensiónFlow - Migración: Bitácora / Chat interno de evaluación por prospecto
-- =============================================================================
-- Hasta ahora la bitácora vivía solo en localStorage (`pp_chat_<id>`), por lo que
-- NO era multiusuario ni sobrevivía a limpiar el navegador. Esta tabla persiste
-- los mensajes en la BD para que sean compartidos entre aliado / account manager /
-- director y queden como antecedente real del cliente.
-- Migración puramente aditiva (no toca datos existentes).
-- =============================================================================

-- 1. Tabla prospect_messages
CREATE TABLE IF NOT EXISTS public.prospect_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id  UUID NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  author_id    UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name  VARCHAR(255) NOT NULL,
  author_role  VARCHAR(50)  NOT NULL,
  text         TEXT NOT NULL,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Índice para cargar la bitácora de un prospecto en orden cronológico
CREATE INDEX IF NOT EXISTS idx_prospect_messages_prospect_created
  ON public.prospect_messages(prospect_id, created_at);

-- 2. Row Level Security
ALTER TABLE public.prospect_messages ENABLE ROW LEVEL SECURITY;

-- Ver mensajes: cualquiera que ya pueda ver el prospecto padre (misma regla que `documents`).
-- El EXISTS respeta la RLS de `prospects`, así que hereda exactamente su modelo de acceso
-- (dueño aliado, su AM, líderes asignados, director/admin).
DROP POLICY IF EXISTS "Ver bitacora de prospectos permitidos" ON public.prospect_messages;
CREATE POLICY "Ver bitacora de prospectos permitidos"
ON public.prospect_messages
FOR SELECT
TO public
USING (
  EXISTS (SELECT 1 FROM public.prospects p WHERE p.id = prospect_messages.prospect_id)
);

-- Escribir mensajes: el autor debe ser uno mismo y poder ver el prospecto.
DROP POLICY IF EXISTS "Escribir bitacora en prospectos permitidos" ON public.prospect_messages;
CREATE POLICY "Escribir bitacora en prospectos permitidos"
ON public.prospect_messages
FOR INSERT
TO public
WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.prospects p WHERE p.id = prospect_messages.prospect_id)
);

-- Borrar mensajes: solo dirección (la bitácora es registro de antecedentes; append-only para el resto).
DROP POLICY IF EXISTS "Solo direccion borra bitacora" ON public.prospect_messages;
CREATE POLICY "Solo direccion borra bitacora"
ON public.prospect_messages
FOR DELETE
TO public
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::text, 'director'::text])
);

-- 3. Realtime (opcional): permite que los mensajes de otros usuarios aparezcan en vivo.
--    Idempotente y tolerante a que la publicación no exista.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'prospect_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.prospect_messages;
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- La publicación supabase_realtime no existe; realtime es opcional, continuar.
  NULL;
END $$;
