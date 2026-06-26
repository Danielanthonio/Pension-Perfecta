-- =============================================================================
-- PensiónFlow - Migración: Subrol "Líder" en Asignación de Aliados
-- =============================================================================

-- 1. Modificar tabla profiles para añadir aliado_tipo y lider_grupo
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS aliado_tipo VARCHAR(50) DEFAULT 'aliado' CHECK (aliado_tipo IN ('aliado', 'lider'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS lider_grupo VARCHAR(255) NULL;

-- Indexar para búsquedas rápidas por tipo de aliado
CREATE INDEX IF NOT EXISTS idx_profiles_aliado_tipo ON public.profiles(aliado_tipo);

-- 2. Crear tabla lider_aliados
CREATE TABLE IF NOT EXISTS public.lider_aliados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lider_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  aliado_asignado_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  grupo_nombre VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  UNIQUE(lider_id, aliado_asignado_id)
);

-- Índices para optimizar las uniones por clave foránea
CREATE INDEX IF NOT EXISTS idx_lider_id ON public.lider_aliados(lider_id);
CREATE INDEX IF NOT EXISTS idx_aliado_asignado_id ON public.lider_aliados(aliado_asignado_id);

-- 3. Habilitar RLS en lider_aliados
ALTER TABLE public.lider_aliados ENABLE ROW LEVEL SECURITY;

-- 4. RLS Políticas

-- Política: Líderes ven sus aliados asignados
DROP POLICY IF EXISTS "Lideres_ven_aliados_asignados" ON public.lider_aliados;
CREATE POLICY "Lideres_ven_aliados_asignados"
ON public.lider_aliados
FOR SELECT
USING (auth.uid() = lider_id);

-- Política: Aliados no ven tabla lider_aliados
DROP POLICY IF EXISTS "Aliados_no_ven_relaciones" ON public.lider_aliados;
CREATE POLICY "Aliados_no_ven_relaciones"
ON public.lider_aliados
FOR SELECT
USING (false);

-- Política: Admins y AMs pueden gestionar las relaciones
DROP POLICY IF EXISTS "Admins_y_AMs_gestionan_relaciones" ON public.lider_aliados;
CREATE POLICY "Admins_y_AMs_gestionan_relaciones"
ON public.lider_aliados
FOR ALL
USING (
  public.get_user_role(auth.uid()) IN ('admin', 'director', 'account_manager')
);

-- 5. Actualizar la función de trigger para sincronizar metadatos adicionales en auth.users
CREATE OR REPLACE FUNCTION public.sync_profile_to_auth_metadata()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data = 
    coalesce(raw_user_meta_data, '{}'::jsonb) 
    || jsonb_build_object(
      'role', NEW.role, 
      'account_manager_id', NEW.account_manager_id,
      'aliado_tipo', NEW.aliado_tipo,
      'lider_grupo', NEW.lider_grupo
    )
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
