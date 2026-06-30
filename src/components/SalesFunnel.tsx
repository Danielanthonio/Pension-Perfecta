"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Prospect, useApp } from "@/utils/context/AppContext";
import {
  ChevronRight,
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
} from "lucide-react";

interface SalesFunnelProps {
  prospects: Prospect[];
}

export default function SalesFunnel({ prospects }: SalesFunnelProps) {
  const { user, profiles } = useApp();
  const [funnelView, setFunnelView] = useState<"consolidated" | "personal" | "team_all" | string>("consolidated");

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
    if (!user || user.aliado_tipo !== "lider") return [];
    return profiles.filter((p) => p.role === "aliado" && p.lider_ids?.includes(user.id));
  }, [profiles, user]);

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
            iconColor: "text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40",
            textColor: "text-indigo-600 dark:text-indigo-400",
          },
        ]
      : []),
    ...(showAliadosCard
      ? [
          {
            label: "ALIADOS",
            value: alliesCount,
            icon: Users,
            iconColor: "text-slate-500 bg-slate-100 dark:bg-slate-800",
            textColor: "text-slate-550 dark:text-slate-400",
          },
        ]
      : []),
    {
      label: "PROYECTOS",
      value: proyectosCount,
      icon: FileText,
      iconColor: "text-slate-500 bg-slate-100 dark:bg-slate-800",
      textColor: "text-slate-550 dark:text-slate-400",
    },
    {
      label: "EVALUADOS",
      value: enEvaluacionCount,
      icon: Hourglass,
      iconColor: "text-blue-500 bg-blue-50 dark:bg-blue-955/40",
      textColor: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "APROBADOS",
      value: aprobadosCount,
      icon: Check,
      iconColor: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40",
      textColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "CONDICIONADOS",
      value: condicionadosCount,
      icon: Clock,
      iconColor: "text-amber-505 bg-amber-50 dark:bg-amber-955/30",
      textColor: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "RECHAZADOS",
      value: rechazadosCount,
      icon: X,
      iconColor: "text-rose-500 bg-rose-50 dark:bg-rose-955/30",
      textColor: "text-rose-600 dark:text-rose-400",
    },
    {
      label: "OTORGADOS",
      value: otorgadosCount,
      icon: Gift,
      iconColor: "text-teal-500 bg-teal-50 dark:bg-teal-955/30",
      textColor: "text-teal-600 dark:text-teal-400",
    },
  ];

  const isLeader = user?.aliado_tipo === "lider";

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-805 p-6 shadow-sm space-y-5 w-full">
      {/* Visual Header */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Embudo Comercial (Sales Funnel)</h3>
        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-555">Actualizado en tiempo real</span>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Side: Tree Navigation (Only for Leaders) */}
        {isLeader && (
          <div className="w-full lg:w-[280px] shrink-0 space-y-4">
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-2xl p-4">
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-555 uppercase tracking-wider mb-3">
                Niveles de Visualización
              </h4>
              <div className="space-y-1 text-xs">
                {/* Node 1: Consolidado */}
                <button
                  onClick={() => setFunnelView("consolidated")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all font-bold ${
                    funnelView === "consolidated"
                      ? "bg-blue-500 text-white shadow-md shadow-blue-500/10"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-850/50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <PieChart className="h-4 w-4 shrink-0" />
                    Consolidado Total
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                    funnelView === "consolidated"
                      ? "bg-white/20 text-white"
                      : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                  }`}>
                    {consolidatedProspectsCount}
                  </span>
                </button>

                {/* Node 2: Mi Gestión Personal */}
                <button
                  onClick={() => setFunnelView("personal")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all font-bold ${
                    funnelView === "personal"
                      ? "bg-blue-500 text-white shadow-md shadow-blue-500/10"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-850/50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <User className="h-4 w-4 shrink-0" />
                    Mi Gestión Personal
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                    funnelView === "personal"
                      ? "bg-white/20 text-white"
                      : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                  }`}>
                    {ownProspectsCount}
                  </span>
                </button>

                {/* Node 3: Mis Aliados Asignados */}
                <div className="pt-2 border-t border-slate-200/50 dark:border-slate-800/50 mt-2 space-y-1">
                  <button
                    onClick={() => setFunnelView("team_all")}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all font-bold ${
                      funnelView === "team_all"
                        ? "bg-blue-500 text-white shadow-md shadow-blue-500/10"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-850/50"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4 shrink-0" />
                      Mis Aliados Asignados
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                      funnelView === "team_all"
                        ? "bg-white/20 text-white"
                        : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                    }`}>
                      {teamProspectsCount}
                    </span>
                  </button>

                  {/* Sub-tree: Individual Allies list */}
                  <div className="pl-4 pt-1 space-y-0.5 max-h-[220px] overflow-y-auto no-scrollbar">
                    {assignedAllies.map((ally) => {
                      const isActive = funnelView === ally.id;
                      const allyCount = getAllyProspectsCount(ally.id);
                      return (
                        <button
                          key={ally.id}
                          onClick={() => setFunnelView(ally.id)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-all font-semibold ${
                            isActive
                              ? "bg-indigo-550 text-white dark:bg-indigo-950 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40"
                              : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-850/30"
                          }`}
                        >
                          <span className="truncate flex items-center gap-1.5 min-w-0">
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                              isActive ? "bg-white" : "bg-slate-300 dark:bg-slate-700"
                            }`} />
                            {ally.full_name}
                          </span>
                          <span className={`px-1.5 py-0.2 text-[8px] font-black rounded ${
                            isActive
                              ? "bg-white/20 text-white"
                              : "bg-slate-200/50 dark:bg-slate-800/50 text-slate-500"
                          }`}>
                            {allyCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Context Info Box */}
            <div className="p-3.5 bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100/50 dark:border-blue-900/20 rounded-2xl text-[10px] leading-relaxed text-slate-550 dark:text-slate-450">
              <span className="font-bold text-blue-650 dark:text-blue-400 block mb-1">
                {funnelView === "consolidated" && "Vista: Consolidado Total"}
                {funnelView === "personal" && "Vista: Mi Gestión Personal"}
                {funnelView === "team_all" && "Vista: Mis Aliados (Consolidado)"}
                {!["consolidated", "personal", "team_all"].includes(funnelView) && `Vista: Asesor ${profiles.find(p => p.id === funnelView)?.full_name}`}
              </span>
              Este filtro recomputa instantáneamente el embudo comercial, las tasas de conversión y los montos de financiamiento del grupo.
            </div>
          </div>
        )}

        {/* Right Side: Funnel Elements */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Funnel row */}
          <div className="flex flex-row items-center gap-1.5 overflow-x-auto pb-3 w-full select-none no-scrollbar">
            {steps.map((step, idx) => {
              const IconComponent = step.icon;
              return (
                <React.Fragment key={step.label}>
                  <div className="flex-1 min-w-[120px] rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col items-center justify-between shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md h-[135px]">
                    {/* Circular Icon */}
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${step.iconColor}`}>
                      <IconComponent className="h-4 w-4" />
                    </div>
                    {/* Label */}
                    <span className={`text-[9px] font-bold uppercase tracking-wider mt-3 text-center leading-none ${step.textColor}`}>
                      {step.label}
                    </span>
                    {/* Value */}
                    <span className="text-xl font-black text-slate-800 dark:text-white mt-2 block leading-none">
                      {step.value}
                    </span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div className="flex items-center justify-center text-slate-300 dark:text-slate-700 shrink-0 px-0.5">
                      <ChevronRight className="h-4 w-4 stroke-[2.5]" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            {/* Chevron connector to Aprobados financing */}
            <div className="flex items-center justify-center text-slate-300 dark:text-slate-700 shrink-0 px-0.5">
              <ChevronRight className="h-4 w-4 stroke-[2.5]" />
            </div>

            {/* Financiamientos Aprobados block */}
            <div className="flex-1 min-w-[170px] rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col justify-between shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md h-[135px]">
              <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 leading-normal">
                FINANCIAMIENTOS APROBADOS
              </span>
              <span className="text-lg font-black mt-3 block leading-none text-indigo-700 dark:text-indigo-400 truncate">
                {formatCurrency(finAprobados)}
              </span>
            </div>

            {/* Chevron connector to Otorgados financing */}
            <div className="flex items-center justify-center text-slate-300 dark:text-slate-700 shrink-0 px-0.5">
              <ChevronRight className="h-4 w-4 stroke-[2.5]" />
            </div>

            {/* Financiamientos Otorgados block */}
            <div className="flex-1 min-w-[170px] rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col justify-between shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md h-[135px]">
              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 leading-normal">
                FINANCIAMIENTOS OTORGADOS
              </span>
              <span className="text-lg font-black mt-3 block leading-none text-emerald-700 dark:text-emerald-400 truncate">
                {formatCurrency(finOtorgados)}
              </span>
            </div>
          </div>

          {/* Rates row */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-1">
            {/* Rate 1 */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 flex flex-row items-center gap-3.5 shadow-sm">
              <div className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-50 dark:bg-blue-955/30 text-blue-500 shrink-0">
                <PieChart className="h-5 w-5" />
              </div>
              <div>
                <span className="block text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider leading-none">
                  T. EVALUACIÓN
                </span>
                <span className="block text-lg font-black text-slate-800 dark:text-white mt-1 leading-none">
                  {tasaEvaluacion.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Rate 2 */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 flex flex-row items-center gap-3.5 shadow-sm">
              <div className="h-10 w-10 rounded-full flex items-center justify-center bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500 shrink-0">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <span className="block text-[9px] text-slate-400 dark:text-slate-505 font-bold uppercase tracking-wider leading-none">
                  T. APROBACIÓN
                </span>
                <span className="block text-lg font-black text-slate-800 dark:text-white mt-1 leading-none">
                  {tasaAprobacion.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Rate 3 */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 flex flex-row items-center gap-3.5 shadow-sm">
              <div className="h-10 w-10 rounded-full flex items-center justify-center bg-amber-50 dark:bg-amber-955/20 text-amber-505 shrink-0">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <span className="block text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider leading-none">
                  T. CIERRE
                </span>
                <span className="block text-lg font-black text-slate-800 dark:text-white mt-1 leading-none">
                  {tasaCierre.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Rate 4 */}
            <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl p-4 flex flex-row items-center gap-3.5 shadow-sm">
              <div className="h-10 w-10 rounded-full flex items-center justify-center bg-indigo-50 dark:bg-indigo-955/20 text-indigo-500 shrink-0">
                <CircleDollarSign className="h-5 w-5" />
              </div>
              <div>
                <span className="block text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider leading-none">
                  T. CIERRE MONTO FIN.
                </span>
                <span className="block text-lg font-black text-slate-800 dark:text-white mt-1 leading-none">
                  {tasaCierreMonto.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
