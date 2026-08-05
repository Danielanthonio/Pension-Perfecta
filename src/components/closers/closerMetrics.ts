// Agregación de métricas de closers en TypeScript puro.
//
// ⚠️ ESPEJO DELIBERADO DE SQL. Estas funciones replican exactamente lo que hacen
// las RPC `closers_overview`, `closers_serie` y `closer_aliados` de
// 20260801000000_closers.sql. Existen por dos motivos concretos:
//
//   1. MODO DEMO. La previsualización local corre sin claves de Supabase y vive
//      en localStorage: sin esto, el módulo se vería vacío al revisarlo antes de
//      desplegar.
//   2. DESGLOSE DE LA DIRECCIÓN. Cuando el director expande un aliado para ver
//      sus clientes, esos proyectos YA están cargados en AppContext; volver a
//      pedirlos a la base sería un viaje de red por cada fila abierta.
//
// En producción manda SIEMPRE la RPC (es la única fuente que el rol closer puede
// usar, porque no tiene acceso de lectura a `prospects`). Si tocas un bucket o un
// criterio aquí, tócalo también en la migración, o los números divergirán.

import type { Prospect, UserProfile } from "@/utils/context/AppContext";
import { isProspectDeleted, isProspectPurged } from "@/utils/context/AppContext";
import {
  APPROVED_STAGE,
  CONDITIONED_STAGE,
  EVALUATED_STAGE,
  FIN_OTORGADO_STAGE,
} from "@/app/admin/_pipelineBuckets";
import type {
  CloserAliadoRow,
  CloserOverviewRow,
  CloserSeriePoint,
  EstadoAliadoFiltro,
  Grano,
  TipoAliadoFiltro,
} from "./closerTypes";
import { bucketStart, inRange, isoDay } from "./closerTypes";

// Los buckets salen de la fuente única del pipeline para que el módulo Closers
// cuadre con el Dashboard y con Reportes. "Venta" = financiamiento otorgado.
const VENTAS = FIN_OTORGADO_STAGE;
const PERDIDOS = ["cerrado_perdido", "cerrado_riesgo", "cerrado_desiste"];
const RECHAZADOS = ["rechazado"];

const NOVENTA_DIAS_MS = 90 * 24 * 60 * 60 * 1000;

/** Proyectos vivos: los de la papelera y los purgados no cuentan para nadie. */
export function activeProspects(prospects: Prospect[]): Prospect[] {
  return prospects.filter((p) => !isProspectDeleted(p) && !isProspectPurged(p));
}

export function isCloser(p: UserProfile): boolean {
  return p.role === "closer";
}

/**
 * Quién puede figurar como responsable del CIERRE de un aliado.
 *
 * No es solo el rol closer: la Dirección también cierra aliados y cobra por
 * ello, con su propia tarifa de `comision_cierre_aliado` (§4.2 de Finanzas, y
 * migración 20260804000001). Por eso aparece en los selectores de atribución.
 *
 * Ojo con el rol: la base guarda 'admin' para las cuentas de dirección y la app
 * las normaliza a 'director' al mapear el perfil, así que aquí solo hay que
 * mirar 'director'.
 */
export function puedeCerrarAliados(p: UserProfile): boolean {
  return p.role === "closer" || p.role === "director";
}

/** Etiqueta para los selectores: distingue a la Dirección de un closer. */
export function etiquetaCerrador(p: UserProfile): string {
  const base = p.role === "director" ? `${p.full_name} (Dirección)` : p.full_name;
  return p.email ? `${base} — ${p.email}` : base;
}

export function isAliado(p: UserProfile): boolean {
  return p.role === "aliado";
}

/** Aliados que todavía no tienen closer atribuido (el cubo "Sin atribución"). */
export function aliadosSinCloser(profiles: UserProfile[]): UserProfile[] {
  return profiles.filter((p) => isAliado(p) && !p.closer_origen_id);
}

export interface Ventana {
  desde: string;
  hasta: string;
  /** 'independiente' | 'empresa' | 'lider'. Vacío o "todos" = sin filtrar. */
  tipoAliado?: TipoAliadoFiltro;
  /** 'activos' (con clientes en 90 días) | 'sin_actividad'. */
  estadoAliado?: EstadoAliadoFiltro;
}

/** Clasificación del §10, derivada de lo que el sistema ya modela. */
export function tipoDeAliado(p: UserProfile): Exclude<TipoAliadoFiltro, "todos"> {
  if (p.aliado_tipo === "lider") return "lider";
  return p.empresa_multialiado_id ? "empresa" : "independiente";
}

function pasaFiltroTipo(p: UserProfile, tipo?: TipoAliadoFiltro): boolean {
  if (!tipo || tipo === "todos") return true;
  return tipoDeAliado(p) === tipo;
}

function pasaFiltroEstado(agg: AliadoAgg, estado?: EstadoAliadoFiltro): boolean {
  if (!estado || estado === "todos") return true;
  if (estado === "activos") return agg.clientes90d > 0;
  return agg.clientesTotal === 0;
}

interface AliadoAgg {
  aliado: UserProfile;
  clientesTotal: number;
  ventasTotal: number;
  clientes90d: number;
  ultimoClienteAt: string | null;
  clientesPeriodo: number;
  evaluados: number;
  aprobados: number;
  condicionados: number;
  rechazados: number;
  perdidos: number;
  ventasPeriodo: number;
  enProceso: number;
  aprobadosTotal: number;
}

/** Índice aliado_id → sus proyectos vivos. Un solo recorrido de la lista. */
function indexByAliado(prospects: Prospect[]): Map<string, Prospect[]> {
  const map = new Map<string, Prospect[]>();
  for (const p of activeProspects(prospects)) {
    const list = map.get(p.aliado_id);
    if (list) list.push(p);
    else map.set(p.aliado_id, [p]);
  }
  return map;
}

function aggregateAliado(aliado: UserProfile, proyectos: Prospect[], v: Ventana): AliadoAgg {
  const corte = Date.now() - NOVENTA_DIAS_MS;
  const agg: AliadoAgg = {
    aliado,
    clientesTotal: proyectos.length,
    ventasTotal: 0,
    clientes90d: 0,
    ultimoClienteAt: null,
    clientesPeriodo: 0,
    evaluados: 0,
    aprobados: 0,
    condicionados: 0,
    rechazados: 0,
    perdidos: 0,
    ventasPeriodo: 0,
    enProceso: 0,
    aprobadosTotal: 0,
  };

  for (const p of proyectos) {
    const esVenta = VENTAS.includes(p.status);
    const esRechazo = RECHAZADOS.includes(p.status);
    const esPerdido = PERDIDOS.includes(p.status);

    if (esVenta) agg.ventasTotal++;
    if (APPROVED_STAGE.includes(p.status)) agg.aprobadosTotal++;
    // "En proceso" = sigue vivo en el embudo: ni venta, ni rechazo, ni perdido.
    if (!esVenta && !esRechazo && !esPerdido) agg.enProceso++;

    const t = new Date(p.created_at).getTime();
    if (!isNaN(t) && t >= corte) agg.clientes90d++;
    if (!agg.ultimoClienteAt || p.created_at > agg.ultimoClienteAt) agg.ultimoClienteAt = p.created_at;

    // Bloque acotado al período (lente `created_at`).
    if (!v.desde && !v.hasta) {
      agg.clientesPeriodo++;
    } else if (inRange(p.created_at, v.desde, v.hasta)) {
      agg.clientesPeriodo++;
    } else {
      continue;
    }
    if (EVALUATED_STAGE.includes(p.status)) agg.evaluados++;
    if (APPROVED_STAGE.includes(p.status)) agg.aprobados++;
    if (CONDITIONED_STAGE.includes(p.status)) agg.condicionados++;
    if (esRechazo) agg.rechazados++;
    if (esPerdido) agg.perdidos++;
    if (esVenta) agg.ventasPeriodo++;
  }

  return agg;
}

/**
 * Una fila por closer. Espejo de `closers_overview(p_desde, p_hasta)`.
 * `scopeCloserId` acota a un solo closer (lo usa la ficha propia del rol closer).
 */
export function buildOverview(
  profiles: UserProfile[],
  prospects: Prospect[],
  v: Ventana,
  scopeCloserId?: string | null
): CloserOverviewRow[] {
  const porAliado = indexByAliado(prospects);
  // Espejo de `closers_cuenta_como_cerrador` en 20260804000001: un closer
  // siempre; una cuenta de dirección solo si de verdad tiene aliados a su
  // nombre, para no llenar el tablero de renglones a cero.
  const conAliados = new Set(
    profiles.filter(isAliado).map((a) => a.closer_origen_id).filter(Boolean) as string[]
  );
  const closers = profiles.filter(
    (p) =>
      (isCloser(p) || (p.role === "director" && conAliados.has(p.id))) &&
      (!scopeCloserId || p.id === scopeCloserId)
  );

  // Un solo pase por los aliados: se agrupan por su closer de ORIGEN (mérito
  // histórico), nunca por el actual. Ver §23 del brief.
  const aggPorCloser = new Map<string, AliadoAgg[]>();
  for (const a of profiles) {
    if (!isAliado(a) || !a.closer_origen_id) continue;
    if (!pasaFiltroTipo(a, v.tipoAliado)) continue;
    const agg = aggregateAliado(a, porAliado.get(a.id) || [], v);
    // El filtro de estado va DESPUÉS de agregar: "activo" depende de los
    // clientes del aliado, no de una bandera en su perfil.
    if (!pasaFiltroEstado(agg, v.estadoAliado)) continue;
    const list = aggPorCloser.get(a.closer_origen_id);
    if (list) list.push(agg);
    else aggPorCloser.set(a.closer_origen_id, [agg]);
  }

  const rows = closers.map<CloserOverviewRow>((c) => {
    const aggs = aggPorCloser.get(c.id) || [];
    const sum = (pick: (a: AliadoAgg) => number) => aggs.reduce((s, a) => s + pick(a), 0);

    const enPeriodo = aggs.filter((a) =>
      !v.desde && !v.hasta ? !!a.aliado.fecha_incorporacion_closer : inRange(a.aliado.fecha_incorporacion_closer, v.desde, v.hasta)
    ).length;

    const ultimoAliado = aggs.reduce<string | null>((acc, a) => {
      const f = a.aliado.fecha_incorporacion_closer || null;
      if (!f) return acc;
      return !acc || f > acc ? f : acc;
    }, null);

    const ultimoCliente = aggs.reduce<string | null>((acc, a) => {
      if (!a.ultimoClienteAt) return acc;
      return !acc || a.ultimoClienteAt > acc ? a.ultimoClienteAt : acc;
    }, null);

    return {
      closer_id: c.id,
      closer_nombre: c.full_name,
      closer_email: c.email || null,
      closer_telefono: c.phone || null,
      closer_avatar_url: c.avatar_url || null,
      closer_created_at: c.created_at || null,

      aliados_total: aggs.length,
      aliados_periodo: enPeriodo,
      aliados_productivos: aggs.filter((a) => a.clientesTotal > 0).length,
      aliados_sin_actividad: aggs.filter((a) => a.clientesTotal === 0).length,
      aliados_activos_90d: aggs.filter((a) => a.clientes90d > 0).length,
      ultimo_aliado_at: ultimoAliado,

      clientes_total: sum((a) => a.clientesTotal),
      ventas_total: sum((a) => a.ventasTotal),
      clientes_periodo: sum((a) => a.clientesPeriodo),
      clientes_evaluados: sum((a) => a.evaluados),
      clientes_aprobados: sum((a) => a.aprobados),
      clientes_condicionados: sum((a) => a.condicionados),
      clientes_rechazados: sum((a) => a.rechazados),
      clientes_perdidos: sum((a) => a.perdidos),
      ventas_periodo: sum((a) => a.ventasPeriodo),
      ultimo_cliente_at: ultimoCliente,
    };
  });

  return rows.sort((a, b) => b.aliados_total - a.aliados_total || a.closer_nombre.localeCompare(b.closer_nombre));
}

/** Espejo de `closer_aliados(p_closer_id, p_desde, p_hasta)`. */
export function buildAliadoRows(
  profiles: UserProfile[],
  prospects: Prospect[],
  closerId: string,
  v: Ventana,
  empresas: { id: string; nombre: string }[] = []
): CloserAliadoRow[] {
  const porAliado = indexByAliado(prospects);
  const empresaNombre = new Map(empresas.map((e) => [e.id, e.nombre]));

  return profiles
    .filter((p) => isAliado(p) && p.closer_origen_id === closerId)
    .map<CloserAliadoRow>((a) => {
      const agg = aggregateAliado(a, porAliado.get(a.id) || [], v);
      return {
        aliado_id: a.id,
        aliado_nombre: a.full_name,
        aliado_email: a.email || null,
        aliado_tipo: a.aliado_tipo === "lider" ? "lider" : "aliado",
        empresa_id: a.empresa_multialiado_id || null,
        empresa_nombre: a.empresa_multialiado_id ? empresaNombre.get(a.empresa_multialiado_id) || null : null,
        fecha_incorporacion: a.fecha_incorporacion_closer || null,
        es_closer_actual: (a.closer_actual_id || null) === closerId,
        creado_por: a.created_by || null,
        creado_por_mi: !!a.created_by && a.created_by === closerId,
        clientes_total: agg.clientesTotal,
        clientes_periodo: agg.clientesPeriodo,
        clientes_en_proceso: agg.enProceso,
        clientes_aprobados: agg.aprobadosTotal,
        ventas: agg.ventasTotal,
        clientes_90d: agg.clientes90d,
        ultimo_cliente_at: agg.ultimoClienteAt,
      };
    })
    .sort((a, b) => {
      const fa = a.fecha_incorporacion || "";
      const fb = b.fecha_incorporacion || "";
      if (fa !== fb) return fb.localeCompare(fa);
      return a.aliado_nombre.localeCompare(b.aliado_nombre);
    });
}

/** Espejo de `closers_serie(p_desde, p_hasta, p_grano)`. */
export function buildSerie(
  profiles: UserProfile[],
  v: Ventana,
  grano: Grano,
  scopeCloserId?: string | null,
  prospects?: Prospect[]
): CloserSeriePoint[] {
  // Igual que en `buildOverview`: la serie también dibuja los cierres de la
  // Dirección. Aquí basta con admitir el rol, porque el punto solo existe si hay
  // un aliado que lo apunte.
  const closerIds = new Set(
    profiles
      .filter((p) => puedeCerrarAliados(p) && (!scopeCloserId || p.id === scopeCloserId))
      .map((p) => p.id)
  );
  const counts = new Map<string, number>();
  const porAliado = v.estadoAliado && v.estadoAliado !== "todos" ? indexByAliado(prospects || []) : null;
  const corte = Date.now() - NOVENTA_DIAS_MS;

  for (const a of profiles) {
    if (!isAliado(a) || !a.closer_origen_id || !closerIds.has(a.closer_origen_id)) continue;
    if (!pasaFiltroTipo(a, v.tipoAliado)) continue;
    if (porAliado) {
      const proyectos = porAliado.get(a.id) || [];
      const activo = proyectos.some((p) => new Date(p.created_at).getTime() >= corte);
      if (v.estadoAliado === "activos" && !activo) continue;
      if (v.estadoAliado === "sin_actividad" && proyectos.length > 0) continue;
    }
    const f = a.fecha_incorporacion_closer;
    if (!f) continue;
    if ((v.desde || v.hasta) && !inRange(f, v.desde, v.hasta)) continue;
    const key = `${a.closer_origen_id}|${bucketStart(f, grano)}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([key, aliados]) => {
      const [closer_id, periodo] = key.split("|");
      return { closer_id, periodo, aliados };
    })
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
}

/**
 * Clientes de un aliado, para el desplegable de la ficha (§14).
 * Solo lo usa la Dirección: el rol closer no recibe expedientes, únicamente
 * agregados. Ver la nota de RLS en la migración.
 */
export function clientesDeAliado(prospects: Prospect[], aliadoId: string, v: Ventana): Prospect[] {
  return activeProspects(prospects)
    .filter((p) => p.aliado_id === aliadoId)
    .filter((p) => (!v.desde && !v.hasta) || inRange(p.created_at, v.desde, v.hasta))
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
}

/** Cuántos aliados incorporó un closer dentro de una ventana concreta. */
export function contarAliadosEnVentana(profiles: UserProfile[], closerId: string, v: Ventana): number {
  return profiles.filter(
    (p) => isAliado(p) && p.closer_origen_id === closerId && inRange(p.fecha_incorporacion_closer, v.desde, v.hasta)
  ).length;
}

/** Etiqueta del tipo de aliado que se usa en tablas y filtros. */
export function tipoAliadoLabel(row: Pick<CloserAliadoRow, "aliado_tipo" | "empresa_nombre">): string {
  if (row.aliado_tipo === "lider") return "Líder de empresa";
  return row.empresa_nombre ? "Empresa" : "Independiente";
}

export { isoDay };
