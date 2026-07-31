-- =============================================================================
-- PensiónFlow — Migración: Datos bancarios de cobro en el perfil
-- =============================================================================
-- Cada usuario necesita registrar CÓMO se le paga. La forma de cobro depende
-- del rol y por eso conviven dos juegos de campos en la misma tabla:
--
--   * Aliado (rol 'aliado', incluye a los líderes) → transferencia en México:
--     banco, número de cuenta, CLABE, tarjeta (opcional), nombre del titular y
--     un correo para avisos de pago. Replica la ficha que hoy se llena a mano
--     en el Google Form de pagos, para dejar de perseguir esos datos por chat.
--
--   * Director y Account Manager (rol 'admin'/'director' y 'account_manager')
--     → cobran por Binance: solo se guarda su ID de Binance.
--
-- Se guardan los DOS juegos en `profiles` (y no en una tabla aparte) porque son
-- 1:1 con el usuario, se leen siempre junto al perfil y así heredan tal cual el
-- RLS de auto-edición que ya existe: cada quien escribe SOLO su propia fila.
--
-- Todo es ADITIVO e IDEMPOTENTE: no altera ni borra nada. Los perfiles actuales
-- quedan con estos campos en NULL (= "datos bancarios pendientes"), lo cual NO
-- limita la operación; solo alimenta el recordatorio de inicio de sesión.
--
-- OJO — esta migración es autosuficiente a propósito: no invoca
-- `update_updated_at_column()` ni ningún helper de `schema.sql`, porque ese
-- archivo NO está aplicado en producción. Tampoco toca `is_active`, columna que
-- no existe en prod (ver 20260722000001 y 20260723000000).
-- =============================================================================

-- 1) Campos de cobro para ALIADOS (transferencia bancaria en México) ----------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banco           text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cuenta_bancaria text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS clabe           text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS titular_cuenta  text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_pagos     text;

-- Número de tarjeta: OPCIONAL, tal como en el formulario de pagos actual.
-- ⚠️ Advertencia deliberada: guardar el PAN completo de una tarjeta cae bajo
-- PCI-DSS. Aquí se conserva porque el proceso de pago vigente lo pide, pero lo
-- recomendable a futuro es guardar solo los últimos 4 dígitos (o eliminarlo y
-- pagar siempre contra CLABE, que es el dato que de verdad se usa para la
-- transferencia SPEI). La app ya lo muestra enmascarado en pantalla.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS numero_tarjeta  text;

-- 2) Campo de cobro para DIRECCIÓN y ACCOUNT MANAGERS (Binance) ---------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS binance_id      text;

-- 3) Sello de última actualización de los datos de cobro ----------------------
-- Sirve para saber si la información de pago está fresca o lleva meses sin
-- tocarse. Lo escribe la app al guardar (no hay trigger, para no depender de
-- helpers que no existen en prod).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS datos_bancarios_updated_at timestamptz;

-- 4) RLS ----------------------------------------------------------------------
-- No se crean políticas nuevas: la escritura ya está cubierta por la política de
-- auto-update de `profiles` (el cliente hace update().eq('id', auth.uid())), y
-- la lectura por las políticas de SELECT vigentes. Como el RLS de Postgres es
-- por FILA y no por columna, quien hoy puede leer una fila de `profiles` podrá
-- leer también estas columnas: la Dirección ve los datos de cobro de todos (que
-- es justo lo que necesita para pagar) y, por la migración
-- 20260722000002_am_see_all_allies_for_assignment.sql, un Account Manager
-- también alcanza a leer los de los aliados. Si más adelante se quiere ocultar
-- el cobro al AM, hay que hacerlo con una vista o con column-level grants, NO
-- endureciendo el SELECT de `profiles` (rompería el selector de asignación).

-- 5) Índice de apoyo para el tablero de pagos ---------------------------------
-- Permite listar rápido "quién no ha registrado cómo cobrar".
CREATE INDEX IF NOT EXISTS idx_profiles_datos_bancarios_pendientes
  ON public.profiles (role)
  WHERE clabe IS NULL AND binance_id IS NULL;
