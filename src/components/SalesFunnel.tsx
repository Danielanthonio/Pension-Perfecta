"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Prospect, useApp } from "@/utils/context/AppContext";
import {
  ChevronDown,
  Users,
  FileText,
  Hourglass,
  Check,
  Clock,
  X,
  Gift,
  PieChart,
  TrendingUp,
  Target,
  CircleDollarSign,
  Shield,
  User,
  LayoutGrid,
  AlignLeft,
} from "lucide-react";

interface SalesFunnelProps {
  prospects: Prospect[];
  assignedAllies?: any[];
}

export default function SalesFunnel({ prospects, assignedAllies: assignedAlliesProp }: SalesFunnelProps) {
  const { user, profiles } = useApp();
  const [funnelView, setFunnelView] = useState<"consolidated" | "personal" | "team_all" | string>("consolidated");

  // Optional funnel visualization: card grid (default) or proportional horizontal bars.
  const [layout, setLayout] = useState<"cards" | "bars">("cards");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("pp_funnel_layout");
      if (saved === "cards" || saved === "bars") setLayout(saved);
    } catch {}
  }, []);
  const changeLayout = (next: "cards" | "bars") => {
    setLayout(next);
    try {
      localStorage.setItem("pp_funnel_layout", next);
    } catch {}
  };

  const showAccountManagers = user?.role === "director";
  const showAliadosCard = user?.role === "director" || user?.role === "account_manager";
  let accountManagersCount = 0;
  let alliesCount = 0;
  if (user?.role === "director") {
    accountManagersCount = profiles.filter((p) => p.role === "account_manager" && p.is_active).length;
    alliesCount = profiles.filter((p) => p.role === "aliado" && p.is_active && p.account_manager_id !== null).length;
  } else if (user?.role === "account_manager") {
    alliesCount = profiles.filter((p) => p.role === "aliado" && p.is_active && p.account_manager_id === user.id).length;
  }

  // Find allies assigned to this leader
  const assignedAllies = useMemo(() => {
    if (assignedAlliesProp && assignedAlliesProp.length > 0) {
      return assignedAlliesProp.map((a: any) => ({
        id: a.id,
        full_name: a.name || a.full_name || "Asesor Comercial",
      }));
    }
    if (!user || user.aliado_tipo !== "lider") return [];
    return profiles.filter((p) => p.role === "aliado" && p.lider_ids?.includes(user.id));
  }, [profiles, user, assignedAlliesProp]);

  const assignedAllyIds = useMemo(() => {
    return assignedAllies.map((a) => a.id);
  }, [assignedAllies]);

  // Filter prospects dynamically based on selected funnel view
  const displayProspects = useMemo(() => {
    if (!user || user.aliado_tipo !== "lider") {
      return prospects;
    }

    if (funnelView === "consolidated") {
      // Level 1: Leader + assigned allies
      return prospects.filter(
        (p) => p.aliado_id === user.id || assignedAllyIds.includes(p.aliado_id || "")
      );
    } else if (funnelView === "personal") {
      // Level 2: Only leader
      return prospects.filter((p) => p.aliado_id === user.id);
    } else if (funnelView === "team_all") {
      // Level 2: Only assigned allies consolidated
      return prospects.filter((p) => assignedAllyIds.includes(p.aliado_id || ""));
    } else {
      // Level 3: Specific assigned ally
      return prospects.filter((p) => p.aliado_id === funnelView);
    }
  }, [prospects, funnelView, user, assignedAllyIds]);

  // Count active prospects for each tree view option
  const ownProspectsCount = useMemo(() => {
    if (!user) return 0;
    return prospects.filter((p) => p.aliado_id === user.id).length;
  }, [prospects, user]);

  const teamProspectsCount = useMemo(() => {
    return prospects.filter((p) => assignedAllyIds.includes(p.aliado_id || "")).length;
  }, [prospects, assignedAllyIds]);

  const consolidatedProspectsCount = useMemo(() => {
    if (!user) return 0;
    return prospects.filter((p) => p.aliado_id === user.id || assignedAllyIds.includes(p.aliado_id || "")).length;
  }, [prospects, user, assignedAllyIds]);

  const getAllyProspectsCount = useCallback((allyId: string) => {
    return prospects.filter((p) => p.aliado_id === allyId).length;
  }, [prospects]);

  // 1. Filter counts according to the specific mappings using displayProspects
  const proyectosCount = displayProspects.length;

  const aprobadosCount = displayProspects.filter((p) =>
    ["aprobado_listo", "asesoria_agendada", "firma_programada"].includes(p.status)
  ).length;

  const condicionadosCount = displayProspects.filter((p) =>
    ["falta_reporte", "falta_afore", "pendiente_documentos", "falta_semanas", "falta_afore_cuenta", "posible_simulacion", "aportacion"].includes(p.status)
  ).length;

  const rechazadosCount = displayProspects.filter((p) =>
    ["rechazado", "cerrado_perdido"].includes(p.status)
  ).length;

  const otorgadosCount = displayProspects.filter((p) =>
    p.status === "pagado_comision"
  ).length;

  const enEvaluacionCount = proyectosCount;

  // Financiamientos Aprobados: sum of simulation.financiamiento for any approved/active/closed project
  const approvedStatuses = [
    "aprobado_listo",
    "aportacion",
    "asesoria_agendada",
    "doc_proceso",
    "analisis_riesgo",
    "firma_programada",
    "pagado_comision",
  ];
  const finAprobados = displayProspects
    .filter((p) => approvedStatuses.includes(p.status) && p.simulation)
    .reduce((sum, p) => sum + (p.simulation?.totalCredito || p.simulation?.financiamiento || 0), 0);

  // Financiamientos Otorgados: sum of simulation.totalCredito for closed/paid projects only (pagado_comision)
  const finOtorgados = displayProspects
    .filter((p) => p.status === "pagado_comision" && p.simulation)
    .reduce((sum, p) => sum + (p.simulation?.totalCredito || p.simulation?.financiamiento || 0), 0);

  // 2. Conversion rates calculations
  const tasaEvaluacion = proyectosCount > 0 ? (enEvaluacionCount / proyectosCount) * 100 : 0;
  const tasaAprobacion = enEvaluacionCount > 0 ? (aprobadosCount / enEvaluacionCount) * 100 : 0;
  const tasaCierre = aprobadosCount > 0 ? (otorgadosCount / aprobadosCount) * 100 : 0;
  const tasaCierreMonto = finAprobados > 0 ? (finOtorgados / finAprobados) * 100 : 0;

  // Currency helper formatting
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  const steps = [
    ...(showAccountManagers
      ? [
          {
            label: "ACCOUNT MANAGERS",
            value: accountManagersCount,
            icon: Shield,
            iconWrap: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400",
            labelColor: "text-indigo-600 dark:text-indigo-400",
            accent: "bg-indigo-500",
          },
        ]
      : []),
    ...(showAliadosCard
      ? [
          {
            label: "ALIADOS",
            value: alliesCount,
            icon: Users,
            iconWrap: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
            labelColor: "text-slate-500 dark:text-slate-400",
            accent: "bg-slate-400",
          },
        ]
      : []),
    {
      label: "PROYECTOS",
      value: proyectosCount,
      icon: FileText,
      iconWrap: "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
      labelColor: "text-sky-600 dark:text-sky-400",
      accent: "bg-sky-500",
    },
    {
      label: "EVALUADOS",
      value: enEvaluacionCount,
      icon: Hourglass,
      iconWrap: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400",
      labelColor: "text-blue-600 dark:text-blue-400",
      accent: "bg-blue-500",
    },
    {
      label: "APROBADOS",
      value: aprobadosCount,
      icon: Check,
      iconWrap: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
      labelColor: "text-emerald-600 dark:text-emerald-400",
      accent: "bg-emerald-500",
    },
    {
      label: "CONDICIONADOS",
      value: condicionadosCount,
      icon: Clock,
      iconWrap: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
      labelColor: "text-amber-600 dark:text-amber-400",
      accent: "bg-amber-500",
    },
    {
      label: "RECHAZADOS",
      value: rechazadosCount,
      icon: X,
      iconWrap: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
      labelColor: "text-rose-600 dark:text-rose-400",
      accent: "bg-rose-500",
    },
    {
      label: "OTORGADOS",
      value: otorgadosCount,
      icon: Gift,
      iconWrap: "bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400",
      labelColor: "text-teal-600 dark:text-teal-400",
      accent: "bg-teal-500",
    },
  ];

  const isLeader = user?.aliado_tipo === "lider";

  // Pipeline stages only (exclude the AM / Aliados head-count tiles) for the bar view
  const pipelineSteps = steps.filter(
    (s) => s.label !== "ACCOUNT MANAGERS" && s.label !== "ALIADOS"
  );
  const maxStepValue = Math.max(...pipelineSteps.map((s) => s.value), 1);

  // Financiamiento tiles are shared across both layouts
  const financiamientoBlocks = (
    <>
      {/* Financiamientos Aprobados block */}
      <div className="relative flex-1 min-w-[168px] h-[140px] rounded-2xl border border-indigo-100 dark:border-indigo-950/60 bg-gradient-to-br from-indigo-50/80 to-white dark:from-indigo-950/30 dark:to-slate-900 p-4 flex flex-col justify-center gap-2.5 shadow-sm shadow-slate-200/40 dark:shadow-none transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-indigo-200/50 dark:hover:shadow-none overflow-hidden">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-indigo-500/10">
            <CircleDollarSign className="h-4 w-4" strokeWidth={2.2} />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-indigo-600 dark:text-indigo-400 leading-tight">
            Financiamientos<br />Aprobados
          </span>
        </div>
        <span className="text-xl font-bold tabular-nums tracking-tight text-indigo-700 dark:text-indigo-300 truncate">
          {formatCurrency(finAprobados)}
        </span>
        <span className="absolute bottom-0 inset-x-0 h-1 bg-indigo-500" />
      </div>

      {/* Financiamientos Otorgados block */}
      <div className="relative flex-1 min-w-[168px] h-[140px] rounded-2xl border border-emerald-100 dark:border-emerald-950/60 bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/30 dark:to-slate-900 p-4 flex flex-col justify-center gap-2.5 shadow-sm shadow-slate-200/40 dark:shadow-none transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-200/50 dark:hover:shadow-none overflow-hidden">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-emerald-500/10">
            <Gift className="h-4 w-4" strokeWidth={2.2} />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-emerald-600 dark:text-emerald-400 leading-tight">
            Financiamientos<br />Otorgados
          </span>
        </div>
        <span className="text-xl font-bold tabular-nums tracking-tight text-emerald-700 dark:text-emerald-300 truncate">
          {formatCurrency(finOtorgados)}
        </span>
        <span className="absolute bottom-0 inset-x-0 h-1 bg-emerald-500" />
      </div>
    </>
  );

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 p-5 sm:p-6 shadow-sm shadow-slate-200/40 dark:shadow-none space-y-5 w-full">
      {/* Visual Header */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm shadow-blue-500/30 shrink-0">
            <TrendingUp className="h-[18px] w-[18px] text-white" strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">Embudo Comercial</h3>
            <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 leading-tight truncate">Pipeline de conversión de prospectos</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Optional view switch: card grid vs proportional bars */}
          <div className="flex items-center gap-0.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 p-0.5 ring-1 ring-inset ring-slate-200/70 dark:ring-slate-700/50">
            <button
              onClick={() => changeLayout("cards")}
              title="Vista de tarjetas"
              aria-pressed={layout === "cards"}
              className={`flex items-center justify-center h-6 w-6 rounded-lg transition-all ${
                layout === "cards"
                  ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" strokeWidth={2.4} />
            </button>
            <button
              onClick={() => changeLayout("bars")}
              title="Vista de embudo (barras)"
              aria-pressed={layout === "bars"}
              className={`flex items-center justify-center h-6 w-6 rounded-lg transition-all ${
                layout === "bars"
                  ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
              }`}
            >
              <AlignLeft className="h-3.5 w-3.5" strokeWidth={2.4} />
            </button>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            <span className="hidden sm:inline">En tiempo real</span>
          </span>
        </div>
      </div>

      {/* Horizontal View Filter (Only for Leaders) */}
      {isLeader && (
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/60 rounded-2xl p-3 text-xs">
            {/* Left: View selector buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-[0.08em] mr-1.5">
                Niveles de Visualización
              </span>
              <button
                onClick={() => setFunnelView("consolidated")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all font-semibold ${
                  funnelView === "consolidated"
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-600/25"
                    : "text-slate-600 hover:bg-white hover:shadow-sm dark:text-slate-300 dark:hover:bg-slate-800/60"
                }`}
              >
                <PieChart className="h-3.5 w-3.5" />
                Consolidado Total
                <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold tabular-nums ${
                  funnelView === "consolidated"
                    ? "bg-white/20 text-white"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                }`}>
                  {consolidatedProspectsCount}
                </span>
              </button>

              <button
                onClick={() => setFunnelView("personal")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all font-semibold ${
                  funnelView === "personal"
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-600/25"
                    : "text-slate-600 hover:bg-white hover:shadow-sm dark:text-slate-300 dark:hover:bg-slate-800/60"
                }`}
              >
                <User className="h-3.5 w-3.5" />
                Mi Gestión Personal
                <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold tabular-nums ${
                  funnelView === "personal"
                    ? "bg-white/20 text-white"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                }`}>
                  {ownProspectsCount}
                </span>
              </button>

              <button
                onClick={() => setFunnelView("team_all")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all font-semibold ${
                  funnelView === "team_all"
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-600/25"
                    : "text-slate-600 hover:bg-white hover:shadow-sm dark:text-slate-300 dark:hover:bg-slate-800/60"
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Mis Aliados Asignados
                <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold tabular-nums ${
                  funnelView === "team_all"
                    ? "bg-white/20 text-white"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                }`}>
                  {teamProspectsCount}
                </span>
              </button>
            </div>

            {/* Right: Dropdown ally selector */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-[0.08em] shrink-0">
                Filtrar por Asesor
              </span>
              <div className="relative shrink-0">
                <select
                  value={["consolidated", "personal", "team_all"].includes(funnelView) ? "" : funnelView}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") {
                      setFunnelView("team_all");
                    } else {
                      setFunnelView(val);
                    }
                  }}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 font-semibold text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 cursor-pointer pr-8 appearance-none transition-all"
                >
                  <option value="">Todos los asesores</option>
                  {assignedAllies.map((ally) => (
                    <option key={ally.id} value={ally.id}>
                      {ally.full_name} ({getAllyProspectsCount(ally.id)})
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Context Info Line */}
          <div className="text-[10px] font-medium text-slate-400 dark:text-slate-500 flex items-center gap-1.5 px-1 pb-1">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
            <span className="font-semibold text-slate-500 dark:text-slate-400">
              {funnelView === "consolidated" && "Mostrando la vista Consolidada Total (Gestión Personal + Aliados)."}
              {funnelView === "personal" && "Mostrando únicamente tu Gestión Personal."}
              {funnelView === "team_all" && "Mostrando la vista Consolidada de todos tus Aliados Asignados."}
              {!["consolidated", "personal", "team_all"].includes(funnelView) && `Mostrando los datos del Asesor Comercial: ${profiles.find(p => p.id === funnelView)?.full_name}.`}
            </span>
            <span className="hidden md:inline text-slate-300 dark:text-slate-700">•</span>
            <span className="hidden md:inline">
              Este filtro recomputa instantáneamente el embudo, tasas y montos de financiamiento del grupo.
            </span>
          </div>
        </div>
      )}
          {/* Funnel row (card grid) — wraps so every stage stays visible without horizontal scroll (consistent across roles) */}
          {layout === "cards" && (
          <div className="flex flex-wrap items-stretch gap-2.5 pb-1 w-full select-none">
            {steps.map((step, idx) => {
              const IconComponent = step.icon;
              return (
                <div
                  key={step.label}
                  className="group relative flex-1 min-w-[130px] h-[140px] rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col items-center justify-center gap-2 shadow-sm shadow-slate-200/40 dark:shadow-none transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-200/70 dark:hover:shadow-none hover:border-slate-300 dark:hover:border-slate-700 overflow-hidden"
                >
                  {/* Step index */}
                  <span className="absolute top-2.5 right-3 text-[10px] font-black tabular-nums text-slate-300 dark:text-slate-700">{idx + 1}</span>
                  {/* Icon chip */}
                  <div className={`h-9 w-9 rounded-xl flex items-center justify-center ring-1 ring-inset ring-black/5 dark:ring-white/10 ${step.iconWrap}`}>
                    <IconComponent className="h-[18px] w-[18px]" strokeWidth={2.2} />
                  </div>
                  {/* Label */}
                  <span className={`text-[10px] font-semibold uppercase tracking-[0.07em] text-center leading-tight px-1.5 ${step.labelColor}`}>
                    {step.label}
                  </span>
                  {/* Value */}
                  <span className="text-[26px] font-bold tabular-nums tracking-tight text-slate-900 dark:text-white leading-none">
                    {step.value}
                  </span>
                  {/* Accent bar */}
                  <span className={`absolute bottom-0 inset-x-0 h-1 ${step.accent}`} />
                </div>
              );
            })}

            {/* Financiamientos Aprobados block */}
            <div className="relative flex-1 min-w-[168px] h-[140px] rounded-2xl border border-indigo-100 dark:border-indigo-950/60 bg-gradient-to-br from-indigo-50/80 to-white dark:from-indigo-950/30 dark:to-slate-900 p-4 flex flex-col justify-center gap-2.5 shadow-sm shadow-slate-200/40 dark:shadow-none transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-indigo-200/50 dark:hover:shadow-none overflow-hidden">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-indigo-500/10">
                  <CircleDollarSign className="h-4 w-4" strokeWidth={2.2} />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-indigo-600 dark:text-indigo-400 leading-tight">
                  Financiamientos<br />Aprobados
                </span>
              </div>
              <span className="text-xl font-bold tabular-nums tracking-tight text-indigo-700 dark:text-indigo-300 truncate">
                {formatCurrency(finAprobados)}
              </span>
              <span className="absolute bottom-0 inset-x-0 h-1 bg-indigo-500" />
            </div>

            {/* Financiamientos Otorgados block */}
            <div className="relative flex-1 min-w-[168px] h-[140px] rounded-2xl border border-emerald-100 dark:border-emerald-950/60 bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/30 dark:to-slate-900 p-4 flex flex-col justify-center gap-2.5 shadow-sm shadow-slate-200/40 dark:shadow-none transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-200/50 dark:hover:shadow-none overflow-hidden">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-emerald-500/10">
                  <Gift className="h-4 w-4" strokeWidth={2.2} />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-emerald-600 dark:text-emerald-400 leading-tight">
                  Financiamientos<br />Otorgados
                </span>
              </div>
              <span className="text-xl font-bold tabular-nums tracking-tight text-emerald-700 dark:text-emerald-300 truncate">
                {formatCurrency(finOtorgados)}
              </span>
              <span className="absolute bottom-0 inset-x-0 h-1 bg-emerald-500" />
            </div>
          </div>
          )}

          {/* Funnel row (bar view) — proportional horizontal funnel, optional alternative to the card grid */}
          {layout === "bars" && (
            <div className="space-y-4 pb-1 w-full">
              <div className="space-y-2">
                {pipelineSteps.map((step, idx) => {
                  const IconComponent = step.icon;
                  const pct = step.value > 0 ? Math.max((step.value / maxStepValue) * 100, 6) : 0;
                  const firstValue = pipelineSteps[0]?.value || 0;
                  const conv = idx === 0 ? 100 : firstValue > 0 ? (step.value / firstValue) * 100 : 0;
                  return (
                    <div key={step.label} className="flex items-center gap-3">
                      {/* Stage label */}
                      <div className="w-32 sm:w-44 shrink-0 flex items-center gap-2 justify-end">
                        <div className={`h-6 w-6 rounded-lg flex items-center justify-center ring-1 ring-inset ring-black/5 dark:ring-white/10 shrink-0 ${step.iconWrap}`}>
                          <IconComponent className="h-3.5 w-3.5" strokeWidth={2.2} />
                        </div>
                        <span className={`text-[10px] font-semibold uppercase tracking-[0.06em] leading-tight text-right ${step.labelColor}`}>
                          {step.label}
                        </span>
                      </div>
                      {/* Proportional bar */}
                      <div className="flex-1 h-9 rounded-lg bg-slate-100 dark:bg-slate-800/40 overflow-hidden relative min-w-0">
                        <div
                          className={`h-full ${step.accent} rounded-lg transition-all duration-500 flex items-center justify-end pr-2.5`}
                          style={{ width: `${pct}%` }}
                        >
                          {pct >= 24 && (
                            <span className="text-[10px] font-bold text-white/90 tabular-nums">{conv.toFixed(0)}%</span>
                          )}
                        </div>
                      </div>
                      {/* Absolute value */}
                      <span className="w-12 text-right text-base font-bold tabular-nums tracking-tight text-slate-900 dark:text-white shrink-0">
                        {step.value}
                      </span>
                    </div>
                  );
                })}
              </div>
              {/* Financiamiento tiles below the funnel */}
              <div className="flex flex-wrap items-stretch gap-2.5">
                {financiamientoBlocks}
              </div>
            </div>
          )}

          {/* Rates row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pt-1">
            {/* Rate 1 */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 rounded-2xl p-4 flex flex-row items-center gap-3.5 shadow-sm shadow-slate-200/40 dark:shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 shrink-0 ring-1 ring-inset ring-blue-500/10">
                <PieChart className="h-5 w-5" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <span className="block text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-[0.07em] leading-tight">
                  T. Evaluación
                </span>
                <span className="block text-xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white mt-0.5 leading-none">
                  {tasaEvaluacion.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Rate 2 */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 rounded-2xl p-4 flex flex-row items-center gap-3.5 shadow-sm shadow-slate-200/40 dark:shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 shrink-0 ring-1 ring-inset ring-emerald-500/10">
                <TrendingUp className="h-5 w-5" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <span className="block text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-[0.07em] leading-tight">
                  T. Aprobación
                </span>
                <span className="block text-xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white mt-0.5 leading-none">
                  {tasaAprobacion.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Rate 3 */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 rounded-2xl p-4 flex flex-row items-center gap-3.5 shadow-sm shadow-slate-200/40 dark:shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 shrink-0 ring-1 ring-inset ring-amber-500/10">
                <Target className="h-5 w-5" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <span className="block text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-[0.07em] leading-tight">
                  T. Cierre
                </span>
                <span className="block text-xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white mt-0.5 leading-none">
                  {tasaCierre.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Rate 4 */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 rounded-2xl p-4 flex flex-row items-center gap-3.5 shadow-sm shadow-slate-200/40 dark:shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 shrink-0 ring-1 ring-inset ring-indigo-500/10">
                <CircleDollarSign className="h-5 w-5" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <span className="block text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-[0.07em] leading-tight">
                  T. Cierre Monto
                </span>
                <span className="block text-xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white mt-0.5 leading-none">
                  {tasaCierreMonto.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
    </div>
  );
}
