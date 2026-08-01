"use client";

// Motor de devengo LOCAL, solo para el modo demo / previsualización.
//
// En producción todo esto lo hace Postgres (`comisiones_sincronizar` y las RPC
// de lectura de 20260802000001). Este archivo replica esas mismas reglas en el
// navegador para que la Dirección pueda ver, tocar y validar el módulo entero
// sin conectarse a la base real — el mismo patrón que `closerMetrics.ts`.
//
// DIFERENCIA CONOCIDA CON PRODUCCIÓN: aquí no existe `prospect_status_history`,
// así que la "fecha de ejecución real del financiamiento" (§4.1) se aproxima con
// `updated_at` del proyecto. Es la única fecha disponible en el cliente y basta
// para poblar la pantalla; en producción la fecha sale del historial de estados,
// que es la buena. Por eso los números del modo demo no son auditables: sirven
// para revisar la interfaz, no para pagar.
//
// El estado de revisión, los cortes, los pagos, los ajustes y las tarifas
// editadas viven en localStorage, para que la previsualización se comporte como
// el módulo real entre recargas.

import type { Prospect, UserProfile } from "@/utils/context/AppContext";
import {
  type AuditoriaRow,
  type ConceptoTarifa,
  type CorteRow,
  type EstadoComision,
  type EventoRow,
  type FinanzasResumen,
  type Grano,
  type InconsistenciaRow,
  type LiquidacionRow,
  type PagoRow,
  type ProduccionRow,
  type ProductoComision,
  type RolBeneficiario,
  type SeriePoint,
  type TarifaRow,
  type TipoEvento,
  RESUMEN_VACIO,
  bucketStart,
  inRange,
  isoDay,
  periodoCorte,
} from "./finanzasTypes";

// ---------------------------------------------------------------------------
// Persistencia del modo demo
// ---------------------------------------------------------------------------

const K_ESTADOS = "pensionflow_fin_estados";
const K_CORTES = "pensionflow_fin_cortes";
const K_PAGOS = "pensionflow_fin_pagos";
const K_TARIFAS = "pensionflow_fin_tarifas";
const K_AJUSTES = "pensionflow_fin_ajustes";
const K_AUDIT = "pensionflow_fin_auditoria";
const K_CONFIG = "pensionflow_fin_config";

function leer<T>(key: string, porDefecto: T): T {
  if (typeof window === "undefined") return porDefecto;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function escribir(key: string, valor: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(valor));
  } catch {
    /* cuota llena: la previsualización sigue, solo no persiste */
  }
}

/** Overlay de revisión: qué le pasó a cada evento después de devengarse. */
interface EstadoOverlay {
  estado?: EstadoComision;
  motivo_observacion?: string | null;
  observaciones?: string | null;
  corte_id?: string | null;
  fecha_aprobacion?: string | null;
  fecha_envio_finanzas?: string | null;
  fecha_pago?: string | null;
  referencia_pago?: string | null;
  anulado_at?: string | null;
}

/** Configuración del módulo: quién cobra las comisiones de Dirección y desde cuándo se devenga. */
export interface FinanzasConfig {
  director_beneficiario_id: string | null;
  arranque: string;
}

export const CONFIG_POR_DEFECTO: FinanzasConfig = { director_beneficiario_id: null, arranque: "2026-07-01" };

export const demoStore = {
  config: () => leer<FinanzasConfig>(K_CONFIG, CONFIG_POR_DEFECTO),
  setConfig: (v: FinanzasConfig) => escribir(K_CONFIG, v),
  estados: () => leer<Record<string, EstadoOverlay>>(K_ESTADOS, {}),
  setEstados: (v: Record<string, EstadoOverlay>) => escribir(K_ESTADOS, v),
  cortes: () => leer<CorteRow[]>(K_CORTES, []),
  setCortes: (v: CorteRow[]) => escribir(K_CORTES, v),
  pagos: () => leer<PagoRow[]>(K_PAGOS, []),
  setPagos: (v: PagoRow[]) => escribir(K_PAGOS, v),
  tarifas: () => leer<TarifaRow[] | null>(K_TARIFAS, null),
  setTarifas: (v: TarifaRow[]) => escribir(K_TARIFAS, v),
  ajustes: () => leer<EventoRow[]>(K_AJUSTES, []),
  setAjustes: (v: EventoRow[]) => escribir(K_AJUSTES, v),
  auditoria: () => leer<AuditoriaRow[]>(K_AUDIT, []),
  setAuditoria: (v: AuditoriaRow[]) => escribir(K_AUDIT, v),
  auditar: (fila: Omit<AuditoriaRow, "id" | "created_at">) => {
    const prev = leer<AuditoriaRow[]>(K_AUDIT, []);
    escribir(K_AUDIT, [
      { ...fila, id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, created_at: new Date().toISOString() },
      ...prev,
    ].slice(0, 500));
  },
};

// ---------------------------------------------------------------------------
// Tarifas
// ---------------------------------------------------------------------------
// Espejo exacto de la semilla del §5 en 20260802000000. Si allá cambia un
// importe, aquí también, o el modo demo mentirá respecto de producción.

const ARRANQUE = "2026-07-01";

function tarifa(
  rol: RolBeneficiario,
  concepto: ConceptoTarifa,
  producto: ProductoComision | null,
  umbral: number,
  monto: number,
  hasta: string | null,
  notas: string
): TarifaRow {
  return {
    id: `t-${rol}-${concepto}-${producto ?? "na"}-${umbral}`,
    rol_beneficiario: rol,
    concepto,
    producto,
    umbral_min: umbral,
    monto,
    moneda: "MXN",
    vigente_desde: ARRANQUE,
    vigente_hasta: hasta,
    activo: true,
    notas,
    created_at: `${ARRANQUE}T00:00:00.000Z`,
  };
}

export const TARIFAS_SEMILLA: TarifaRow[] = [
  tarifa("director", "comision_financiamiento", "mod_40", 0, 500, null, "Financiamiento Mod 40"),
  tarifa("director", "comision_financiamiento", "mod_10", 0, 300, null, "Financiamiento Mod 10"),
  tarifa("director", "comision_financiamiento", "credito_nomina", 0, 250, null, "Crédito de nómina"),
  tarifa("director", "comision_cierre_aliado", null, 0, 300, null, "Solo por aliados que cierra él mismo"),
  tarifa("director", "bono_mensual", null, 20, 10000, "2026-09-30", "20 o más financiamientos del equipo"),
  tarifa("director", "bono_mensual", null, 30, 15000, "2026-09-30", "30 o más financiamientos del equipo"),
  tarifa("director", "bono_mensual", null, 40, 25000, "2026-09-30", "40 o más financiamientos del equipo"),

  tarifa("closer", "comision_cierre_aliado", null, 0, 300, null, "Por cada aliado que cierra"),
  tarifa("closer", "comision_primer_financiamiento", "mod_40", 0, 500, null, "Una sola vez por aliado"),
  tarifa("closer", "comision_primer_financiamiento", "mod_10", 0, 300, null, "Una sola vez por aliado"),
  tarifa("closer", "comision_primer_financiamiento", "credito_nomina", 0, 250, null, "Una sola vez por aliado"),

  tarifa("account_manager", "salario_fijo", null, 0, 8000, null, "Salario fijo mensual"),
  tarifa("account_manager", "comision_financiamiento", "mod_40", 0, 600, null, "Mod 40 gestionado"),
  tarifa("account_manager", "comision_financiamiento", "mod_10", 0, 300, null, "Mod 10 gestionado"),
  tarifa("account_manager", "comision_financiamiento", "credito_nomina", 0, 300, null, "Crédito de nómina gestionado"),
  tarifa("account_manager", "bono_mensual", null, 10, 7000, null, "10 o más financiamientos en el mes"),
  tarifa("account_manager", "bono_mensual", null, 20, 15000, null, "20 o más financiamientos en el mes"),
  tarifa("account_manager", "bono_mensual", null, 30, 25000, null, "30 o más financiamientos en el mes"),
  tarifa("account_manager", "bono_trimestral", null, 100, 10000, "2026-09-30", "Q3 2026 · 100 o más"),
  tarifa("account_manager", "bono_trimestral", null, 150, 15000, "2026-09-30", "Q3 2026 · 150 o más"),
  tarifa("account_manager", "bono_trimestral", null, 200, 20000, "2026-09-30", "Q3 2026 · 200 o más"),
  // El ALIADO no lleva tarifas: el brief todavía no define su esquema económico
  // (§5.4). En cuanto se den de alta desde el panel, este motor las aplica solo.
];

export function tarifasVigentes(): TarifaRow[] {
  return demoStore.tarifas() ?? TARIFAS_SEMILLA;
}

/** Tramo MÁS ALTO alcanzado, vigente en esa fecha. Los tramos no se acumulan. */
export function resolverTarifa(
  tarifas: TarifaRow[],
  rol: RolBeneficiario,
  concepto: ConceptoTarifa,
  producto: ProductoComision | null,
  fecha: string,
  produccion = 0
): TarifaRow | null {
  const dia = isoDay(fecha);
  if (!dia) return null;
  const candidatas = tarifas.filter(
    (t) =>
      t.activo &&
      t.rol_beneficiario === rol &&
      t.concepto === concepto &&
      (t.producto ?? null) === (producto ?? null) &&
      t.vigente_desde <= dia &&
      (!t.vigente_hasta || t.vigente_hasta >= dia) &&
      t.umbral_min <= produccion
  );
  if (candidatas.length === 0) return null;
  return candidatas.sort(
    (a, b) => b.umbral_min - a.umbral_min || b.vigente_desde.localeCompare(a.vigente_desde)
  )[0];
}

// ---------------------------------------------------------------------------
// Lectura del CRM
// ---------------------------------------------------------------------------

const ESTADOS_VENTA = ["firma_programada", "pagado_comision"];

const estaBorrado = (p: Prospect) =>
  (p.notes_director || "").startsWith("[DELETED:") || (p.notes_director || "").startsWith("[PURGED:");

/** Producto comisionable. Sin modalidad ni crédito de nómina no se adivina: null. */
export function productoDe(p: Prospect): ProductoComision | null {
  if (p.tipo_financiamiento === "credito_nomina") return "credito_nomina";
  if (p.modalidad === "40") return "mod_40";
  if (p.modalidad === "10") return "mod_10";
  return null;
}

export interface VentaLocal {
  prospecto_id: string;
  cliente_nombre: string;
  aliado_id: string | null;
  account_manager_id: string | null;
  producto: ProductoComision | null;
  fecha_ejecucion: string;
}

export function ventasDe(prospects: Prospect[]): VentaLocal[] {
  return prospects
    .filter((p) => ESTADOS_VENTA.includes(p.status) && !estaBorrado(p))
    .map((p) => ({
      prospecto_id: p.id,
      cliente_nombre: p.full_name,
      aliado_id: p.aliado_id || null,
      account_manager_id: p.account_manager_id || null,
      producto: productoDe(p),
      // Aproximación del modo demo: sin historial de estados en el cliente, la
      // ejecución se fecha con la última actualización del proyecto.
      fecha_ejecucion: p.updated_at || p.created_at,
    }))
    .sort((a, b) => a.fecha_ejecucion.localeCompare(b.fecha_ejecucion));
}

/** Quién cerró al aliado (§4.2). Cae en `closer_origen_id` como en la migración. */
const cerradorDe = (a: UserProfile): string | null =>
  (a as any).aliado_cerrado_por_id || a.closer_origen_id || null;

// ---------------------------------------------------------------------------
// Devengo
// ---------------------------------------------------------------------------

function nuevoEvento(
  clave: string,
  base: Partial<EventoRow> & {
    usuario_id: string;
    usuario_nombre: string;
    rol_beneficiario: RolBeneficiario;
    tipo_evento: TipoEvento;
    monto: number;
    fecha_devengo: string;
  }
): EventoRow {
  return {
    id: clave,
    tipo_producto: null,
    moneda: "MXN",
    produccion: null,
    periodo_corte: periodoCorte(base.fecha_devengo, "semanal"),
    estado: "pendiente_revision",
    motivo_observacion: null,
    observaciones: null,
    prospecto_id: null,
    cliente_nombre: null,
    aliado_id: null,
    aliado_nombre: null,
    account_manager: null,
    corte_id: null,
    anulado_at: null,
    fecha_aprobacion: null,
    fecha_envio_finanzas: null,
    fecha_pago: null,
    referencia_pago: null,
    ...base,
  } as EventoRow;
}

/**
 * Reconstruye el libro mayor completo a partir del CRM, aplicando encima el
 * overlay de revisión guardado en localStorage. Mismo orden de reglas que
 * `comisiones_sincronizar`.
 */
export function construirEventos(profiles: UserProfile[], prospects: Prospect[]): EventoRow[] {
  const tarifas = tarifasVigentes();
  const overlay = demoStore.estados();
  const porId = new Map(profiles.map((p) => [p.id, p]));
  const ventas = ventasDe(prospects);
  const eventos: EventoRow[] = [];

  // Beneficiario de las comisiones de Dirección. Si no hay uno designado se usa
  // la cuenta de dirección más antigua, igual que `fin_director_id()` en la base:
  // sin señalar una sola, cada venta multiplicaría la comisión por el número de
  // cuentas con rol de dirección.
  const config = demoStore.config();
  const director =
    (config.director_beneficiario_id ? profiles.find((p) => p.id === config.director_beneficiario_id) : null) ||
    profiles.filter((p) => p.role === "director").sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))[0] ||
    null;

  const etiquetaProducto = (prod: ProductoComision | null) =>
    prod ? null : "El proyecto no tiene modalidad (40/10) ni está marcado como crédito de nómina.";

  // A + B — comisión de Dirección y del Account Manager por cada financiamiento
  for (const v of ventas) {
    const aliado = v.aliado_id ? porId.get(v.aliado_id) : undefined;

    if (director) {
      const t = resolverTarifa(tarifas, "director", "comision_financiamiento", v.producto, v.fecha_ejecucion);
      eventos.push(
        nuevoEvento(`fin:${v.prospecto_id}:${director.id}`, {
          usuario_id: director.id,
          usuario_nombre: director.full_name,
          rol_beneficiario: "director",
          tipo_evento: "comision_financiamiento",
          tipo_producto: v.producto,
          monto: t?.monto ?? 0,
          fecha_devengo: v.fecha_ejecucion,
          estado: t ? "pendiente_revision" : "observado",
          motivo_observacion: t ? null : etiquetaProducto(v.producto) || "No hay tarifa de Dirección vigente.",
          prospecto_id: v.prospecto_id,
          cliente_nombre: v.cliente_nombre,
          aliado_id: v.aliado_id,
          aliado_nombre: aliado?.full_name ?? null,
        })
      );
    }

    const am = v.account_manager_id ? porId.get(v.account_manager_id) : undefined;
    if (am) {
      const t = resolverTarifa(tarifas, "account_manager", "comision_financiamiento", v.producto, v.fecha_ejecucion);
      eventos.push(
        nuevoEvento(`fin:${v.prospecto_id}:${am.id}`, {
          usuario_id: am.id,
          usuario_nombre: am.full_name,
          rol_beneficiario: "account_manager",
          tipo_evento: "comision_financiamiento",
          tipo_producto: v.producto,
          monto: t?.monto ?? 0,
          fecha_devengo: v.fecha_ejecucion,
          estado: t ? "pendiente_revision" : "observado",
          motivo_observacion: t ? null : etiquetaProducto(v.producto) || "No hay tarifa de Account Manager vigente.",
          prospecto_id: v.prospecto_id,
          cliente_nombre: v.cliente_nombre,
          aliado_id: v.aliado_id,
          aliado_nombre: aliado?.full_name ?? null,
          account_manager: am.full_name,
        })
      );
    }

    // E — comisión del aliado, solo si existe tarifa (§5.4)
    if (aliado) {
      const t = resolverTarifa(tarifas, "aliado", "comision_aliado", v.producto, v.fecha_ejecucion);
      if (t) {
        eventos.push(
          nuevoEvento(`ali_fin:${v.prospecto_id}`, {
            usuario_id: aliado.id,
            usuario_nombre: aliado.full_name,
            rol_beneficiario: "aliado",
            tipo_evento: "comision_aliado",
            tipo_producto: v.producto,
            monto: t.monto,
            fecha_devengo: v.fecha_ejecucion,
            prospecto_id: v.prospecto_id,
            cliente_nombre: v.cliente_nombre,
            aliado_id: v.aliado_id,
            aliado_nombre: aliado.full_name,
          })
        );
      }
    }
  }

  // C — comisión por cierre de aliado
  for (const a of profiles) {
    if (a.role !== "aliado") continue;
    const cerradorId = cerradorDe(a);
    if (!cerradorId) continue;
    const c = porId.get(cerradorId);
    if (!c || !["closer", "director"].includes(c.role)) continue;

    const rol: RolBeneficiario = c.role === "closer" ? "closer" : "director";
    const fecha = a.fecha_incorporacion_closer || a.created_at;
    const t = resolverTarifa(tarifas, rol, "comision_cierre_aliado", null, fecha);
    eventos.push(
      nuevoEvento(`alia:${a.id}`, {
        usuario_id: c.id,
        usuario_nombre: c.full_name,
        rol_beneficiario: rol,
        tipo_evento: "comision_cierre_aliado",
        monto: t?.monto ?? 0,
        fecha_devengo: fecha,
        estado: t ? "pendiente_revision" : "observado",
        motivo_observacion: t ? null : "No hay tarifa de cierre de aliado vigente para ese rol.",
        aliado_id: a.id,
        aliado_nombre: a.full_name,
      })
    );
  }

  // D — primer financiamiento de cada aliado, para el closer que lo cerró
  const primeras = new Map<string, VentaLocal>();
  for (const v of ventas) {
    if (!v.aliado_id) continue;
    if (!primeras.has(v.aliado_id)) primeras.set(v.aliado_id, v);
  }
  primeras.forEach((v, aliadoId) => {
    const a = porId.get(aliadoId);
    if (!a || a.role !== "aliado") return;
    const cerradorId = cerradorDe(a);
    const c = cerradorId ? porId.get(cerradorId) : undefined;
    // Cerrado por la Dirección → ningún closer cobra el primer financiamiento.
    if (!c || c.role !== "closer") return;

    const t = resolverTarifa(tarifas, "closer", "comision_primer_financiamiento", v.producto, v.fecha_ejecucion);
    eventos.push(
      nuevoEvento(`1fin:${aliadoId}`, {
        usuario_id: c.id,
        usuario_nombre: c.full_name,
        rol_beneficiario: "closer",
        tipo_evento: "comision_primer_financiamiento",
        tipo_producto: v.producto,
        monto: t?.monto ?? 0,
        fecha_devengo: v.fecha_ejecucion,
        estado: t ? "pendiente_revision" : "observado",
        motivo_observacion: t ? null : "No hay tarifa de primer financiamiento vigente.",
        prospecto_id: v.prospecto_id,
        cliente_nombre: v.cliente_nombre,
        aliado_id: aliadoId,
        aliado_nombre: a.full_name,
      })
    );
  });

  // F + G — salario fijo y bonos, mes a mes y trimestre a trimestre.
  // Nunca antes del arranque configurado: sin ese tope se fabricarían salarios y
  // bonos de todo el histórico del CRM.
  const arranque = config.arranque || ARRANQUE;
  const meses = mesesEntre(arranque, hoyIso());
  const ams = profiles.filter((p) => p.role === "account_manager");

  for (const mes of meses) {
    const finMes = ultimoDiaDelMes(mes);
    const ventasMes = ventas.filter((v) => inRange(v.fecha_ejecucion, mes, finMes));

    for (const am of ams) {
      if (isoDay(am.created_at) && isoDay(am.created_at)! > finMes) continue;

      const tSal = resolverTarifa(tarifas, "account_manager", "salario_fijo", null, finMes);
      if (tSal) {
        eventos.push(
          nuevoEvento(`sal:${am.id}:${mes.substring(0, 7)}`, {
            usuario_id: am.id,
            usuario_nombre: am.full_name,
            rol_beneficiario: "account_manager",
            tipo_evento: "salario_fijo",
            monto: tSal.monto,
            fecha_devengo: `${finMes}T00:00:00.000Z`,
            periodo_corte: mes.substring(0, 7),
          })
        );
      }

      const prod = ventasMes.filter((v) => v.account_manager_id === am.id).length;
      const tBono = resolverTarifa(tarifas, "account_manager", "bono_mensual", null, finMes, prod);
      if (tBono) {
        eventos.push(
          nuevoEvento(`bmen:${am.id}:${mes.substring(0, 7)}`, {
            usuario_id: am.id,
            usuario_nombre: am.full_name,
            rol_beneficiario: "account_manager",
            tipo_evento: "bono_mensual",
            monto: tBono.monto,
            produccion: prod,
            fecha_devengo: `${finMes}T00:00:00.000Z`,
            periodo_corte: mes.substring(0, 7),
          })
        );
      }
    }

    if (director) {
      const tBonoDir = resolverTarifa(tarifas, "director", "bono_mensual", null, finMes, ventasMes.length);
      if (tBonoDir) {
        eventos.push(
          nuevoEvento(`bmen:${director.id}:${mes.substring(0, 7)}`, {
            usuario_id: director.id,
            usuario_nombre: director.full_name,
            rol_beneficiario: "director",
            tipo_evento: "bono_mensual",
            monto: tBonoDir.monto,
            produccion: ventasMes.length,
            fecha_devengo: `${finMes}T00:00:00.000Z`,
            periodo_corte: mes.substring(0, 7),
          })
        );
      }
    }
  }

  for (const tri of trimestresEntre(arranque, hoyIso())) {
    const finTri = ultimoDiaDelTrimestre(tri);
    const ventasTri = ventas.filter((v) => inRange(v.fecha_ejecucion, tri, finTri));
    const etiqueta = periodoCorte(`${tri}T00:00:00.000Z`, "trimestral");

    for (const am of ams) {
      const prod = ventasTri.filter((v) => v.account_manager_id === am.id).length;
      const t = resolverTarifa(tarifas, "account_manager", "bono_trimestral", null, finTri, prod);
      if (!t) continue;
      eventos.push(
        nuevoEvento(`btri:${am.id}:${etiqueta}`, {
          usuario_id: am.id,
          usuario_nombre: am.full_name,
          rol_beneficiario: "account_manager",
          tipo_evento: "bono_trimestral",
          monto: t.monto,
          produccion: prod,
          fecha_devengo: `${finTri}T00:00:00.000Z`,
          periodo_corte: etiqueta,
        })
      );
    }
  }

  // Ajustes y reversiones manuales, que no se derivan del CRM.
  eventos.push(...demoStore.ajustes());

  // El overlay manda sobre el estado calculado: es lo que la Dirección decidió.
  return eventos.map((e) => {
    const o = overlay[e.id];
    return o ? ({ ...e, ...o } as EventoRow) : e;
  });
}

// ---------------------------------------------------------------------------
// Agregados (equivalentes locales de las RPC de lectura)
// ---------------------------------------------------------------------------

export interface FiltroLocal {
  desde: string;
  hasta: string;
  rol?: RolBeneficiario | null;
  estado?: EstadoComision | null;
  usuarioId?: string | null;
  tipoEvento?: TipoEvento | null;
  corteId?: string | null;
}

export function filtrarEventos(eventos: EventoRow[], f: FiltroLocal): EventoRow[] {
  return eventos.filter((e) => {
    if (e.estado === "revertido" || e.anulado_at) return false;
    if ((f.desde || f.hasta) && !inRange(e.fecha_devengo, f.desde, f.hasta)) return false;
    if (f.rol && e.rol_beneficiario !== f.rol) return false;
    if (f.estado && e.estado !== f.estado) return false;
    if (f.usuarioId && e.usuario_id !== f.usuarioId) return false;
    if (f.tipoEvento && e.tipo_evento !== f.tipoEvento) return false;
    if (f.corteId && e.corte_id !== f.corteId) return false;
    return true;
  });
}

const COMISIONES: TipoEvento[] = [
  "comision_financiamiento",
  "comision_cierre_aliado",
  "comision_primer_financiamiento",
  "comision_aliado",
];
const BONOS: TipoEvento[] = ["bono_mensual", "bono_trimestral"];
const AJUSTES: TipoEvento[] = ["ajuste_positivo", "ajuste_negativo", "reversion"];

const suma = (xs: EventoRow[]) => xs.reduce((s, e) => s + (Number(e.monto) || 0), 0);

export function resumenLocal(eventos: EventoRow[]): FinanzasResumen {
  if (eventos.length === 0) return { ...RESUMEN_VACIO };
  const distintos = (pred: (e: EventoRow) => boolean, campo: "prospecto_id" | "aliado_id") =>
    new Set(eventos.filter(pred).map((e) => e[campo]).filter(Boolean)).size;

  return {
    produccion_financiamientos: distintos(
      (e) => e.tipo_evento === "comision_financiamiento" || e.tipo_evento === "comision_aliado",
      "prospecto_id"
    ),
    produccion_aliados: distintos((e) => e.tipo_evento === "comision_cierre_aliado", "aliado_id"),
    produccion_primeros: eventos.filter((e) => e.tipo_evento === "comision_primer_financiamiento").length,
    total_generado: suma(eventos),
    total_pendiente_revision: suma(eventos.filter((e) => e.estado === "pendiente_revision")),
    total_aprobado: suma(eventos.filter((e) => e.estado === "aprobado")),
    total_enviado_finanzas: suma(eventos.filter((e) => e.estado === "enviado_finanzas")),
    total_pagado: suma(eventos.filter((e) => e.estado === "pagado")),
    total_pendiente_pago: suma(eventos.filter((e) => e.estado !== "pagado")),
    total_observado: suma(eventos.filter((e) => e.estado === "observado")),
    total_ajustes: suma(eventos.filter((e) => AJUSTES.includes(e.tipo_evento))),
    eventos_total: eventos.length,
    eventos_observados: eventos.filter((e) => e.estado === "observado").length,
    beneficiarios: new Set(eventos.map((e) => e.usuario_id)).size,
  };
}

export function liquidacionesLocal(eventos: EventoRow[], profiles: UserProfile[]): LiquidacionRow[] {
  const porId = new Map(profiles.map((p) => [p.id, p]));
  const grupos = new Map<string, EventoRow[]>();
  for (const e of eventos) {
    const k = `${e.usuario_id}|${e.rol_beneficiario}`;
    grupos.set(k, [...(grupos.get(k) || []), e]);
  }

  const filas: LiquidacionRow[] = [];
  grupos.forEach((evs, k) => {
    const [usuarioId, rol] = k.split("|") as [string, RolBeneficiario];
    const p = porId.get(usuarioId);
    const observados = evs.filter((e) => e.estado === "observado").length;

    // Estado de la fila = el punto MENOS avanzado: lo que aún falta por hacer.
    const estado: EstadoComision = observados
      ? "observado"
      : evs.some((e) => e.estado === "pendiente_revision")
        ? "pendiente_revision"
        : evs.some((e) => e.estado === "aprobado")
          ? "aprobado"
          : evs.some((e) => e.estado === "enviado_finanzas")
            ? "enviado_finanzas"
            : "pagado";

    const prospectos = new Set(
      evs.filter((e) => e.tipo_evento !== "comision_cierre_aliado").map((e) => e.prospecto_id).filter(Boolean)
    ).size;
    const aliados = new Set(
      evs.filter((e) => e.tipo_evento === "comision_cierre_aliado").map((e) => e.aliado_id).filter(Boolean)
    ).size;

    filas.push({
      usuario_id: usuarioId,
      usuario_nombre: p?.full_name || evs[0]?.usuario_nombre || "Cuenta eliminada",
      rol_beneficiario: rol,
      avatar_url: p?.avatar_url ?? null,
      produccion: prospectos + aliados,
      comision_base: suma(evs.filter((e) => COMISIONES.includes(e.tipo_evento))),
      bonos: suma(evs.filter((e) => BONOS.includes(e.tipo_evento))),
      salario: suma(evs.filter((e) => e.tipo_evento === "salario_fijo")),
      ajustes: suma(evs.filter((e) => AJUSTES.includes(e.tipo_evento))),
      total_a_pagar: suma(evs),
      total_pagado: suma(evs.filter((e) => e.estado === "pagado")),
      total_pendiente: suma(evs.filter((e) => e.estado !== "pagado")),
      eventos: evs.length,
      eventos_observados: observados,
      estado_resumen: estado,
      fecha_envio: evs.map((e) => e.fecha_envio_finanzas).filter(Boolean).sort().pop() || null,
      fecha_pago: evs.map((e) => e.fecha_pago).filter(Boolean).sort().pop() || null,
      clabe: p?.clabe ?? null,
      banco: p?.banco ?? null,
      titular_cuenta: p?.titular_cuenta ?? null,
      binance_id: p?.binance_id ?? null,
    });
  });

  return filas.sort((a, b) => b.total_a_pagar - a.total_a_pagar || a.usuario_nombre.localeCompare(b.usuario_nombre));
}

export function serieLocal(eventos: EventoRow[], grano: Grano): SeriePoint[] {
  const mapa = new Map<string, SeriePoint>();
  for (const e of eventos) {
    const periodo = bucketStart(e.fecha_devengo, grano);
    const k = `${periodo}|${e.rol_beneficiario}`;
    const prev =
      mapa.get(k) || { periodo, rol: e.rol_beneficiario, generado: 0, pagado: 0, pendiente: 0 };
    const m = Number(e.monto) || 0;
    prev.generado += m;
    if (e.estado === "pagado") prev.pagado += m;
    else prev.pendiente += m;
    mapa.set(k, prev);
  }
  return [...mapa.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
}

export function produccionLocal(
  prospects: Prospect[],
  profiles: UserProfile[],
  dimension: "producto" | "account_manager" | "closer" | "aliado",
  desde: string,
  hasta: string
): ProduccionRow[] {
  const porId = new Map(profiles.map((p) => [p.id, p]));
  const ventas = ventasDe(prospects).filter((v) => !desde && !hasta ? true : inRange(v.fecha_ejecucion, desde, hasta));
  const mapa = new Map<string, ProduccionRow>();

  for (const v of ventas) {
    const aliado = v.aliado_id ? porId.get(v.aliado_id) : undefined;
    let clave = "todos";
    let etiqueta = "Total";

    if (dimension === "producto") {
      clave = v.producto ?? "sin_producto";
      etiqueta = v.producto
        ? { mod_40: "Financiamiento Mod 40", mod_10: "Financiamiento Mod 10", credito_nomina: "Crédito de nómina" }[v.producto]
        : "Producto sin definir";
    } else if (dimension === "account_manager") {
      clave = v.account_manager_id ?? "sin_am";
      etiqueta = (v.account_manager_id ? porId.get(v.account_manager_id)?.full_name : null) || "Sin Account Manager";
    } else if (dimension === "aliado") {
      clave = v.aliado_id ?? "sin_aliado";
      etiqueta = aliado?.full_name || "Sin aliado";
    } else {
      const cerradorId = aliado ? cerradorDe(aliado) : null;
      clave = cerradorId ?? "sin_cerrador";
      etiqueta = (cerradorId ? porId.get(cerradorId)?.full_name : null) || "Sin responsable de cierre";
    }

    const prev =
      mapa.get(clave) || { clave, etiqueta, financiamientos: 0, mod_40: 0, mod_10: 0, credito_nomina: 0 };
    prev.financiamientos += 1;
    if (v.producto) prev[v.producto] += 1;
    mapa.set(clave, prev);
  }

  return [...mapa.values()].sort((a, b) => b.financiamientos - a.financiamientos || a.etiqueta.localeCompare(b.etiqueta));
}

export function inconsistenciasLocal(
  prospects: Prospect[],
  profiles: UserProfile[],
  eventos: EventoRow[],
  desde: string,
  hasta: string
): InconsistenciaRow[] {
  const porId = new Map(profiles.map((p) => [p.id, p]));
  const ventas = ventasDe(prospects).filter((v) => (!desde && !hasta) || inRange(v.fecha_ejecucion, desde, hasta));
  const filas: InconsistenciaRow[] = [];

  for (const v of ventas) {
    if (!v.aliado_id) {
      filas.push({
        tipo: "venta_sin_aliado",
        severidad: "alta",
        titulo: "Financiamiento sin aliado identificado",
        detalle: "No se puede calcular la comisión del Closer ni la del Aliado.",
        prospecto_id: v.prospecto_id,
        aliado_id: null,
        referencia: v.cliente_nombre,
        fecha: v.fecha_ejecucion,
      });
    }
    if (!v.account_manager_id) {
      filas.push({
        tipo: "venta_sin_am",
        severidad: "alta",
        titulo: "Financiamiento sin Account Manager",
        detalle: "La operación no genera comisión de gestión hasta que se le asigne un Account Manager.",
        prospecto_id: v.prospecto_id,
        aliado_id: v.aliado_id,
        referencia: v.cliente_nombre,
        fecha: v.fecha_ejecucion,
      });
    }
    if (!v.producto) {
      filas.push({
        tipo: "venta_sin_producto",
        severidad: "alta",
        titulo: "Financiamiento sin producto determinable",
        detalle: "Falta la modalidad (40 / 10) o marcarlo como crédito de nómina; sin eso no hay tarifa que aplicar.",
        prospecto_id: v.prospecto_id,
        aliado_id: v.aliado_id,
        referencia: v.cliente_nombre,
        fecha: v.fecha_ejecucion,
      });
    }
  }

  const conVentas = new Set(ventas.map((v) => v.aliado_id).filter(Boolean) as string[]);
  for (const id of conVentas) {
    const a = porId.get(id);
    if (a && a.role === "aliado" && !cerradorDe(a)) {
      filas.push({
        tipo: "aliado_sin_cerrador",
        severidad: "media",
        titulo: "Aliado sin responsable de cierre",
        detalle: "No se puede determinar quién cobra el cierre ni el primer financiamiento de este aliado.",
        prospecto_id: null,
        aliado_id: a.id,
        referencia: a.full_name,
        fecha: a.fecha_incorporacion_closer || a.created_at,
      });
    }
  }

  for (const e of eventos) {
    if (e.estado !== "observado") continue;
    filas.push({
      tipo: "evento_observado",
      severidad: "media",
      titulo: "Comisión observada",
      detalle: e.motivo_observacion || "Revisar antes de aprobar.",
      prospecto_id: e.prospecto_id,
      aliado_id: e.aliado_id,
      referencia: e.usuario_nombre,
      fecha: e.fecha_devengo,
    });
  }

  const pendientes = new Set(eventos.filter((e) => e.estado !== "pagado").map((e) => e.usuario_id));
  for (const id of pendientes) {
    const p = porId.get(id);
    if (p && !p.clabe && !p.binance_id) {
      filas.push({
        tipo: "sin_datos_cobro",
        severidad: "media",
        titulo: "Beneficiario sin datos de cobro",
        detalle: "No tiene CLABE ni ID de Binance registrado: Finanzas no puede depositarle.",
        prospecto_id: null,
        aliado_id: null,
        referencia: p.full_name,
        fecha: null,
      });
    }
  }

  const orden = { alta: 0, media: 1, baja: 2 } as const;
  return filas.sort((a, b) => orden[a.severidad] - orden[b.severidad] || (b.fecha || "").localeCompare(a.fecha || ""));
}

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

const hoyIso = () => new Date().toISOString().substring(0, 10);

function mesesEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  const [y0, m0] = desde.split("-").map(Number);
  const [y1, m1] = hasta.split("-").map(Number);
  let y = y0;
  let m = m0;
  // Tope de seguridad: la previsualización nunca necesita más de diez años.
  while ((y < y1 || (y === y1 && m <= m1)) && out.length < 120) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function trimestresEntre(desde: string, hasta: string): string[] {
  return mesesEntre(desde, hasta).filter((m) => [1, 4, 7, 10].includes(Number(m.split("-")[1])));
}

function ultimoDiaDelMes(primerDia: string): string {
  const [y, m] = primerDia.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().substring(0, 10);
}

function ultimoDiaDelTrimestre(primerDia: string): string {
  const [y, m] = primerDia.split("-").map(Number);
  return new Date(Date.UTC(y, m + 2, 0)).toISOString().substring(0, 10);
}
