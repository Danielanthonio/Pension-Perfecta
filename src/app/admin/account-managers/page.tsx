"use client";

import React from "react";
import { useApp } from "@/utils/context/AppContext";
import { StatCard } from "@/components/ui/StatCard";
import { useSortable, SortControl } from "@/components/ui/sorting";
import {
  Users,
  Award,
  Layers,
  DollarSign,
  Briefcase,
  UserCheck,
  UserX,
} from "lucide-react";

export default function GestionAccountManagers() {
  const { profiles, prospects } = useApp();

  const allies = profiles.filter((p) => p.role === "aliado");
  const accountManagers = profiles.filter((p) => p.role === "account_manager");

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  const getMetricsForAllies = (allyIds: string[]) => {
    const groupProspects = prospects.filter((p) => allyIds.includes(p.aliado_id));
    const totalCount = groupProspects.length;

    const aprobados = groupProspects.filter((p) =>
      ["aprobado_listo", "asesoria_agendada", "firma_programada"].includes(p.status)
    ).length;

    const condicionados = groupProspects.filter((p) =>
      ["falta_reporte", "falta_afore", "pendiente_documentos", "falta_semanas", "falta_afore_cuenta", "posible_simulacion", "aportacion"].includes(p.status)
    ).length;

    // "Cerrado perdido" es solo un estado del cliente, no un rechazo.
    const rechazados = groupProspects.filter((p) => p.status === "rechazado").length;

    const otorgados = groupProspects.filter((p) => p.status === "pagado_comision").length;

    // "Evaluados" = proyectos que ya tienen un dictamen/respuesta (aprobado, condicionado,
    // rechazado u otorgado). Los estados previos al dictamen (evaluacion_pendiente,
    // analisis_riesgo, doc_proceso) todavía NO cuentan como evaluados.
    const enEvaluacion = aprobados + condicionados + rechazados + otorgados;

    const approvedStatuses = [
      "aprobado_listo", "aportacion", "asesoria_agendada", "doc_proceso",
      "analisis_riesgo", "firma_programada", "pagado_comision",
    ];
    const finAprobados = groupProspects
      .filter((p) => approvedStatuses.includes(p.status) && p.simulation)
      .reduce((sum, p) => sum + (p.simulation?.totalCredito || p.simulation?.financiamiento || 0), 0);

    const finOtorgados = groupProspects
      .filter((p) => p.status === "pagado_comision" && p.simulation)
      .reduce((sum, p) => sum + (p.simulation?.totalCredito || p.simulation?.financiamiento || 0), 0);

    const tasaEvaluacion = totalCount > 0 ? (enEvaluacion / totalCount) * 100 : 0;
    const tasaAprobacion = enEvaluacion > 0 ? (aprobados / enEvaluacion) * 100 : 0;
    const tasaCierre = aprobados > 0 ? (otorgados / aprobados) * 100 : 0;

    return {
      totalCount, enEvaluacion, aprobados, condicionados, rechazados, otorgados,
      finAprobados, finOtorgados, tasaEvaluacion, tasaAprobacion, tasaCierre,
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

  type Column = (typeof columns)[number];

  const sortAM = useSortable<Column>(
    columns,
    {
      clientes: (c) => c.metrics.totalCount,
      aprobados: (c) => c.metrics.aprobados,
      otorgados: (c) => c.metrics.otorgados,
      finAprobados: (c) => c.metrics.finAprobados,
      finOtorgados: (c) => c.metrics.finOtorgados,
      tasaCierre: (c) => c.metrics.tasaCierre,
      aliados: (c) => c.alliesCount,
      name: (c) => c.name,
    },
    "clientes",
    "desc"
  );
  const sortOptions = [
    { id: "clientes", label: "Clientes" },
    { id: "aprobados", label: "Aprobados" },
    { id: "otorgados", label: "Otorgados" },
    { id: "finAprobados", label: "Fin. aprobado" },
    { id: "finOtorgados", label: "Fin. otorgado" },
    { id: "tasaCierre", label: "Tasa cierre" },
    { id: "aliados", label: "Nº de aliados" },
    { id: "name", label: "Nombre (A-Z)" },
  ];

  const totalAllies = allies.length;
  const totalAMs = accountManagers.length;
  const totalProspectsCount = prospects.length;

  return (
    <div className="space-y-5 max-w-[1700px] mx-auto animate-fade-in pb-12 text-slate-800 dark:text-slate-100">

      {/* Header actions */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-slate-500 dark:text-slate-400 text-xs hidden sm:block">
          Compara métricas, financiamiento y embudos de conversión de supervisores lado a lado.
        </p>
        <SortControl options={sortOptions} sort={sortAM} accent="emerald" />
      </div>

      {/* Global Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Supervisores en Sistema" value={`${totalAMs}`} sub="AMs" tone="indigo" icon={UserCheck} />
        <StatCard label="Cartera Total de Aliados" value={`${totalAllies}`} sub="Aliados B2B" tone="emerald" icon={Users} />
        <StatCard label="Expedientes en Embudo" value={`${totalProspectsCount}`} sub="Prospectos" tone="amber" icon={Briefcase} />
      </div>

      {/* Comparative Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-stretch">
        {sortAM.sorted.map((col) => {
          const m = col.metrics;
          const funnelRows = [
            { label: "Proyectos", value: m.totalCount, icon: Briefcase, bar: "bg-slate-400", text: "text-slate-600 dark:text-slate-300" },
            { label: "Evaluados", value: m.enEvaluacion, icon: Layers, bar: "bg-blue-500", text: "text-blue-600 dark:text-blue-400" },
            { label: "Aprobados", value: m.aprobados, icon: Award, bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
            { label: "Condicionados", value: m.condicionados, icon: Layers, bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
            { label: "Rechazados", value: m.rechazados, icon: UserX, bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
            { label: "Otorgados", value: m.otorgados, icon: UserCheck, bar: "bg-teal-500", text: "text-teal-600 dark:text-teal-400" },
          ];
          return (
            <div
              key={col.id}
              className={`bg-white dark:bg-slate-900 rounded-2xl border shadow-sm p-4 flex flex-col justify-between transition-all hover:shadow-md ${
                col.type === "director"
                  ? "border-emerald-200/70 dark:border-emerald-900/40"
                  : "border-slate-200/70 dark:border-slate-800"
              }`}
            >
              {/* Card Header */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <div className={`h-9 w-9 rounded-xl flex items-center justify-center text-sm font-bold ring-1 ring-inset ring-black/5 dark:ring-white/10 ${
                    col.type === "director"
                      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                      : "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400"
                  }`}>
                    {col.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-slate-800 dark:text-white truncate tracking-tight">{col.name}</h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate uppercase tracking-wide mt-0.5">{col.email}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-100 dark:border-slate-850">
                  <div className="text-center">
                    <span className="block text-[8px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wide">Aliados</span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5 block tabular-nums">{col.alliesCount}</span>
                  </div>
                  <div className="text-center border-l border-slate-200/60 dark:border-slate-850">
                    <span className="block text-[8px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wide">Clientes</span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5 block tabular-nums">{m.totalCount}</span>
                  </div>
                </div>
              </div>

              {/* Vertical Funnel Comparison */}
              <div className="my-4 space-y-2">
                <span className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-[0.08em] block">Embudo Operativo</span>
                <div className="space-y-1.5">
                  {funnelRows.map((r) => {
                    const RIcon = r.icon;
                    return (
                      <div key={r.label}>
                        <div className={`flex items-center justify-between text-[10px] font-semibold ${r.text}`}>
                          <span className="flex items-center gap-1">
                            <RIcon className="h-3 w-3" strokeWidth={2.2} /> {r.label}
                          </span>
                          <span className="tabular-nums">{r.value}</span>
                        </div>
                        <div className="w-full bg-slate-200/60 dark:bg-slate-800 h-1 rounded-full overflow-hidden mt-1">
                          <div className={`${r.bar} h-full rounded-full transition-all duration-500`} style={{ width: m.totalCount > 0 ? `${(r.value / m.totalCount) * 100}%` : "0%" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Financial & KPIs Footer */}
              <div className="space-y-3 pt-3 border-t border-slate-150 dark:border-slate-850">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center bg-indigo-50/40 dark:bg-indigo-950/10 px-2 py-1.5 rounded-lg">
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide flex items-center gap-1">
                      <DollarSign className="h-3 w-3 text-indigo-500" /> Fin. Aprobado
                    </span>
                    <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-400 tabular-nums">{formatCurrency(m.finAprobados)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-emerald-50/40 dark:bg-emerald-950/10 px-2 py-1.5 rounded-lg">
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide flex items-center gap-1">
                      <DollarSign className="h-3 w-3 text-emerald-500" /> Fin. Otorgado
                    </span>
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{formatCurrency(m.finOtorgados)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-slate-50/60 dark:bg-slate-950/30 py-1.5 rounded-lg text-center text-slate-600 dark:text-slate-400">
                  <div>
                    <span className="block text-[7px] text-slate-400 dark:text-slate-500 font-semibold uppercase leading-none">T. Eval</span>
                    <span className="text-[11px] font-bold mt-1 block leading-none tabular-nums">{m.tasaEvaluacion.toFixed(0)}%</span>
                  </div>
                  <div className="border-l border-slate-200/60 dark:border-slate-800">
                    <span className="block text-[7px] text-slate-400 dark:text-slate-500 font-semibold uppercase leading-none">T. Aprob</span>
                    <span className="text-[11px] font-bold mt-1 block leading-none tabular-nums">{m.tasaAprobacion.toFixed(0)}%</span>
                  </div>
                  <div className="border-l border-slate-200/60 dark:border-slate-800">
                    <span className="block text-[7px] text-slate-400 dark:text-slate-500 font-semibold uppercase leading-none">T. Cierre</span>
                    <span className="text-[11px] font-bold mt-1 block leading-none tabular-nums">{m.tasaCierre.toFixed(0)}%</span>
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
