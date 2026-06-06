"use client";

import React from "react";
import { Prospect, useApp } from "@/utils/context/AppContext";
import { ChevronRight } from "lucide-react";

interface SalesFunnelProps {
  prospects: Prospect[];
}

export default function SalesFunnel({ prospects }: SalesFunnelProps) {
  const { user, profiles } = useApp();

  const showAliadosCard = user?.role === "director" || user?.role === "account_manager";
  let alliesCount = 0;
  if (user?.role === "director") {
    alliesCount = profiles.filter((p) => p.role === "aliado" && p.account_manager_id !== null).length;
  } else if (user?.role === "account_manager") {
    alliesCount = profiles.filter((p) => p.role === "aliado" && p.account_manager_id === user.id).length;
  }

  // 1. Filter counts according to the specific mappings
  const proyectosCount = prospects.length;

  const enEvaluacionCount = prospects.filter((p) =>
    ["evaluacion_pendiente", "analisis_riesgo", "doc_proceso"].includes(p.status)
  ).length;

  const aprobadosCount = prospects.filter((p) =>
    ["aprobado_listo", "asesoria_agendada", "firma_programada", "aportacion"].includes(p.status)
  ).length;

  const condicionadosCount = prospects.filter((p) =>
    ["falta_reporte", "falta_afore", "pendiente_documentos"].includes(p.status)
  ).length;

  const rechazadosCount = prospects.filter((p) =>
    ["rechazado", "cerrado_perdido"].includes(p.status)
  ).length;

  const otorgadosCount = prospects.filter((p) =>
    p.status === "pagado_comision"
  ).length;

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
  const finAprobados = prospects
    .filter((p) => approvedStatuses.includes(p.status) && p.simulation)
    .reduce((sum, p) => sum + (p.simulation?.totalCredito || p.simulation?.financiamiento || 0), 0);

  // Financiamientos Otorgados: sum of simulation.totalCredito for closed/paid projects only (pagado_comision)
  const finOtorgados = prospects
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
    ...(showAliadosCard
      ? [
          {
            label: "Aliados",
            value: alliesCount,
            color: user?.role === "account_manager"
              ? "border-blue-100 dark:border-blue-900/30 bg-blue-50/40 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400"
              : "border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400",
          },
        ]
      : []),
    { label: "Proyectos", value: proyectosCount, color: "border-slate-205 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300" },
    { label: "En Evaluación", value: enEvaluacionCount, color: "border-blue-100 dark:border-blue-900/30 bg-blue-50/40 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400" },
    { label: "Aprobados", value: aprobadosCount, color: "border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400" },
    { label: "Condicionados", value: condicionadosCount, color: "border-amber-100 dark:border-amber-900/30 bg-amber-50/40 dark:bg-amber-955/15 text-amber-600 dark:text-amber-400" },
    { label: "Rechazados", value: rechazadosCount, color: "border-rose-100 dark:border-rose-900/30 bg-rose-50/40 dark:bg-rose-955/15 text-rose-600 dark:text-rose-450" },
    { label: "Otorgados", value: otorgadosCount, color: "border-teal-100 dark:border-teal-900/30 bg-teal-50/40 dark:bg-teal-955/15 text-teal-600 dark:text-teal-400" },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-805 p-6 shadow-sm space-y-5 w-full">
      {/* Visual Header */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-505 dark:text-slate-400">Embudo Comercial (Sales Funnel)</h3>
        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">Actualizado en tiempo real</span>
      </div>

      {/* Funnel row */}
      <div className="flex flex-row items-center gap-1.5 overflow-x-auto pb-3 w-full select-none no-scrollbar">
        {steps.map((step, idx) => (
          <React.Fragment key={step.label}>
            <div className={`flex-1 min-w-[120px] rounded-2xl border p-4 flex flex-col justify-between shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${step.color}`}>
              <span className="text-[9px] font-bold uppercase tracking-wider opacity-85 leading-none">{step.label}</span>
              <span className="text-2xl font-black mt-3 block leading-none">{step.value}</span>
            </div>
            {idx < steps.length - 1 && (
              <div className="flex items-center justify-center text-slate-300 dark:text-slate-600 shrink-0 px-0.5">
                <ChevronRight className="h-4 w-4 stroke-[2.5]" />
              </div>
            )}
          </React.Fragment>
        ))}

        {/* Vertical divider */}
        <div className="w-px bg-slate-200 dark:bg-slate-800 self-stretch mx-2 shrink-0 hidden lg:block" />

        {/* Right Arrow Connector to Aprobados financing */}
        <div className="flex items-center justify-center text-slate-350 dark:text-slate-600 shrink-0 px-0.5">
          <ChevronRight className="h-4 w-4 stroke-[2.5] text-indigo-400 dark:text-indigo-500" />
        </div>

        {/* Financiamientos Aprobados block */}
        <div className="flex-1 min-w-[170px] rounded-2xl border border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 p-4 flex flex-col justify-between shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
          <span className="text-[9px] font-bold uppercase tracking-wider opacity-85 leading-none">Financiamientos Aprobados</span>
          <span className="text-xl font-black mt-3 block leading-none truncate">{formatCurrency(finAprobados)}</span>
        </div>

        {/* Arrow Connector to Otorgados financing */}
        <div className="flex items-center justify-center text-slate-355 dark:text-slate-600 shrink-0 px-0.5">
          <ChevronRight className="h-4 w-4 stroke-[2.5] text-emerald-400 dark:text-emerald-500" />
        </div>

        {/* Financiamientos Otorgados block */}
        <div className="flex-1 min-w-[170px] rounded-2xl border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 p-4 flex flex-col justify-between shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
          <span className="text-[9px] font-bold uppercase tracking-wider opacity-85 leading-none">Financiamientos Otorgados</span>
          <span className="text-xl font-black mt-3 block leading-none truncate">{formatCurrency(finOtorgados)}</span>
        </div>
      </div>

      {/* Rates row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
        <div className="bg-slate-50/70 dark:bg-slate-950/20 border border-slate-205/50 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
          <span className="text-[9px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider leading-none">T. Evaluación</span>
          <span className="text-lg font-black text-slate-700 dark:text-slate-200 mt-2 leading-none">{tasaEvaluacion.toFixed(1)}%</span>
        </div>
        <div className="bg-slate-50/70 dark:bg-slate-950/20 border border-slate-205/50 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
          <span className="text-[9px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider leading-none">T. Aprobación</span>
          <span className="text-lg font-black text-slate-700 dark:text-slate-200 mt-2 leading-none">{tasaAprobacion.toFixed(1)}%</span>
        </div>
        <div className="bg-slate-50/70 dark:bg-slate-950/20 border border-slate-205/50 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
          <span className="text-[9px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider leading-none">T. Cierre</span>
          <span className="text-lg font-black text-slate-700 dark:text-slate-200 mt-2 leading-none">{tasaCierre.toFixed(1)}%</span>
        </div>
        <div className="bg-slate-50/70 dark:bg-slate-950/20 border border-slate-205/50 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
          <span className="text-[9px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider leading-none">T. Cierre monto fin.</span>
          <span className="text-lg font-black text-indigo-650 dark:text-indigo-400 mt-2 leading-none">{tasaCierreMonto.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}
