-- =============================================================================
-- PensiónFlow — El closer da de alta a sus propios aliados
-- =============================================================================
-- Regla de negocio (dicha por Dirección el 2026-07-31): la PRODUCCIÓN de un
-- closer se genera cuando ese closer incorpora un aliado nuevo. Ese alta es su
-- "venta". Hasta ahora el closer solo podía mirar sus métricas; el alta la hacía
-- la Dirección y le asignaba el closer a mano. Eso invertía el flujo real.
--
-- El problema estaba en la base, no en la interfaz: la política de INSERT de
-- `profiles` ("Admins y Account Managers pueden crear perfiles") solo admite
-- admin / director / account_manager, o insertarse uno mismo. Un closer chocaba
-- contra el RLS y el perfil quedaba a medias: usuario de Auth creado, fila de
-- `profiles` ausente hasta que el aliado iniciara sesión por primera vez
-- (`ensureProfileExists`). El closer no vería su alta reflejada, que es
-- justamente el número que le importa.
--
-- ADITIVA: se AÑADEN políticas nuevas. No se toca ni se endurece ninguna de las
-- existentes — las políticas de PERMISSIVE se combinan con OR, así que nadie
-- pierde permisos y no hay forma de romper el selector de asignación
-- (ver 20260722000002) ni el INSERT de la Dirección.
--
-- Lo que NO se concede a propósito:
--   * crear cualquier rol que no sea 'aliado' (nada de fabricarse un admin),
--   * atribuir el alta a otro closer,
--   * UPDATE ni DELETE sobre `profiles` (el closer no edita ni borra a nadie),
--   * ninguna lectura nueva: sigue sin ver `prospects` ni PII de clientes.
-- =============================================================================

BEGIN;

-- 1) Alta de aliados por el closer ------------------------------------------
-- El WITH CHECK es la barrera real. Cada condición cierra un abuso concreto:
--   role = 'aliado'                → no puede crearse un admin/director/closer.
--   closer_origen_id = auth.uid()  → no puede colgarle el mérito a otro closer.
--   closer_actual_id = auth.uid()  → nace gestionándolo él mismo (§4: origen y
--                                    actual arrancan iguales y solo divergen si
--                                    la Dirección reasigna después).
--   account_manager_id IS NULL     → el AM se sortea POR PROYECTO desde
--                                    20260723000000, no se fija en el alta.
-- `closer_asignado_por` se admite nulo o él mismo: la app manda su propio id,
-- pero no vale la pena reventar un alta por un campo de bitácora.
DROP POLICY IF EXISTS "Closers dan de alta a sus aliados" ON public.profiles;
CREATE POLICY "Closers dan de alta a sus aliados"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.closers_my_role() = 'closer'
    AND role = 'aliado'
    AND closer_origen_id = auth.uid()
    AND closer_actual_id = auth.uid()
    AND account_manager_id IS NULL
    AND (closer_asignado_por IS NULL OR closer_asignado_por = auth.uid())
  );

COMMENT ON POLICY "Closers dan de alta a sus aliados" ON public.profiles IS
  'El alta de un aliado ES la producción del closer. Solo puede crear role=aliado y atribuido a sí mismo; el WITH CHECK impide fabricar admins o robar atribución ajena.';

-- 2) El closer deja constancia de ese alta en el historial --------------------
-- La tabla es append-only (sin UPDATE ni DELETE para nadie) y hasta ahora solo
-- escribía la Dirección. El closer necesita poder registrar SU propia alta, y
-- únicamente esa: movimiento inicial, sin closer anterior, a su nombre.
DROP POLICY IF EXISTS "Closer registra el alta de su aliado" ON public.closer_aliado_asignaciones;
CREATE POLICY "Closer registra el alta de su aliado"
  ON public.closer_aliado_asignaciones
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.closers_my_role() = 'closer'
    AND tipo_movimiento = 'asignacion_inicial'
    AND closer_anterior_id IS NULL
    AND closer_nuevo_id = auth.uid()
    AND closer_origen_id = auth.uid()
    AND (asignado_por IS NULL OR asignado_por = auth.uid())
  );

COMMENT ON POLICY "Closer registra el alta de su aliado" ON public.closer_aliado_asignaciones IS
  'Solo el movimiento de alta inicial y solo a su propio nombre. Las reasignaciones siguen siendo exclusivas de Dirección.';

-- 3) Los códigos de invitación del closer ------------------------------------
-- `invitation_codes` ya tiene una política INSERT abierta a `authenticated`
-- ("Permitir a usuarios insertar códigos", CHECK true) heredada de una versión
-- anterior, así que el closer ya puede generar códigos: no hace falta nada.
-- ⚠️ Se deja anotado que esa política es más laxa de lo que debería para
-- CUALQUIER rol; endurecerla es un trabajo aparte y NO se hace aquí para no
-- arrastrar una regresión dentro de un cambio de closers.

NOTIFY pgrst, 'reload schema';

COMMIT;
