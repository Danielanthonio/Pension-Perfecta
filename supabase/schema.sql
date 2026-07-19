-- =============================================================================
-- PensiónFlow - Schema de Base de Datos Supabase
-- =============================================================================
-- Ejecutar este script en el SQL Editor de tu proyecto Supabase
-- Supabase Dashboard > SQL Editor > New query > Pegar y ejecutar

-- Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PERFILES DE USUARIO (Director y Aliados)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name text,
  email text UNIQUE,
  phone text,
  role text CHECK (role IN ('admin', 'aliado', 'account_manager')),
  invitation_code_used text,
  account_manager_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  aliado_tipo text DEFAULT 'aliado' CHECK (aliado_tipo IN ('aliado', 'lider')),
  lider_grupo text,
  empresa_multialiado_id uuid, -- Referencia a empresas_multialiado (añadida vía alter o definida después)
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CÓDIGOS DE INVITACIÓN
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE invitation_codes (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  code text UNIQUE NOT NULL,
  created_by uuid REFERENCES profiles(id),
  is_used boolean DEFAULT false,
  used_by uuid REFERENCES profiles(id),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PROSPECTOS / EXPEDIENTES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE prospects (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  aliado_id uuid REFERENCES profiles(id),
  aliado_name text,
  empresa_multialiado_id uuid REFERENCES public.empresas_multialiado(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  nss text,
  curp text,
  phone text,
  email text,
  status text DEFAULT 'evaluacion_pendiente'
    CHECK (status IN (
      'evaluacion_pendiente',
      'rechazado',
      'aprobado_listo',
      'asesoria_agendada',
      'doc_proceso',
      'analisis_riesgo',
      'firma_contrato',
      'firma_programada',
      'pagado_comision',
      'aportacion',
      'falta_reporte',
      'falta_afore',
      'pendiente_documentos',
      'cerrado_perdido',
      'falta_semanas',
      'falta_afore_cuenta',
      'posible_simulacion'
    )),
  notes_aliado text,
  notes_director text,
  
  -- Campos de Simulación (Ley 73)
  semanas_imss integer,
  pension_actual numeric,
  pension_mejorada numeric,
  monto_financiamiento numeric,
  costo_gestion numeric,
  total_credito numeric GENERATED ALWAYS AS (COALESCE(monto_financiamiento, 0) + COALESCE(costo_gestion, 0)) STORED,
  roi_months integer,
  simulation_comments text,
  afore_pensionarse numeric DEFAULT 0,
  aportacion numeric DEFAULT 0,
  
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. DOCUMENTOS ADJUNTOS (metadatos, archivos en Storage)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE documents (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  prospect_id uuid REFERENCES prospects(id) ON DELETE CASCADE,
  file_name text,
  file_url text,
  file_type text CHECK (file_type IN ('AFORE', 'IMSS', 'OTROS')),
  storage_path text, -- Ruta en Supabase Storage
  uploaded_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. NOTIFICACIONES DEL SISTEMA
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text,
  type text DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'error')),
  read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Trigger function to automatically keep auth.users metadata in sync with public.profiles role/assignment
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

-- Trigger declaration on public.profiles
DROP TRIGGER IF EXISTS sync_profile_to_auth_metadata_trigger ON public.profiles;
CREATE TRIGGER sync_profile_to_auth_metadata_trigger
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_to_auth_metadata();

-- Helper function for isolated metadata checks
CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_user_account_manager(user_id uuid)
RETURNS uuid AS $$
  SELECT account_manager_id FROM public.profiles WHERE id = user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── Profiles ────────────────────────────────────────────────────────────────
CREATE POLICY "Usuarios pueden ver su propio perfil"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins ven todos y AMs ven sus aliados"
  ON profiles FOR SELECT USING (
    auth.uid() = id
    OR public.get_user_role(auth.uid()) = 'admin'
    OR public.get_user_role(auth.uid()) = 'director'
    OR (
      public.get_user_role(auth.uid()) = 'account_manager'
      AND account_manager_id = auth.uid()
    )
    OR (
      id = public.get_user_account_manager(auth.uid())
    )
    OR (
      id IN (SELECT aliado_asignado_id FROM public.lider_aliados WHERE lider_id = auth.uid())
    )
    OR (
      id IN (SELECT lider_id FROM public.lider_aliados WHERE aliado_asignado_id = auth.uid())
    )
  );

CREATE POLICY "Usuarios pueden actualizar su perfil"
  ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins y AMs pueden actualizar perfiles de sus aliados"
  ON profiles FOR UPDATE USING (
    auth.uid() = id
    OR public.get_user_role(auth.uid()) = 'admin'
    OR public.get_user_role(auth.uid()) = 'director'
    OR (
      public.get_user_role(auth.uid()) = 'account_manager'
      AND account_manager_id = auth.uid()
    )
  );

CREATE POLICY "Admins y Account Managers pueden crear perfiles"
  ON profiles FOR INSERT WITH CHECK (
    public.get_user_role(auth.uid()) = 'admin'
    OR public.get_user_role(auth.uid()) = 'director'
    OR public.get_user_role(auth.uid()) = 'account_manager'
    OR auth.uid() = id
  );

-- ─── Prospects ───────────────────────────────────────────────────────────────
CREATE POLICY "Aliados ven sus propios prospectos"
  ON prospects FOR SELECT USING (
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

CREATE POLICY "Aliados crean sus prospectos"
  ON prospects FOR INSERT WITH CHECK (aliado_id = auth.uid());

CREATE POLICY "Admins y dueños pueden actualizar"
  ON prospects FOR UPDATE USING (
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

CREATE POLICY "Admins pueden eliminar prospectos"
  ON prospects FOR DELETE USING (
    public.get_user_role(auth.uid()) = 'admin'
    OR public.get_user_role(auth.uid()) = 'director'
  );

-- ─── Documents ───────────────────────────────────────────────────────────────
CREATE POLICY "Ver documentos permitidos"
  ON documents FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.prospects p
      WHERE p.id = documents.prospect_id
    )
  );

CREATE POLICY "Subir documentos"
  ON documents FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.prospects p
      WHERE p.id = prospect_id
    )
  );

CREATE POLICY "Eliminar documentos con prospecto"
  ON documents FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.prospects p
      WHERE p.id = documents.prospect_id
    )
  );

-- ─── Notifications ───────────────────────────────────────────────────────────
CREATE POLICY "Usuarios ven sus notificaciones"
  ON notifications FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Sistema puede crear notificaciones"
  ON notifications FOR INSERT WITH CHECK (true);

CREATE POLICY "Usuarios pueden marcar como leídas"
  ON notifications FOR UPDATE USING (user_id = auth.uid());

-- ─── Invitation Codes ────────────────────────────────────────────────────────
CREATE POLICY "Admins ven todos y AMs ven sus propios creados"
  ON invitation_codes FOR SELECT USING (
    public.get_user_role(auth.uid()) = 'admin'
    OR public.get_user_role(auth.uid()) = 'director'
    OR created_by = auth.uid()
  );

CREATE POLICY "Admins y AMs crean códigos"
  ON invitation_codes FOR INSERT WITH CHECK (
    public.get_user_role(auth.uid()) = 'admin'
    OR public.get_user_role(auth.uid()) = 'director'
    OR public.get_user_role(auth.uid()) = 'account_manager'
  );

-- =============================================================================
-- STORAGE BUCKET para documentos PDF/IMG
-- =============================================================================
-- Ejecutar en SQL Editor:
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage
CREATE POLICY "Aliados suben archivos"
  ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'documents' AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Usuarios autorizados descargan archivos"
  ON storage.objects FOR SELECT USING (
    bucket_id = 'documents' AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Admins eliminan archivos"
  ON storage.objects FOR DELETE USING (
    bucket_id = 'documents'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================================================
-- FUNCIÓN: Actualizar updated_at automáticamente
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_prospects_updated_at
  BEFORE UPDATE ON prospects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- MIGRACIÓN: Soporte para Google Drive API
-- =============================================================================
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS drive_folder_id text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS drive_folder_url text;

ALTER TABLE documents ADD COLUMN IF NOT EXISTS drive_file_id text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS drive_file_url text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS drive_folder_id text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- MIGRACIÓN: Soporte para Crédito de Nómina en Simulación
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS credito_nomina numeric DEFAULT 0;

-- =============================================================================
-- MIGRACIÓN: Módulo de Liderazgo (Asignación de Aliados a Líderes)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.lider_aliados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lider_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  aliado_asignado_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  grupo_nombre VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  UNIQUE(lider_id, aliado_asignado_id)
);

CREATE INDEX IF NOT EXISTS idx_lider_id ON public.lider_aliados(lider_id);
CREATE INDEX IF NOT EXISTS idx_aliado_asignado_id ON public.lider_aliados(aliado_asignado_id);

ALTER TABLE public.lider_aliados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lideres_ven_aliados_asignados"
  ON public.lider_aliados FOR SELECT USING (auth.uid() = lider_id);

CREATE POLICY "Aliados_ven_sus_propios_lideres"
  ON public.lider_aliados FOR SELECT USING (auth.uid() = aliado_asignado_id);

CREATE POLICY "Admins_y_AMs_gestionan_relaciones"
  ON public.lider_aliados FOR ALL USING (
    public.get_user_role(auth.uid()) IN ('admin', 'director', 'account_manager')
  );

-- =============================================================================
-- MIGRACIÓN: Validación de Unicidad de CURP (RPC)
-- =============================================================================
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

-- Forzar la recarga del caché de esquemas de PostgREST en Supabase
NOTIFY pgrst, 'reload schema';
