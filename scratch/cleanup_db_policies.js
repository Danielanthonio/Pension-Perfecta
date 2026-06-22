const { Client } = require('/Users/Macbook/Pesion Perfecta 1/node_modules/pg');

const connectionString = 'postgresql://postgres.gxovfywzftiirdpcskbc:Villouta2026.@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const cleanupQueries = `
-- =============================================================================
-- 1. DROP ALL KNOWN POLICIES (OLD & NEW) TO START CLEAN
-- =============================================================================

-- profiles policies
DROP POLICY IF EXISTS "Admins ven todos y AMs ven sus aliados" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by all users." ON profiles;
DROP POLICY IF EXISTS "Usuarios pueden ver su propio perfil" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON profiles;
DROP POLICY IF EXISTS "Usuarios pueden actualizar su perfil" ON profiles;
DROP POLICY IF EXISTS "Admins y AMs pueden actualizar perfiles de sus aliados" ON profiles;
DROP POLICY IF EXISTS "Admins and directors can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins y Account Managers pueden crear perfiles" ON profiles;

-- prospects policies
DROP POLICY IF EXISTS "Aliados ven sus propios prospectos" ON prospects;
DROP POLICY IF EXISTS "Aliados pueden ver sus propios prospectos, Directores ven todos" ON prospects;
DROP POLICY IF EXISTS "Aliados crean sus prospectos" ON prospects;
DROP POLICY IF EXISTS "Aliados pueden crear prospectos." ON prospects;
DROP POLICY IF EXISTS "Admins y dueños pueden actualizar" ON prospects;
DROP POLICY IF EXISTS "Directores y dueños pueden actualizar prospectos." ON prospects;
DROP POLICY IF EXISTS "Admins pueden eliminar prospectos" ON prospects;
DROP POLICY IF EXISTS "Directores pueden eliminar prospectos." ON prospects;

-- documents policies
DROP POLICY IF EXISTS "Ver documentos permitidos" ON documents;
DROP POLICY IF EXISTS "Subir documentos" ON documents;
DROP POLICY IF EXISTS "Eliminar documentos con prospecto" ON documents;
DROP POLICY IF EXISTS "Aliados pueden subir documentos." ON documents;
DROP POLICY IF EXISTS "Usuarios ven documentos de sus prospectos autorizados." ON documents;

-- invitation_codes policies
DROP POLICY IF EXISTS "Admins ven todos y AMs ven sus propios creados" ON invitation_codes;
DROP POLICY IF EXISTS "Admins y AMs crean códigos" ON invitation_codes;


-- =============================================================================
-- 2. CREATE SIMPLIFIED RECURSION-FREE POLICIES USING DEFINER FUNCTIONS
-- =============================================================================

-- --- Profiles Table ---
-- Everyone can read their own profile, admins can read all, AMs can read their allies
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


-- --- Prospects Table ---
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


-- --- Documents Table ---
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


-- --- Invitation Codes Table ---
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
`;

async function run() {
  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected! Cleaning up and applying strict RLS policies...');
    
    await client.query(cleanupQueries);
    console.log('SUCCESS: Old policies removed and clean policies applied!');

    // Let's verify what policies are left in the database
    console.log('\n--- VERIFYING ACTIVE POLICIES ---');
    const policiesRes = await client.query(`
      SELECT schemaname, tablename, policyname, cmd
      FROM pg_policies
      WHERE tablename IN ('profiles', 'prospects', 'documents', 'invitation_codes')
      ORDER BY tablename, cmd;
    `);
    console.log(JSON.stringify(policiesRes.rows, null, 2));

  } catch (error) {
    console.error('Cleanup failed:', error);
  } finally {
    await client.end();
    console.log('\nDatabase connection closed.');
  }
}

run();
