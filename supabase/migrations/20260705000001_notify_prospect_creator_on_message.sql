-- =============================================================================
-- PensiónFlow - Migración: Notificar al aliado creador cuando hay mensaje nuevo
--                          en la bitácora del prospecto.
-- =============================================================================
-- Al insertarse un mensaje en `prospect_messages`, se crea automáticamente una
-- notificación (campana) para el ALIADO CREADOR del prospecto (`prospects.aliado_id`),
-- salvo que él mismo sea el autor del mensaje.
--
-- Se implementa como TRIGGER SECURITY DEFINER (corre con privilegios del dueño de la
-- función) para que funcione sin importar el rol de quien escribe: la RLS de INSERT
-- en `notifications` solo permite a admin/director, pero un Account Manager también
-- debe poder avisar al aliado. El trigger evita ampliar esa RLS.
-- Migración puramente aditiva (crea función + trigger; no toca datos existentes).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_prospect_creator_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aliado_id   uuid;
  v_client_name text;
BEGIN
  SELECT aliado_id, full_name
    INTO v_aliado_id, v_client_name
  FROM public.prospects
  WHERE id = NEW.prospect_id;

  -- Notificar al aliado creador salvo que sea el propio autor del mensaje.
  -- IS DISTINCT FROM cubre el caso author_id NULL.
  IF v_aliado_id IS NOT NULL AND v_aliado_id IS DISTINCT FROM NEW.author_id THEN
    INSERT INTO public.notifications (user_id, title, message, type, read)
    VALUES (
      v_aliado_id,
      'Nuevo mensaje en la bitácora',
      NEW.author_name || ' escribió sobre ' || COALESCE(v_client_name, 'tu prospecto')
        || ': ' || left(NEW.text, 140),
      'info',
      false
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_prospect_creator_on_message ON public.prospect_messages;
CREATE TRIGGER trg_notify_prospect_creator_on_message
AFTER INSERT ON public.prospect_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_prospect_creator_on_message();
