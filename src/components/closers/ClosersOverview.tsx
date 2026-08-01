"use client";

// Vista general del módulo Closers: cuántos aliados incorporó cada uno y qué
// produjeron esos aliados.
//
// Las métricas NO se calculan aquí: llegan ya agregadas de Postgres (RPC
// `closers_overview` / `closers_serie`). El navegador solo ordena, busca y pinta.

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Calendar,
  ChevronDown,
  Download,
  Filter,
  LineChart as LineChartIcon,
  Link2,
  Percent,
  RotateCcw,
  Search,
  Target,
  TrendingUp,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import { useApp } from "@/utils/context/AppContext";
import { StatCard } from "@/components/ui/StatCard";
import { useClosers } from "./useClosers";
import { useCloserFilters } from "./closerFilters";
import { aliadosSinCloser } from "./closerMetrics";
import {
  CloserChart,
  CloserChartLegend,
  CLOSER_MUTED_VAR,
  CLOSER_VIZ_STYLE,
  colorMapFor,
  type ChartBucket,
  type ChartSeries,
} from "./CloserChart";
import {
  type CloserOverviewRow,
  type Grano,
  type RangoPreset,
  GRANO_LABEL,
  RANGO_LABEL,
  bucketFullLabel,
  bucketLabel,
  bucketStart,
  conversion,
  fmtFecha,
  fmtNum,
  fmtPct,
  nextBucket,
  promedio,
} from "./closerTypes";

type OrdenCol = "aliados" | "aliados_periodo" | "clientes" | "ventas" | "conversion" | "reciente" | "nombre";

const ORDEN_OPCIONES: { id: OrdenCol; label: string }[] = [
  { id: "aliados", label: "Más aliados" },
  { id: "aliados_periodo", label: "Más aliados del período" },
  { id: "clientes", label: "Más clientes" },
  { id: "ventas", label: "Más ventas" },
  { id: "conversion", label: "Mejor conversión" },
  { id: "reciente", label: "Incorporación más reciente" },
  { id: "nombre", label: "Nombre" },
];

const PRESETS: RangoPreset[] = ["hoy", "7d", "30d", "mes_actual", "mes_anterior", "anio_actual", "anio_anterior", "todo"];
const GRANOS: Grano[] = ["dia", "semana", "mes", "anio"];

const pill = (active: boolean) =>
  `px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
    active
      ? "bg-emerald-600 text-white shadow-sm"
      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
  }`;

const segmented = "flex items-center gap-0.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 p-0.5 ring-1 ring-inset ring-slate-200/70 dark:ring-slate-700/50";

export default function ClosersOverview() {
  const { user, profiles } = useApp();
  const { filters, setFilters, qs } = useCloserFilters();

  const { overview, serie, loading, error, reload } = useClosers({
    desde: filters.desde,
    hasta: filters.hasta,
    grano: filters.grano,
    tipoAliado: filters.tipoAliado,
    estadoAliado: filters.estadoAliado,
  });

  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<OrdenCol>("aliados");
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [rangoAbierto, setRangoAbierto] = useState(filters.preset === "personalizado");

  const puedeAdministrar = user?.role === "director";

  // ── Color estable por entidad ──────────────────────────────────────────────
  // El slot se asigna por ANTIGÜEDAD del closer, no por su posición en el
  // ranking: así, filtrar o reordenar la tabla no repinta a los que quedan.
  const colorPorCloser = useMemo(() => {
    const ids = profiles
      .filter((p) => p.role === "closer")
      .slice()
      .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "") || a.id.localeCompare(b.id))
      .map((p) => p.id);
    return colorMapFor(ids);
  }, [profiles]);

  // ── Aliados de cada closer (para la búsqueda por aliado / empresa) ─────────
  const aliadosPorCloser = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of profiles) {
      if (p.role !== "aliado" || !p.closer_origen_id) continue;
      const etiquetas = [p.full_name, p.lider_grupo || ""].filter(Boolean) as string[];
      const prev = map.get(p.closer_origen_id) || [];
      map.set(p.closer_origen_id, [...prev, ...etiquetas]);
    }
    return map;
  }, [profiles]);

  // ── Filtro por closer + búsqueda ───────────────────────────────────────────
  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return overview
      .filter((r) => filters.closers.length === 0 || filters.closers.includes(r.closer_id))
      .filter((r) => {
        if (!q) return true;
        if (r.closer_nombre.toLowerCase().includes(q)) return true;
        if ((r.closer_email || "").toLowerCase().includes(q)) return true;
        return (aliadosPorCloser.get(r.closer_id) || []).some((n) => n.toLowerCase().includes(q));
      });
  }, [overview, filters.closers, busqueda, aliadosPorCloser]);

  const filasOrdenadas = useMemo(() => {
    const conv = (r: CloserOverviewRow) => conversion(r.ventas_total, r.clientes_total) ?? -1;
    return [...filas].sort((a, b) => {
      switch (orden) {
        case "aliados_periodo":
          return b.aliados_periodo - a.aliados_periodo;
        case "clientes":
          return b.clientes_total - a.clientes_total;
        case "ventas":
          return b.ventas_total - a.ventas_total;
        case "conversion":
          return conv(b) - conv(a);
        case "reciente":
          return (b.ultimo_aliado_at || "").localeCompare(a.ultimo_aliado_at || "");
        case "nombre":
          return a.closer_nombre.localeCompare(b.closer_nombre);
        default:
          return b.aliados_total - a.aliados_total;
      }
    });
  }, [filas, orden]);

  // ── Tarjetas del §8 ────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const suma = (pick: (r: CloserOverviewRow) => number) => filas.reduce((s, r) => s + pick(r), 0);
    const noventaDias = Date.now() - 90 * 24 * 60 * 60 * 1000;
    return {
      closers: filas.length,
      // `profiles.is_active` no existe en producción, así que "activo" no puede
      // salir de una bandera: se deriva de haber incorporado a alguien hace poco.
      conActividad: filas.filter((r) => r.ultimo_aliado_at && new Date(r.ultimo_aliado_at).getTime() >= noventaDias).length,
      aliadosTotal: suma((r) => r.aliados_total),
      aliadosPeriodo: suma((r) => r.aliados_periodo),
      clientesTotal: suma((r) => r.clientes_total),
      clientesPeriodo: suma((r) => r.clientes_periodo),
      ventasTotal: suma((r) => r.ventas_total),
      ventasPeriodo: suma((r) => r.ventas_periodo),
    };
  }, [filas]);

  const conversionGeneral = conversion(kpis.ventasTotal, kpis.clientesTotal);

  // ── Gráfico ────────────────────────────────────────────────────────────────
  const { buckets, series, leyenda } = useMemo(() => {
    const visibles = new Set(filasOrdenadas.map((r) => r.closer_id));
    const puntos = serie.filter((p) => visibles.has(p.closer_id));

    if (puntos.length === 0) {
      return { buckets: [] as ChartBucket[], series: [] as ChartSeries[], leyenda: [] as any[] };
    }

    // Cubos continuos: se rellenan los períodos SIN incorporaciones, que también
    // son información (§13). El rango arranca en el filtro si lo hay.
    const isos = puntos.map((p) => p.periodo).sort();
    const primero = filters.desde ? bucketStart(`${filters.desde}T00:00:00Z`, filters.grano) : isos[0];
    const ultimo = filters.hasta ? bucketStart(`${filters.hasta}T00:00:00Z`, filters.grano) : isos[isos.length - 1];

    const listaIso: string[] = [];
    let cur = primero < isos[0] ? primero : isos[0];
    const fin = ultimo > isos[isos.length - 1] ? ultimo : isos[isos.length - 1];
    let guard = 0;
    while (cur <= fin && guard < 400) {
      listaIso.push(cur);
      cur = nextBucket(cur, filters.grano);
      guard++;
    }

    const idx = new Map(listaIso.map((iso, i) => [iso, i]));
    const bucketsOut: ChartBucket[] = listaIso.map((iso) => ({
      iso,
      label: bucketLabel(iso, filters.grano),
      full: bucketFullLabel(iso, filters.grano),
    }));

    const acumular = (filtro: (p: { closer_id: string }) => boolean) => {
      const vals = new Array(listaIso.length).fill(0);
      puntos.filter(filtro).forEach((p) => {
        const i = idx.get(p.periodo);
        if (i !== undefined) vals[i] += p.aliados;
      });
      return vals;
    };

    if (filters.consolidado) {
      const s: ChartSeries[] = [
        { id: "__total__", label: "Total consolidado", color: "var(--cl-1)", values: acumular(() => true) },
      ];
      return { buckets: bucketsOut, series: s, leyenda: [] };
    }

    const todas = filasOrdenadas.map<ChartSeries>((r) => ({
      id: r.closer_id,
      label: r.closer_nombre,
      color: colorPorCloser.get(r.closer_id) || CLOSER_MUTED_VAR,
      values: acumular((p) => p.closer_id === r.closer_id),
    }));

    const leyendaOut = todas.map((s) => ({
      id: s.id,
      label: s.label,
      color: s.color,
      total: s.values.reduce((a, b) => a + b, 0),
    }));

    return { buckets: bucketsOut, series: todas.filter((s) => !ocultas.has(s.id)), leyenda: leyendaOut };
  }, [serie, filasOrdenadas, filters.consolidado, filters.grano, filters.desde, filters.hasta, colorPorCloser, ocultas]);

  const toggleSerie = (id: string) =>
    setOcultas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleCloser = (id: string) => {
    const next = filters.closers.includes(id)
      ? filters.closers.filter((c) => c !== id)
      : [...filters.closers, id];
    setFilters({ closers: next });
  };

  // ── Aliados sin atribuir ───────────────────────────────────────────────────
  const sinCloser = useMemo(() => aliadosSinCloser(profiles), [profiles]);

  // ── Exportar CSV, respetando los filtros (§28) ─────────────────────────────
  const exportCsv = () => {
    const esc = (v: string | number) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows: (string | number)[][] = [
      [
        "Closer", "Correo", "Aliados totales", "Aliados del período", "Aliados productivos",
        "Aliados con actividad (90 d)", "Sin actividad", "Clientes generados", "Clientes del período",
        "Evaluados", "Aprobados", "Ventas", "Conversión %", "Clientes por aliado", "Último aliado incorporado",
      ],
    ];
    filasOrdenadas.forEach((r) => {
      rows.push([
        r.closer_nombre,
        r.closer_email || "",
        r.aliados_total,
        r.aliados_periodo,
        r.aliados_productivos,
        r.aliados_activos_90d,
        r.aliados_sin_actividad,
        r.clientes_total,
        r.clientes_periodo,
        r.clientes_evaluados,
        r.clientes_aprobados,
        r.ventas_total,
        (conversion(r.ventas_total, r.clientes_total) ?? 0).toFixed(1),
        (promedio(r.clientes_total, r.aliados_total) ?? 0).toFixed(2),
        r.ultimo_aliado_at ? r.ultimo_aliado_at.substring(0, 10) : "",
      ]);
    });
    const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `closers-${new Date().toISOString().substring(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const closersDisponibles = useMemo(
    () => profiles.filter((p) => p.role === "closer").sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [profiles]
  );

  // ── Estado vacío: todavía no hay closers ───────────────────────────────────
  if (!loading && !error && overview.length === 0 && closersDisponibles.length === 0) {
    return (
      <div className="closers-viz space-y-5 animate-fade-in">
        <style>{CLOSER_VIZ_STYLE}</style>
        <Encabezado onExport={null} />
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm px-6 py-16 text-center">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Target className="h-6 w-6" strokeWidth={2.2} />
          </div>
          <h3 className="mt-4 text-sm font-bold text-slate-800 dark:text-white">
            Todavía no existen closers registrados.
          </h3>
          <p className="mt-1.5 text-[12px] text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            Crea el primer usuario con rol Closer para comenzar a medir su productividad. Desde ese
            momento, cada aliado nuevo quedará atribuido a quien lo cerró.
          </p>
          {puedeAdministrar && (
            <Link
              href="/admin/usuarios"
              className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-500/20 transition-all active:scale-95"
            >
              <UserPlus className="h-4 w-4" strokeWidth={2.4} /> Crear un closer
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="closers-viz space-y-5 animate-fade-in text-slate-800 dark:text-slate-100">
      <style>{CLOSER_VIZ_STYLE}</style>

      <Encabezado onExport={filasOrdenadas.length > 0 ? exportCsv : null} />

      {error && (
        <div className="rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-[12px] font-semibold text-rose-700 dark:text-rose-300">{error}</p>
          <button
            onClick={reload}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-rose-700 dark:text-rose-300 bg-white/70 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-900 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reintentar
          </button>
        </div>
      )}

      {/* ── Fila única de filtros, encima de todo lo que acotan ─────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-3.5 space-y-3">
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

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-1 border-t border-slate-100 dark:border-slate-800">
          {/* Tipo de aliado */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">Tipo de aliado</span>
            <div className={segmented}>
              {(["todos", "independiente", "empresa", "lider"] as const).map((t) => (
                <button key={t} onClick={() => setFilters({ tipoAliado: t })} className={pill(filters.tipoAliado === t)}>
                  {t === "todos" ? "Todos" : t === "lider" ? "Líder" : t === "empresa" ? "Empresa" : "Independiente"}
                </button>
              ))}
            </div>
          </div>

          {/* Actividad del aliado */}
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500"
              title="El sistema no guarda una bandera de activo/inactivo: la actividad se deriva de si el aliado ha registrado clientes."
            >
              Actividad
            </span>
            <div className={segmented}>
              {(["todos", "activos", "sin_actividad"] as const).map((t) => (
                <button key={t} onClick={() => setFilters({ estadoAliado: t })} className={pill(filters.estadoAliado === t)}>
                  {t === "todos" ? "Todos" : t === "activos" ? "Con clientes (90 d)" : "Sin actividad"}
                </button>
              ))}
            </div>
          </div>

          {/* Selección de closers */}
          {closersDisponibles.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">Closer</span>
              <div className={`${segmented} flex-wrap`}>
                <button onClick={() => setFilters({ closers: [] })} className={pill(filters.closers.length === 0)}>
                  Todos
                </button>
                {closersDisponibles.map((c) => (
                  <button key={c.id} onClick={() => toggleCloser(c.id)} className={pill(filters.closers.includes(c.id))}>
                    {c.full_name.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Al refrescar se mantiene el render anterior en opacidad reducida: sin
          salto de layout ni parpadeo de esqueleto. */}
      <div className={loading ? "opacity-50 transition-opacity duration-200" : "transition-opacity duration-200"}>
        {/* ── Tarjetas (§8) ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          <StatCard label="Total de closers" value={kpis.closers} icon={Users} tone="slate" />
          <StatCard
            label="Con actividad"
            value={kpis.conActividad}
            sub="90 días"
            icon={Target}
            tone="emerald"
          />
          <StatCard label="Aliados incorporados" value={kpis.aliadosTotal} icon={UserPlus} tone="teal" />
          <StatCard
            label="Aliados del período"
            value={kpis.aliadosPeriodo}
            sub={RANGO_LABEL[filters.preset]}
            icon={TrendingUp}
            tone="blue"
          />
          <StatCard
            label="Clientes generados"
            value={kpis.clientesTotal}
            sub={`${kpis.clientesPeriodo} en el período`}
            icon={Users}
            tone="indigo"
          />
          <StatCard
            label="Ventas"
            value={kpis.ventasTotal}
            sub={`${kpis.ventasPeriodo} en el período`}
            icon={Target}
            tone="cyan"
          />
          <StatCard
            label="Conversión general"
            value={fmtPct(conversionGeneral)}
            sub="ventas / clientes"
            icon={Percent}
            tone="amber"
          />
        </div>

        {/* ── Gráfico (§9) ───────────────────────────────────────────────── */}
        <div className="mt-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-emerald-500/10">
                <BarChart3 className="h-4 w-4" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">
                  Aliados incorporados por closer
                </h3>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight">
                  {kpis.aliadosPeriodo} aliado(s) en el período · agrupado por {GRANO_LABEL[filters.grano].toLowerCase()}
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
              <button
                onClick={() => setFilters({ consolidado: !filters.consolidado })}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all border ${
                  filters.consolidado
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                    : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                Consolidado
              </button>
            </div>
          </div>

          <CloserChart buckets={buckets} series={series} tipo={filters.tipoGrafico} />
          {!filters.consolidado && (
            <CloserChartLegend series={leyenda} onToggle={toggleSerie} hidden={ocultas} />
          )}
        </div>

        {/* ── Tabla de rendimiento (§11) ─────────────────────────────────── */}
        <div className="mt-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-indigo-500/10">
                <Filter className="h-4 w-4" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">Rendimiento por closer</h3>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight">
                  Los mismos números del gráfico, en tabla.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Closer, correo, aliado o empresa…"
                  className="w-56 pl-8 pr-3 py-1.5 rounded-lg text-[11px] bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500"
                />
              </div>
              <div className="relative">
                <select
                  value={orden}
                  onChange={(e) => setOrden(e.target.value as OrdenCol)}
                  className="appearance-none pl-3 pr-7 py-1.5 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 outline-none focus:border-emerald-500"
                >
                  {ORDEN_OPCIONES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {filasOrdenadas.length === 0 ? (
            <div className="px-5 py-12 text-center text-[12px] font-medium text-slate-400 dark:text-slate-500">
              {overview.length === 0
                ? "No existen resultados para el período seleccionado."
                : "Ningún closer coincide con la búsqueda."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[1100px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-left">
                    {[
                      "Closer",
                      "Actividad",
                      "Aliados",
                      "Del período",
                      "Con clientes",
                      "Clientes",
                      "Evaluados",
                      "Aprobados",
                      "Ventas",
                      "Conversión",
                      "Prom. x aliado",
                      "Último aliado",
                      "",
                    ].map((h, i) => (
                      <th
                        key={h + i}
                        className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 ${
                          i >= 2 && i <= 10 ? "text-right" : ""
                        } ${i === 0 ? "pl-5" : ""} ${i === 12 ? "pr-5 text-right" : ""}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {filasOrdenadas.map((r) => {
                    const conv = conversion(r.ventas_total, r.clientes_total);
                    const prom = promedio(r.clientes_total, r.aliados_total);
                    const activo =
                      !!r.ultimo_aliado_at &&
                      new Date(r.ultimo_aliado_at).getTime() >= Date.now() - 90 * 24 * 60 * 60 * 1000;
                    return (
                      <tr key={r.closer_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors">
                        <td className="pl-5 pr-3 py-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ background: colorPorCloser.get(r.closer_id) || CLOSER_MUTED_VAR }}
                            />
                            <div className="min-w-0">
                              <Link
                                href={`/admin/closers/${r.closer_id}${qs}`}
                                className="font-bold text-slate-800 dark:text-slate-200 hover:underline truncate block max-w-[190px]"
                              >
                                {r.closer_nombre}
                              </Link>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate block max-w-[190px]">
                                {r.closer_email || "—"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              activo
                                ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            {activo ? "Activo" : "Sin movimiento"}
                          </span>
                        </td>
                        <Num v={r.aliados_total} fuerte />
                        <Num v={r.aliados_periodo} />
                        <Num v={r.aliados_activos_90d} />
                        <Num v={r.clientes_total} />
                        <Num v={r.clientes_evaluados} />
                        <Num v={r.clientes_aprobados} />
                        <Num v={r.ventas_total} fuerte />
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                          {fmtPct(conv)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                          {fmtNum(prom, 2)}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">
                          {fmtFecha(r.ultimo_aliado_at)}
                        </td>
                        <td className="pl-3 pr-5 py-2.5 text-right">
                          <Link
                            href={`/admin/closers/${r.closer_id}${qs}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-500/20 transition-all active:scale-95"
                          >
                            Ver <ArrowRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Aviso de aliados sin atribución ─────────────────────────────
            El asignador vive en su propio módulo (Asignación Closer): aquí solo
            se avisa y se enlaza, para no duplicar la misma herramienta en dos
            sitios. */}
        {sinCloser.length > 0 && (
          <div className="mt-5 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <UserX className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-[12px] text-amber-800 dark:text-amber-200 leading-relaxed flex-1">
              Hay <strong>{sinCloser.length}</strong> aliado(s) sin closer atribuido. Todo lo que produzcan
              queda fuera de estas métricas, porque no hay a quién adjudicárselo.
            </p>
            {puedeAdministrar && (
              <Link
                href="/admin/asignacion-closer"
                className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-sm transition-all active:scale-95"
              >
                <Link2 className="h-4 w-4" strokeWidth={2.4} /> Asignar closers
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Num({ v, fuerte }: { v: number; fuerte?: boolean }) {
  return (
    <td
      className={`px-3 py-2.5 text-right tabular-nums ${
        fuerte ? "font-bold text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-300"
      }`}
    >
      {v}
    </td>
  );
}

function Encabezado({ onExport }: { onExport: (() => void) | null }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white leading-tight flex items-center gap-2">
          <Target className="h-5 w-5 text-emerald-600 dark:text-emerald-400" strokeWidth={2.2} />
          Closers
        </h2>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
          Seguimiento de captación, productividad y resultados comerciales.
        </p>
      </div>
      {onExport && (
        <button
          onClick={onExport}
          className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-500/20 transition-all active:scale-95 print:hidden"
        >
          <Download className="h-4 w-4" strokeWidth={2.4} /> Exportar CSV
        </button>
      )}
    </div>
  );
}
