// Buckets de estado compartidos por el Dashboard del director (admin/page.tsx),
// el módulo Reportes (admin/reportes/page.tsx) y cualquier KPI que deba cuadrar con
// el Embudo Comercial. Fuente única de verdad para que los conteos no diverjan.
//
// "Aprobado" = dictamen de aprobación + el pipeline de cierre HASTA Firma de Contrato
// (Agenda Asesoría, Firma Carta Compromiso, Análisis de Riesgo, Firma de Contrato). Un
// proyecto se mantiene "Aprobado" mientras avanza esos pasos. Al ejecutarse el
// financiamiento (Cerrada Ganada = firma_programada) pasa a "Fin. Otorgado", ya NO cuenta
// aquí. Esto hace que el conteo del embudo "Fin. Otorgado" cuadre con la línea de tiempo.
export const APPROVED_STAGE = ["aprobado_listo", "asesoria_agendada", "doc_proceso", "analisis_riesgo", "firma_contrato"];
export const CONDITIONED_STAGE = ["falta_reporte", "falta_afore", "pendiente_documentos", "falta_semanas", "falta_afore_cuenta", "posible_simulacion", "agenda_futura", "aportacion"];
// "Fin. Otorgado" = financiamiento otorgado/ejecutado: Cerrada Ganada (firma_programada, se
// ejecutan las líneas de captura) y Pagado/Cerrado (pagado_comision, comisión ya liberada).
export const FIN_OTORGADO_STAGE = ["firma_programada", "pagado_comision"];
export const FINANCED_APPROVED = ["aprobado_listo", "aportacion", "asesoria_agendada", "doc_proceso", "analisis_riesgo", "firma_contrato", "firma_programada", "pagado_comision"];
// "Evaluados" = proyectos con dictamen/respuesta (aprobado, condicionado, rechazado o
// fin. otorgado). El único estado previo al dictamen que se excluye es evaluacion_pendiente.
export const EVALUATED_STAGE = [...APPROVED_STAGE, ...CONDITIONED_STAGE, "rechazado", ...FIN_OTORGADO_STAGE];

// ═══════════════════════════════════════════════════════════════════════════════
// HITOS ALCANZADOS — el embudo se cuenta por lo que el proyecto LOGRÓ, no por
// dónde está hoy.
// ═══════════════════════════════════════════════════════════════════════════════
// Los buckets de arriba responden "¿dónde está AHORA?" y siguen sirviendo para las
// vistas de pipeline vivo (listados, tablero, línea de tiempo). Pero como métrica
// de gestión mentían: al pasar un proyecto a Cerrado Perdido se le restaba de
// Proyectos, de Evaluados y de Aprobados, y la Tasa de Aprobación caía hacia atrás.
// Cerrarlo GANADO hacía lo mismo (firma_programada no está en APPROVED_STAGE).
//
// Una aprobación es un hecho con fecha: pasó. Perder o ganar al cliente después es
// un desenlace posterior, no una des-aprobación. Por eso el embudo cuenta "llegó al
// menos hasta aquí", leyendo los sellos `hito_*` que graba el trigger
// sellar_hitos_prospecto (migración 20260831000000_hitos_alcanzados.sql).
//
// Consecuencia: las tarjetas ya NO suman entre sí. Aprobados incluye a los que ya
// se otorgaron, igual que en cualquier embudo real, y cada escalón es subconjunto
// del anterior: Proyectos ⊇ Evaluados ⊇ Aprobados ⊇ Fin. Otorgado.
//
// Cada predicado cae al estado ACTUAL si no hay sello: así el modo demo y una base
// sin la migración aplicada siguen dando números razonables (nunca menos que hoy).

/** Lo mínimo que necesita un predicado de hito. Evita acoplar esto al tipo Prospect. */
type ConHitos = {
  status: string;
  hito_condicionado_at?: string | null;
  hito_rechazado_at?: string | null;
  hito_aprobado_at?: string | null;
  hito_otorgado_at?: string | null;
};

/** ¿Alguna vez fue condicionado? */
export const fueCondicionado = (p: ConHitos): boolean =>
  Boolean(p.hito_condicionado_at) || CONDITIONED_STAGE.includes(p.status);

/** ¿Alguna vez fue rechazado? */
export const fueRechazado = (p: ConHitos): boolean =>
  Boolean(p.hito_rechazado_at) || p.status === "rechazado";

/**
 * ¿Alguna vez fue aprobado? Incluye a los que ya se otorgaron (un financiamiento no
 * se ejecuta sin aprobarse) y a los que después se perdieron.
 */
export const fueAprobado = (p: ConHitos): boolean =>
  Boolean(p.hito_aprobado_at) ||
  APPROVED_STAGE.includes(p.status) ||
  FIN_OTORGADO_STAGE.includes(p.status);

/** ¿Alguna vez llegó a financiamiento otorgado? */
export const fueOtorgado = (p: ConHitos): boolean =>
  Boolean(p.hito_otorgado_at) || FIN_OTORGADO_STAGE.includes(p.status);

/** ¿Alguna vez tuvo dictamen? Es tener cualquiera de los cuatro hitos. */
export const fueEvaluado = (p: ConHitos): boolean =>
  fueAprobado(p) || fueCondicionado(p) || fueRechazado(p) || fueOtorgado(p);

/**
 * Monto del financiamiento del proyecto. Mismo criterio en todo el sistema:
 * financiamiento + costo de gestión, o el financiamiento solo si no hay total.
 */
export const montoFinanciamiento = (p: { simulation?: { totalCredito?: number; financiamiento?: number } }): number =>
  p.simulation ? p.simulation.totalCredito || p.simulation.financiamiento || 0 : 0;
