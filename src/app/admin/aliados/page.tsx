"use client";

import React, { useState } from "react";
import { useApp, Prospect, UserProfile } from "@/utils/context/AppContext";
import {
  Users,
  TrendingUp,
  Coins,
  CheckCircle,
  Clock,
  Search,
  Check,
  Eye,
  X,
  ChevronRight,
  FileText,
  ShieldAlert,
  ArrowUpRight,
  AlertTriangle,
  Award,
  BarChart3,
  Percent,
  Download,
  Calendar,
  DollarSign,
} from "lucide-react";

export default function GestorAliados() {
  const { prospects, profiles, isProspectDeleted, isProspectPurged } = useApp();
  const activeProspects = prospects.filter((p) => !isProspectDeleted(p) && !isProspectPurged(p));

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAlly, setSelectedAlly] = useState<UserProfile | null>(null);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [dateFilter, setDateFilter] = useState<{ start: string; end: string }>({ start: "", end: "" });

  // Get all allies dynamically from profiles list
  const allies = profiles.filter((p) => p.role === "aliado");

  // Helper to filter prospects by date range
  const filterProspectsByDate = (prospectList: Prospect[]) => {
    return prospectList.filter((p) => {
      if (!p.created_at) return true;
      const createdAt = new Date(p.created_at).getTime();
      if (dateFilter.start) {
        const start = new Date(dateFilter.start).getTime();
        if (createdAt < start) return false;
      }
      if (dateFilter.end) {
        // Add 1 day to make the end date inclusive
        const end = new Date(dateFilter.end).getTime() + 24 * 60 * 60 * 1000;
        if (createdAt > end) return false;
      }
      return true;
    });
  };

  // Helper to get prospects sent by a specific ally
  const getAllyProspects = (ally: UserProfile) => {
    const list = activeProspects.filter(
      (p) => p.aliado_id === ally.id || p.aliado_name?.toLowerCase() === ally.full_name.toLowerCase()
    );
    return filterProspectsByDate(list);
  };

  // Calculate metrics for a single ally
  const getAllyMetrics = (ally: UserProfile) => {
    const allyProspects = getAllyProspects(ally);
    const total = allyProspects.length;

    // Funnel Stage Count Definitions
    const evaluation = allyProspects.filter((p) => p.status === "evaluacion_pendiente").length;
    
    const conditioned = allyProspects.filter((p) =>
      ["falta_reporte", "falta_afore", "pendiente_documentos", "falta_semanas", "falta_afore_cuenta", "posible_simulacion"].includes(p.status)
    ).length;

    const approved = allyProspects.filter((p) =>
      [
        "aprobado_listo",
        "asesoria_agendada",
        "doc_proceso",
        "analisis_riesgo",
        "firma_programada",
        "aportacion",
      ].includes(p.status)
    ).length;

    const financed = allyProspects.filter((p) => p.status === "pagado_comision").length;
    const rejected = allyProspects.filter((p) => ["rechazado", "cerrado_perdido"].includes(p.status)).length;

    // Conversion Rates
    const conversionRate = total > 0 ? Math.round((financed / total) * 100) : 0;
    const approvalRate = total > 0 ? Math.round(((approved + financed) / total) * 100) : 0;

    // Commissions: $15,000 per financed, and pending for approved
    const comisionPagada = financed * 15000;
    const comisionPendiente = approved * 15000;
    const comisionTotal = comisionPagada + comisionPendiente;

    // Lead quality metric
    let leadQuality: "Alta" | "Media" | "Baja" | "N/A" = "N/A";
    if (total > 0) {
      const positiveRate = (approved + financed) / total;
      if (positiveRate >= 0.6) leadQuality = "Alta";
      else if (positiveRate >= 0.25) leadQuality = "Media";
      else leadQuality = "Baja";
    }

    return {
      total,
      evaluation,
      conditioned,
      approved,
      financed,
      rejected,
      conversionRate,
      approvalRate,
      comisionPagada,
      comisionPendiente,
      comisionTotal,
      leadQuality,
    };
  };

  // Filter allies list based on search term
  const filteredAllies = allies.filter(
    (a) =>
      a.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Active allies count (is_active !== false)
  const totalActiveAllies = allies.filter((a) => a.is_active !== false).length;

  // Global aggregate metrics for the date range
  const filteredProspectsGlobal = filterProspectsByDate(activeProspects);
  const totalProspectsSent = filteredProspectsGlobal.length;
  
  const globalEvaluation = filteredProspectsGlobal.filter((p) => p.status === "evaluacion_pendiente").length;
  
  const globalConditioned = filteredProspectsGlobal.filter((p) =>
    ["falta_reporte", "falta_afore", "pendiente_documentos", "falta_semanas", "falta_afore_cuenta", "posible_simulacion"].includes(p.status)
  ).length;

  const globalApproved = filteredProspectsGlobal.filter((p) =>
    [
      "aprobado_listo",
      "asesoria_agendada",
      "doc_proceso",
      "analisis_riesgo",
      "firma_programada",
      "aportacion",
    ].includes(p.status)
  ).length;

  const globalFinanced = filteredProspectsGlobal.filter((p) => p.status === "pagado_comision").length;
  const globalRejected = filteredProspectsGlobal.filter((p) => ["rechazado", "cerrado_perdido"].includes(p.status)).length;

  // Global Averages
  const avgProspectsPerAlly = allies.length > 0 ? (totalProspectsSent / allies.length).toFixed(1) : "0.0";
  const avgApprovalsPerAlly = allies.length > 0 ? ((globalApproved + globalFinanced) / allies.length).toFixed(1) : "0.0";
  const avgFinancementsPerAlly = allies.length > 0 ? (globalFinanced / allies.length).toFixed(1) : "0.0";
  
  const globalConversionRate = totalProspectsSent > 0 ? Math.round((globalFinanced / totalProspectsSent) * 100) : 0;
  const globalApprovalRate = totalProspectsSent > 0 ? Math.round(((globalApproved + globalFinanced) / totalProspectsSent) * 100) : 0;

  // Rankings
  // 1. By Productivity (total leads sent)
  const alliesByProductivity = [...allies]
    .map((a) => ({ ally: a, stats: getAllyMetrics(a) }))
    .sort((a, b) => b.stats.total - a.stats.total)
    .slice(0, 3);

  // 2. By Quality (conversion rate)
  const alliesByQuality = [...allies]
    .map((a) => ({ ally: a, stats: getAllyMetrics(a) }))
    .filter((a) => a.stats.total > 0)
    .sort((a, b) => b.stats.conversionRate - a.stats.conversionRate)
    .slice(0, 3);

  // Clear date filters
  const handleClearDateFilters = () => {
    setDateFilter({ start: "", end: "" });
  };

  return (
    <div className="space-y-8 max-w-[1700px] mx-auto animate-fade-in pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Gestión de Aliados</h1>
          <p className="text-slate-500 text-sm mt-1">
            Audita el rendimiento comercial, calcula las comisiones de la red de asesores y analiza la eficiencia del embudo de prospección.
          </p>
        </div>

        {/* Date Filter Widgets */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl p-2.5 shadow-sm text-xs text-slate-600">
            <Calendar className="h-4 w-4 text-indigo-500" />
            <input
              type="date"
              value={dateFilter.start}
              onChange={(e) => setDateFilter((prev) => ({ ...prev, start: e.target.value }))}
              className="bg-transparent font-semibold border-none outline-none focus:ring-0 cursor-pointer"
            />
            <span className="text-slate-350">a</span>
            <input
              type="date"
              value={dateFilter.end}
              onChange={(e) => setDateFilter((prev) => ({ ...prev, end: e.target.value }))}
              className="bg-transparent font-semibold border-none outline-none focus:ring-0 cursor-pointer"
            />
          </div>
          {(dateFilter.start || dateFilter.end) && (
            <button
              onClick={handleClearDateFilters}
              className="px-3.5 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-colors"
            >
              Limpiar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Aggregate metrics grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Active Allies */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between h-28 relative overflow-hidden">
          <div className="absolute right-[-10px] top-[-10px] bg-indigo-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Aliados Activos</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-800">
              {totalActiveAllies} <span className="text-sm font-semibold text-slate-400">/ {allies.length}</span>
            </span>
            <span className="text-[9px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-bold">Productivos</span>
          </div>
        </div>

        {/* Total prospects sent */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between h-28 relative overflow-hidden">
          <div className="absolute right-[-10px] top-[-10px] bg-emerald-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Clientes Enviados</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-emerald-600">{totalProspectsSent}</span>
            <span className="text-[10px] text-slate-400 font-semibold">
              {globalFinanced} <span className="text-emerald-500 font-bold">Financiados</span>
            </span>
          </div>
        </div>

        {/* Global Conversion Rates */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between h-28 relative overflow-hidden">
          <div className="absolute right-[-10px] top-[-10px] bg-amber-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tasas Promedio</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-800">{globalConversionRate}%</span>
            <span className="text-[10px] text-slate-500">
              Aprobación: <span className="text-indigo-600 font-bold">{globalApprovalRate}%</span>
            </span>
          </div>
        </div>

        {/* Averages per Ally */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between h-28 relative overflow-hidden">
          <div className="absolute right-[-10px] top-[-10px] bg-cyan-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Promedios por Aliado</span>
          <div className="mt-2 flex flex-col gap-0.5 justify-end">
            <div className="flex justify-between text-xs font-semibold text-slate-700">
              <span>Enviados:</span>
              <span className="font-extrabold">{avgProspectsPerAlly}</span>
            </div>
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Aprobados: {avgApprovalsPerAlly}</span>
              <span>Financiados: {avgFinancementsPerAlly}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Allies Conversion Efficiency Funnel */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <BarChart3 className="h-4.5 w-4.5 text-indigo-500" />
            Embudo de Eficiencia Comercial (Aliados)
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Muestra el volumen acumulado y el porcentaje de conversión del pipeline total de clientes enviados.
          </p>
        </div>

        {/* Funnel Visual Bars */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 pt-2">
          {/* Stage 1: Clientes Enviados */}
          <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl text-center space-y-1 relative overflow-hidden flex flex-col justify-between">
            <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider block">1. Clientes Enviados</span>
            <div className="py-2">
              <span className="text-3xl font-black text-slate-800">{totalProspectsSent}</span>
              <span className="block text-[10px] text-slate-400 font-bold mt-1">100% Volumen</span>
            </div>
            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
              <div className="bg-slate-650 h-full w-full" />
            </div>
          </div>

          {/* Stage 2: En Evaluación */}
          <div className="bg-indigo-50/20 border border-indigo-100 p-4 rounded-2xl text-center space-y-1 relative overflow-hidden flex flex-col justify-between">
            <span className="text-[9px] text-indigo-550 font-extrabold uppercase tracking-wider block">2. En Evaluación</span>
            <div className="py-2">
              <span className="text-3xl font-black text-indigo-600">{globalEvaluation}</span>
              <span className="block text-[10px] text-indigo-500 font-bold mt-1">
                {totalProspectsSent > 0 ? Math.round((globalEvaluation / totalProspectsSent) * 100) : 0}% Conv.
              </span>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden border border-slate-200">
              <div
                className="bg-indigo-500 h-full"
                style={{ width: `${totalProspectsSent > 0 ? (globalEvaluation / totalProspectsSent) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Stage 3: Condicionados */}
          <div className="bg-amber-550/5 border border-amber-200 p-4 rounded-2xl text-center space-y-1 relative overflow-hidden flex flex-col justify-between">
            <span className="text-[9px] text-amber-600 font-extrabold uppercase tracking-wider block">3. Condicionados</span>
            <div className="py-2">
              <span className="text-3xl font-black text-amber-600">{globalConditioned}</span>
              <span className="block text-[10px] text-amber-600 font-bold mt-1">
                {totalProspectsSent > 0 ? Math.round((globalConditioned / totalProspectsSent) * 100) : 0}% Conv.
              </span>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden border border-slate-200">
              <div
                className="bg-amber-500 h-full"
                style={{ width: `${totalProspectsSent > 0 ? (globalConditioned / totalProspectsSent) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Stage 4: Aprobados */}
          <div className="bg-emerald-50/20 border border-emerald-100 p-4 rounded-2xl text-center space-y-1 relative overflow-hidden flex flex-col justify-between">
            <span className="text-[9px] text-emerald-600 font-extrabold uppercase tracking-wider block">4. Aprobados</span>
            <div className="py-2">
              <span className="text-3xl font-black text-emerald-600">{globalApproved}</span>
              <span className="block text-[10px] text-emerald-500 font-bold mt-1">
                {totalProspectsSent > 0 ? Math.round((globalApproved / totalProspectsSent) * 100) : 0}% Conv.
              </span>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden border border-slate-200">
              <div
                className="bg-emerald-500 h-full"
                style={{ width: `${totalProspectsSent > 0 ? (globalApproved / totalProspectsSent) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Stage 5: Financiados */}
          <div className="bg-gradient-to-br from-indigo-50 to-emerald-50 border border-indigo-150 p-4 rounded-2xl text-center space-y-1 relative overflow-hidden flex flex-col justify-between">
            <span className="text-[9px] text-indigo-700 font-extrabold uppercase tracking-wider block">5. Financiados</span>
            <div className="py-2">
              <span className="text-3xl font-black text-indigo-700">{globalFinanced}</span>
              <span className="block text-[10px] text-indigo-650 font-bold mt-1">
                {totalProspectsSent > 0 ? Math.round((globalFinanced / totalProspectsSent) * 100) : 0}% Final
              </span>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden border border-slate-200">
              <div
                className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-full"
                style={{ width: `${totalProspectsSent > 0 ? (globalFinanced / totalProspectsSent) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Allies Table + Productivity Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left Side: Allies Table (2/3 width) */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
            {/* Search Header */}
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block">Directorio Comercial</span>
                <span className="text-xs font-bold text-slate-600 mt-1 block">Supervisa y audita las métricas individuales de cada asesor comercial.</span>
              </div>
              <div className="relative w-full sm:w-60">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar asesor..."
                  className="pl-9 pr-4 py-2 w-full bg-white hover:bg-slate-100/50 focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-indigo-500 transition-colors shadow-sm"
                />
              </div>
            </div>

            {/* Allies Table */}
            {filteredAllies.length === 0 ? (
              <div className="py-20 text-center space-y-3">
                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
                  <Users className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700">Sin aliados encontrados</h4>
                  <p className="text-xs text-slate-400 mt-1">Prueba con otro término de búsqueda.</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-150 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-left">
                      <th className="px-6 py-4">Aliado</th>
                      <th className="px-6 py-4 text-center">Estado</th>
                      <th className="px-6 py-4 text-center">Enviados</th>
                      <th className="px-6 py-4 text-center">Evaluación</th>
                      <th className="px-6 py-4 text-center">Condic.</th>
                      <th className="px-6 py-4 text-center">Aprobados</th>
                      <th className="px-6 py-4 text-center">Financ.</th>
                      <th className="px-6 py-4 text-center">Rechaz.</th>
                      <th className="px-6 py-4 text-center">Conversión</th>
                      <th className="px-6 py-4 text-center">Lead Quality</th>
                      <th className="px-6 py-4 text-right">Comisión</th>
                      <th className="px-6 py-4 relative"><span className="sr-only">Detalle</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 text-xs">
                    {filteredAllies.map((ally) => {
                      const stats = getAllyMetrics(ally);
                      const isAllyActive = ally.is_active !== false;
                      return (
                        <tr key={ally.id} className="hover:bg-slate-50/40 transition-colors group">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-black border transition-all bg-emerald-500/10 text-emerald-600 border-emerald-200`}>
                                {ally.full_name.charAt(0)}
                              </div>
                              <div>
                                <span className="font-extrabold text-slate-800 block leading-tight">{ally.full_name}</span>
                                <span className="text-[9px] text-slate-450 block mt-0.5 leading-none">{ally.email}</span>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-bold border ${
                                isAllyActive
                                  ? "bg-emerald-50 text-emerald-600 border-emerald-150"
                                  : "bg-slate-100 text-slate-400 border-slate-200"
                              }`}
                            >
                              {isAllyActive ? "Activo" : "Inactivo"}
                            </span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center font-extrabold text-slate-700">
                            {stats.total}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center font-semibold text-indigo-500">
                            {stats.evaluation}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center font-semibold text-amber-600">
                            {stats.conditioned}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center font-semibold text-emerald-650">
                            {stats.approved}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center font-extrabold text-indigo-700">
                            {stats.financed}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center font-semibold text-rose-500">
                            {stats.rejected}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center font-bold">
                            <span className="text-indigo-600">{stats.conversionRate}%</span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold ${
                                stats.leadQuality === "Alta"
                                  ? "bg-emerald-50 text-emerald-600 border border-emerald-150"
                                  : stats.leadQuality === "Media"
                                  ? "bg-amber-50 text-amber-700 border border-amber-150"
                                  : stats.leadQuality === "Baja"
                                  ? "bg-rose-50 text-rose-600 border border-rose-150"
                                  : "bg-slate-50 text-slate-400"
                              }`}
                            >
                              {stats.leadQuality}
                            </span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-right font-black text-emerald-600">
                            ${stats.comisionTotal.toLocaleString()}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <button
                              onClick={() => setSelectedAlly(ally)}
                              className="inline-flex items-center gap-0.5 px-2.5 py-1.5 border border-indigo-100 hover:border-indigo-200 text-[10px] font-bold text-indigo-600 bg-indigo-50/50 hover:bg-indigo-50 rounded-xl transition-all active:scale-95 transform"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Detalle
                            </button>
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

        {/* Right Side: Productivity and Quality Rankings (1/3 width) */}
        <div className="space-y-6">
          
          {/* Ranking 1: Productivity */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Award className="h-4.5 w-4.5 text-indigo-500" />
                Ranking de Productividad
              </h3>
              <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Total Enviado</span>
            </div>

            <div className="space-y-3">
              {alliesByProductivity.map((item, idx) => (
                <div key={item.ally.id} className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-150">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-slate-400 w-4">#{idx + 1}</span>
                    <div>
                      <span className="text-xs font-extrabold text-slate-800 block leading-tight">{item.ally.full_name}</span>
                      <span className="text-[9px] text-slate-400 block mt-0.5 font-medium">{item.ally.email}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-black text-indigo-600 block">{item.stats.total} leads</span>
                    <span className="text-[8px] font-bold text-slate-450 uppercase mt-0.5 block">Enviados</span>
                  </div>
                </div>
              ))}
              {alliesByProductivity.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">No hay datos de productividad disponibles.</p>
              )}
            </div>
          </div>

          {/* Ranking 2: Quality */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Percent className="h-4.5 w-4.5 text-emerald-500" />
                Ranking de Calidad (Conversión)
              </h3>
              <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Financiados %</span>
            </div>

            <div className="space-y-3">
              {alliesByQuality.map((item, idx) => (
                <div key={item.ally.id} className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-150">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-slate-400 w-4">#{idx + 1}</span>
                    <div>
                      <span className="text-xs font-extrabold text-slate-800 block leading-tight">{item.ally.full_name}</span>
                      <span className="text-[9px] text-slate-400 block mt-0.5 font-medium">{item.ally.email}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-black text-emerald-600 block">{item.stats.conversionRate}%</span>
                    <span className="text-[8px] font-bold text-slate-450 uppercase mt-0.5 block">Tasa Conversión</span>
                  </div>
                </div>
              ))}
              {alliesByQuality.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">No hay datos de calidad disponibles.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Slide-over Drawer / Modal for Ally Detail */}
      {selectedAlly && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-end z-40 animate-fade-in">
          <div className="bg-white h-full max-w-4xl w-full border-l border-slate-200 flex flex-col animate-slide-in shadow-2xl">
            {/* Drawer Header */}
            <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 text-emerald-600 border border-emerald-200 flex items-center justify-center text-sm font-black">
                  {selectedAlly.full_name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                    Detalle de Productividad: {selectedAlly.full_name}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                    {selectedAlly.email} • {selectedAlly.phone || "Sin Teléfono"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedAlly(null);
                  setSelectedProspect(null);
                }}
                className="p-1.5 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-700"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Drawer Body - Split into two sections if a prospect is selected */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Stats Summary specifically for this Ally */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-50 border border-slate-150 p-3.5 rounded-2xl">
                  <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">Clientes Enviados</span>
                  <span className="block text-xl font-black text-slate-800 mt-1">{getAllyMetrics(selectedAlly).total}</span>
                </div>
                <div className="bg-slate-50 border border-slate-150 p-3.5 rounded-2xl">
                  <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">Tasa Conversión</span>
                  <span className="block text-xl font-black text-indigo-600 mt-1">{getAllyMetrics(selectedAlly).conversionRate}%</span>
                </div>
                <div className="bg-slate-50 border border-slate-150 p-3.5 rounded-2xl">
                  <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">Comisión Pagada</span>
                  <span className="block text-xl font-black text-emerald-600 mt-1">${getAllyMetrics(selectedAlly).comisionPagada.toLocaleString()}</span>
                </div>
                <div className="bg-slate-50 border border-slate-150 p-3.5 rounded-2xl">
                  <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">Comisión Pendiente</span>
                  <span className="block text-xl font-black text-amber-600 mt-1">${getAllyMetrics(selectedAlly).comisionPendiente.toLocaleString()}</span>
                </div>
              </div>

              {/* Main Split Grid (Prospects list vs selected prospect detail) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Left side: Sent prospects list */}
                <div className="space-y-3">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block">Expedientes Enviados</span>
                  {getAllyProspects(selectedAlly).length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-10 bg-slate-50 rounded-2xl border border-dashed">
                      Este aliado no ha enviado ningún prospecto en el período seleccionado.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                      {getAllyProspects(selectedAlly).map((p) => {
                        const isSelected = selectedProspect?.id === p.id;
                        return (
                          <div
                            key={p.id}
                            onClick={() => setSelectedProspect(p)}
                            className={`p-3.5 rounded-2xl border transition-all cursor-pointer text-left ${
                              isSelected
                                ? "bg-indigo-50/30 border-indigo-500 shadow-sm"
                                : "bg-white border-slate-200 hover:bg-slate-50/50"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold text-slate-800 block truncate">{p.full_name}</span>
                              <span className="text-[8px] font-bold text-slate-400">
                                {new Date(p.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="flex justify-between items-center mt-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[8px] font-black border ${
                                  p.status === "pagado_comision"
                                    ? "bg-emerald-50 text-emerald-600 border-emerald-150"
                                    : ["falta_reporte", "falta_afore", "pendiente_documentos", "falta_semanas", "falta_afore_cuenta", "posible_simulacion"].includes(p.status)
                                    ? "bg-amber-50 text-amber-700 border-amber-150"
                                    : ["rechazado", "cerrado_perdido"].includes(p.status)
                                    ? "bg-rose-50 text-rose-600 border-rose-150"
                                    : "bg-indigo-50 text-indigo-600 border-indigo-150"
                                }`}
                              >
                                {p.status === "pagado_comision"
                                  ? "Financiado"
                                  : p.status === "evaluacion_pendiente"
                                  ? "Evaluación"
                                  : ["falta_reporte", "falta_afore", "pendiente_documentos", "falta_semanas", "falta_afore_cuenta", "posible_simulacion"].includes(p.status)
                                  ? "Condicionado"
                                  : ["rechazado", "cerrado_perdido"].includes(p.status)
                                  ? "Rechazado"
                                  : "Aprobado"}
                              </span>
                              
                              <span className="text-[10px] font-bold text-slate-500">
                                {p.status === "pagado_comision" ? (
                                  <span className="text-emerald-600 font-extrabold">Comisión Pagada</span>
                                ) : [
                                    "aprobado_listo",
                                    "asesoria_agendada",
                                    "doc_proceso",
                                    "analisis_riesgo",
                                    "firma_programada",
                                    "aportacion",
                                  ].includes(p.status) ? (
                                  <span className="text-amber-600 font-extrabold">Comisión Pendiente</span>
                                ) : (
                                  <span className="text-slate-450 font-normal">Sin Comisión</span>
                                )}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right side: Detailed View of the selected prospect */}
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-3">Detalle del Expediente</span>
                  {selectedProspect ? (
                    <div className="bg-slate-550/5 border border-slate-200 rounded-3xl p-5 space-y-4 text-left animate-fade-in">
                      {/* Name & status header */}
                      <div className="border-b border-slate-200/80 pb-3">
                        <span className="text-[9px] text-indigo-500 font-bold uppercase tracking-wider">Cliente de {selectedAlly.full_name}</span>
                        <h4 className="text-sm font-black text-slate-800 mt-1">{selectedProspect.full_name}</h4>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="text-[9px] font-semibold text-slate-450 bg-slate-100 px-2 py-0.5 rounded-full">
                            CURP: {selectedProspect.curp || "N/A"}
                          </span>
                          <span className="text-[9px] font-semibold text-slate-450 bg-slate-100 px-2 py-0.5 rounded-full">
                            NSS: {selectedProspect.nss || "N/A"}
                          </span>
                        </div>
                      </div>

                      {/* Documents Uploaded */}
                      <div className="space-y-2">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Documentos Adjuntos</span>
                        {selectedProspect.documents && selectedProspect.documents.length > 0 ? (
                          <div className="grid grid-cols-1 gap-2">
                            {selectedProspect.documents.map((doc) => (
                              <div key={doc.id} className="flex items-center justify-between p-2 bg-white border border-slate-150 rounded-xl">
                                <div className="flex items-center gap-2 min-w-0">
                                  <FileText className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                                  <span className="text-[10px] font-bold text-slate-700 truncate">{doc.file_name}</span>
                                </div>
                                <span className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-black uppercase">
                                  {doc.file_type}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[10px] text-slate-400 italic">No se han cargado documentos en este expediente.</p>
                        )}
                      </div>

                      {/* Simulation & Notes */}
                      <div className="space-y-3 bg-white border border-slate-200 p-4 rounded-2xl">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block border-b pb-1.5">
                          Evaluación Técnica / Simulación
                        </span>
                        
                        {selectedProspect.simulation ? (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px]">
                            <div>
                              <span className="text-slate-400 font-semibold block">Semanas Cotizadas:</span>
                              <span className="font-extrabold text-slate-700">{selectedProspect.simulation.semanas} semanas</span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-semibold block">Financiamiento M40:</span>
                              <span className="font-extrabold text-slate-700">${selectedProspect.simulation.financiamiento?.toLocaleString()} MXN</span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-semibold block">Pensión Actual:</span>
                              <span className="font-extrabold text-slate-700">${selectedProspect.simulation.pensionActual?.toLocaleString()} MXN</span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-semibold block">Pensión Estimada:</span>
                              <span className="font-extrabold text-emerald-600">${selectedProspect.simulation.pensionMejorada?.toLocaleString()} MXN</span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-semibold block">Total Crédito:</span>
                              <span className="font-extrabold text-indigo-600">${selectedProspect.simulation.totalCredito?.toLocaleString()} MXN</span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-semibold block">Aportación:</span>
                              <span className="font-extrabold text-teal-600">${selectedProspect.simulation.aportacion?.toLocaleString()} MXN</span>
                            </div>
                            {selectedProspect.simulation.creditoNomina !== undefined && selectedProspect.simulation.creditoNomina > 0 && (
                              <div>
                                <span className="text-slate-400 font-semibold block">Crédito de Nómina:</span>
                                <span className="font-extrabold text-slate-700">${selectedProspect.simulation.creditoNomina?.toLocaleString()} MXN</span>
                              </div>
                            )}
                            <div className="col-span-2 border-t pt-2 mt-1">
                              <span className="text-slate-450 font-bold block mb-1">Notas del Director:</span>
                              <p className="text-[10px] text-slate-600 leading-normal bg-slate-50 p-2 rounded-lg italic">
                                {selectedProspect.notes_director || "Sin notas técnicas adicionales de evaluación."}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="text-[10px] text-slate-450 font-bold block">Notas del Director:</span>
                            <p className="text-[10px] text-slate-600 leading-normal bg-slate-50 p-2 rounded-lg italic">
                              {selectedProspect.notes_director || "Expediente pendiente de evaluación técnica."}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Activity History */}
                      <div className="space-y-2">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Historial de Actividad</span>
                        <div className="space-y-1.5">
                          <div className="flex items-start gap-2 text-[10px]">
                            <span className="inline-block h-2 w-2 rounded-full bg-indigo-500 mt-1" />
                            <div>
                              <span className="font-extrabold text-slate-750">Registro del expediente</span>
                              <span className="block text-[8px] text-slate-400 font-medium">
                                Creado el {new Date(selectedProspect.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          
                          {selectedProspect.status !== "evaluacion_pendiente" && (
                            <div className="flex items-start gap-2 text-[10px]">
                              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 mt-1" />
                              <div>
                                <span className="font-extrabold text-slate-750">
                                  {selectedProspect.status === "pagado_comision" ? "Comisión Pagada" : "Aprobación de viabilidad"}
                                </span>
                                <span className="block text-[8px] text-slate-400 font-medium">
                                  Última actualización: {new Date(selectedProspect.updated_at || selectedProspect.created_at).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200 border-dashed rounded-3xl p-10 text-center text-slate-400 text-xs">
                      Selecciona un expediente de la lista para ver su auditoría de documentos, decisiones técnicas y comisiones asociadas.
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 text-right">
              <button
                onClick={() => {
                  setSelectedAlly(null);
                  setSelectedProspect(null);
                }}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs transition-all active:scale-95 shadow-sm"
              >
                Cerrar Panel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
