-- =============================================================================
-- PensiónFlow - Migración: Gestión de Empresas Multialiado
-- =============================================================================

-- 1. Crear tabla de empresas_multialiado
CREATE TABLE IF NOT EXISTS public.empresas_multialiado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(255) NOT NULL UNIQUE,
  created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Indexar para búsquedas rápidas y claves foráneas
CREATE INDEX IF NOT EXISTS idx_empresas_multialiado_nombre ON public.empresas_multialiado(nombre);

-- Insertar empresas iniciales si no existen
INSERT INTO public.empresas_multialiado (nombre, created_by)
VALUES 
  ('Apoyamax', NULL),
  ('Pensium', NULL)
ON CONFLICT (nombre) DO NOTHING;

-- 2. Modificar tabla profiles para añadir empresa_multialiado_id
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS empresa_multialiado_id UUID NULL 
  REFERENCES public.empresas_multialiado(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_empresa_multialiado_id ON public.profiles(empresa_multialiado_id);

-- 3. Actualizar la tabla lider_aliados para incluir empresa_multialiado_id
-- Para evitar errores de integridad con registros previos de prueba, limpiamos la tabla e insertamos la nueva restricción NOT NULL.
TRUNCATE TABLE public.lider_aliados;

ALTER TABLE public.lider_aliados ADD COLUMN IF NOT EXISTS empresa_multialiado_id UUID NOT NULL 
  REFERENCES public.empresas_multialiado(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_lider_aliados_empresa_id ON public.lider_aliados(empresa_multialiado_id);

-- 4. Habilitar RLS en empresas_multialiado
ALTER TABLE public.empresas_multialiado ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para empresas_multialiado
DROP POLICY IF EXISTS "Todos los usuarios autenticados pueden ver empresas" ON public.empresas_multialiado;
CREATE POLICY "Todos los usuarios autenticados pueden ver empresas"
ON public.empresas_multialiado
FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Solo directores y account managers pueden modificar empresas" ON public.empresas_multialiado;
CREATE POLICY "Solo directores y account managers pueden modificar empresas"
ON public.empresas_multialiado
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
      'lider_grupo', NEW.lider_grupo,
      'empresa_multialiado_id', NEW.empresa_multialiado_id
    )
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
