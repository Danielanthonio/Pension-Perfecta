"use client";

import React from "react";
import { useApp, Prospect } from "@/utils/context/AppContext";
import {
  Users,
  TrendingUp,
  Award,
  Layers,
  ArrowDown,
  DollarSign,
  Briefcase,
  Percent,
  UserCheck,
  UserX,
} from "lucide-react";

export default function GestionAccountManagers() {
  const { profiles, prospects } = useApp();

  const allies = profiles.filter((p) => p.role === "aliado");
  const accountManagers = profiles.filter((p) => p.role === "account_manager");

  // Currency helper formatting
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Helper to compute metrics for a list of ally IDs
  const getMetricsForAllies = (allyIds: string[]) => {
    const groupProspects = prospects.filter((p) => allyIds.includes(p.aliado_id));
    const totalCount = groupProspects.length;

    const enEvaluacion = groupProspects.filter((p) =>
      ["evaluacion_pendiente", "analisis_riesgo", "doc_proceso"].includes(p.status)
    ).length;

    const aprobados = groupProspects.filter((p) =>
      ["aprobado_listo", "asesoria_agendada", "firma_programada", "aportacion"].includes(p.status)
    ).length;

    const condicionados = groupProspects.filter((p) =>
      ["falta_reporte", "falta_afore", "pendiente_documentos"].includes(p.status)
    ).length;

    const rechazados = groupProspects.filter((p) =>
      ["rechazado", "cerrado_perdido"].includes(p.status)
    ).length;

    const otorgados = groupProspects.filter((p) => p.status === "pagado_comision").length;

    // Financial Volumes
    const approvedStatuses = [
      "aprobado_listo",
      "aportacion",
      "asesoria_agendada",
      "doc_proceso",
      "analisis_riesgo",
      "firma_programada",
      "pagado_comision",
    ];
    const finAprobados = groupProspects
      .filter((p) => approvedStatuses.includes(p.status) && p.simulation)
      .reduce((sum, p) => sum + (p.simulation?.totalCredito || p.simulation?.financiamiento || 0), 0);

    const finOtorgados = groupProspects
      .filter((p) => p.status === "pagado_comision" && p.simulation)
      .reduce((sum, p) => sum + (p.simulation?.totalCredito || p.simulation?.financiamiento || 0), 0);

    // Rates
    const tasaEvaluacion = totalCount > 0 ? (enEvaluacion / totalCount) * 100 : 0;
    const tasaAprobacion = enEvaluacion > 0 ? (aprobados / enEvaluacion) * 100 : 0;
    const tasaCierre = aprobados > 0 ? (otorgados / aprobados) * 100 : 0;

    return {
      totalCount,
      enEvaluacion,
      aprobados,
      condicionados,
      rechazados,
      otorgados,
      finAprobados,
      finOtorgados,
      tasaEvaluacion,
      tasaAprobacion,
      tasaCierre,
    };
  };

  // Build the list of columns to compare: Account Managers + Director's Direct Portfolio
  const columns = [
    ...accountManagers.map((am) => {
      const amAllies = allies.filter((a) => a.account_manager_id === am.id);
      const amAllyIds = amAllies.map((a) => a.id);
      return {
        id: am.id,
        name: am.full_name,
        email: am.email,
        type: "account_manager" as const,
        alliesCount: amAllies.length,
        metrics: getMetricsForAllies(amAllyIds),
      };
    }),
    {
      id: "director_direct",
      name: "Gestión Directa (Director)",
      email: "Operaciones Centrales",
      type: "director" as const,
      alliesCount: allies.filter((a) => !a.account_manager_id).length,
      metrics: getMetricsForAllies(allies.filter((a) => !a.account_manager_id).map((a) => a.id)),
    },
  ];

  // Global metrics for overview
  const totalAllies = allies.length;
  const totalAMs = accountManagers.length;
  const totalProspectsCount = prospects.length;

  return (
    <div className="space-y-8 max-w-[1700px] mx-auto animate-fade-in pb-12 text-slate-800 dark:text-slate-100">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-850 pb-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Gestión Account Manager</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Compara métricas clave, volúmenes de financiamiento y embudos de conversión de supervisores lado a lado.
          </p>
        </div>
      </div>

      {/* Global Highlights Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between h-24 relative overflow-hidden transition-colors">
          <div className="absolute right-[-10px] top-[-10px] bg-indigo-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Supervisores en Sistema</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-800 dark:text-white">{totalAMs} AMs</span>
            <span className="text-[10px] text-slate-550 dark:text-slate-400 font-bold">
              Asignación Comercial
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between h-24 relative overflow-hidden transition-colors">
          <div className="absolute right-[-10px] top-[-10px] bg-emerald-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Cartera Total de Aliados</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-500">{totalAllies} B2B</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">
              Aliados Registrados
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between h-24 relative overflow-hidden transition-colors">
          <div className="absolute right-[-10px] top-[-10px] bg-amber-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Expedientes en Embudo</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-600 dark:text-amber-500">{totalProspectsCount} Casos</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">
              Prospectos Totales
            </span>
          </div>
        </div>
      </div>

      {/* Comparative Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-stretch">
        {columns.map((col) => {
          const m = col.metrics;
          return (
            <div 
              key={col.id} 
              className={`bg-white dark:bg-slate-900 rounded-3xl border shadow-sm p-6 flex flex-col justify-between transition-all hover:shadow-md ${
                col.type === "director" 
                  ? "border-emerald-200/60 dark:border-emerald-950/40 bg-emerald-50/[0.02]" 
                  : "border-slate-200 dark:border-slate-800"
              }`}
            >
              {/* Card Header */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center text-sm font-black border ${
                    col.type === "director"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-250/20"
                      : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-250/20"
                  }`}>
                    {col.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-slate-800 dark:text-white truncate tracking-tight">{col.name}</h3>
                    <p className="text-[10px] text-slate-400 font-semibold truncate leading-normal uppercase mt-0.5">{col.email}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-100 dark:border-slate-850">
                  <div className="text-center">
                    <span className="block text-[8px] text-slate-400 dark:text-slate-500 font-extrabold uppercase">Aliados</span>
                    <span className="text-xs font-black text-slate-700 dark:text-slate-300 mt-0.5 block">{col.alliesCount} B2B</span>
                  </div>
                  <div className="text-center border-l border-slate-200/50 dark:border-slate-850">
                    <span className="block text-[8px] text-slate-400 dark:text-slate-500 font-extrabold uppercase">Clientes</span>
                    <span className="text-xs font-black text-slate-700 dark:text-slate-300 mt-0.5 block">{m.totalCount} Casos</span>
                  </div>
                </div>
              </div>

              {/* Vertical Funnel Comparison */}
              <div className="my-6 space-y-3">
                <span className="text-[9px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider block">Embudo Operativo Vertical</span>
                
                <div className="space-y-2">
                  {/* Proyectos */}
                  <div className="p-2.5 bg-slate-50/70 dark:bg-slate-950/20 border border-slate-150 dark:border-slate-850 rounded-xl">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 dark:text-slate-350">
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3.5 w-3.5 text-slate-450" /> Proyectos
                      </span>
                      <span>{m.totalCount}</span>
                    </div>
                    <div className="w-full bg-slate-200/60 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1.5">
                      <div className="bg-slate-500 h-full rounded-full" style={{ width: m.totalCount > 0 ? "100%" : "0%" }} />
                    </div>
                  </div>

                  {/* En Evaluación */}
                  <div className="p-2.5 bg-blue-50/20 dark:bg-blue-950/10 border border-blue-100/50 dark:border-blue-900/20 rounded-xl">
                    <div className="flex items-center justify-between text-[10px] font-bold text-blue-600 dark:text-blue-400">
                      <span className="flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5" /> En Evaluación
                      </span>
                      <span>{m.enEvaluacion}</span>
                    </div>
                    <div className="w-full bg-slate-200/60 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1.5">
                      <div className="bg-blue-500 h-full rounded-full" style={{ width: m.totalCount > 0 ? `${(m.enEvaluacion / m.totalCount) * 100}%` : "0%" }} />
                    </div>
                  </div>

                  {/* Aprobados */}
                  <div className="p-2.5 bg-emerald-50/20 dark:bg-emerald-950/10 border border-emerald-100/50 dark:border-emerald-900/20 rounded-xl">
                    <div className="flex items-center justify-between text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      <span className="flex items-center gap-1">
                        <Award className="h-3.5 w-3.5" /> Aprobados
                      </span>
                      <span>{m.aprobados}</span>
                    </div>
                    <div className="w-full bg-slate-200/60 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1.5">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: m.totalCount > 0 ? `${(m.aprobados / m.totalCount) * 100}%` : "0%" }} />
                    </div>
                  </div>

                  {/* Condicionados */}
                  <div className="p-2.5 bg-amber-50/20 dark:bg-amber-955/10 border border-amber-100/50 dark:border-amber-900/20 rounded-xl">
                    <div className="flex items-center justify-between text-[10px] font-bold text-amber-600 dark:text-amber-400">
                      <span className="flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5" /> Condicionados
                      </span>
                      <span>{m.condicionados}</span>
                    </div>
                    <div className="w-full bg-slate-200/60 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1.5">
                      <div className="bg-amber-500 h-full rounded-full" style={{ width: m.totalCount > 0 ? `${(m.condicionados / m.totalCount) * 100}%` : "0%" }} />
                    </div>
                  </div>

                  {/* Rechazados */}
                  <div className="p-2.5 bg-rose-50/20 dark:bg-rose-955/10 border border-rose-100/50 dark:border-rose-900/20 rounded-xl">
                    <div className="flex items-center justify-between text-[10px] font-bold text-rose-600 dark:text-rose-450">
                      <span className="flex items-center gap-1">
                        <UserX className="h-3.5 w-3.5" /> Rechazados
                      </span>
                      <span>{m.rechazados}</span>
                    </div>
                    <div className="w-full bg-slate-200/60 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1.5">
                      <div className="bg-rose-500 h-full rounded-full" style={{ width: m.totalCount > 0 ? `${(m.rechazados / m.totalCount) * 100}%` : "0%" }} />
                    </div>
                  </div>

                  {/* Otorgados */}
                  <div className="p-2.5 bg-teal-50/20 dark:bg-teal-955/10 border border-teal-100/50 dark:border-teal-900/20 rounded-xl">
                    <div className="flex items-center justify-between text-[10px] font-bold text-teal-650 dark:text-teal-400">
                      <span className="flex items-center gap-1">
                        <UserCheck className="h-3.5 w-3.5" /> Otorgados
                      </span>
                      <span>{m.otorgados}</span>
                    </div>
                    <div className="w-full bg-slate-200/60 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1.5">
                      <div className="bg-teal-500 h-full rounded-full" style={{ width: m.totalCount > 0 ? `${(m.otorgados / m.totalCount) * 100}%` : "0%" }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Financial & KPIs Footer Section */}
              <div className="space-y-4 pt-4 border-t border-slate-150 dark:border-slate-850">
                {/* Financial Boxes */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center bg-indigo-50/30 dark:bg-indigo-950/10 p-2 rounded-xl border border-indigo-100/30">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      <DollarSign className="h-3 w-3 text-indigo-500" /> Fin. Aprobado
                    </span>
                    <span className="text-xs font-black text-indigo-700 dark:text-indigo-400">{formatCurrency(m.finAprobados)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-emerald-50/30 dark:bg-emerald-955/10 p-2 rounded-xl border border-emerald-100/30">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      <DollarSign className="h-3 w-3 text-emerald-500" /> Fin. Otorgado
                    </span>
                    <span className="text-xs font-black text-emerald-700 dark:text-emerald-400">{formatCurrency(m.finOtorgados)}</span>
                  </div>
                </div>

                {/* Conversion KPIs */}
                <div className="grid grid-cols-3 gap-2 bg-slate-50/50 dark:bg-slate-950/20 p-2 rounded-xl text-center text-slate-600 dark:text-slate-400">
                  <div>
                    <span className="block text-[7px] text-slate-400 font-bold uppercase leading-none">T. Eval</span>
                    <span className="text-[10px] font-black mt-1.5 block leading-none">{m.tasaEvaluacion.toFixed(0)}%</span>
                  </div>
                  <div className="border-l border-slate-200/50 dark:border-slate-800">
                    <span className="block text-[7px] text-slate-400 font-bold uppercase leading-none">T. Aprob</span>
                    <span className="text-[10px] font-black mt-1.5 block leading-none">{m.tasaAprobacion.toFixed(0)}%</span>
                  </div>
                  <div className="border-l border-slate-200/50 dark:border-slate-800">
                    <span className="block text-[7px] text-slate-400 font-bold uppercase leading-none">T. Cierre</span>
                    <span className="text-[10px] font-black mt-1.5 block leading-none">{m.tasaCierre.toFixed(0)}%</span>
                  </div>
                </div>
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}
