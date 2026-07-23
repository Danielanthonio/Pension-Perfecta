"use client";

import React, { useState } from "react";
import { useApp, Prospect } from "@/utils/context/AppContext";
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
  Shuffle,
} from "lucide-react";

export default function GestionAccountManagers() {
  const { profiles, prospects, user, updateProfileAdmin } = useApp();

  const isDirector = user?.role === "director";

  const allies = profiles.filter((p) => p.role === "aliado");
  const accountManagers = profiles.filter((p) => p.role === "account_manager");

  // Interruptor de "ruleta" de asignación automática por AM. La ruleta reparte
  // PROYECTOS: solo los AM encendidos reciben proyectos nuevos al azar cuando un
  // aliado captura lo suyo; los apagados (p. ej. cuentas de prueba) quedan fuera
  // del sorteo. La asignación real la ejecuta el trigger assign_am_to_prospect
  // sobre prospects (el trigger sobre profiles se eliminó).
  const [togglingId, setTogglingId] = useState<string | null>(null);
  // Cuenta solo los AM que realmente entran al sorteo: encendidos Y activos (mismo
  // criterio que `pickRandomAutoAssignAM` y el trigger de la BD). Un AM inactivo,
  // aunque tenga el interruptor encendido, no recibe proyectos.
  const rouletteCount = accountManagers.filter(
    (am) => am.auto_assign_enabled === true && am.is_active !== false
  ).length;

  const handleToggleRoulette = async (amId: string, current: boolean) => {
    setTogglingId(amId);
    try {
      await updateProfileAdmin(amId, { auto_assign_enabled: !current });
    } catch (e) {
      console.error(e);
      alert("No se pudo actualizar la ruleta de asignación automática.");
    } finally {
      setTogglingId(null);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  const getMetricsForProspects = (groupProspects: Prospect[]) => {
    const totalCount = groupProspects.length;

    // "Aprobado" = misma etapa que Gestión Clientes (getStageAndSubStage → "aprobado"): dictamen
    // de aprobación + pipeline de cierre posterior. Un proyecto ahí YA fue aprobado.
    const aprobados = groupProspects.filter((p) =>
      ["aprobado_listo", "asesoria_agendada", "doc_proceso", "analisis_riesgo", "firma_contrato", "firma_programada"].includes(p.status)
    ).length;

    const condicionados = groupProspects.filter((p) =>
      ["falta_reporte", "falta_afore", "pendiente_documentos", "falta_semanas", "falta_afore_cuenta", "posible_simulacion", "agenda_futura", "aportacion"].includes(p.status)
    ).length;

    // "Cerrado perdido" es solo un estado del cliente, no un rechazo.
    const rechazados = groupProspects.filter((p) => p.status === "rechazado").length;

    const otorgados = groupProspects.filter((p) => p.status === "pagado_comision").length;

    // "Evaluados" = proyectos que ya tienen un dictamen/respuesta (aprobado, condicionado,
    // rechazado u otorgado). El único estado previo al dictamen que se excluye es
    // evaluacion_pendiente.
    const enEvaluacion = aprobados + condicionados + rechazados + otorgados;

    const approvedStatuses = [
      "aprobado_listo", "aportacion", "asesoria_agendada", "doc_proceso",
      "analisis_riesgo", "firma_contrato", "firma_programada", "pagado_comision",
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

  // "Aliados" de una columna = aliados distintos dueños de los proyectos de esa lista
  // (la "cartera de aliados" del AM ya no existe: la relación nace de sus proyectos).
  const distinctAlliesCount = (groupProspects: Prospect[]) =>
    new Set(groupProspects.map((p) => p.aliado_id)).size;

  // Proyectos sin AM (account_manager_id null) = mesa de dirección / gestión directa.
  const directProspects = prospects.filter((p) => !p.account_manager_id);

  // Columnas a comparar: cada Account Manager con SUS proyectos + la gestión directa del director
  const columns = [
    ...accountManagers.map((am) => {
      const amProspects = prospects.filter((p) => p.account_manager_id === am.id);
      return {
        id: am.id,
        name: am.full_name,
        email: am.email,
        type: "account_manager" as const,
        alliesCount: distinctAlliesCount(amProspects),
        autoAssign: am.auto_assign_enabled === true,
        metrics: getMetricsForProspects(amProspects),
      };
    }),
    {
      id: "director_direct",
      name: "Gestión Directa (Director)",
      email: "Operaciones Centrales",
      type: "director" as const,
      alliesCount: distinctAlliesCount(directProspects),
      autoAssign: false,
      metrics: getMetricsForProspects(directProspects),
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

      {/* Explicación de la ruleta de asignación automática (para el director) */}
      {isDirector && (
        <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/15 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          <Shuffle className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" strokeWidth={2.2} />
          <span>
            La asignación de proyectos a Account Manager es <strong className="text-slate-800 dark:text-slate-100">automática y al azar</strong> entre los AM que estén en la ruleta cuando un aliado captura su propio proyecto.
            Enciende el interruptor de cada AM que deba participar; deja apagadas las cuentas de prueba.
            {rouletteCount === 0 ? (
              <span className="text-amber-600 dark:text-amber-400 font-semibold"> Ahora mismo no hay ningún AM en la ruleta, así que los proyectos nuevos quedan sin AM (mesa del director).</span>
            ) : (
              <span className="font-semibold text-indigo-700 dark:text-indigo-400"> {rouletteCount} {rouletteCount === 1 ? "AM participa" : "AM participan"} en la ruleta.</span>
            )}
          </span>
        </div>
      )}

      {/* Global Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Supervisores en Sistema" value={`${totalAMs}`} sub="AMs" tone="indigo" icon={UserCheck} />
        <StatCard label="Aliados en Sistema" value={`${totalAllies}`} sub="Aliados B2B" tone="emerald" icon={Users} />
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

                {/* Ruleta de asignación automática (solo AMs; editable por el director) */}
                {col.type === "account_manager" && (
                  <div className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border transition-colors ${
                    col.autoAssign
                      ? "border-emerald-200/70 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/15"
                      : "border-slate-150 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/30"
                  }`}>
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                      <Shuffle className={`h-3 w-3 ${col.autoAssign ? "text-emerald-500" : "text-slate-400 dark:text-slate-500"}`} strokeWidth={2.4} />
                      Ruleta de asignación
                    </span>
                    {isDirector ? (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={col.autoAssign}
                        onClick={() => handleToggleRoulette(col.id, col.autoAssign)}
                        disabled={togglingId === col.id}
                        title={col.autoAssign ? "Recibe proyectos nuevos al azar. Click para sacarlo del sorteo." : "Fuera del sorteo. Click para que reciba proyectos nuevos al azar."}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
                          col.autoAssign ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
                        } ${togglingId === col.id ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          col.autoAssign ? "translate-x-4" : "translate-x-1"
                        }`} />
                      </button>
                    ) : (
                      <span className={`text-[9px] font-black uppercase tracking-wide ${col.autoAssign ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"}`}>
                        {col.autoAssign ? "En sorteo" : "Fuera"}
                      </span>
                    )}
                  </div>
                )}
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
