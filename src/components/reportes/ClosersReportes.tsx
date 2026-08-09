"use client";

// Pestaña CLOSER del módulo Reportes.
//
// QUÉ ES Y QUÉ NO ES
// Es el MISMO informe que la ficha de un closer —las cuatro tarjetas (Aliados,
// CF, CNF, PPE) y la evolución de incorporaciones— pero con un interruptor
// arriba: general (todos los closers sumados) o uno concreto.
//
// Hasta el 2026-08-09 esta pestaña embebía el tablero completo del módulo
// Closers (siete tarjetas, gráfico por closer, tabla de rendimiento y aviso de
// aliados sin atribuir). Dirección pidió quitarlo: eso ya está en el módulo
// Closers, y repetirlo aquí solo duplicaba pantalla. Lo que falte, se abre con
// el enlace al módulo, que conserva el período elegido.
//
// DE DÓNDE SALEN LOS NÚMEROS
// De las mismas RPC que la ficha, para que nunca digan algo distinto:
//   · `closers_overview` / `closers_serie` → incorporaciones por período.
//   · `closer_aliados` (una llamada por closer en pantalla) → la lista de
//     aliados, que es lo único que permite calcular CF/CNF y PPE:
//       - CF/CNF: el contrato vive en el perfil del aliado, no en el agregado.
//       - PPE: se cuentan ALIADOS con alguna venta, no ventas. `aliados_
//         productivos` del agregado NO sirve: cuenta a los que tienen clientes,
//         que es otra cosa.
// Con la Dirección incluida son cinco o seis llamadas; a cambio, la cifra del
// reporte y la de la ficha son la misma por construcción.
//
// El período viaja por la URL (`rango`/`desde`/`hasta`/`grano`), así que cambiar
// de pestaña —o saltar al módulo Closers— conserva el rango elegido.

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  Clock,
  FileCheck,
  FileWarning,
  LineChart as LineChartIcon,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { useApp } from "@/utils/context/AppContext";
import { StatCard } from "@/components/ui/StatCard";
import { useClosers } from "@/components/closers/useClosers";
import { useCloserFilters } from "@/components/closers/closerFilters";
import {
  CloserChart,
  CLOSER_VIZ_STYLE,
  type ChartBucket,
  type ChartSeries,
} from "@/components/closers/CloserChart";
import {
  type CloserAliadoRow,
  type Grano,
  type RangoPreset,
  GRANO_LABEL,
  RANGO_LABEL,
  bucketFullLabel,
  bucketLabel,
  bucketStart,
  fmtFecha,
  fmtPct,
  nextBucket,
  periodoAnterior,
  variacion,
} from "@/components/closers/closerTypes";
import { segmented, pill } from "./ReportesCharts";

const PRESETS: RangoPreset[] = ["hoy", "7d", "30d", "mes_actual", "mes_anterior", "anio_actual", "anio_anterior", "todo"];
const GRANOS: Grano[] = ["dia", "semana", "mes", "anio"];

export function ClosersReportes({ qs }: { qs: string }) {
  const { profiles } = useApp();
  const { filters, setFilters } = useCloserFilters();

  // Tipo de aliado y actividad se fijan en "todos" a propósito: esta pestaña ya
  // no tiene esas botoneras (viven en el módulo Closers) y, si se heredaran de
  // la URL, acotarían el agregado pero no la lista de aliados —que es de donde
  // salen CF/CNF/PPE—, así que las tarjetas y el gráfico se contradirían.
  const { overview, serie, loading, error, fetchAliados, fetchOverviewEn } = useClosers({
    desde: filters.desde,
    hasta: filters.hasta,
    grano: filters.grano,
    tipoAliado: "todos",
    estadoAliado: "todos",
  });

  const [rangoAbierto, setRangoAbierto] = useState(filters.preset === "personalizado");

  // La botonera se construye con las filas del agregado, no con
  // `profiles.role === 'closer'`: desde 20260804000001 la Dirección también
  // cierra aliados, y filtrando por rol se quedaría fuera justo quien más tiene.
  const entidades = useMemo(
    () => [...overview].sort((a, b) => a.closer_nombre.localeCompare(b.closer_nombre)),
    [overview]
  );

  // Selección de UNO (o ninguno = general). El filtro de la URL es una lista
  // porque el módulo Closers admite comparar varios; aquí se respeta lo que
  // venga, pero los botones seleccionan de a uno.
  const seleccion = useMemo(() => new Set(filters.closers), [filters.closers]);
  const filas = useMemo(
    () => (seleccion.size === 0 ? entidades : entidades.filter((e) => seleccion.has(e.closer_id))),
    [entidades, seleccion]
  );
  const unico = filas.length === 1 && seleccion.size > 0 ? filas[0] : null;

  // Clave estable de la selección: evita relanzar las consultas en cada render
  // solo porque `filas` es un array nuevo.
  const idsFilas = useMemo(() => filas.map((f) => f.closer_id).join(","), [filas]);

  // ── Aliados de los closers en pantalla ─────────────────────────────────────
  const [aliados, setAliados] = useState<CloserAliadoRow[]>([]);
  const [cargandoAliados, setCargandoAliados] = useState(true);

  useEffect(() => {
    let vivo = true;
    const ids = idsFilas ? idsFilas.split(",") : [];
    if (ids.length === 0) {
      setAliados([]);
      setCargandoAliados(false);
      return;
    }
    setCargandoAliados(true);
    // Un aliado pertenece a un solo closer (`closer_origen_id`), así que juntar
    // las listas no duplica a nadie.
    Promise.all(ids.map((id) => fetchAliados(id).catch(() => [] as CloserAliadoRow[])))
      .then((listas) => {
        if (vivo) setAliados(listas.flat());
      })
      .finally(() => {
        if (vivo) setCargandoAliados(false);
      });
    return () => {
      vivo = false;
    };
  }, [idsFilas, fetchAliados]);

  // El contrato no viene de la RPC (que agrega números) sino del perfil del
  // aliado, que la Dirección ya lee por RLS.
  const contratoPorAliado = useMemo(() => {
    const m = new Map<string, string | null>();
    profiles.forEach((p) => m.set(p.id, p.contrato_url || null));
    return m;
  }, [profiles]);

  // ── Las cuatro tarjetas, idénticas a las de la ficha ───────────────────────
  //   · Aliados  → creados por el closer MÁS los que le atribuyeron.
  //   · CF / CNF → contrato firmado / sin firmar; se reparten el total.
  //   · PPE      → primer proyecto ejecutado. Un aliado con cuatro
  //                financiamientos cuenta UNO, que es lo que Finanzas paga.
  const resumen = useMemo(() => {
    const total = aliados.length;
    const cf = aliados.filter((a) => !!contratoPorAliado.get(a.aliado_id)).length;
    return { total, cf, cnf: total - cf, ppe: aliados.filter((a) => a.ventas > 0).length };
  }, [aliados, contratoPorAliado]);

  const aliadosPeriodo = useMemo(() => filas.reduce((s, r) => s + r.aliados_periodo, 0), [filas]);
  const ultimoAliado = useMemo(
    () => filas.reduce<string | null>((max, r) => (r.ultimo_aliado_at && (!max || r.ultimo_aliado_at > max) ? r.ultimo_aliado_at : max), null),
    [filas]
  );

  // ── Comparativa con el período inmediatamente anterior ─────────────────────
  const previo = useMemo(() => periodoAnterior(filters.desde, filters.hasta), [filters.desde, filters.hasta]);
  const [aliadosPrevios, setAliadosPrevios] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    if (!previo || !idsFilas) {
      setAliadosPrevios(null);
      return;
    }
    const ids = new Set(idsFilas.split(","));
    fetchOverviewEn(previo.desde, previo.hasta).then((rows) => {
      if (!vivo) return;
      setAliadosPrevios(rows.filter((r) => ids.has(r.closer_id)).reduce((s, r) => s + r.aliados_periodo, 0));
    });
    return () => {
      vivo = false;
    };
  }, [previo, fetchOverviewEn, idsFilas]);

  const varPct = aliadosPrevios !== null ? variacion(aliadosPeriodo, aliadosPrevios) : null;

  // ── Gráfico: una sola serie, sea un closer o la suma de todos ──────────────
  // Los cubos son continuos: los períodos sin incorporaciones también informan.
  const { buckets, series } = useMemo(() => {
    const vacio = { buckets: [] as ChartBucket[], series: [] as ChartSeries[] };
    const ids = new Set(idsFilas ? idsFilas.split(",") : []);
    const puntos = serie.filter((p) => ids.has(p.closer_id));
    if (puntos.length === 0 && !filters.desde) return vacio;

    const isos = puntos.map((p) => p.periodo).sort();
    const inicio = filters.desde ? bucketStart(`${filters.desde}T00:00:00Z`, filters.grano) : isos[0];
    const fin = filters.hasta ? bucketStart(`${filters.hasta}T00:00:00Z`, filters.grano) : isos[isos.length - 1];
    if (!inicio || !fin) return vacio;

    const lista: string[] = [];
    let cur = inicio;
    let guard = 0;
    while (cur <= fin && guard < 400) {
      lista.push(cur);
      cur = nextBucket(cur, filters.grano);
      guard++;
    }
    const idx = new Map(lista.map((iso, i) => [iso, i]));
    const values = new Array(lista.length).fill(0);
    puntos.forEach((p) => {
      const i = idx.get(p.periodo);
      if (i !== undefined) values[i] += p.aliados;
    });

    return {
      buckets: lista.map((iso) => ({
        iso,
        label: bucketLabel(iso, filters.grano),
        full: bucketFullLabel(iso, filters.grano),
      })),
      series: [
        {
          id: "__closers__",
          label: unico ? unico.closer_nombre : "Todos los closers",
          color: "var(--cl-1)",
          values,
        },
      ],
    };
  }, [serie, idsFilas, filters.desde, filters.hasta, filters.grano, unico]);

  const seleccionarCloser = (id: string) =>
    setFilters({ closers: filters.closers.length === 1 && filters.closers[0] === id ? [] : [id] });

  const atenuado = loading || cargandoAliados;

  return (
    <div className="closers-viz space-y-5 animate-fade-in text-slate-800 dark:text-slate-100">
      <style>{CLOSER_VIZ_STYLE}</style>

      {/* ── Filtros: solo período y a quién se mide ─────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-3.5 space-y-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 pr-1">
            <Calendar className="h-3.5 w-3.5" /> Período
          </span>
          <div className={`${segmented} flex-wrap`}>
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => {
                  setRangoAbierto(false);
                  setFilters({ preset: p });
                }}
                className={pill(filters.preset === p)}
              >
                {RANGO_LABEL[p]}
              </button>
            ))}
            <button
              onClick={() => {
                setRangoAbierto((v) => !v);
                if (filters.preset !== "personalizado") setFilters({ preset: "personalizado" });
              }}
              className={pill(filters.preset === "personalizado")}
            >
              {RANGO_LABEL.personalizado}
            </button>
          </div>
        </div>

        {rangoAbierto && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/70 dark:border-slate-800 p-3">
            <label className="flex flex-col gap-1">
              <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Desde</span>
              <input
                type="date"
                value={filters.desde}
                onChange={(e) => setFilters({ preset: "personalizado", desde: e.target.value })}
                className="px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Hasta</span>
              <input
                type="date"
                value={filters.hasta}
                onChange={(e) => setFilters({ preset: "personalizado", hasta: e.target.value })}
                className="px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500"
              />
            </label>
          </div>
        )}

        {entidades.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 pr-1">
              Closer
            </span>
            <div className={`${segmented} flex-wrap`}>
              <button onClick={() => setFilters({ closers: [] })} className={pill(seleccion.size === 0)}>
                General
              </button>
              {entidades.map((e) => (
                <button key={e.closer_id} onClick={() => seleccionarCloser(e.closer_id)} className={pill(seleccion.has(e.closer_id))}>
                  {e.closer_nombre}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-3">
          <p className="text-[12px] font-semibold text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      {/* ── Encabezado del informe: a quién se está mirando ─────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center text-lg font-black shrink-0 overflow-hidden">
          {unico?.closer_avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={unico.closer_avatar_url} alt={unico.closer_nombre} className="h-full w-full object-cover" />
          ) : unico ? (
            unico.closer_nombre.charAt(0)
          ) : (
            <Target className="h-5 w-5" strokeWidth={2.4} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white leading-tight truncate">
            {unico ? unico.closer_nombre : "Todos los closers"}
          </h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {unico ? (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5 text-emerald-500" /> Closer
                </span>
                <span>{unico.closer_email || "—"}</span>
                {unico.closer_telefono && <span>{unico.closer_telefono}</span>}
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Alta {fmtFecha(unico.closer_created_at)}
                </span>
              </>
            ) : (
              <span>
                {filas.length} closer(s) sumados · {RANGO_LABEL[filters.preset].toLowerCase()}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-4">
          <div className="text-right">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Último aliado
            </span>
            <span className="block text-sm font-bold tabular-nums text-slate-800 dark:text-white">
              {fmtFecha(ultimoAliado)}
            </span>
          </div>
          <Link
            href={unico ? `/admin/closers/${unico.closer_id}${qs}` : `/admin/closers${qs}`}
            className="print:hidden shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95"
          >
            {unico ? "Ver ficha completa" : "Abrir el módulo Closers"} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Documentación pendiente: es lo que frena el pago de comisiones. */}
      {resumen.cnf > 0 && !cargandoAliados && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <p className="text-[12px] text-amber-800 dark:text-amber-300">
            <strong>
              {resumen.cnf} {resumen.cnf === 1 ? "aliado no tiene" : "aliados no tienen"} contrato registrado.
            </strong>{" "}
            Al pagar comisiones se revisa que la documentación esté completa. No impide operar, pero conviene
            completarlo antes del siguiente corte.
          </p>
        </div>
      )}

      {!loading && entidades.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm px-6 py-14 text-center">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            Todavía no hay closers con aliados incorporados.
          </p>
        </div>
      ) : (
        <div className={atenuado ? "opacity-50 transition-opacity duration-200 space-y-5" : "transition-opacity duration-200 space-y-5"}>
          {/* ── Las cuatro tarjetas ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Aliados" value={resumen.total} sub="creados y asignados" icon={Users} tone="teal" />
            <StatCard label="Aliados CF" value={resumen.cf} sub="contrato firmado" icon={FileCheck} tone="emerald" />
            <StatCard label="Aliados CNF" value={resumen.cnf} sub="contrato no firmado" icon={FileWarning} tone="amber" />
            <StatCard
              label="PPE — primer proyecto ejecutado"
              value={resumen.ppe}
              sub={resumen.total > 0 ? `de ${resumen.total} aliados` : "uno por aliado"}
              icon={Target}
              tone="blue"
            />
          </div>

          {/* ── Evolución de incorporaciones ────────────────────────────── */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-emerald-500/10">
                  <BarChart3 className="h-4 w-4" strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">
                    Evolución de aliados incorporados
                  </h3>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight">
                    {unico ? unico.closer_nombre : "Todos los closers"} · agrupado por{" "}
                    {GRANO_LABEL[filters.grano].toLowerCase()}.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <div className={segmented}>
                  {GRANOS.map((g) => (
                    <button key={g} onClick={() => setFilters({ grano: g })} className={pill(filters.grano === g)}>
                      {GRANO_LABEL[g]}
                    </button>
                  ))}
                </div>
                <div className={segmented}>
                  <button onClick={() => setFilters({ tipoGrafico: "barras" })} className={pill(filters.tipoGrafico === "barras")}>
                    <BarChart3 className="h-3.5 w-3.5 inline -mt-0.5 mr-1" /> Barras
                  </button>
                  <button onClick={() => setFilters({ tipoGrafico: "lineas" })} className={pill(filters.tipoGrafico === "lineas")}>
                    <LineChartIcon className="h-3.5 w-3.5 inline -mt-0.5 mr-1" /> Líneas
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px]">
              <span className="text-slate-500 dark:text-slate-400">
                Aliados en el período:{" "}
                <strong className="text-slate-900 dark:text-white tabular-nums">{aliadosPeriodo}</strong>
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                Período anterior:{" "}
                <strong className="text-slate-900 dark:text-white tabular-nums">
                  {aliadosPrevios === null ? "—" : aliadosPrevios}
                </strong>
              </span>
              <span className="inline-flex items-center gap-1.5">
                {varPct === null ? (
                  <span className="text-slate-400 dark:text-slate-500">Sin base de comparación</span>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1 font-bold tabular-nums ${
                      varPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {varPct >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {varPct >= 0 ? "+" : ""}
                    {fmtPct(varPct)}
                  </span>
                )}
              </span>
            </div>

            <CloserChart buckets={buckets} series={series} tipo={filters.tipoGrafico} />
          </div>
        </div>
      )}
    </div>
  );
}
