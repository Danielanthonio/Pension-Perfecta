-- PensiónFlow - PAL-003 (ampliación): la alerta de cliente duplicado ahora aplica
-- a CUALQUIER aliado de la MISMA empresa multialiado, sin importar el líder.
--
-- Reemplaza check_team_duplicate quitando el requisito de líder compartido; se
-- mantiene el resto (misma empresa, otro aliado, coincidencia por CURP o NSS,
-- excluye borrados/purgados). Idempotente (CREATE OR REPLACE).

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
  ORDER BY p.created_at ASC
  LIMIT 1;

  RETURN result; -- NULL cuando no hay duplicado en la empresa
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Forzar recarga del caché de esquemas de PostgREST en Supabase.
NOTIFY pgrst, 'reload schema';
