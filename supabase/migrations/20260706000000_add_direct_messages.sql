-- =============================================================================
-- PensiónFlow - Migración: Chat general (mensajería directa persona ↔ persona)
-- =============================================================================
-- Reemplaza a la bitácora por proyecto (prospect_messages) por un chat GENERAL,
-- disponible en todas las vistas, entre personas de la cadena comercial:
--   · aliado  ↔ su Account Manager y dirección
--   · account_manager ↔ sus aliados y dirección
--   · director ↔ todos
-- Un mensaje puede referir OPCIONALMENTE un proyecto (chip) o ninguno.
--
-- Migración puramente aditiva: crea una tabla nueva. NO toca prospect_messages ni
-- sus datos (se conservan como antecedente histórico, solo dejan de mostrarse).
-- Idempotente y tolerante (mismo patrón que 20260705000000_add_prospect_messages).
-- =============================================================================

-- 1. Tabla direct_messages
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id      UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_name    VARCHAR(255) NOT NULL,
  sender_role    VARCHAR(50)  NOT NULL,
  recipient_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_name VARCHAR(255) NOT NULL,
  recipient_role VARCHAR(50)  NOT NULL,
  prospect_id    UUID NULL REFERENCES public.prospects(id) ON DELETE SET NULL,
  prospect_name  VARCHAR(255) NULL,
  text           TEXT NOT NULL,
  read           BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Índices para listar la conversación de un par y contar no leídos por destinatario.
CREATE INDEX IF NOT EXISTS idx_direct_messages_pair
  ON public.direct_messages(sender_id, recipient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_direct_messages_recipient
  ON public.direct_messages(recipient_id, created_at);

-- 2. Row Level Security
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Ver: soy el emisor o el destinatario (dirección ve todo).
DROP POLICY IF EXISTS "Ver mis mensajes directos" ON public.direct_messages;
CREATE POLICY "Ver mis mensajes directos"
ON public.direct_messages
FOR SELECT
TO public
USING (
  sender_id = auth.uid()
  OR recipient_id = auth.uid()
  OR get_user_role(auth.uid()) = ANY (ARRAY['admin'::text, 'director'::text])
);

-- Escribir: el emisor debe ser uno mismo (no se puede suplantar a otro).
DROP POLICY IF EXISTS "Enviar mensajes directos como uno mismo" ON public.direct_messages;
CREATE POLICY "Enviar mensajes directos como uno mismo"
ON public.direct_messages
FOR INSERT
TO public
WITH CHECK (
  sender_id = auth.uid()
);

-- Actualizar: solo el destinatario, para marcar como leído.
DROP POLICY IF EXISTS "Marcar mis mensajes como leidos" ON public.direct_messages;
CREATE POLICY "Marcar mis mensajes como leidos"
ON public.direct_messages
FOR UPDATE
TO public
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());

-- Borrar: solo dirección (el chat es registro; append-only para el resto).
DROP POLICY IF EXISTS "Solo direccion borra mensajes directos" ON public.direct_messages;
CREATE POLICY "Solo direccion borra mensajes directos"
ON public.direct_messages
FOR DELETE
TO public
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::text, 'director'::text])
);

-- 3. Realtime: mensajes en vivo para ambas partes. Idempotente y tolerante.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'direct_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- La publicación supabase_realtime no existe; realtime es opcional, continuar.
  NULL;
END $$;

-- 4. Notificar al destinatario en cada mensaje nuevo (reutiliza tabla notifications).
CREATE OR REPLACE FUNCTION public.notify_recipient_on_direct_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No auto-notificar al propio emisor. IS DISTINCT FROM cubre sender_id NULL.
  IF NEW.recipient_id IS NOT NULL AND NEW.recipient_id IS DISTINCT FROM NEW.sender_id THEN
    INSERT INTO public.notifications (user_id, title, message, type, read)
    VALUES (
      NEW.recipient_id,
      'Nuevo mensaje de ' || NEW.sender_name,
      left(NEW.text, 140)
        || CASE WHEN NEW.prospect_name IS NOT NULL
                THEN ' · sobre ' || NEW.prospect_name ELSE '' END,
      'info',
      false
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_recipient_on_direct_message ON public.direct_messages;
CREATE TRIGGER trg_notify_recipient_on_direct_message
AFTER INSERT ON public.direct_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_recipient_on_direct_message();
