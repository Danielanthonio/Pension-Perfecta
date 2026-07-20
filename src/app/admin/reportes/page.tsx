"use client";

import React, { useState, useMemo, Suspense } from "react";
import {
  useApp,
  Prospect,
  UserProfile,
} from "@/utils/context/AppContext";
import { AliadoPicker, prospectMatchesSelection } from "@/components/ui/AliadoPicker";
import { ModalidadFilter, ModalidadFilterValue, prospectMatchesModalidadFilter } from "@/components/ui/ModalidadFilter";
import { TipoFinanciamientoBadge, getFinanciamientoResuelto } from "@/components/ui/tipoFinanciamiento";
import { STEP_STATUSES, STEP_DEFS } from "@/components/ui/projectStepper";
import { APPROVED_STAGE, CONDITIONED_STAGE, FINANCED_APPROVED, EVALUATED_STAGE } from "../_pipelineBuckets";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Users,
  Filter,
  FileBarChart,
  Download,
  Printer,
  Route,
  PieChart as PieIcon,
  CalendarClock,
  Landmark,
  ArrowRight,
  TrendingUp,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
const financiamientoOf = (p: Prospect) => p.simulation?.totalCredito || p.simulation?.financiamiento || 0;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Variables CSS de color para los charts (categóricas validadas, alternan en .dark).
const VIZ_STYLE = `
.viz-root{--cat-1:#2a78d6;--cat-2:#008300;--cat-3:#e87ba4;--cat-4:#eda100;--cat-muted:#94a3b8;}
.dark .viz-root{--cat-1:#3987e5;--cat-3:#d55181;--cat-4:#c98500;--cat-muted:#64748b;}
`;
const CAT_VARS = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)"];

// ── Dona SVG (segmentos con separación + total al centro) ─────────────────────
function Donut({ segments, centerTop, centerBottom, size = 176 }: {
  segments: { label: string; value: number; color: string }[];
  centerTop: string;
  centerBottom: string;
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 60;
  const C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg viewBox="0 0 160 160" width={size} height={size} className="shrink-0">
      <circle cx="80" cy="80" r={r} fill="none" stroke="currentColor" strokeWidth="20" className="text-slate-100 dark:text-slate-800" />
      {total > 0 &&
        segments.map((s, i) => {
          const frac = s.value / total;
          const visible = Math.max(frac * C - 2, 0.001);
          const el = (
            <circle
              key={i}
              cx="80"
              cy="80"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="20"
              strokeDasharray={`${visible} ${C - visible}`}
              strokeDashoffset={-acc * C}
              transform="rotate(-90 80 80)"
              strokeLinecap="butt"
            >
              <title>{`${s.label}: ${s.value} (${((frac) * 100).toFixed(1)}%)`}</title>
            </circle>
          );
          acc += frac;
          return el;
        })}
      <text x="80" y="74" textAnchor="middle" className="fill-slate-900 dark:fill-white" style={{ fontSize: 22, fontWeight: 700 }}>
        {centerTop}
      </text>
      <text x="80" y="92" textAnchor="middle" className="fill-slate-400 dark:fill-slate-500" style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.5 }}>
        {centerBottom}
      </text>
    </svg>
  );
}

function DonutLegend({ segments, total }: { segments: { label: string; value: number; color: string }[]; total: number }) {
  return (
    <ul className="space-y-2 min-w-0 flex-1">
      {segments.map((s) => (
        <li key={s.label} className="flex items-center gap-2 text-[11px]">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.color }} />
          <span className="font-medium text-slate-600 dark:text-slate-300 truncate flex-1" title={s.label}>{s.label}</span>
          <span className="font-bold tabular-nums text-slate-800 dark:text-slate-100">{s.value}</span>
          <span className="tabular-nums text-slate-400 dark:text-slate-500 w-12 text-right">
            {total > 0 ? ((s.value / total) * 100).toFixed(1) : "0.0"}%
          </span>
        </li>
      ))}
      {segments.length === 0 && <li className="text-[11px] text-slate-400 dark:text-slate-500">Sin datos.</li>}
    </ul>
  );
}

// ── Área SVG (serie temporal de proyectos ingresados) ─────────────────────────
function AreaChart({ points }: { points: { label: string; value: number; full: string }[] }) {
  const W = 820, H = 280, padL = 40, padR = 14, padT = 14, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = points.length;
  const maxV = Math.max(...points.map((p) => p.value), 1);
  const x = (i: number) => (n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - (v / maxV) * plotH;
  const baseline = padT + plotH;
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const areaPath = n > 0 ? `M ${x(0).toFixed(1)} ${baseline} ${points.map((p, i) => `L ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ")} L ${x(n - 1).toFixed(1)} ${baseline} Z` : "";
  const grid = [0, 0.25, 0.5, 0.75, 1];
  const tickEvery = Math.max(1, Math.ceil(n / 9));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      {grid.map((g) => {
        const yy = padT + plotH - g * plotH;
        return (
          <g key={g}>
            <line x1={padL} y1={yy} x2={W - padR} y2={yy} className="stroke-slate-100 dark:stroke-slate-800" strokeWidth="1" />
            <text x={padL - 6} y={yy + 3} textAnchor="end" className="fill-slate-400 dark:fill-slate-500" style={{ fontSize: 9 }}>
              {Math.round(maxV * g)}
            </text>
          </g>
        );
      })}
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {areaPath && <path d={areaPath} fill="url(#areaFill)" />}
      {linePath && <path d={linePath} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      {points.map((p, i) =>
        n <= 45 ? (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={n <= 20 ? 3 : 2} fill="#10b981" className="stroke-white dark:stroke-slate-900" strokeWidth="1.5">
            <title>{`${p.full}: ${p.value} proyecto(s)`}</title>
          </circle>
        ) : null
      )}
      {points.map((p, i) =>
        i % tickEvery === 0 || i === n - 1 ? (
          <text key={i} x={x(i)} y={H - 10} textAnchor="middle" className="fill-slate-400 dark:fill-slate-500" style={{ fontSize: 9 }}>
            {p.label}
          </text>
        ) : null
      )}
    </svg>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────
function ReportesContent() {
  const { user, prospects, profiles, isProspectDeleted, isProspectPurged } = useApp();
  const isAM = user?.role === "account_manager";
  const searchParams = useSearchParams();

  const startDate = searchParams.get("desde") || "";
  const endDate = searchParams.get("hasta") || "";

  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [modalidadFilter, setModalidadFilter] = useState<ModalidadFilterValue>("all");
  const [granularity, setGranularity] = useState<"diario" | "mensual" | "anual">("diario");

  const baseFilteredProspects = useMemo(() => {
    if (user?.role !== "director") return prospects;
    return prospects.filter((p) => prospectMatchesSelection(p, selectedEntities, profiles));
  }, [prospects, user, selectedEntities, profiles]);

  const activeProspects = baseFilteredProspects.filter(
    (p) => !isProspectDeleted(p) && !isProspectPurged(p) && prospectMatchesModalidadFilter(p, modalidadFilter)
  );

  const filteredByDate = useMemo(
    () =>
      activeProspects.filter((p) => {
        if (!p.created_at) return true;
        const d = p.created_at.substring(0, 10);
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
        return true;
      }),
    [activeProspects, startDate, endDate]
  );

  // Base del embudo (sin cerrado_perdido).
  const pipeline = useMemo(() => filteredByDate.filter((p) => p.status !== "cerrado_perdido"), [filteredByDate]);

  // ── Embudo comercial (tarjetas de arriba) ────────────────────────────────────
  const f = useMemo(() => {
    const proyectos = pipeline.length;
    const evaluados = pipeline.filter((p) => EVALUATED_STAGE.includes(p.status)).length;
    const aprobados = pipeline.filter((p) => APPROVED_STAGE.includes(p.status)).length;
    const condicionados = pipeline.filter((p) => CONDITIONED_STAGE.includes(p.status)).length;
    const rechazados = pipeline.filter((p) => p.status === "rechazado").length;
    const otorgados = pipeline.filter((p) => p.status === "pagado_comision").length;
    const finAprobado = pipeline.filter((p) => FINANCED_APPROVED.includes(p.status)).reduce((s, p) => s + financiamientoOf(p), 0);
    const finOtorgado = pipeline.filter((p) => p.status === "pagado_comision").reduce((s, p) => s + financiamientoOf(p), 0);
    return { proyectos, evaluados, aprobados, condicionados, rechazados, otorgados, finAprobado, finOtorgado };
  }, [pipeline]);

  const pct = (n: number) => (f.proyectos > 0 ? `${((n / f.proyectos) * 100).toFixed(0)}% del total` : "—");
  const funnelCards = [
    { label: "Proyectos", value: String(f.proyectos), sub: "ingresados", tone: "text-sky-600 dark:text-sky-400", bar: "bg-sky-500" },
    { label: "Evaluados", value: String(f.evaluados), sub: pct(f.evaluados), tone: "text-blue-600 dark:text-blue-400", bar: "bg-blue-500" },
    { label: "Aprobados", value: String(f.aprobados), sub: pct(f.aprobados), tone: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
    { label: "Condicionados", value: String(f.condicionados), sub: pct(f.condicionados), tone: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" },
    { label: "Rechazados", value: String(f.rechazados), sub: pct(f.rechazados), tone: "text-rose-600 dark:text-rose-400", bar: "bg-rose-500" },
    { label: "Otorgados", value: String(f.otorgados), sub: pct(f.otorgados), tone: "text-teal-600 dark:text-teal-400", bar: "bg-teal-500" },
    { label: "Financiamiento aprobado", value: fmtCurrency(f.finAprobado), sub: "acumulado", tone: "text-indigo-600 dark:text-indigo-400", bar: "bg-indigo-500", wide: true },
    { label: "Financiamiento otorgado", value: fmtCurrency(f.finOtorgado), sub: "liberado", tone: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500", wide: true },
  ];

  // ── Serie temporal: proyectos ingresados (día / mes / año) ────────────────────
  const series = useMemo(() => {
    const dated = filteredByDate.filter((p) => p.created_at).map((p) => new Date(p.created_at));
    if (dated.length === 0) return [];
    const key = (d: Date) =>
      granularity === "anual"
        ? `${d.getFullYear()}`
        : granularity === "mensual"
        ? `${d.getFullYear()}-${d.getMonth()}`
        : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const counts = new Map<string, number>();
    dated.forEach((d) => counts.set(key(d), (counts.get(key(d)) || 0) + 1));
    const min = new Date(Math.min(...dated.map((d) => d.getTime())));
    const max = new Date(Math.max(...dated.map((d) => d.getTime())));
    const out: { label: string; value: number; full: string }[] = [];
    const cur = new Date(min);
    if (granularity === "diario") cur.setHours(0, 0, 0, 0);
    else if (granularity === "mensual") cur.setDate(1), cur.setHours(0, 0, 0, 0);
    else cur.setMonth(0, 1), cur.setHours(0, 0, 0, 0);
    let guard = 0;
    while (cur.getTime() <= max.getTime() && guard < 400) {
      guard++;
      const k = key(cur);
      const label =
        granularity === "anual" ? `${cur.getFullYear()}` : granularity === "mensual" ? `${MESES[cur.getMonth()]} ${String(cur.getFullYear()).slice(2)}` : `${cur.getDate()} ${MESES[cur.getMonth()]}`;
      const full =
        granularity === "anual" ? `${cur.getFullYear()}` : granularity === "mensual" ? `${MESES[cur.getMonth()]} ${cur.getFullYear()}` : `${cur.getDate()} ${MESES[cur.getMonth()]} ${cur.getFullYear()}`;
      out.push({ label, value: counts.get(k) || 0, full });
      if (granularity === "diario") cur.setDate(cur.getDate() + 1);
      else if (granularity === "mensual") cur.setMonth(cur.getMonth() + 1);
      else cur.setFullYear(cur.getFullYear() + 1);
    }
    return out;
  }, [filteredByDate, granularity]);
  const totalIngresados = series.reduce((s, p) => s + p.value, 0);

  // ── Dona: tipos de financiamiento ─────────────────────────────────────────────
  const tipoSegments = useMemo(() => {
    // El tipo se resuelve por cliente a exactamente uno de 3 valores: Crédito de
    // nómina / Modalidad 40 / Modalidad 10. Modalidad 40/10 sin decidir cae en
    // Modalidad 40 (default), igual que el badge por cliente (getFinanciamientoResuelto).
    let cn = 0, m40 = 0, m10 = 0;
    for (const p of filteredByDate) {
      const meta = getFinanciamientoResuelto(p.tipo_financiamiento, p.modalidad);
      if (!meta) continue;
      if (meta.kind === "credito_nomina") cn++;
      else if (meta.kind === "modalidad_10") m10++;
      else m40++;
    }
    return [
      { label: "Crédito de nómina", value: cn, color: CAT_VARS[0] },
      { label: "Modalidad 40", value: m40, color: CAT_VARS[1] },
      { label: "Modalidad 10", value: m10, color: CAT_VARS[2] },
    ].filter((s) => s.value > 0);
  }, [filteredByDate]);
  const tipoTotal = tipoSegments.reduce((s, x) => s + x.value, 0);

  // ── Aprobados por línea de tiempo (breakdown) ─────────────────────────────────
  const breakdownRows = useMemo(() => {
    const rows = [
      { status: "aprobado_listo", label: "Aprobado · sin agendar", bar: "bg-slate-400" },
      ...STEP_STATUSES.map((s, i) => ({ status: s, label: STEP_DEFS[i].label, bar: ["bg-sky-500", "bg-blue-500", "bg-indigo-500", "bg-violet-500", "bg-emerald-500", "bg-teal-500"][i] })),
    ];
    return rows.map((r) => ({ ...r, count: filteredByDate.filter((p) => p.status === r.status).length }));
  }, [filteredByDate]);
  const maxBreak = Math.max(...breakdownRows.map((r) => r.count), 1);
  const totalAprobPipeline = breakdownRows.reduce((s, r) => s + r.count, 0);

  // ── Dona: contribución por Account Manager (Nº de proyectos) ───────────────────
  const amSegments = useMemo(() => {
    const map = new Map<string, number>();
    pipeline.forEach((p) => {
      const ally = profiles.find((pr) => pr.id === p.aliado_id);
      const amId = ally?.account_manager_id || null;
      const name = amId ? profiles.find((pr) => pr.id === amId)?.full_name || "Account Manager" : "Sin Account Manager";
      map.set(name, (map.get(name) || 0) + 1);
    });
    let arr = Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    if (arr.length > 5) {
      const otros = arr.slice(4).reduce((s, x) => s + x.value, 0);
      arr = [...arr.slice(0, 4), { name: "Otros", value: otros }];
    }
    return arr.map((x, i) => ({ label: x.name, value: x.value, color: i < 4 && x.name !== "Sin Account Manager" ? CAT_VARS[i] : "var(--cat-muted)" }));
  }, [pipeline, profiles]);
  const amTotal = amSegments.reduce((s, x) => s + x.value, 0);

  // ── Cerrada Ganada / esperando finanzas (firma_programada) ────────────────────
  const enFinanzas = useMemo(() => pipeline.filter((p) => p.status === "firma_programada"), [pipeline]);
  const finTotalMonto = enFinanzas.reduce((s, p) => s + financiamientoOf(p), 0);

  // Barras mensuales de Cerrada Ganada (por fecha del último cambio de estado).
  const ganadaMonthly = useMemo(() => {
    if (enFinanzas.length === 0) return [];
    const map = new Map<string, { d: Date; count: number }>();
    enFinanzas.forEach((p) => {
      const d = new Date(p.updated_at || p.created_at);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      if (!map.has(k)) map.set(k, { d: new Date(d.getFullYear(), d.getMonth(), 1), count: 0 });
      map.get(k)!.count++;
    });
    return Array.from(map.values()).sort((a, b) => a.d.getTime() - b.d.getTime()).slice(-8).map((x) => ({ label: `${MESES[x.d.getMonth()]} ${String(x.d.getFullYear()).slice(2)}`, count: x.count }));
  }, [enFinanzas]);
  const maxGanada = Math.max(...ganadaMonthly.map((m) => m.count), 1);

  // Worklist: días esperando desde el último cambio de estado.
  const daysWaiting = (p: Prospect) => Math.max(0, Math.floor((Date.now() - new Date(p.updated_at || p.created_at).getTime()) / 86400000));
  const finWorklist = useMemo(() => [...enFinanzas].sort((a, b) => daysWaiting(b) - daysWaiting(a)), [enFinanzas]);

  // ── Exportar CSV (resumen macro) ──────────────────────────────────────────────
  const exportCsv = () => {
    const esc = (v: string | number) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows: (string | number)[][] = [["Sección", "Concepto", "Valor"]];
    rows.push(["Embudo", "Proyectos", f.proyectos], ["Embudo", "Evaluados", f.evaluados], ["Embudo", "Aprobados", f.aprobados], ["Embudo", "Condicionados", f.condicionados], ["Embudo", "Rechazados", f.rechazados], ["Embudo", "Otorgados", f.otorgados], ["Embudo", "Financiamiento aprobado", Math.round(f.finAprobado)], ["Embudo", "Financiamiento otorgado", Math.round(f.finOtorgado)]);
    tipoSegments.forEach((s) => rows.push(["Tipo de financiamiento", s.label, s.value]));
    amSegments.forEach((s) => rows.push(["Contribución AM (proyectos)", s.label, s.value]));
    breakdownRows.forEach((r) => rows.push(["Aprobados por etapa", r.label, r.count]));
    rows.push(["Finanzas", "En Cerrada Ganada (esperando finanzas)", enFinanzas.length], ["Finanzas", "Monto esperando finanzas", Math.round(finTotalMonto)]);
    const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-macro-${new Date().toISOString().substring(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const gBtn = (active: boolean) =>
    `px-3 py-1 rounded-lg text-[11px] font-semibold transition-all ${active ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`;

  return (
    <div className="viz-root space-y-5 max-w-[1700px] mx-auto animate-fade-in text-slate-800 dark:text-slate-100">
      <style>{VIZ_STYLE}</style>

      {/* Encabezado + acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white leading-tight flex items-center gap-2">
            <FileBarChart className="h-5 w-5 text-emerald-600 dark:text-emerald-400" strokeWidth={2.2} />
            Reportes
          </h2>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Panorama del embudo, ingreso de proyectos y estado de cierre / finanzas.</p>
        </div>
        <div className="flex items-center gap-2 print:hidden shrink-0">
          <button onClick={exportCsv} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-500/20 transition-all active:scale-95">
            <Download className="h-4 w-4" strokeWidth={2.4} /> Exportar CSV
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95">
            <Printer className="h-4 w-4" strokeWidth={2.4} /> Imprimir
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col lg:flex-row gap-3 print:hidden">
        {!isAM && (
          <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-emerald-500/10">
                <Users className="h-4 w-4" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-800 dark:text-white">Filtro de Asignación</h4>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">Aliados y/o account managers.</p>
              </div>
            </div>
            <AliadoPicker profiles={profiles} selected={selectedEntities} onChange={setSelectedEntities} accent="emerald" />
          </div>
        )}
        <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-indigo-500/10">
              <Filter className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-slate-800 dark:text-white">Modalidad de aprobación</h4>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">Recalcula todos los reportes.</p>
            </div>
          </div>
          <ModalidadFilter value={modalidadFilter} onChange={setModalidadFilter} />
        </div>
      </div>

      {/* 1 · Embudo comercial (tarjetas de arriba) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        {funnelCards.map((c) => (
          <div key={c.label} className="relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-3.5 overflow-hidden flex flex-col justify-between min-h-[104px]">
            <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-400 dark:text-slate-500 leading-tight">{c.label}</span>
            <span className={`block font-bold tabular-nums tracking-tight text-slate-900 dark:text-white leading-none mt-2 ${c.wide ? "text-lg" : "text-2xl"}`}>{c.value}</span>
            <span className={`text-[10px] font-semibold mt-1.5 ${c.tone}`}>{c.sub}</span>
            <span className={`absolute bottom-0 inset-x-0 h-1 ${c.bar}`} />
          </div>
        ))}
      </div>

      {/* 2 · Serie temporal (2/3) + dona tipo financiamiento (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-emerald-500/10">
                <TrendingUp className="h-4 w-4" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">Proyectos ingresados</h3>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight">{totalIngresados} proyecto(s) en el periodo.</p>
              </div>
            </div>
            <div className="flex items-center gap-0.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 p-0.5 ring-1 ring-inset ring-slate-200/70 dark:ring-slate-700/50 print:hidden">
              <button onClick={() => setGranularity("diario")} className={gBtn(granularity === "diario")}>Diario</button>
              <button onClick={() => setGranularity("mensual")} className={gBtn(granularity === "mensual")}>Mensual</button>
              <button onClick={() => setGranularity("anual")} className={gBtn(granularity === "anual")}>Anual</button>
            </div>
          </div>
          {series.length === 0 ? (
            <div className="py-16 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">Sin proyectos en el periodo.</div>
          ) : (
            <AreaChart points={series} />
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="h-8 w-8 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-sky-500/10">
              <PieIcon className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">Tipos de financiamiento</h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight">Distribución de los proyectos.</p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-4">
            <Donut segments={tipoSegments} centerTop={String(tipoTotal)} centerBottom="PROYECTOS" />
            <DonutLegend segments={tipoSegments} total={tipoTotal} />
          </div>
        </div>
      </div>

      {/* 3 · Tres paneles: aprobados por etapa · contribución AM · Cerrada Ganada mensual */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Aprobados por línea de tiempo */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="h-8 w-8 rounded-lg bg-violet-50 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-violet-500/10">
              <Route className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">Aprobados por línea de tiempo</h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight">En qué etapa de cierre están.</p>
            </div>
          </div>
          <div className="space-y-2.5">
            {breakdownRows.map((r) => (
              <div key={r.status} className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-[11px] font-semibold text-slate-600 dark:text-slate-300 truncate" title={r.label}>{r.label}</span>
                <div className="flex-1 h-5 rounded-md bg-slate-100 dark:bg-slate-800/50 overflow-hidden min-w-0">
                  <div className={`h-full rounded-md ${r.bar} transition-all duration-500`} style={{ width: `${r.count > 0 ? Math.max((r.count / maxBreak) * 100, 4) : 0}%` }} />
                </div>
                <span className="w-6 text-right text-sm font-bold tabular-nums text-slate-900 dark:text-white shrink-0">{r.count}</span>
              </div>
            ))}
            <div className="pt-1.5 mt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-400 dark:text-slate-500">Total en pipeline de cierre</span>
              <span className="font-bold tabular-nums text-slate-800 dark:text-white">{totalAprobPipeline}</span>
            </div>
          </div>
        </div>

        {/* Contribución por Account Manager */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-indigo-500/10">
              <PieIcon className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">Contribución por Account Manager</h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight">Nº de proyectos por equipo.</p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-4">
            <Donut segments={amSegments} centerTop={String(amTotal)} centerBottom="PROYECTOS" />
            <DonutLegend segments={amSegments} total={amTotal} />
          </div>
        </div>

        {/* Cerrada Ganada por mes */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="h-8 w-8 rounded-lg bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-teal-500/10">
              <CalendarClock className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">Cerrada Ganada por mes</h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight">{enFinanzas.length} caso(s) · {fmtCurrency(finTotalMonto)}</p>
            </div>
          </div>
          {ganadaMonthly.length === 0 ? (
            <div className="py-16 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">Aún no hay casos en Cerrada Ganada.</div>
          ) : (
            <div className="flex items-end justify-between gap-2 h-[200px] pt-4">
              {ganadaMonthly.map((m) => (
                <div key={m.label} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full" title={`${m.label}: ${m.count}`}>
                  <span className="text-[11px] font-bold tabular-nums text-slate-700 dark:text-slate-200">{m.count}</span>
                  <div className="w-full max-w-[36px] bg-teal-500 rounded-t-md transition-all duration-500" style={{ height: `${Math.max((m.count / maxGanada) * 100, 4)}%` }} />
                  <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500">{m.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 4 · Esperando respuesta de finanzas (worklist) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-amber-500/10">
              <Landmark className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">Esperando respuesta de finanzas</h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight">Casos en Cerrada Ganada pendientes de que finanzas libere la comisión.</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="block text-lg font-bold tabular-nums text-slate-900 dark:text-white leading-none">{enFinanzas.length}</span>
            <span className="block text-[10px] font-semibold text-amber-600 dark:text-amber-400 tabular-nums">{fmtCurrency(finTotalMonto)}</span>
          </div>
        </div>
        {finWorklist.length === 0 ? (
          <div className="px-5 py-8 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">No hay casos esperando respuesta de finanzas.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-left">
                  <th className="pl-5 pr-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">Cliente</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">Aliado</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">Tipo</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">Monto</th>
                  <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">Esperando</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {finWorklist.map((p) => {
                  const dias = daysWaiting(p);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="pl-5 pr-4 py-2.5">
                        <Link href={`/prospectos/${p.id}`} className="font-bold text-slate-800 dark:text-slate-200 hover:underline truncate block max-w-[220px]">{p.full_name}</Link>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">{p.nss}</span>
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[150px]">{p.aliado_name || "Asesor Comercial"}</td>
                      <td className="px-4 py-2.5"><TipoFinanciamientoBadge value={p.tipo_financiamiento} /></td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums text-slate-700 dark:text-slate-200">{financiamientoOf(p) > 0 ? fmtCurrency(financiamientoOf(p)) : "—"}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tabular-nums ${dias >= 7 ? "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400" : dias >= 3 ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"}`}>
                          {dias} d
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <Link href={`/prospectos/${p.id}`} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-500/20 transition-all active:scale-95">
                          Auditar <ArrowRight className="h-3.5 w-3.5" />
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
    </div>
  );
}

export default function ReportesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Cargando reportes…</div>}>
      <ReportesContent />
    </Suspense>
  );
}
