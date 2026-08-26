-- =============================================================================
-- PensiónFlow — el sello de cotejo con GoHighLevel, guardado.
-- =============================================================================
-- Hasta ahora el sello (verde / azul / teal / ámbar) se calculaba al pulsar el
-- botón y vivía en la memoria del navegador: al recargar la página desaparecía.
-- Las NOTAS sí quedaban —están en `prospect_notas`— pero el sello no, así que
-- nadie podía entrar por la mañana y ver de un vistazo qué expedientes cotejan
-- bien y cuáles tienen los datos de contacto mal capturados.
--
-- -- Por qué una tabla aparte y no dos columnas en `prospects` --
--
-- Porque `prospects.updated_at` NO es decorativo: de él cuelgan la fecha
-- «Actualizado» de la ficha, la VIGENCIA del cálculo (`getCalcValidUntil`) y el
-- «días esperando» del tablero de Reportes. Si el barrido nocturno escribiera en
-- `prospects` y existiera allá un trigger de `updated_at` —`schema.sql` lo
-- declara, y `schema.sql` no está aplicado en producción, así que no se puede
-- afirmar ni lo uno ni lo otro sin mirar—, cada madrugada los 478 proyectos
-- quedarían «actualizados hoy» y el contador de días esperando se pondría a cero
-- entero. Un indicador de negocio destruido por un detalle cosmético.
--
-- Una tabla propia lo hace imposible por construcción, y además dice la verdad
-- sobre lo que es este dato: no es del proyecto, es el resultado de compararlo
-- con un sistema de fuera, y se recalcula cada noche.
--
-- Aditiva: crea una tabla y sus políticas. No altera ninguna tabla, trigger ni
-- política existente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.prospect_ghl_cotejo (
  -- Uno por proyecto: el cotejo es una foto del estado actual, no un histórico.
  prospect_id     uuid        PRIMARY KEY REFERENCES public.prospects(id) ON DELETE CASCADE,
  -- 'verificado' | 'probable' | 'nombre' | 'revisar'. NULL = se buscó y no está
  -- en GoHighLevel, que es distinto de «no se ha buscado» (esa fila no existe).
  sello           text        NULL,
  -- Cuántos de los tres datos coincidieron (0-3). Redundante con `sello` a
  -- propósito: el sello es para pintar, el nivel es para poder consultar
  -- «cuántos expedientes cotejan mal» sin conocer los nombres de los sellos.
  nivel           smallint    NOT NULL DEFAULT 0,
  -- Con quién cotejó, y CON QUÉ DATOS. El correo y el teléfono de allá no son
  -- adorno: son la mitad que falta para arreglar el expediente. Un sello ámbar
  -- dice «algo no cuadra»; ver que en GoHighLevel el correo es
  -- `escobedo@gmail.com` y aquí `ecobedo@gmail.com` dice QUÉ corregir, y se
  -- arregla en diez segundos sin salir de la pantalla ni abrir el otro sistema.
  contacto_id       text      NULL,
  contacto_nombre   text      NULL,
  contacto_correo   text      NULL,
  contacto_telefono text      NULL,
  -- Cuándo se comprobó por última vez. Un sello de hace tres semanas sobre un
  -- cliente cuyo correo se corrigió ayer ya no dice la verdad, y esta columna es
  -- lo único que permite darse cuenta.
  cotejado_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospect_ghl_cotejo_sello_valido
    CHECK (sello IS NULL OR sello IN ('verificado', 'probable', 'nombre', 'revisar')),
  CONSTRAINT prospect_ghl_cotejo_nivel_valido CHECK (nivel BETWEEN 0 AND 3)
);

COMMENT ON TABLE public.prospect_ghl_cotejo IS
  'Resultado del cotejo de un proyecto contra los contactos de GoHighLevel. Lo reescribe el barrido nocturno y el botón «Traer notas de GHL». Una fila por proyecto; sin fila = nunca se ha cotejado.';
COMMENT ON COLUMN public.prospect_ghl_cotejo.sello IS
  'verificado (3 de 3) / probable (2 de 3) / nombre (el nombre completo, idéntico) / revisar (un dato suelto). NULL = se buscó y no está allá.';
COMMENT ON COLUMN public.prospect_ghl_cotejo.contacto_correo IS
  'El correo que tiene GoHighLevel para ese contacto. Se guarda para poder enseñar, junto al del expediente, cuál de los dos hay que corregir.';
COMMENT ON COLUMN public.prospect_ghl_cotejo.cotejado_at IS
  'Última comprobación. Sirve para distinguir un sello vigente de uno viejo que ya no refleja los datos actuales del expediente.';

-- «Enséñame los expedientes con los datos de contacto mal capturados» es LA
-- consulta de esta tabla: la que convierte el sello en una lista de trabajo.
CREATE INDEX IF NOT EXISTS prospect_ghl_cotejo_sello_idx
  ON public.prospect_ghl_cotejo (sello);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.prospect_ghl_cotejo ENABLE ROW LEVEL SECURITY;

-- LEER: quien ya pueda ver el proyecto padre. El EXISTS dispara la RLS de
-- `prospects`, así que esta tabla HEREDA su modelo de acceso y no hay que
-- mantener dos veces la misma lista de casos. Mismo patrón que `prospect_notas`.
DROP POLICY IF EXISTS "Ver cotejo de proyectos permitidos" ON public.prospect_ghl_cotejo;
CREATE POLICY "Ver cotejo de proyectos permitidos"
ON public.prospect_ghl_cotejo
FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.prospects p WHERE p.id = prospect_ghl_cotejo.prospect_id)
);

-- ESCRIBIR: nadie desde el navegador. No hay políticas de INSERT / UPDATE /
-- DELETE, y eso es la decisión, no un olvido: este dato lo produce el servidor
-- cotejando contra GoHighLevel. Si se pudiera escribir desde el cliente, el
-- sello dejaría de ser una medición y pasaría a ser una opinión.
-- La `service_role` del barrido se salta RLS y escribe sin problema.
REVOKE ALL ON public.prospect_ghl_cotejo FROM PUBLIC, anon;
GRANT SELECT ON public.prospect_ghl_cotejo TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación (informativa; sale en los NOTICE del editor SQL)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_pol int;
  n_proy bigint;
BEGIN
  SELECT count(*) INTO n_pol FROM pg_policies
   WHERE schemaname='public' AND tablename='prospect_ghl_cotejo';
  SELECT count(*) INTO n_proy FROM public.prospects;
  RAISE NOTICE 'Cotejo persistente listo: % política de lectura, 0 de escritura (a propósito). Tabla vacía; se llena en el siguiente sincronizado, que cotejará % proyectos.',
    n_pol, n_proy;
END $$;
