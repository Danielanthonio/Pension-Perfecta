-- PensiónFlow - Migración: Asociación de Prospectos a Empresa y Validación de CURP

-- 1. Agregar columna de empresa a prospects
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS empresa_multialiado_id UUID NULL 
  REFERENCES public.empresas_multialiado(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_empresa_multialiado_id ON public.prospects(empresa_multialiado_id);

-- 2. Crear función RPC para validar unicidad de CURP saltando RLS (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.check_curp_exists(target_curp text)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.prospects 
    WHERE UPPER(curp) = UPPER(target_curp)
      AND (notes_director IS NULL OR (notes_director NOT LIKE '[DELETED:%' AND notes_director NOT LIKE '[PURGED:%'))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Actualizar políticas de RLS para visibilidad de empresa y liderazgo
DROP POLICY IF EXISTS "Aliados ven sus propios prospectos" ON public.prospects;
CREATE POLICY "Aliados ven sus propios prospectos"
  ON public.prospects FOR SELECT USING (
    aliado_id = auth.uid()
    OR public.get_user_role(auth.uid()) = 'admin'
    OR public.get_user_role(auth.uid()) = 'director'
    OR (
      public.get_user_role(auth.uid()) = 'account_manager'
      AND public.get_user_account_manager(aliado_id) = auth.uid()
    )
    OR (
      aliado_id IN (
        SELECT aliado_asignado_id 
        FROM public.lider_aliados 
        WHERE lider_id = auth.uid()
      )
    )
    OR (
      empresa_multialiado_id IS NOT NULL 
      AND empresa_multialiado_id IN (
        SELECT empresa_multialiado_id 
        FROM public.profiles 
        WHERE id = auth.uid() 
          AND (aliado_tipo = 'lider' OR role IN ('admin', 'director', 'account_manager'))
      )
    )
  );

DROP POLICY IF EXISTS "Admins y dueños pueden actualizar" ON public.prospects;
CREATE POLICY "Admins y dueños pueden actualizar"
  ON public.prospects FOR UPDATE USING (
    aliado_id = auth.uid()
    OR public.get_user_role(auth.uid()) = 'admin'
    OR public.get_user_role(auth.uid()) = 'director'
    OR (
      public.get_user_role(auth.uid()) = 'account_manager'
      AND public.get_user_account_manager(aliado_id) = auth.uid()
    )
    OR (
      aliado_id IN (
        SELECT aliado_asignado_id 
        FROM public.lider_aliados 
        WHERE lider_id = auth.uid()
      )
    )
  );

-- 4. Forzar la recarga del caché de esquemas de PostgREST en Supabase
NOTIFY pgrst, 'reload schema';
