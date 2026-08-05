// Tipos y utilidades compartidas del módulo de Finanzas y Comisiones.
//
// Las formas de fila de abajo son el CONTRATO con la base: coinciden columna a
// columna con lo que devuelven las RPC de 20260802000001_finanzas_rpc.sql. Si
// cambia una, cambia la otra.
//
// La regla que ordena todo el módulo: ningún importe existe sin un EVENTO que lo
// justifique. Las tarjetas, el gráfico y la tabla de liquidaciones son sumas de
// `comision_eventos`, nunca cifras calculadas al vuelo en el navegador.

// ---------------------------------------------------------------------------
// Vocabulario del dominio
// ---------------------------------------------------------------------------

export type RolBeneficiario = "director" | "account_manager" | "closer" | "aliado";

/** Productos comisionables. Salen de `tipo_financiamiento` + `modalidad`. */
export type ProductoComision = "mod_40" | "mod_10" | "credito_nomina";

/** Los seis estados del §7, en orden de avance. */
export type EstadoComision =
  | "pendiente_revision"
  | "aprobado"
  | "enviado_finanzas"
  | "pagado"
  | "observado"
  | "revertido";

export type TipoEvento =
  | "comision_financiamiento"
  | "comision_cierre_aliado"
  | "comision_primer_financiamiento"
  | "comision_aliado"
  | "salario_fijo"
  | "bono_mensual"
  | "bono_trimestral"
  | "ajuste_positivo"
  | "ajuste_negativo"
  | "reversion";

export type TipoCorte = "semanal" | "mensual" | "trimestral" | "personalizado";

export type EstadoCorte =
  | "borrador"
  | "en_revision"
  | "aprobado"
  | "enviado_finanzas"
  | "pagado_parcial"
  | "pagado"
  | "anulado";

export type MetodoPago = "transferencia" | "binance" | "efectivo" | "otro";

export type ConceptoTarifa =
  | "comision_financiamiento"
  | "comision_cierre_aliado"
  | "comision_primer_financiamiento"
  | "comision_aliado"
  | "salario_fijo"
  | "bono_mensual"
  | "bono_trimestral";

export const ROL_LABEL: Record<RolBeneficiario, string> = {
  director: "Director",
  account_manager: "Account Manager",
  closer: "Closer",
  aliado: "Aliado",
};

export const PRODUCTO_LABEL: Record<ProductoComision, string> = {
  mod_40: "Financiamiento Mod 40",
  mod_10: "Financiamiento Mod 10",
  credito_nomina: "Crédito de nómina",
};

export const PRODUCTO_CORTO: Record<ProductoComision, string> = {
  mod_40: "Mod 40",
  mod_10: "Mod 10",
  credito_nomina: "Nómina",
};

export const ESTADO_LABEL: Record<EstadoComision, string> = {
  pendiente_revision: "Pendiente de revisión",
  aprobado: "Aprobado",
  enviado_finanzas: "Enviado a Finanzas",
  pagado: "Pagado",
  observado: "Observado",
  revertido: "Revertido",
};

export const ESTADO_CORTE_LABEL: Record<EstadoCorte, string> = {
  borrador: "Borrador",
  en_revision: "En revisión",
  aprobado: "Aprobado",
  enviado_finanzas: "Enviado a Finanzas",
  pagado_parcial: "Pagado parcial",
  pagado: "Pagado",
  anulado: "Anulado",
};

export const TIPO_EVENTO_LABEL: Record<TipoEvento, string> = {
  comision_financiamiento: "Comisión por financiamiento",
  comision_cierre_aliado: "Comisión por cierre de aliado",
  comision_primer_financiamiento: "Comisión por primer financiamiento",
  comision_aliado: "Comisión del aliado",
  salario_fijo: "Salario fijo",
  bono_mensual: "Bono mensual",
  bono_trimestral: "Bono trimestral",
  ajuste_positivo: "Ajuste a favor",
  ajuste_negativo: "Ajuste en contra",
  reversion: "Reversión",
};

export const CONCEPTO_LABEL: Record<ConceptoTarifa, string> = {
  comision_financiamiento: "Comisión por financiamiento",
  comision_cierre_aliado: "Comisión por cierre de aliado",
  comision_primer_financiamiento: "Comisión por primer financiamiento",
  comision_aliado: "Comisión del aliado",
  salario_fijo: "Salario fijo mensual",
  bono_mensual: "Bono mensual",
  bono_trimestral: "Bono trimestral",
};

export const METODO_PAGO_LABEL: Record<MetodoPago, string> = {
  transferencia: "Transferencia (SPEI)",
  binance: "Binance",
  efectivo: "Efectivo",
  otro: "Otro",
};

// Familias de concepto: en qué casilla del recibo cae cada movimiento. Las usan
// tanto el cálculo de la liquidación como el cuadre del detalle por persona, y
// por eso viven aquí y no en cada consumidor.
export const TIPOS_COMISION: TipoEvento[] = [
  "comision_financiamiento",
  "comision_cierre_aliado",
  "comision_primer_financiamiento",
  "comision_aliado",
];
export const TIPOS_BONO: TipoEvento[] = ["bono_mensual", "bono_trimestral"];
export const TIPOS_SALARIO: TipoEvento[] = ["salario_fijo"];
export const TIPOS_AJUSTE: TipoEvento[] = ["ajuste_positivo", "ajuste_negativo", "reversion"];

/** Conceptos cuyo importe NO depende del producto. */
export const CONCEPTOS_SIN_PRODUCTO: ConceptoTarifa[] = [
  "comision_cierre_aliado",
  "salario_fijo",
  "bono_mensual",
  "bono_trimestral",
];

/** Conceptos que se pagan por tramo de producción alcanzado. */
export const CONCEPTOS_CON_UMBRAL: ConceptoTarifa[] = ["bono_mensual", "bono_trimestral"];

// ---------------------------------------------------------------------------
// Filas que devuelve la base (o su equivalente en modo demo)
// ---------------------------------------------------------------------------

/** Tarjetas superiores del §8.1. */
export interface FinanzasResumen {
  produccion_financiamientos: number;
  produccion_aliados: number;
  produccion_primeros: number;
  total_generado: number;
  total_pendiente_revision: number;
  total_aprobado: number;
  total_enviado_finanzas: number;
  total_pagado: number;
  total_pendiente_pago: number;
  total_observado: number;
  total_ajustes: number;
  eventos_total: number;
  eventos_observados: number;
  beneficiarios: number;
}

export const RESUMEN_VACIO: FinanzasResumen = {
  produccion_financiamientos: 0,
  produccion_aliados: 0,
  produccion_primeros: 0,
  total_generado: 0,
  total_pendiente_revision: 0,
  total_aprobado: 0,
  total_enviado_finanzas: 0,
  total_pagado: 0,
  total_pendiente_pago: 0,
  total_observado: 0,
  total_ajustes: 0,
  eventos_total: 0,
  eventos_observados: 0,
  beneficiarios: 0,
};

/** Una fila por beneficiario en la tabla de liquidaciones (§9). */
export interface LiquidacionRow {
  usuario_id: string;
  usuario_nombre: string;
  rol_beneficiario: RolBeneficiario;
  avatar_url: string | null;
  produccion: number;
  comision_base: number;
  bonos: number;
  salario: number;
  ajustes: number;
  total_a_pagar: number;
  total_pagado: number;
  total_pendiente: number;
  eventos: number;
  eventos_observados: number;
  estado_resumen: EstadoComision;
  fecha_envio: string | null;
  fecha_pago: string | null;
  clabe: string | null;
  banco: string | null;
  titular_cuenta: string | null;
  binance_id: string | null;
}

/** Un punto del gráfico del §8.2, desglosado por rol. */
export interface SeriePoint {
  periodo: string;
  rol: RolBeneficiario;
  generado: number;
  pagado: number;
  pendiente: number;
}

/** Producción del período por dimensión (§8.4). */
export interface ProduccionRow {
  clave: string;
  etiqueta: string;
  financiamientos: number;
  mod_40: number;
  mod_10: number;
  credito_nomina: number;
}

/** Un evento del libro mayor con su operación de origen (§10). */
export interface EventoRow {
  id: string;
  usuario_id: string;
  usuario_nombre: string;
  rol_beneficiario: RolBeneficiario;
  tipo_evento: TipoEvento;
  tipo_producto: ProductoComision | null;
  monto: number;
  moneda: string;
  produccion: number | null;
  fecha_devengo: string;
  periodo_corte: string;
  estado: EstadoComision;
  motivo_observacion: string | null;
  observaciones: string | null;
  prospecto_id: string | null;
  cliente_nombre: string | null;
  aliado_id: string | null;
  aliado_nombre: string | null;
  account_manager: string | null;
  corte_id: string | null;
  anulado_at: string | null;
  fecha_aprobacion: string | null;
  fecha_envio_finanzas: string | null;
  fecha_pago: string | null;
  referencia_pago: string | null;
}

/** Una validación del §18 que necesita mano humana. */
export interface InconsistenciaRow {
  tipo: string;
  severidad: "alta" | "media" | "baja";
  titulo: string;
  detalle: string;
  prospecto_id: string | null;
  aliado_id: string | null;
  referencia: string | null;
  fecha: string | null;
}

export interface CorteRow {
  id: string;
  tipo_corte: TipoCorte;
  fecha_inicio: string;
  fecha_fin: string;
  moneda: string;
  total_produccion: number;
  total_comisiones: number;
  total_bonos: number;
  total_salarios: number;
  total_ajustes: number;
  total_a_pagar: number;
  total_pagado: number;
  estado: EstadoCorte;
  creado_por_nombre: string | null;
  aprobado_por_nombre: string | null;
  enviado_por_nombre: string | null;
  fecha_aprobacion: string | null;
  fecha_envio_finanzas: string | null;
  fecha_pago: string | null;
  observaciones: string | null;
  beneficiarios: number;
  eventos: number;
  created_at: string;
}

export interface PagoRow {
  id: string;
  corte_id: string | null;
  usuario_id: string;
  usuario_nombre: string;
  monto_pagado: number;
  moneda: string;
  fecha_pago: string;
  metodo_pago: MetodoPago;
  referencia_bancaria: string | null;
  comprobante_url: string | null;
  observaciones: string | null;
  registrado_por_nombre: string | null;
  created_at: string;
}

export interface TarifaRow {
  id: string;
  rol_beneficiario: RolBeneficiario;
  concepto: ConceptoTarifa;
  producto: ProductoComision | null;
  umbral_min: number;
  monto: number;
  moneda: string;
  vigente_desde: string;
  vigente_hasta: string | null;
  activo: boolean;
  notas: string | null;
  created_at: string;
}

export interface AuditoriaRow {
  id: string;
  entidad: string;
  entidad_id: string | null;
  accion: string;
  estado_anterior: string | null;
  estado_nuevo: string | null;
  monto_anterior: number | null;
  monto_nuevo: number | null;
  comentario: string | null;
  actor_nombre: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

export type Grano = "dia" | "semana" | "mes" | "trimestre" | "anio";

export const GRANO_LABEL: Record<Grano, string> = {
  dia: "Día",
  semana: "Semana",
  mes: "Mes",
  trimestre: "Trimestre",
  anio: "Año",
};

export type RangoPreset =
  | "semana_actual"
  | "semana_anterior"
  | "mes_actual"
  | "mes_anterior"
  | "trimestre_actual"
  | "anio_actual"
  | "todo"
  | "personalizado";

export const RANGO_LABEL: Record<RangoPreset, string> = {
  semana_actual: "Semana actual",
  semana_anterior: "Semana anterior",
  mes_actual: "Mes actual",
  mes_anterior: "Mes anterior",
  trimestre_actual: "Trimestre actual",
  anio_actual: "Año actual",
  todo: "Histórico",
  personalizado: "Rango…",
};

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const MXN_COMPACTO = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Importe con centavos. El detalle de una comisión SIEMPRE va con centavos. */
export function fmtMoneda(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return MXN.format(v);
}

/**
 * Importe sin centavos, para las tarjetas y los ejes. Se redondea solo la
 * PRESENTACIÓN: el dato que viaja a Finanzas conserva sus decimales.
 */
export function fmtMonedaCorta(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return MXN_COMPACTO.format(v);
}

export function fmtNumero(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return new Intl.NumberFormat("es-MX").format(v);
}

/** Fecha UTC en YYYY-MM-DD, sin pasar por el huso del navegador. */
export function isoDay(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const s = typeof value === "string" ? value : value.toISOString();
  return s.length >= 10 ? s.substring(0, 10) : null;
}

export function fmtFecha(value: string | null | undefined): string {
  const d = isoDay(value);
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export function fmtFechaHora(value: string | null | undefined): string {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (isNaN(t)) return "—";
  return new Date(t).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Inicio del cubo temporal al que pertenece una fecha (UTC), como YYYY-MM-DD. */
export function bucketStart(value: string, grano: Grano): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value.substring(0, 10);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  if (grano === "anio") return `${y}-01-01`;
  if (grano === "trimestre") return `${y}-${pad(Math.floor(m / 3) * 3 + 1)}-01`;
  if (grano === "mes") return `${y}-${pad(m + 1)}-01`;
  if (grano === "semana") {
    // Semana ISO: arranca en lunes, como pide el §11.1. getUTCDay() da 0 el domingo.
    const dow = (d.getUTCDay() + 6) % 7;
    return new Date(Date.UTC(y, m, day - dow)).toISOString().substring(0, 10);
  }
  return `${y}-${pad(m + 1)}-${pad(day)}`;
}

export function nextBucket(iso: string, grano: Grano): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (grano === "anio") return `${y + 1}-01-01`;
  if (grano === "trimestre") return m > 9 ? `${y + 1}-01-01` : `${y}-${pad(m + 3)}-01`;
  if (grano === "mes") return m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  const step = grano === "semana" ? 7 : 1;
  return new Date(Date.UTC(y, m - 1, d + step)).toISOString().substring(0, 10);
}

export function bucketLabel(iso: string, grano: Grano): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (grano === "anio") return String(y);
  if (grano === "trimestre") return `T${Math.floor((m - 1) / 3) + 1} ${String(y).slice(2)}`;
  if (grano === "mes") return `${MESES_CORTOS[m - 1]} ${String(y).slice(2)}`;
  return `${d} ${MESES_CORTOS[m - 1]}`;
}

export function bucketFullLabel(iso: string, grano: Grano): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (grano === "anio") return String(y);
  if (grano === "trimestre") return `Trimestre ${Math.floor((m - 1) / 3) + 1} de ${y}`;
  if (grano === "mes") return `${MESES_CORTOS[m - 1]} ${y}`;
  if (grano === "semana") return `Semana del ${d} ${MESES_CORTOS[m - 1]} ${y}`;
  return `${d} ${MESES_CORTOS[m - 1]} ${y}`;
}

/** Etiqueta del período de corte tal como la guarda la base: '2026-W32', '2026-08', '2026-Q3'. */
export function periodoCorte(fechaIso: string, tipo: TipoCorte): string {
  const d = new Date(fechaIso);
  if (isNaN(d.getTime())) return fechaIso.substring(0, 10);
  const y = d.getUTCFullYear();
  if (tipo === "mensual") return `${y}-${pad(d.getUTCMonth() + 1)}`;
  if (tipo === "trimestral") return `${y}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
  if (tipo === "semanal") {
    // Semana ISO con su año ISO: la semana 1 puede caer en el año anterior.
    const t = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate()));
    const dow = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - dow + 3); // jueves de esa semana
    const jueves = t.getTime();
    const enero4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    const dowE = (enero4.getUTCDay() + 6) % 7;
    enero4.setUTCDate(enero4.getUTCDate() - dowE + 3);
    const semana = 1 + Math.round((jueves - enero4.getTime()) / (7 * 86400000));
    return `${t.getUTCFullYear()}-W${pad(semana)}`;
  }
  return isoDay(fechaIso) || "";
}

/**
 * Rangos predefinidos. Devuelven fechas UTC YYYY-MM-DD.
 * `hoy` entra por parámetro para que la función sea pura y testeable.
 */
export function resolveRango(preset: RangoPreset, hoy: Date): { desde: string; hasta: string } {
  const y = hoy.getUTCFullYear();
  const m = hoy.getUTCMonth();
  const d = hoy.getUTCDate();
  const iso = (dt: Date) => dt.toISOString().substring(0, 10);
  // Lunes de la semana en curso (§11.1: los cortes van de lunes a domingo).
  const dow = (hoy.getUTCDay() + 6) % 7;

  switch (preset) {
    case "semana_actual":
      return { desde: iso(new Date(Date.UTC(y, m, d - dow))), hasta: iso(new Date(Date.UTC(y, m, d - dow + 6))) };
    case "semana_anterior":
      return { desde: iso(new Date(Date.UTC(y, m, d - dow - 7))), hasta: iso(new Date(Date.UTC(y, m, d - dow - 1))) };
    case "mes_actual":
      return { desde: iso(new Date(Date.UTC(y, m, 1))), hasta: iso(new Date(Date.UTC(y, m + 1, 0))) };
    case "mes_anterior":
      return { desde: iso(new Date(Date.UTC(y, m - 1, 1))), hasta: iso(new Date(Date.UTC(y, m, 0))) };
    case "trimestre_actual": {
      const q = Math.floor(m / 3) * 3;
      return { desde: iso(new Date(Date.UTC(y, q, 1))), hasta: iso(new Date(Date.UTC(y, q + 3, 0))) };
    }
    case "anio_actual":
      return { desde: `${y}-01-01`, hasta: `${y}-12-31` };
    default:
      return { desde: "", hasta: "" };
  }
}

/** Tipo de corte que le corresponde a un preset, para preseleccionarlo al generar. */
export function tipoCorteDePreset(preset: RangoPreset): TipoCorte {
  if (preset === "semana_actual" || preset === "semana_anterior") return "semanal";
  if (preset === "mes_actual" || preset === "mes_anterior") return "mensual";
  if (preset === "trimestre_actual") return "trimestral";
  return "personalizado";
}

export function inRange(value: string | null | undefined, desde: string, hasta: string): boolean {
  const d = isoDay(value);
  if (!d) return false;
  if (desde && d < desde) return false;
  if (hasta && d > hasta) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Presentación de estados
// ---------------------------------------------------------------------------

/** Clases del chip de estado. Mismo lenguaje de color en toda la app. */
export function estadoChip(estado: EstadoComision | EstadoCorte): string {
  switch (estado) {
    case "pagado":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900";
    case "aprobado":
      return "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-900";
    case "enviado_finanzas":
      return "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-900";
    case "observado":
      return "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900";
    case "revertido":
    case "anulado":
      return "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900";
    case "pagado_parcial":
      return "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:ring-teal-900";
    default:
      return "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700";
  }
}

/** Cómo cobra cada rol (ver 20260731000000_datos_bancarios.sql). */
export function medioDeCobro(rol: RolBeneficiario): MetodoPago {
  return rol === "aliado" ? "transferencia" : "binance";
}

/** Dato de cobro que Finanzas necesita para depositarle a esta persona. */
export function datosDeCobro(row: LiquidacionRow): { etiqueta: string; valor: string | null } {
  if (row.rol_beneficiario === "aliado") {
    return { etiqueta: "CLABE", valor: row.clabe };
  }
  return { etiqueta: "Binance ID", valor: row.binance_id };
}
