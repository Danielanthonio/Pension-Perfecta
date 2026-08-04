"use client";

// Ficha individual de un closer: sus métricas, su evolución, los aliados que
// incorporó (desplegables hasta el cliente) y el embudo que generaron.
//
// La ve la Dirección para auditar, y el propio closer para medirse. La diferencia
// es deliberada y está en un solo sitio: `puedeVerExpedientes`. Un closer NO
// recibe la lista de clientes con su PII —la base tampoco se la daría: no tiene
// política de lectura sobre `prospects`—, solo los agregados.

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  BarChart3,
  FileCheck,
  FileText,
  FileWarning,
  ChevronRight,
  Clock,
  History,
  Key,
  LineChart as LineChartIcon,
  Loader2,
  Lock,
  Pencil,
  Route,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { useApp } from "@/utils/context/AppContext";
import { StatCard } from "@/components/ui/StatCard";
import { useClosers } from "./useClosers";
import { useCloserFilters } from "./closerFilters";
import { clientesDeAliado, tipoAliadoLabel } from "./closerMetrics";
import { CloserChart, CLOSER_VIZ_STYLE, type ChartBucket, type ChartSeries } from "./CloserChart";
import { ReasignarCloser } from "./ReasignarCloser";
import { AltaAliadoCloser } from "./AltaAliadoCloser";
import { EditarAliadoCloser } from "./EditarAliadoCloser";
import { CredencialesAliado } from "./CredencialesAliado";
import { EliminarAliadoCloser } from "./EliminarAliadoCloser";
import {
  type CloserAliadoRow,
  type CloserAsignacion,
  type Grano,
  GRANO_LABEL,
  bucketFullLabel,
  bucketLabel,
  bucketStart,
  conversion,
  fmtFecha,
  fmtPct,
  nextBucket,
  periodoAnterior,
  variacion,
} from "./closerTypes";

const GRANOS: Grano[] = ["dia", "semana", "mes", "anio"];

// Cabecera de la tabla de aliados. En lista con alineación explícita en vez de
// por índice: cada columna nueva desplazaba los rangos y rompía el alineado.
const COLUMNAS: { label: string; align?: "right" }[] = [
  { label: "Aliado" },
  { label: "Tipo" },
  { label: "Empresa" },
  { label: "Incorporación" },
  { label: "Contrato" },
  { label: "Actividad" },
  { label: "Clientes", align: "right" },
  { label: "En proceso", align: "right" },
  { label: "Ventas", align: "right" },
  { label: "Conversión", align: "right" },
  { label: "Último cliente" },
  { label: "" },
];

const pill = (active: boolean) =>
  `px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
    active
      ? "bg-emerald-600 text-white shadow-sm"
      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
  }`;

const segmented =
  "flex items-center gap-0.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 p-0.5 ring-1 ring-inset ring-slate-200/70 dark:ring-slate-700/50";

export default function CloserDetail({ closerId }: { closerId: string }) {
  const { user, profiles, prospects, assignCloser } = useApp();
  const { filters, setFilters, qs } = useCloserFilters();

  const { overview, serie, loading, error, reload, fetchAliados, fetchHistorial, fetchOverviewEn } = useClosers({
    desde: filters.desde,
    hasta: filters.hasta,
    grano: filters.grano,
    tipoAliado: filters.tipoAliado,
    estadoAliado: filters.estadoAliado,
  });

  const esDireccion = user?.role === "director";
  // Solo la Dirección abre expedientes. Para el rol closer, `prospects` llega
  // vacío del contexto y la base tampoco se los daría.
  const puedeVerExpedientes = esDireccion;
  // Su producción se genera aquí: el alta de un aliado ES la venta del closer.
  // La Dirección también puede darlo de alta desde la ficha, y entonces queda
  // acreditado a ese closer (no a ella).
  const esMiFicha = user?.role === "closer" && user?.id === closerId;
  const puedeDarDeAlta = esMiFicha || esDireccion;
  // Administrar = corregir el nombre y el teléfono, cargar el contrato, ver las
  // credenciales y dar de baja. Desde el 2026-08-04 el alcance del closer NO es
  // "los aliados que tengo atribuidos" sino "los que YO di de alta" (§8/§9):
  // un aliado que abrió el AM y le atribuyeron después lo ve y le trabaja el
  // proceso comercial, pero no lo administra. La base impone lo mismo en
  // `closer_actualiza_aliado`, `credenciales_aliado` y /api/admin/delete-user;
  // esto es solo la pantalla.
  const puedeAdministrar = (a: CloserAliadoRow) => esDireccion || (esMiFicha && a.creado_por_mi);

  const closer = useMemo(() => profiles.find((p) => p.id === closerId) || null, [profiles, closerId]);
  const fila = useMemo(() => overview.find((r) => r.closer_id === closerId) || null, [overview, closerId]);

  const [aliados, setAliados] = useState<CloserAliadoRow[]>([]);
  const [cargandoAliados, setCargandoAliados] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [historial, setHistorial] = useState<CloserAsignacion[]>([]);
  const [reasignando, setReasignando] = useState<CloserAliadoRow | null>(null);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [viendoCredenciales, setViendoCredenciales] = useState<CloserAliadoRow | null>(null);
  const [eliminando, setEliminando] = useState<CloserAliadoRow | null>(null);
  const [editando, setEditando] = useState<CloserAliadoRow | null>(null);
  const [aliadosPrevios, setAliadosPrevios] = useState<number | null>(null);

  const recargarAliados = React.useCallback(async () => {
    setCargandoAliados(true);
    try {
      setAliados(await fetchAliados(closerId));
    } catch (e) {
      console.error(e);
      setAliados([]);
    } finally {
      setCargandoAliados(false);
    }
  }, [fetchAliados, closerId]);

  useEffect(() => {
    recargarAliados();
  }, [recargarAliados]);

  // El historial solo lo muestra la Dirección: si lo pide un closer, el viaje de
  // red se gasta para nada.
  useEffect(() => {
    if (!esDireccion) return;
    fetchHistorial().then((h) => setHistorial(h.filter((r) => r.closer_nuevo_id === closerId || r.closer_anterior_id === closerId)));
  }, [fetchHistorial, closerId, esDireccion]);

  // Comparativa con el período INMEDIATAMENTE anterior y del mismo largo (§13).
  const previo = useMemo(() => periodoAnterior(filters.desde, filters.hasta), [filters.desde, filters.hasta]);
  useEffect(() => {
    let vivo = true;
    if (!previo) {
      setAliadosPrevios(null);
      return;
    }
    fetchOverviewEn(previo.desde, previo.hasta).then((rows) => {
      if (!vivo) return;
      setAliadosPrevios(rows.find((r) => r.closer_id === closerId)?.aliados_periodo ?? 0);
    });
    return () => {
      vivo = false;
    };
  }, [previo, fetchOverviewEn, closerId]);

  // ── Gráfico de evolución ───────────────────────────────────────────────────
  const { buckets, series } = useMemo(() => {
    const puntos = serie.filter((p) => p.closer_id === closerId);
    if (puntos.length === 0 && !filters.desde) {
      return { buckets: [] as ChartBucket[], series: [] as ChartSeries[] };
    }
    const isos = puntos.map((p) => p.periodo).sort();
    const inicio = filters.desde ? bucketStart(`${filters.desde}T00:00:00Z`, filters.grano) : isos[0];
    const fin = filters.hasta ? bucketStart(`${filters.hasta}T00:00:00Z`, filters.grano) : isos[isos.length - 1];
    if (!inicio || !fin) return { buckets: [] as ChartBucket[], series: [] as ChartSeries[] };

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
      // Una sola serie: sin leyenda, el título ya la nombra.
      series: [{ id: closerId, label: closer?.full_name || "Closer", color: "var(--cl-1)", values }],
    };
  }, [serie, closerId, filters.desde, filters.hasta, filters.grano, closer?.full_name]);

  // ── Aliados filtrados en pantalla (tipo / actividad) ───────────────────────
  const aliadosVisibles = useMemo(() => {
    return aliados.filter((a) => {
      if (filters.tipoAliado !== "todos") {
        const tipo = a.aliado_tipo === "lider" ? "lider" : a.empresa_nombre ? "empresa" : "independiente";
        if (tipo !== filters.tipoAliado) return false;
      }
      if (filters.estadoAliado === "activos" && a.clientes_90d === 0) return false;
      if (filters.estadoAliado === "sin_actividad" && a.clientes_total > 0) return false;
      return true;
    });
  }, [aliados, filters.tipoAliado, filters.estadoAliado]);

  const ocultos = aliados.length - aliadosVisibles.length;

  // El contrato no viene del RPC (que agrega números) sino del perfil del aliado,
  // que tanto la Dirección como el closer ya pueden leer por RLS.
  const contratoPorAliado = useMemo(() => {
    const m = new Map<string, string | null>();
    profiles.forEach((p) => m.set(p.id, p.contrato_url || null));
    return m;
  }, [profiles]);

  // ── Las cuatro métricas de la ficha (§12) ─────────────────────────────────
  // Salen de la LISTA de aliados, no del agregado de `closers_overview`, por dos
  // motivos: el contrato vive en el perfil del aliado (no en las métricas), y así
  // las tarjetas nunca contradicen a la tabla de abajo cuando hay filtros activos.
  //
  //   · Aliados      → los que el closer creó MÁS los que le atribuyeron la
  //                    Dirección o un AM; ambos casos fijan `closer_origen_id`,
  //                    que es lo que ancla esta lista.
  //   · CF / CNF     → contrato firmado / sin firmar. Se reparten el total: un
  //                    aliado está en una tarjeta o en la otra, nunca en las dos.
  //   · PPE          → primer proyecto ejecutado. Se cuentan ALIADOS, no
  //                    proyectos: si un aliado ejecuta cuatro financiamientos, al
  //                    closer se le paga UNO. Por eso basta con "¿este aliado ya
  //                    ejecutó alguno?" en vez de sumar ventas. Es la misma regla
  //                    que aplica Finanzas, que devenga una sola comisión por
  //                    aliado con la clave `1fin:<aliado_id>` (§18 del ledger).
  const resumen = useMemo(() => {
    const total = aliadosVisibles.length;
    const cf = aliadosVisibles.filter((a) => !!contratoPorAliado.get(a.aliado_id)).length;
    return {
      total,
      cf,
      cnf: total - cf,
      ppe: aliadosVisibles.filter((a) => a.ventas > 0).length,
    };
  }, [aliadosVisibles, contratoPorAliado]);

  const sinContrato = resumen.cnf;

  // ── Embudo (§16) ──────────────────────────────────────────────────────────
  const embudo = useMemo(() => {
    if (!fila) return [];
    const base = fila.clientes_periodo;
    const etapas = [
      { label: "Clientes ingresados", value: base, bar: "bg-sky-500" },
      { label: "Evaluados", value: fila.clientes_evaluados, bar: "bg-blue-500" },
      { label: "Aprobados", value: fila.clientes_aprobados, bar: "bg-emerald-500" },
      { label: "Fin. Otorgado (ventas)", value: fila.ventas_periodo, bar: "bg-teal-500" },
    ];
    return etapas.map((e, i) => ({
      ...e,
      pctTotal: base > 0 ? (e.value / base) * 100 : 0,
      // Conversión respecto de la etapa anterior, no del total.
      pctPrev: i === 0 ? null : etapas[i - 1].value > 0 ? (e.value / etapas[i - 1].value) * 100 : null,
    }));
  }, [fila]);

  const closersDisponibles = useMemo(
    () => profiles.filter((p) => p.role === "closer").sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [profiles]
  );

  const nombrePorId = useMemo(() => new Map(profiles.map((p) => [p.id, p.full_name])), [profiles]);

  if (!loading && !closer && !fila) {
    return (
      <div className="space-y-4">
        <Volver qs={qs} />
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm px-6 py-14 text-center">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Este closer no existe o no tienes permiso para verlo.</p>
        </div>
      </div>
    );
  }

  const varPct = aliadosPrevios !== null && fila ? variacion(fila.aliados_periodo, aliadosPrevios) : null;
  // Las tarjetas dependen de la lista de aliados, así que se atenúan también
  // mientras esa lista viaja: si no, se ven cuatro ceros y luego el salto.
  const atenuado = loading || cargandoAliados;

  return (
    <div className="closers-viz space-y-5 animate-fade-in text-slate-800 dark:text-slate-100">
      <style>{CLOSER_VIZ_STYLE}</style>

      {esDireccion && <Volver qs={qs} />}

      {/* ── Encabezado de la ficha (§12) ────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center text-xl font-black shrink-0 overflow-hidden">
          {closer?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={closer.avatar_url} alt={closer.full_name} className="h-full w-full object-cover" />
          ) : (
            (fila?.closer_nombre || closer?.full_name || "?").charAt(0)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white leading-tight truncate">
            {fila?.closer_nombre || closer?.full_name}
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-emerald-500" /> Closer
            </span>
            <span>{fila?.closer_email || closer?.email || "—"}</span>
            {(fila?.closer_telefono || closer?.phone) && <span>{fila?.closer_telefono || closer?.phone}</span>}
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Alta {fmtFecha(fila?.closer_created_at || closer?.created_at)}
            </span>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-4">
          <div className="text-right">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Último aliado
            </span>
            <span className="block text-sm font-bold tabular-nums text-slate-800 dark:text-white">
              {fmtFecha(fila?.ultimo_aliado_at)}
            </span>
          </div>
          {puedeDarDeAlta && (
            <button
              onClick={() => setAltaAbierta(true)}
              className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white font-bold rounded-xl text-[11px] shadow-md shadow-emerald-500/10 transition-all active:scale-95 flex items-center gap-1.5 whitespace-nowrap"
            >
              <UserPlus className="h-3.5 w-3.5" strokeWidth={2.4} />
              Nuevo aliado
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-3">
          <p className="text-[12px] font-semibold text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      {/* Documentación pendiente. Sale arriba porque es lo que va a frenar el
          pago, y aparece sobre todo con los aliados anteriores a la regla. */}
      {sinContrato > 0 && !cargandoAliados && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <p className="text-[12px] text-amber-800 dark:text-amber-300">
            <strong>
              {sinContrato} {sinContrato === 1 ? "aliado no tiene" : "aliados no tienen"} contrato registrado.
            </strong>{" "}
            Al pagar comisiones se revisa que la documentación esté completa. No impide operar, pero conviene
            completarlo antes del siguiente corte.
          </p>
        </div>
      )}

      <div className={atenuado ? "opacity-50 transition-opacity duration-200 space-y-5" : "transition-opacity duration-200 space-y-5"}>
        {/* ── Tarjetas de métricas (§12) ────────────────────────────────── */}
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

        {/* ── Evolución (§13) ───────────────────────────────────────────── */}
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
                  Agrupado por {GRANO_LABEL[filters.grano].toLowerCase()}.
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

          {/* Indicadores sobre el gráfico */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px]">
            <span className="text-slate-500 dark:text-slate-400">
              Aliados en el período:{" "}
              <strong className="text-slate-900 dark:text-white tabular-nums">{fila?.aliados_periodo ?? 0}</strong>
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

        {/* ── Embudo comercial (§16) ────────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="h-8 w-8 rounded-lg bg-violet-50 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-violet-500/10">
              <Route className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">
                Embudo de los clientes que generó
              </h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight">
                Mismas etapas que el pipeline comercial, acotadas a los aliados de este closer.
              </p>
            </div>
          </div>

          {(fila?.clientes_periodo ?? 0) === 0 ? (
            <p className="py-10 text-center text-[12px] font-medium text-slate-400 dark:text-slate-500">
              Los aliados de este closer todavía no han registrado clientes en el período.
            </p>
          ) : (
            <div className="space-y-2.5">
              {embudo.map((e) => (
                <div key={e.label} className="flex items-center gap-3">
                  <span className="w-44 shrink-0 text-[11px] font-semibold text-slate-600 dark:text-slate-300 truncate">
                    {e.label}
                  </span>
                  <div className="flex-1 h-5 rounded-md bg-slate-100 dark:bg-slate-800/50 overflow-hidden min-w-0">
                    <div
                      className={`h-full rounded-md ${e.bar} transition-all duration-500`}
                      style={{ width: `${e.value > 0 ? Math.max(e.pctTotal, 4) : 0}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-sm font-bold tabular-nums text-slate-900 dark:text-white shrink-0">
                    {e.value}
                  </span>
                  <span className="w-14 text-right text-[10px] tabular-nums text-slate-400 dark:text-slate-500 shrink-0">
                    {e.pctTotal.toFixed(0)}%
                  </span>
                  <span className="w-24 text-right text-[10px] tabular-nums text-slate-400 dark:text-slate-500 shrink-0">
                    {e.pctPrev === null ? "" : `↳ ${e.pctPrev.toFixed(0)}% de la anterior`}
                  </span>
                </div>
              ))}
              <div className="pt-2 mt-1 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px]">
                <span className="text-slate-500 dark:text-slate-400">
                  Condicionados:{" "}
                  <strong className="tabular-nums text-slate-800 dark:text-slate-100">{fila?.clientes_condicionados ?? 0}</strong>
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  Rechazados:{" "}
                  <strong className="tabular-nums text-slate-800 dark:text-slate-100">{fila?.clientes_rechazados ?? 0}</strong>
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  Cerrados perdidos:{" "}
                  <strong className="tabular-nums text-slate-800 dark:text-slate-100">{fila?.clientes_perdidos ?? 0}</strong>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Aliados incorporados (§14) ────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-teal-500/10">
                <UserPlus className="h-4 w-4" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">Aliados incorporados</h3>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight">
                  {aliadosVisibles.length} aliado(s)
                  {ocultos > 0 ? ` · ${ocultos} oculto(s) por los filtros` : ""}
                  {puedeVerExpedientes ? " · toca una fila para ver sus clientes" : ""}
                </p>
              </div>
            </div>
          </div>

          {cargandoAliados ? (
            <div className="px-5 py-10 flex items-center justify-center gap-2 text-[12px] text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando aliados…
            </div>
          ) : aliadosVisibles.length === 0 ? (
            <p className="px-5 py-12 text-center text-[12px] font-medium text-slate-400 dark:text-slate-500">
              {aliados.length === 0
                ? "Este closer todavía no tiene aliados incorporados."
                : "Ningún aliado coincide con los filtros seleccionados."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[1080px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-left">
                    {COLUMNAS.map((c, i) => (
                      <th
                        key={c.label + i}
                        className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 ${
                          c.align === "right" ? "text-right" : ""
                        } ${i === 0 ? "pl-5" : ""} ${i === COLUMNAS.length - 1 ? "pr-5 text-right" : ""}`}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {aliadosVisibles.map((a) => {
                    const abierto = expandido === a.aliado_id;
                    const conv = conversion(a.ventas, a.clientes_total);
                    const clientes = abierto && puedeVerExpedientes
                      ? clientesDeAliado(prospects, a.aliado_id, { desde: filters.desde, hasta: filters.hasta })
                      : [];
                    return (
                      <React.Fragment key={a.aliado_id}>
                        <tr
                          className={`transition-colors ${
                            puedeVerExpedientes ? "cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-800/20" : ""
                          } ${abierto ? "bg-slate-50 dark:bg-slate-800/30" : ""}`}
                          onClick={puedeVerExpedientes ? () => setExpandido(abierto ? null : a.aliado_id) : undefined}
                        >
                          <td className="pl-5 pr-3 py-2.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {puedeVerExpedientes && (
                                <ChevronRight
                                  className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${abierto ? "rotate-90" : ""}`}
                                />
                              )}
                              <div className="min-w-0">
                                <span className="flex items-center gap-1.5 min-w-0">
                                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[180px]">
                                    {a.aliado_nombre}
                                  </span>
                                  {/* Quién abrió la cuenta cambia lo que se puede
                                      hacer con ella, así que se dice en la fila y
                                      no solo en el hueco donde faltan botones. */}
                                  {!a.creado_por_mi && (
                                    <span
                                      className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                                      title="Esta cuenta la abrió otra persona y después se te atribuyó."
                                    >
                                      Atribuido
                                    </span>
                                  )}
                                </span>
                                <span className="block text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[180px]">
                                  {a.aliado_email || "—"}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{tipoAliadoLabel(a)}</td>
                          <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 truncate max-w-[140px]">
                            {a.empresa_nombre || "—"}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">
                            {fmtFecha(a.fecha_incorporacion)}
                          </td>
                          {/* El contrato se mira el día del pago de comisiones:
                              o hay enlace, o hay una alerta roja. No hay término
                              medio ni guion discreto que se pueda pasar por alto. */}
                          <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            {contratoPorAliado.get(a.aliado_id) ? (
                              <a
                                href={contratoPorAliado.get(a.aliado_id) as string}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-750 transition-colors"
                              >
                                <FileText className="h-3 w-3" /> Ver
                              </a>
                            ) : (
                              // Ámbar y no rojo: el contrato es una advertencia,
                              // no un bloqueo. Rojo leería como "esto está roto".
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="h-3 w-3" /> Pendiente
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                a.clientes_90d > 0
                                  ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
                                  : a.clientes_total > 0
                                    ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                              }`}
                            >
                              {a.clientes_90d > 0 ? "Activo" : a.clientes_total > 0 ? "Inactivo" : "Sin actividad"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-900 dark:text-white">
                            {a.clientes_total}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                            {a.clientes_en_proceso}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-900 dark:text-white">
                            {a.ventas}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                            {fmtPct(conv)}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">
                            {fmtFecha(a.ultimo_cliente_at)}
                          </td>
                          <td className="pl-3 pr-5 py-2.5 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              {puedeAdministrar(a) ? (
                                <>
                                  <button
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      setViendoCredenciales(a);
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors active:scale-95"
                                    title="Ver el correo y la contraseña provisional"
                                  >
                                    <Key className="h-3 w-3" /> Acceso
                                  </button>
                                  <button
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      setEditando(a);
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors active:scale-95"
                                    title="Editar nombre, teléfono o contrato"
                                  >
                                    <Pencil className="h-3 w-3" /> Editar
                                  </button>
                                  {esMiFicha && (
                                    // Dirección borra desde Gestión de Usuarios,
                                    // que además sabe reasignar la cartera; aquí
                                    // el botón es para el closer que abrió la
                                    // cuenta y se equivocó.
                                    <button
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        setEliminando(a);
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/50 transition-colors active:scale-95"
                                      title="Dar de baja esta cuenta"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </>
                              ) : (
                                esMiFicha && (
                                  // No es un botón deshabilitado: es la
                                  // explicación de por qué no hay botones. Sin
                                  // esto la fila parece rota.
                                  <span
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500"
                                    title="Esta cuenta la abrió otra persona. La ves y le trabajas el proceso comercial, pero administrarla es de quien la creó o de Dirección."
                                  >
                                    <Lock className="h-3 w-3" /> Solo lectura
                                  </span>
                                )
                              )}
                              {esDireccion && (
                                <button
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setReasignando(a);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors active:scale-95"
                                  title="Reasignar este aliado a otro closer"
                                >
                                  <ArrowRightLeft className="h-3 w-3" /> Reasignar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {abierto && puedeVerExpedientes && (
                          <tr className="bg-slate-50/60 dark:bg-slate-950/30">
                            <td colSpan={11} className="px-5 py-3">
                              {clientes.length === 0 ? (
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 py-2">
                                  Este aliado todavía no ha registrado clientes en el período seleccionado.
                                </p>
                              ) : (
                                <ul className="space-y-1">
                                  {clientes.map((c) => (
                                    <li key={c.id} className="flex items-center gap-3 text-[11px] py-1">
                                      <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />
                                      <Link
                                        href={`/prospectos/${c.id}`}
                                        className="font-semibold text-slate-700 dark:text-slate-200 hover:underline truncate max-w-[280px]"
                                      >
                                        {c.full_name}
                                      </Link>
                                      <span className="text-slate-400 dark:text-slate-500 tabular-nums">
                                        {fmtFecha(c.created_at)}
                                      </span>
                                      <span className="text-slate-500 dark:text-slate-400 truncate">{c.status}</span>
                                      <Link
                                        href={`/prospectos/${c.id}`}
                                        className="ml-auto inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold shrink-0"
                                      >
                                        Abrir <ArrowRight className="h-3 w-3" />
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Historial de asignaciones (§22) ───────────────────────────── */}
        {esDireccion && historial.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
                <History className="h-4 w-4" strokeWidth={2.2} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">Historial de asignaciones</h3>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight">
                  Registro completo e inmodificable de cada movimiento.
                </p>
              </div>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {historial.slice(0, 30).map((h) => (
                <li key={h.id} className="px-5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                  <span className="tabular-nums text-slate-400 dark:text-slate-500 w-20 shrink-0">
                    {fmtFecha(h.fecha_asignacion)}
                  </span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">
                    {nombrePorId.get(h.aliado_id) || "Aliado"}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {h.tipo_movimiento === "reasignacion"
                      ? `${nombrePorId.get(h.closer_anterior_id || "") || "Sin closer"} → ${nombrePorId.get(h.closer_nuevo_id || "") || "Sin closer"}`
                      : h.tipo_movimiento === "backfill"
                        ? "Atribución retroactiva"
                        : h.tipo_movimiento === "desasignacion"
                          ? "Desasignado"
                          : "Asignación inicial"}
                  </span>
                  {h.motivo && <span className="text-slate-400 dark:text-slate-500 italic truncate">{h.motivo}</span>}
                  <span className="ml-auto text-slate-400 dark:text-slate-500 shrink-0">
                    {nombrePorId.get(h.asignado_por || "") || "Sistema"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {reasignando && (
        <ReasignarCloser
          aliado={reasignando}
          closerActualId={closerId}
          closers={closersDisponibles.map((c) => ({ id: c.id, nombre: c.full_name }))}
          onCerrar={() => setReasignando(null)}
          onConfirmar={async (nuevoCloserId, motivo) => {
            await assignCloser([reasignando.aliado_id], nuevoCloserId, { tipo: "reasignacion", motivo });
            setReasignando(null);
            await recargarAliados();
            setHistorial(
              (await fetchHistorial()).filter((r) => r.closer_nuevo_id === closerId || r.closer_anterior_id === closerId)
            );
          }}
        />
      )}

      {editando && (
        <EditarAliadoCloser
          aliado={editando}
          contratoActual={contratoPorAliado.get(editando.aliado_id) || null}
          telefonoActual={profiles.find((p) => p.id === editando.aliado_id)?.phone || null}
          onCerrar={() => setEditando(null)}
          onGuardado={async () => {
            // Tanto editar como eliminar cambian la lista y los agregados.
            await Promise.all([recargarAliados(), reload()]);
          }}
        />
      )}

      {viendoCredenciales && (
        <CredencialesAliado
          aliadoId={viendoCredenciales.aliado_id}
          aliadoNombre={viendoCredenciales.aliado_nombre}
          onCerrar={() => setViendoCredenciales(null)}
        />
      )}

      {eliminando && (
        <EliminarAliadoCloser
          aliadoId={eliminando.aliado_id}
          aliadoNombre={eliminando.aliado_nombre}
          clientesTotal={eliminando.clientes_total}
          onCerrar={() => setEliminando(null)}
          onEliminado={async () => {
            // Una baja mueve la lista y los agregados: el aliado deja de contar.
            await Promise.all([recargarAliados(), reload()]);
          }}
        />
      )}

      {altaAbierta && (
        <AltaAliadoCloser
          closerId={closerId}
          closerNombre={fila?.closer_nombre || closer?.full_name || "este closer"}
          esMiPropiaFicha={esMiFicha}
          onCerrar={() => setAltaAbierta(false)}
          onCreado={async () => {
            // El alta cambia las dos cosas a la vez: la lista de aliados y los
            // agregados del RPC (que es de donde sale su producción).
            await Promise.all([recargarAliados(), reload()]);
          }}
        />
      )}
    </div>
  );
}

function Volver({ qs }: { qs: string }) {
  return (
    <Link
      href={`/admin/closers${qs}`}
      className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Volver a Closers
    </Link>
  );
}
