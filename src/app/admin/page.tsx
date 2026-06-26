"use client";

import React, { useState, useMemo } from "react";
import {
  useApp,
  Prospect,
  getStageAndSubStage,
} from "@/utils/context/AppContext";
import SalesFunnel from "@/components/SalesFunnel";
import {
  Users,
  TrendingUp,
  Briefcase,
  Calendar,
  Sparkles,
  PieChart,
  Target,
  CircleDollarSign,
  Heart,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function PipelineManagerContent() {
  const {
    user,
    prospects,
    profiles,
    isProspectDeleted,
    isProspectPurged,
  } = useApp();

  const isAM = user?.role === "account_manager";
  const searchParams = useSearchParams();

  const startDate = searchParams.get("desde") || "";
  const endDate = searchParams.get("hasta") || "";

  // Director filtering states
  const [directorFilterType, setDirectorFilterType] = useState<"todos" | "am" | "aliado" | "gestion_directa">("todos");
  const [selectedAMId, setSelectedAMId] = useState<string>("all");
  const [selectedAllyId, setSelectedAllyId] = useState<string>("all");

  const baseFilteredProspects = useMemo(() => {
    if (user?.role !== "director") return prospects;

    if (directorFilterType === "todos") {
      return prospects;
    }
    if (directorFilterType === "am") {
      if (selectedAMId === "all") return prospects;
      const assignedAllyIds = profiles
        .filter((p) => p.role === "aliado" && p.account_manager_id === selectedAMId)
        .map((p) => p.id);
      return prospects.filter((p) => assignedAllyIds.includes(p.aliado_id));
    }
    if (directorFilterType === "aliado") {
      if (selectedAllyId === "all") return prospects;
      return prospects.filter((p) => p.aliado_id === selectedAllyId);
    }
    if (directorFilterType === "gestion_directa") {
      const unassignedAllyIds = profiles
        .filter((p) => p.role === "aliado" && !p.account_manager_id)
        .map((p) => p.id);
      return prospects.filter((p) => unassignedAllyIds.includes(p.aliado_id));
    }
    return prospects;
  }, [prospects, user, directorFilterType, selectedAMId, selectedAllyId, profiles]);

  const activeProspects = baseFilteredProspects.filter((p) => !isProspectDeleted(p) && !isProspectPurged(p));

  const filteredByDate = activeProspects.filter((p) => {
    if (!p.created_at) return true;
    const createdDateStr = p.created_at.substring(0, 10);

    if (startDate && createdDateStr < startDate) return false;
    if (endDate && createdDateStr > endDate) return false;

    return true;
  });

  const amsList = useMemo(() => {
    return profiles.filter((p) => p.role === "account_manager" && p.is_active);
  }, [profiles]);

  // Calculate efficiency data for each AM
  const amPerformanceData = useMemo(() => {
    const getAMStats = (amId: string | null, amName: string) => {
      // Find allies assigned to this AM
      const amAllies = profiles.filter(
        (p) => p.role === "aliado" && p.is_active && (amId ? p.account_manager_id === amId : !p.account_manager_id)
      );
      const amAllyIds = amAllies.map((a) => a.id);

      // Prospects for this AM's allies (already date-filtered)
      const amProspects = filteredByDate.filter((p) => amAllyIds.includes(p.aliado_id));

      const totalClientes = amProspects.length;

      const evaluados = amProspects.filter((p) =>
        ["evaluacion_pendiente", "analisis_riesgo", "doc_proceso"].includes(p.status)
      ).length;

      const aprobados = amProspects.filter((p) =>
        ["aprobado_listo", "asesoria_agendada", "firma_programada", "aportacion"].includes(p.status)
      ).length;

      const condicionados = amProspects.filter((p) =>
        ["falta_reporte", "falta_afore", "pendiente_documentos", "falta_semanas", "falta_afore_cuenta", "posible_simulacion"].includes(p.status)
      ).length;

      const rechazados = amProspects.filter((p) =>
        ["rechazado", "cerrado_perdido"].includes(p.status)
      ).length;

      const approvedStatuses = [
        "aprobado_listo",
        "aportacion",
        "asesoria_agendada",
        "doc_proceso",
        "analisis_riesgo",
        "firma_programada",
        "pagado_comision",
      ];
      const finAprobados = amProspects
        .filter((p) => approvedStatuses.includes(p.status) && p.simulation)
        .reduce((sum, p) => sum + (p.simulation?.totalCredito || p.simulation?.financiamiento || 0), 0);

      const finOtorgados = amProspects
        .filter((p) => p.status === "pagado_comision" && p.simulation)
        .reduce((sum, p) => sum + (p.simulation?.totalCredito || p.simulation?.financiamiento || 0), 0);

      const tasaEvaluacion = totalClientes > 0 ? (evaluados / totalClientes) * 100 : 0;
      const tasaAprobacion = evaluados > 0 ? (aprobados / evaluados) * 100 : 0;
      const tasaCierre = aprobados > 0 ? (amProspects.filter((p) => p.status === "pagado_comision").length / aprobados) * 100 : 0;

      return {
        name: amName,
        alliesCount: amAllies.length,
        clientes: totalClientes,
        evaluados,
        aprobados,
        condicionados,
        rechazados,
        finAprobados,
        finOtorgados,
        tasaEvaluacion,
        tasaAprobacion,
        tasaCierre,
      };
    };

    // Calculate for all AMs
    const data = amsList.map((am) => getAMStats(am.id, am.full_name));

    // Add "Gestión Directa" (Director's own managed allies)
    const directData = getAMStats(null, "Gestión Directa (Sin AM)");
    if (directData.alliesCount > 0 || directData.clientes > 0) {
      data.push(directData);
    }

    return data;
  }, [amsList, profiles, filteredByDate]);

  // Filter performance data by the selected filters at the top
  const displayPerformanceData = useMemo(() => {
    let result = amPerformanceData;

    if (isAM) {
      result = result.filter((row) => row.name === user?.full_name);
    } else {
      if (directorFilterType === "am" && selectedAMId !== "all") {
        const selectedAM = profiles.find((p) => p.id === selectedAMId);
        if (selectedAM) {
          result = result.filter((row) => row.name === selectedAM.full_name);
        }
      } else if (directorFilterType === "gestion_directa") {
        result = result.filter((row) => row.name === "Gestión Directa (Sin AM)");
      } else if (directorFilterType === "aliado" && selectedAllyId !== "all") {
        const selectedAlly = profiles.find((p) => p.id === selectedAllyId);
        if (selectedAlly) {
          if (selectedAlly.account_manager_id) {
            const managingAM = profiles.find((p) => p.id === selectedAlly.account_manager_id);
            if (managingAM) {
              result = result.filter((row) => row.name === managingAM.full_name);
            }
          } else {
            result = result.filter((row) => row.name === "Gestión Directa (Sin AM)");
          }
        }
      }
    }

    return result;
  }, [amPerformanceData, isAM, user, directorFilterType, selectedAMId, selectedAllyId, profiles]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  const themeColorText = isAM ? "text-blue-500" : "text-emerald-500";

  return (
    <div className="space-y-8 max-w-[1700px] mx-auto animate-fade-in text-slate-800 dark:text-slate-100">
      
      {/* Director Pipeline Assignment Filters */}
      {!isAM && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-808/80 shadow-sm p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 flex-shrink-0 text-emerald-500" />
            <div>
              <h4 className="text-xs font-bold text-slate-808 dark:text-white">Filtro de Asignación / Origen</h4>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Filtra todo el embudo y el comparativo por supervisor, aliado comercial o gestión directa.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="bg-slate-200/60 dark:bg-slate-950 p-1 rounded-xl flex border border-slate-202 dark:border-slate-850 text-xs font-bold">
              <button
                onClick={() => setDirectorFilterType("todos")}
                className={`px-3 py-1.5 rounded-lg transition-all text-[10px] ${
                  directorFilterType === "todos" ? "bg-white dark:bg-slate-850 text-slate-850 dark:text-white shadow-sm font-black" : "text-slate-500 hover:text-slate-850"
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setDirectorFilterType("am")}
                className={`px-3 py-1.5 rounded-lg transition-all text-[10px] ${
                  directorFilterType === "am" ? "bg-white dark:bg-slate-850 text-slate-850 dark:text-white shadow-sm font-black" : "text-slate-505 hover:text-slate-850"
                }`}
              >
                Por Account Manager
              </button>
              <button
                onClick={() => setDirectorFilterType("aliado")}
                className={`px-3 py-1.5 rounded-lg transition-all text-[10px] ${
                  directorFilterType === "aliado" ? "bg-white dark:bg-slate-850 text-slate-850 dark:text-white shadow-sm font-black" : "text-slate-505 hover:text-slate-850"
                }`}
              >
                Por Aliado
              </button>
              <button
                onClick={() => setDirectorFilterType("gestion_directa")}
                className={`px-3 py-1.5 rounded-lg transition-all text-[10px] ${
                  directorFilterType === "gestion_directa" ? "bg-white dark:bg-slate-850 text-slate-850 dark:text-white shadow-sm font-black" : "text-slate-500 hover:text-slate-850"
                }`}
              >
                Gestión Directa
              </button>
            </div>

            {directorFilterType === "am" && (
              <select
                value={selectedAMId}
                onChange={(e) => setSelectedAMId(e.target.value)}
                className="bg-slate-55 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl py-1.5 px-3 text-xs font-semibold outline-none transition-colors cursor-pointer dark:text-slate-350 focus:border-emerald-500"
              >
                <option value="all">Todos los AM...</option>
                {profiles
                  .filter((p) => p.role === "account_manager")
                  .map((am) => (
                    <option key={am.id} value={am.id}>
                      {am.full_name}
                    </option>
                  ))}
              </select>
            )}

            {directorFilterType === "aliado" && (
              <select
                value={selectedAllyId}
                onChange={(e) => setSelectedAllyId(e.target.value)}
                className="bg-slate-55 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl py-1.5 px-3 text-xs font-semibold outline-none transition-colors cursor-pointer dark:text-slate-355 focus:border-emerald-500"
              >
                <option value="all">Todos los aliados...</option>
                {profiles
                  .filter((p) => p.role === "aliado")
                  .map((ally) => (
                    <option key={ally.id} value={ally.id}>
                      {ally.full_name}
                    </option>
                  ))}
              </select>
            )}
          </div>
        </div>
      )}

      {/* Sales Funnel Section */}
      <SalesFunnel prospects={filteredByDate} />

      {/* Account Manager Performance Comparative Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-805 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 dark:text-slate-505 font-bold uppercase tracking-widest">
            {isAM ? "Mis Indicadores de Eficiencia" : "Indicadores de Gestión de los Account Managers"}
          </span>
          <span className={`text-[10px] font-bold flex items-center gap-1 ${themeColorText}`}>
            <Sparkles className="h-3.5 w-3.5" />
            Comparativa de eficiencia en tiempo real
          </span>
        </div>

        {displayPerformanceData.length === 0 ? (
          <div className="py-20 text-center space-y-3 bg-white dark:bg-slate-900">
            <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mx-auto">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-705 dark:text-slate-300">Sin datos de rendimiento</h4>
              <p className="text-xs text-slate-450 dark:text-slate-500 mt-1 max-w-[280px] mx-auto">
                No hay asesores asignados ni prospectos registrados bajo el filtro actual.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-150 dark:border-slate-800 text-[9px] font-bold text-slate-550 dark:text-slate-455 uppercase tracking-widest text-left">
                  <th className="px-6 py-4">Account Manager</th>
                  <th className="px-4 py-4 text-center">Aliados</th>
                  <th className="px-4 py-4 text-center">Clientes</th>
                  <th className="px-4 py-4 text-center">Evaluados</th>
                  <th className="px-4 py-4 text-center">Aprobados</th>
                  <th className="px-4 py-4 text-center">Condicionados</th>
                  <th className="px-4 py-4 text-center">Rechazados</th>
                  <th className="px-5 py-4 text-right">Fin. Aprobados</th>
                  <th className="px-5 py-4 text-right">Fin. Otorgados</th>
                  <th className="px-4 py-4 text-center">Tasa Eval.</th>
                  <th className="px-4 py-4 text-center">Tasa Aprob.</th>
                  <th className="px-4 py-4 text-center">Tasa Cierre</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 dark:divide-slate-808">
                {displayPerformanceData.map((row) => (
                  <tr key={row.name} className="hover:bg-slate-50/40 dark:hover:bg-slate-850/10 transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap text-xs font-extrabold text-slate-808 dark:text-slate-200">
                      {row.name}
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-350">
                      {row.alliesCount}
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-350">
                      {row.clientes}
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-350">
                      {row.evaluados}
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap text-xs font-semibold text-slate-605 dark:text-slate-350">
                      {row.aprobados}
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-350">
                      {row.condicionados}
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-350">
                      {row.rechazados}
                    </td>
                    <td className="px-5 py-4 text-right whitespace-nowrap text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                      {formatCurrency(row.finAprobados)}
                    </td>
                    <td className="px-5 py-4 text-right whitespace-nowrap text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(row.finOtorgados)}
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-955/20 text-blue-650 dark:text-blue-400 border border-blue-105">
                        {row.tasaEvaluacion.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 dark:bg-purple-950/20 text-purple-650 dark:text-purple-405 border border-purple-105">
                        {row.tasaAprobacion.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-650 dark:text-emerald-400 border border-emerald-105">
                        {row.tasaCierre.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PipelineManager() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-455">Cargando consola...</div>}>
      <PipelineManagerContent />
    </Suspense>
  );
}
