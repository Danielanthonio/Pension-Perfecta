-- =============================================================================
-- FIX: el Account Manager (y Dirección) no puede CREAR un prospecto asignándolo
-- a otro aliado → "new row violates row-level security policy for table prospects".
-- =============================================================================
-- Síntoma: un AM captura un proyecto y elige a un aliado distinto de sí mismo en
-- "Asignación del Proyecto"; al enviar, el INSERT revienta con el error de RLS.
--
-- Causa: la política de INSERT activa en prod es la ORIGINAL restrictiva de
-- schema.sql:
--     WITH CHECK (aliado_id = auth.uid())
-- que exige que el creador sea el propio aliado del proyecto. La migración
-- 20260722000000 la había ampliado para que admin/director/account_manager
-- pudieran insertar con el aliado_id de un TERCERO, pero esa versión permisiva
-- NO quedó aplicada en producción (o se revirtió durante el incidente de
-- recursión del 2026-07-23). Resultado: el AM asigna a "Agustín Morales" pero
-- aliado_id (Agustín) != auth.uid() (AM) => el WITH CHECK restrictivo rechaza.
--
-- Fix: reinstalar (idempotente) la política PERMISIVA. Es exactamente la de
-- 20260722000000; se repite aquí para garantizar que quede activa en prod sin
-- depender de que aquella se haya corrido. Correr solo esto en el SQL Editor de
-- prod arregla el problema; NO hace falta tocar el frontend (el código ya manda
-- el aliado_id correcto y el trigger fija account_manager_id).
--
-- Alcance de seguridad: el aliado normal SIGUE limitado a crear solo sus propios
-- prospectos (aliado_id = auth.uid()). Solo admin/director/account_manager pueden
-- asignar a un tercero al capturar. No se referencia profiles.is_active (no existe
-- en prod).
-- =============================================================================

DROP POLICY IF EXISTS "Aliados crean sus prospectos" ON public.prospects;
CREATE POLICY "Aliados crean sus prospectos"
  ON public.prospects FOR INSERT WITH CHECK (
    aliado_id = auth.uid()
    OR public.get_user_role(auth.uid()) = 'admin'
    OR public.get_user_role(auth.uid()) = 'director'
    OR public.get_user_role(auth.uid()) = 'account_manager'
  );

-- Recargar el caché de esquemas de PostgREST.
NOTIFY pgrst, 'reload schema';
