-- PensiónFlow - Migración: Alerta de cliente duplicado entre aliados del mismo equipo (PAL-003)
--
-- Detecta cuando otro aliado de la MISMA empresa multialiado y que comparte al
-- menos un LÍDER con quien captura ya tiene registrado al mismo cliente (por CURP
-- o por NSS). Se usa para mostrar una advertencia visible al subir el prospecto y
-- evitar que dos aliados del mismo equipo trabajen el mismo cliente sin saberlo.
--
-- Corre como SECURITY DEFINER (igual que check_curp_exists) porque un aliado NO
-- puede leer por RLS los prospectos de sus compañeros de equipo.

CREATE OR REPLACE FUNCTION public.check_team_duplicate(target_curp text, target_nss text)
RETURNS jsonb AS $$
DECLARE
  caller uuid := auth.uid();
  caller_empresa uuid;
  clean_curp text := NULLIF(UPPER(TRIM(COALESCE(target_curp, ''))), '');
  clean_nss  text := NULLIF(TRIM(COALESCE(target_nss, '')), '');
  result jsonb;
BEGIN
  IF caller IS NULL THEN
    RETURN NULL;
  END IF;

  -- Sin CURP ni NSS que comparar no hay nada que validar.
  IF clean_curp IS NULL AND clean_nss IS NULL THEN
    RETURN NULL;
  END IF;

  -- El concepto de "equipo" solo aplica dentro de una empresa multialiado.
  SELECT empresa_multialiado_id INTO caller_empresa
  FROM public.profiles
  WHERE id = caller;

  IF caller_empresa IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'aliado_name', COALESCE(p.aliado_name, owner.full_name),
    'full_name',   p.full_name,
    'matched_by',  CASE
        WHEN clean_curp IS NOT NULL AND UPPER(p.curp) = clean_curp
             AND clean_nss IS NOT NULL AND p.nss = clean_nss THEN 'ambos'
        WHEN clean_curp IS NOT NULL AND UPPER(p.curp) = clean_curp THEN 'curp'
        ELSE 'nss'
      END
  )
  INTO result
  FROM public.prospects p
  LEFT JOIN public.profiles owner ON owner.id = p.aliado_id
  WHERE p.aliado_id <> caller
    AND p.empresa_multialiado_id = caller_empresa
    AND (
      (clean_curp IS NOT NULL AND UPPER(p.curp) = clean_curp)
      OR (clean_nss IS NOT NULL AND p.nss = clean_nss)
    )
    AND (p.notes_director IS NULL OR (p.notes_director NOT LIKE '[DELETED:%' AND p.notes_director NOT LIKE '[PURGED:%'))
    -- El dueño del expediente comparte al menos un líder con quien captura.
    AND EXISTS (
      SELECT 1
      FROM public.lider_aliados la_owner
      JOIN public.lider_aliados la_caller
        ON la_caller.lider_id = la_owner.lider_id
      WHERE la_owner.aliado_asignado_id = p.aliado_id
        AND la_caller.aliado_asignado_id = caller
    )
  ORDER BY p.created_at ASC
  LIMIT 1;

  RETURN result; -- NULL cuando no hay duplicado de equipo
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Forzar recarga del caché de esquemas de PostgREST en Supabase.
NOTIFY pgrst, 'reload schema';
