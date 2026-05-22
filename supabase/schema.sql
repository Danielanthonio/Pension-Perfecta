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
  role text CHECK (role IN ('admin', 'aliado')),
  invitation_code_used text,
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

-- ─── Profiles ────────────────────────────────────────────────────────────────
CREATE POLICY "Usuarios pueden ver su propio perfil"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins pueden ver todos los perfiles"
  ON profiles FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Usuarios pueden actualizar su perfil"
  ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins pueden crear perfiles"
  ON profiles FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR auth.uid() = id
  );

-- ─── Prospects ───────────────────────────────────────────────────────────────
CREATE POLICY "Aliados ven sus propios prospectos"
  ON prospects FOR SELECT USING (
    aliado_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Aliados crean sus prospectos"
  ON prospects FOR INSERT WITH CHECK (aliado_id = auth.uid());

CREATE POLICY "Admins y dueños pueden actualizar"
  ON prospects FOR UPDATE USING (
    aliado_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins pueden eliminar prospectos"
  ON prospects FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─── Documents ───────────────────────────────────────────────────────────────
CREATE POLICY "Ver documentos permitidos"
  ON documents FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM prospects
      WHERE id = documents.prospect_id
      AND (
        aliado_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
      )
    )
  );

CREATE POLICY "Subir documentos"
  ON documents FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM prospects
      WHERE id = documents.prospect_id AND aliado_id = auth.uid()
    )
  );

CREATE POLICY "Eliminar documentos con prospecto"
  ON documents FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM prospects
      WHERE id = documents.prospect_id
      AND (
        aliado_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
      )
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
CREATE POLICY "Admins ven todos los códigos"
  ON invitation_codes FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins crean códigos"
  ON invitation_codes FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
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
