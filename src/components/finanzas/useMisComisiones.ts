"use client";

// Capa de datos de «Mis comisiones»: lo que ve de Finanzas quien COBRA, no quien
// paga.
//
// Es deliberadamente un hook aparte de `useFinanzas` y no un modo suyo. Aquel
// carga el libro mayor entero —liquidaciones de todo el equipo, cortes,
// producción global, inconsistencias, bitácora, directorio— y expone catorce
// acciones de escritura. Meter aquí un `if (soyAM)` alrededor de cada bloque
// convertiría el módulo más delicado de la app en un campo de minas donde una
// condición mal puesta enseña la nómina de otro. Son dos pantallas distintas
// porque son dos permisos distintos.
//
// Toda la agregación ocurre en Postgres, en las RPC de 20260810000000, que
// filtran por `auth.uid()` por dentro y no aceptan un parámetro de usuario: el
// navegador no puede pedir la liquidación de nadie más ni aunque se lo proponga.
//
// El motor local del modo demo se reutiliza tal cual (`finanzasMetrics`): la
// previsualización sin base tiene que enseñar esta pantalla igual que las otras.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/utils/context/AppContext";
import { createClient } from "@/utils/supabase/client";
import type {
  EstadoComision,
  Grano,
  ProductoComision,
  RolBeneficiario,
  TipoEvento,
} from "./finanzasTypes";
import { inRange } from "./finanzasTypes";
import { construirEventos, demoStore, tarifasVigentes } from "./finanzasMetrics";

const n = (v: unknown): number => {
  const x = Number(v);
  return isFinite(x) ? x : 0;
};

// ---------------------------------------------------------------------------
// Filas que devuelve la base
// ---------------------------------------------------------------------------
// Coinciden columna a columna con las RPC `mis_comisiones_*`. Si cambia una,
// cambia la otra.

/** Tarjetas superiores: cuánto llevo y en qué punto está cada peso. */
export interface MiResumen {
  total_generado: number;
  total_pendiente_revision: number;
  total_aprobado: number;
  total_enviado_finanzas: number;
  total_pagado: number;
  total_pendiente_pago: number;
  total_observado: number;
  comisiones: number;
  bonos: number;
  salario: number;
  ajustes: number;
  eventos: number;
  eventos_observados: number;
  operaciones: number;
  primer_devengo: string | null;
  ultimo_devengo: string | null;
  ultimo_pago: string | null;
}

export const MI_RESUMEN_VACIO: MiResumen = {
  total_generado: 0,
  total_pendiente_revision: 0,
  total_aprobado: 0,
  total_enviado_finanzas: 0,
  total_pagado: 0,
  total_pendiente_pago: 0,
  total_observado: 0,
  comisiones: 0,
  bonos: 0,
  salario: 0,
  ajustes: 0,
  eventos: 0,
  eventos_observados: 0,
  operaciones: 0,
  primer_devengo: null,
  ultimo_devengo: null,
  ultimo_pago: null,
};

/**
 * Un movimiento propio. Es `EventoRow` sin las columnas que hablan de terceros:
 * no lleva `usuario_*` (soy yo) ni `account_manager` (el del proyecto puede ser
 * otra persona, y para un Closer eso sería información ajena).
 */
export interface MiEvento {
  id: string;
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
  corte_id: string | null;
  anulado_at: string | null;
  fecha_aprobacion: string | null;
  fecha_envio_finanzas: string | null;
  fecha_pago: string | null;
  referencia_pago: string | null;
}

export interface MiSeriePunto {
  periodo: string;
  generado: number;
  pagado: number;
  pendiente: number;
}

export interface MiConcepto {
  tipo_evento: TipoEvento;
  tipo_producto: ProductoComision | null;
  eventos: number;
  monto: number;
  pagado: number;
}

export interface MiPago {
  id: string;
  corte_id: string | null;
  monto_pagado: number;
  moneda: string;
  fecha_pago: string;
  metodo_pago: string;
  referencia_bancaria: string | null;
  comprobante_url: string | null;
  observaciones: string | null;
  created_at: string;
}

export interface MiTarifa {
  id: string;
  rol_beneficiario: RolBeneficiario;
  concepto: string;
  producto: ProductoComision | null;
  umbral_min: number;
  monto: number;
  moneda: string;
  vigente_desde: string;
  vigente_hasta: string | null;
  notas: string | null;
  vigente_hoy: boolean;
}

// ---------------------------------------------------------------------------
// Motor local (modo demo)
// ---------------------------------------------------------------------------

const COMISIONES: TipoEvento[] = [
  "comision_financiamiento",
  "comision_cierre_aliado",
  "comision_primer_financiamiento",
  "comision_aliado",
];
const BONOS: TipoEvento[] = ["bono_mensual", "bono_trimestral"];
const AJUSTES: TipoEvento[] = ["ajuste_positivo", "ajuste_negativo", "reversion"];

/** Mismas reglas que `mis_comisiones_resumen`: sin revertidos ni anulados. */
function resumenPropio(eventos: MiEvento[]): MiResumen {
  const vivos = eventos.filter((e) => e.estado !== "revertido" && !e.anulado_at);
  if (vivos.length === 0) return { ...MI_RESUMEN_VACIO };
  const suma = (pred: (e: MiEvento) => boolean) =>
    vivos.filter(pred).reduce((s, e) => s + e.monto, 0);
  const fechas = (campo: "fecha_devengo" | "fecha_pago") =>
    vivos.map((e) => e[campo]).filter(Boolean).sort() as string[];
  const devengos = fechas("fecha_devengo");
  const pagos = fechas("fecha_pago");

  return {
    total_generado: suma(() => true),
    total_pendiente_revision: suma((e) => e.estado === "pendiente_revision"),
    total_aprobado: suma((e) => e.estado === "aprobado"),
    total_enviado_finanzas: suma((e) => e.estado === "enviado_finanzas"),
    total_pagado: suma((e) => e.estado === "pagado"),
    total_pendiente_pago: suma((e) => e.estado !== "pagado"),
    total_observado: suma((e) => e.estado === "observado"),
    comisiones: suma((e) => COMISIONES.includes(e.tipo_evento)),
    bonos: suma((e) => BONOS.includes(e.tipo_evento)),
    salario: suma((e) => e.tipo_evento === "salario_fijo"),
    ajustes: suma((e) => AJUSTES.includes(e.tipo_evento)),
    eventos: vivos.length,
    eventos_observados: vivos.filter((e) => e.estado === "observado").length,
    operaciones:
      new Set(
        vivos
          .filter((e) => e.tipo_evento !== "comision_cierre_aliado")
          .map((e) => e.prospecto_id)
          .filter(Boolean)
      ).size +
      new Set(
        vivos
          .filter((e) => e.tipo_evento === "comision_cierre_aliado")
          .map((e) => e.aliado_id)
          .filter(Boolean)
      ).size,
    primer_devengo: devengos[0] ?? null,
    ultimo_devengo: devengos[devengos.length - 1] ?? null,
    ultimo_pago: pagos[pagos.length - 1] ?? null,
  };
}

function conceptosPropios(eventos: MiEvento[]): MiConcepto[] {
  const mapa = new Map<string, MiConcepto>();
  for (const e of eventos) {
    if (e.estado === "revertido" || e.anulado_at) continue;
    const clave = `${e.tipo_evento}|${e.tipo_producto ?? ""}`;
    const actual =
      mapa.get(clave) ||
      { tipo_evento: e.tipo_evento, tipo_producto: e.tipo_producto, eventos: 0, monto: 0, pagado: 0 };
    actual.eventos += 1;
    actual.monto += e.monto;
    if (e.estado === "pagado") actual.pagado += e.monto;
    mapa.set(clave, actual);
  }
  return [...mapa.values()].sort((a, b) => b.monto - a.monto);
}

// ---------------------------------------------------------------------------
// El hook
// ---------------------------------------------------------------------------

export interface UseMisComisionesArgs {
  desde: string;
  hasta: string;
  grano: Grano;
  estado: EstadoComision | null;
}

export function useMisComisiones({ desde, hasta, grano, estado }: UseMisComisionesArgs) {
  const { user, profiles, prospects, isDemoMode, isProvisionalSession } = useApp();

  const supabase = useMemo(() => {
    if (isDemoMode || isProvisionalSession) return null;
    return createClient();
  }, [isDemoMode, isProvisionalSession]);

  const isLocal = isDemoMode || isProvisionalSession || !supabase;

  // Quién tiene vista personal. Es el mismo criterio que el portero de la base
  // (`mis_comisiones_puedo_ver`), pero aquí solo sirve para no disparar seis RPC
  // que van a volver vacías: quien manda es Postgres.
  const puedeVer = user?.role === "account_manager" || user?.role === "closer";

  const [resumen, setResumen] = useState<MiResumen>({ ...MI_RESUMEN_VACIO });
  const [eventos, setEventos] = useState<MiEvento[]>([]);
  const [serie, setSerie] = useState<MiSeriePunto[]>([]);
  const [conceptos, setConceptos] = useState<MiConcepto[]>([]);
  const [pagos, setPagos] = useState<MiPago[]>([]);
  const [tarifas, setTarifas] = useState<MiTarifa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!puedeVer || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    if (isLocal) {
      // El motor local construye el libro mayor de TODOS y aquí se recorta a
      // quien mira. En producción ese recorte lo hace Postgres antes de que el
      // dato salga de la base; aquí no hay base a la que pedírselo.
      const mios = construirEventos(profiles, prospects)
        .filter((e) => e.usuario_id === user.id)
        .filter((e) => !(desde || hasta) || inRange(e.fecha_devengo, desde, hasta))
        .map(
          (e): MiEvento => ({
            id: e.id,
            rol_beneficiario: e.rol_beneficiario,
            tipo_evento: e.tipo_evento,
            tipo_producto: e.tipo_producto,
            monto: e.monto,
            moneda: e.moneda,
            produccion: e.produccion,
            fecha_devengo: e.fecha_devengo,
            periodo_corte: e.periodo_corte,
            estado: e.estado,
            motivo_observacion: e.motivo_observacion,
            observaciones: e.observaciones,
            prospecto_id: e.prospecto_id,
            cliente_nombre: e.cliente_nombre,
            aliado_id: e.aliado_id,
            aliado_nombre: e.aliado_nombre,
            corte_id: e.corte_id,
            anulado_at: e.anulado_at,
            fecha_aprobacion: e.fecha_aprobacion,
            fecha_envio_finanzas: e.fecha_envio_finanzas,
            fecha_pago: e.fecha_pago,
            referencia_pago: e.referencia_pago,
          })
        )
        .sort((a, b) => b.fecha_devengo.localeCompare(a.fecha_devengo));

      const visibles = estado ? mios.filter((e) => e.estado === estado) : mios;

      setResumen(resumenPropio(mios));
      setEventos(visibles);
      setConceptos(conceptosPropios(mios));
      setSerie(serieLocalPropia(mios, grano));
      setPagos(
        demoStore
          .pagos()
          .filter((p) => p.usuario_id === user.id)
          .filter((p) => !(desde || hasta) || inRange(p.fecha_pago, desde, hasta))
          .map((p) => ({
            id: p.id,
            corte_id: p.corte_id,
            monto_pagado: p.monto_pagado,
            moneda: p.moneda,
            fecha_pago: p.fecha_pago,
            metodo_pago: p.metodo_pago,
            referencia_bancaria: p.referencia_bancaria,
            comprobante_url: p.comprobante_url,
            observaciones: p.observaciones,
            created_at: p.created_at,
          }))
      );
      const hoy = new Date().toISOString().substring(0, 10);
      setTarifas(
        tarifasVigentes()
          .filter((t) => t.activo && t.rol_beneficiario === user.role)
          .map((t) => ({
            id: t.id,
            rol_beneficiario: t.rol_beneficiario,
            concepto: t.concepto,
            producto: t.producto,
            umbral_min: t.umbral_min,
            monto: t.monto,
            moneda: t.moneda,
            vigente_desde: t.vigente_desde,
            vigente_hasta: t.vigente_hasta,
            notas: t.notas,
            vigente_hoy: t.vigente_desde <= hoy && (!t.vigente_hasta || t.vigente_hasta >= hoy),
          }))
      );
      setLoading(false);
      return;
    }

    try {
      const args = { p_desde: desde || null, p_hasta: hasta || null };
      const [res, ev, ser, con, pag, tar] = await Promise.all([
        supabase!.rpc("mis_comisiones_resumen", args),
        supabase!.rpc("mis_comisiones_eventos", {
          ...args,
          p_estado: estado,
          p_tipo_evento: null,
          p_limite: 500,
        }),
        supabase!.rpc("mis_comisiones_serie", { ...args, p_grano: grano }),
        supabase!.rpc("mis_comisiones_por_concepto", args),
        supabase!.rpc("mis_comisiones_pagos", { ...args, p_limite: 200 }),
        supabase!.rpc("mis_comisiones_tarifas"),
      ]);

      for (const r of [res, ev, ser, con, pag, tar]) {
        if (r.error) throw r.error;
      }

      const fila = (res.data || [])[0];
      setResumen(
        fila
          ? {
              total_generado: n(fila.total_generado),
              total_pendiente_revision: n(fila.total_pendiente_revision),
              total_aprobado: n(fila.total_aprobado),
              total_enviado_finanzas: n(fila.total_enviado_finanzas),
              total_pagado: n(fila.total_pagado),
              total_pendiente_pago: n(fila.total_pendiente_pago),
              total_observado: n(fila.total_observado),
              comisiones: n(fila.comisiones),
              bonos: n(fila.bonos),
              salario: n(fila.salario),
              ajustes: n(fila.ajustes),
              eventos: n(fila.eventos),
              eventos_observados: n(fila.eventos_observados),
              operaciones: n(fila.operaciones),
              primer_devengo: fila.primer_devengo ?? null,
              ultimo_devengo: fila.ultimo_devengo ?? null,
              ultimo_pago: fila.ultimo_pago ?? null,
            }
          : { ...MI_RESUMEN_VACIO }
      );

      setEventos(
        ((ev.data || []) as any[]).map((r) => ({
          ...r,
          monto: n(r.monto),
          produccion: r.produccion === null || r.produccion === undefined ? null : n(r.produccion),
        })) as MiEvento[]
      );
      setSerie(
        ((ser.data || []) as any[]).map((r) => ({
          periodo: String(r.periodo).substring(0, 10),
          generado: n(r.generado),
          pagado: n(r.pagado),
          pendiente: n(r.pendiente),
        }))
      );
      setConceptos(
        ((con.data || []) as any[]).map((r) => ({
          tipo_evento: r.tipo_evento,
          tipo_producto: r.tipo_producto ?? null,
          eventos: n(r.eventos),
          monto: n(r.monto),
          pagado: n(r.pagado),
        }))
      );
      setPagos(
        ((pag.data || []) as any[]).map((r) => ({ ...r, monto_pagado: n(r.monto_pagado) })) as MiPago[]
      );
      setTarifas(
        ((tar.data || []) as any[]).map((r) => ({
          ...r,
          monto: n(r.monto),
          umbral_min: n(r.umbral_min),
        })) as MiTarifa[]
      );
    } catch (e: any) {
      // El error crudo de Supabase se queda en consola: al usuario se le da una
      // frase que puede accionar. Mismo criterio que `useFinanzas`.
      console.error("Error cargando mis comisiones:", e);
      setError("No se pudieron cargar tus comisiones. Vuelve a intentarlo en unos segundos.");
      setResumen({ ...MI_RESUMEN_VACIO });
      setEventos([]);
      setSerie([]);
      setConceptos([]);
      setPagos([]);
    } finally {
      setLoading(false);
    }
    // `profiles` y `prospects` solo importan en la ruta local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocal, supabase, puedeVer, user, desde, hasta, grano, estado, profiles, prospects]);

  useEffect(() => {
    load();
  }, [load]);

  return { resumen, eventos, serie, conceptos, pagos, tarifas, loading, error, isLocal, puedeVer, reload: load };
}

/** Serie propia en modo demo. En producción la agrupa Postgres. */
function serieLocalPropia(eventos: MiEvento[], grano: Grano): MiSeriePunto[] {
  const mapa = new Map<string, MiSeriePunto>();
  for (const e of eventos) {
    if (e.estado === "revertido" || e.anulado_at) continue;
    const clave = bucket(e.fecha_devengo, grano);
    const punto = mapa.get(clave) || { periodo: clave, generado: 0, pagado: 0, pendiente: 0 };
    punto.generado += e.monto;
    if (e.estado === "pagado") punto.pagado += e.monto;
    else punto.pendiente += e.monto;
    mapa.set(clave, punto);
  }
  return [...mapa.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
}

function bucket(iso: string, grano: Grano): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.substring(0, 10);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const pad = (x: number) => String(x).padStart(2, "0");
  if (grano === "anio") return `${y}-01-01`;
  if (grano === "trimestre") return `${y}-${pad(Math.floor(m / 3) * 3 + 1)}-01`;
  if (grano === "mes") return `${y}-${pad(m + 1)}-01`;
  if (grano === "semana") {
    const dow = (d.getUTCDay() + 6) % 7; // semana ISO: arranca en lunes
    return new Date(Date.UTC(y, m, day - dow)).toISOString().substring(0, 10);
  }
  return `${y}-${pad(m + 1)}-${pad(day)}`;
}
