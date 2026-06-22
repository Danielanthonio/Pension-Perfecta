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
      'firma_programada',
      'pagado_comision',
      'aportacion',
      'falta_reporte',
      'falta_afore',
      'pendiente_documentos',
      'cerrado_perdido'
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
    || jsonb_build_object('role', NEW.role, 'account_manager_id', NEW.account_manager_id)
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
