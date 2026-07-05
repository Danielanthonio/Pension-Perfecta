-- =============================================================================
-- PensiónFlow - Migración: Bitácora dirigida ("Para: …")
-- =============================================================================
-- Cada mensaje de la bitácora puede dirigirse a una persona de la cadena comercial
-- (aliado creador, su Account Manager, líder o dirección). El mensaje SIGUE siendo
-- parte del registro compartido del cliente (todos en la cadena lo leen: es el
-- "seguimiento"); "dirigido" solo significa a quién se le avisa (notificación).
--
-- Migración puramente aditiva: agrega columnas opcionales y actualiza el cuerpo de
-- la función de notificación (creada en 20260705000001) para enrutar al destinatario
-- elegido, con respaldo al aliado creador cuando el mensaje es general.
-- =============================================================================

-- 1. Columnas de destinatario (opcionales; NULL = seguimiento general para todos)
ALTER TABLE public.prospect_messages
  ADD COLUMN IF NOT EXISTS recipient_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipient_name varchar(255),
  ADD COLUMN IF NOT EXISTS recipient_role varchar(50);

-- 2. Enrutar la notificación al destinatario elegido (o al aliado creador si es general)
CREATE OR REPLACE FUNCTION public.notify_prospect_creator_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aliado_id   uuid;
  v_client_name text;
  v_target      uuid;
BEGIN
  SELECT aliado_id, full_name
    INTO v_aliado_id, v_client_name
  FROM public.prospects
  WHERE id = NEW.prospect_id;

  -- Mensaje dirigido → avisar al destinatario; general → avisar al aliado creador.
  v_target := COALESCE(NEW.recipient_id, v_aliado_id);

  -- No auto-notificar al propio autor. IS DISTINCT FROM cubre author_id NULL.
  IF v_target IS NOT NULL AND v_target IS DISTINCT FROM NEW.author_id THEN
    INSERT INTO public.notifications (user_id, title, message, type, read)
    VALUES (
      v_target,
      'Nuevo mensaje en la bitácora',
      NEW.author_name || ' escribió sobre ' || COALESCE(v_client_name, 'un prospecto')
        || ': ' || left(NEW.text, 140),
      'info',
      false
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Trigger idempotente (por si esta migración se aplica sola)
DROP TRIGGER IF EXISTS trg_notify_prospect_creator_on_message ON public.prospect_messages;
CREATE TRIGGER trg_notify_prospect_creator_on_message
AFTER INSERT ON public.prospect_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_prospect_creator_on_message();
