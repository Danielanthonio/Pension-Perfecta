"use client";

import React, { useState } from "react";
import { useApp, Prospect, getStageAndSubStage, getStatusFromStageAndSubStage, STAGES_LIST, SUB_STAGES_BY_STAGE } from "@/utils/context/AppContext";
import SalesFunnel from "@/components/SalesFunnel";
import {
  Folder,
  Hourglass,
  CheckSquare,
  AlertCircle,
  Calendar,
  DollarSign,
  TrendingUp,
  FileText,
  Clock,
  ChevronRight,
  ArrowUpRight,
  CheckCircle2,
  X,
  Layers,
  Search,
  Trash2,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";

export default function DashboardAliado() {
  const { prospects, scheduleAssessment, deleteProspect, restoreProspect, permanentlyDeleteProspect, isProspectDeleted, isProspectPurged, getProspectDeletedAt } = useApp();
  const [activeTab, setActiveTab] = useState<"evaluacion" | "listo" | "activos" | "papelera">("evaluacion");
  
  // States for Scheduling Modal
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [schedulingStep, setSchedulingStep] = useState<"datetime" | "confirm">("datetime");

  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [subStageFilter, setSubStageFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const getStageLabel = (status: Prospect["status"]) => {
    const { stage, subStage } = getStageAndSubStage(status);
    const stageObj = STAGES_LIST.find((s) => s.id === stage);
    const stageLabel = stageObj ? stageObj.label : stage;
    return subStage ? `${stageLabel} • ${subStage}` : stageLabel;
  };

  const getStageColor = (status: Prospect["status"]) => {
    switch (status) {
      case "evaluacion_pendiente":
        return "bg-blue-50 text-blue-600 border-blue-100";
      case "rechazado":
        return "bg-red-50 text-red-600 border-red-100";
      case "aprobado_listo":
        return "bg-emerald-50 text-emerald-600 border-emerald-100";
      case "asesoria_agendada":
        return "bg-purple-50 text-purple-600 border-purple-100";
      case "doc_proceso":
        return "bg-amber-50 text-amber-600 border-amber-100";
      case "analisis_riesgo":
        return "bg-cyan-50 text-cyan-600 border-cyan-100";
      case "firma_programada":
        return "bg-indigo-50 text-indigo-600 border-indigo-100";
      case "pagado_comision":
        return "bg-amber-500/10 text-amber-700 border-amber-500/20 shadow-sm";
      case "aportacion":
        return "bg-teal-50 text-teal-700 border-teal-100 shadow-sm";
      case "falta_reporte":
        return "bg-rose-50 text-rose-600 border-rose-100";
      case "falta_afore":
        return "bg-orange-50 text-orange-600 border-orange-100";
      case "pendiente_documentos":
        return "bg-amber-50 text-amber-700 border-amber-100 shadow-sm";
      case "falta_semanas":
        return "bg-amber-50 text-amber-700 border-amber-100 shadow-sm";
      case "falta_afore_cuenta":
        return "bg-amber-50 text-amber-700 border-amber-100 shadow-sm";
      case "cerrado_perdido":
        return "bg-slate-100 text-slate-600 border-slate-200";
      default:
        return "bg-slate-50 text-slate-600 border-slate-200";
    }
  };

  const activeProspects = prospects.filter((p) => !isProspectDeleted(p) && !isProspectPurged(p));
  const deletedProspects = prospects.filter((p) => isProspectDeleted(p));

  const filteredDeletedBySearchAndFilters = deletedProspects
    .filter((p) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        p.full_name.toLowerCase().includes(term) ||
        p.nss.includes(term) ||
        p.curp.toLowerCase().includes(term)
      );
    });

  const filteredByDate = activeProspects.filter((p) => {
    if (!p.created_at) return true;
    const createdDate = new Date(p.created_at).getTime();
    
    if (startDate) {
      const start = new Date(startDate + "T00:00:00").getTime();
      if (createdDate < start) return false;
    }
    
    if (endDate) {
      const end = new Date(endDate + "T23:59:59").getTime();
      if (createdDate > end) return false;
    }
    
    return true;
  });

  const filteredBySearchAndFilters = filteredByDate
    .filter((p) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        p.full_name.toLowerCase().includes(term) ||
        p.nss.includes(term) ||
        p.curp.toLowerCase().includes(term)
      );
    })
    .filter((p) => {
      if (stageFilter === "all") return true;
      const { stage } = getStageAndSubStage(p.status);
      return stage === stageFilter;
    })
    .filter((p) => {
      if (subStageFilter === "all") return true;
      const { subStage } = getStageAndSubStage(p.status);
      return subStage === subStageFilter;
    });

  // Dynamic calculations based on global state
  const enEvaluacion = filteredBySearchAndFilters.filter((p) =>
    ["evaluacion_pendiente", "falta_reporte", "falta_afore", "pendiente_documentos", "falta_semanas", "falta_afore_cuenta"].includes(p.status)
  );
  const listoPresentar = filteredBySearchAndFilters.filter((p) =>
    ["aprobado_listo", "aportacion"].includes(p.status) ||
    (p.status === "asesoria_agendada" && !p.notes_aliado?.includes("Asesoría agendada"))
  );
  
  const activeStatuses = [
    "doc_proceso",
    "analisis_riesgo",
    "firma_programada",
    "pagado_comision",
  ];
  const proyectosActivos = filteredBySearchAndFilters.filter((p) => 
    activeStatuses.includes(p.status) ||
    (p.status === "asesoria_agendada" && p.notes_aliado?.includes("Asesoría agendada"))
  );
  
  // Missing docs: in evaluation but have less than 2 documents uploaded
  const faltaDocumentos = filteredByDate.filter(
    (p) => p.status === "evaluacion_pendiente" && p.documents.length < 2
  );

  // Total Financing amount pending to be financed (sum of Approved Ley 73 projects that are active/approved but not paid)
  const pendingFinancingStatuses = [
    "aprobado_listo",
    "aportacion",
    "asesoria_agendada",
    "doc_proceso",
    "analisis_riesgo",
    "firma_programada",
  ];
  const totalPorFinanciar = filteredByDate
    .filter((p) => pendingFinancingStatuses.includes(p.status) && p.simulation)
    .reduce((sum, p) => sum + (p.simulation?.financiamiento || 0), 0);

  // Total Financing amount executed (sum of paid/closed M40 projects in pagado_comision status)
  const totalEjecutados = filteredByDate
    .filter((p) => p.status === "pagado_comision" && p.simulation)
    .reduce((sum, p) => sum + (p.simulation?.financiamiento || 0), 0);

  const getActiveStageIndex = (status: Prospect["status"]) => {
    switch (status) {
      case "asesoria_agendada":
        return 0;
      case "doc_proceso":
        return 1;
      case "analisis_riesgo":
        return 2;
      case "firma_programada":
        return 3;
      case "pagado_comision":
        return 4;
      default:
        return 0;
    }
  };

  const activeSteps = [
    { label: "Agenda Asesoria", desc: "Asesoría agendada para presentar propuesta" },
    { label: "Firma Carta Compromiso", desc: "Carta compromiso firmada por el cliente" },
    { label: "Analisis de Riesgo", desc: "En análisis de riesgo operativo" },
    { label: "Cerrada Ganada", desc: "Caso cerrado y ganado" },
    { label: "Pagado / Cerrado", desc: "Comisión liberada y cobrada" },
  ];

  const handleOpenSchedule = (prospect: Prospect) => {
    setSelectedProspect(prospect);
    setSelectedDate("");
    setSelectedTime("");
    setSchedulingStep("datetime");
  };

  const handleConfirmSchedule = async () => {
    if (!selectedProspect || !selectedDate || !selectedTime) return;
    await scheduleAssessment(selectedProspect.id, selectedDate, selectedTime);
    setSelectedProspect(null);
    setActiveTab("activos"); // Automatically switch tab to see active projects
  };

  return (
    <div className="space-y-8 select-none max-w-[1700px] mx-auto">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Mi Panel Comercial</h1>
          <p className="text-slate-500 text-sm mt-1">Registra prospectos, presenta propuestas y monitorea tus comisiones Ley 73.</p>
        </div>
        <Link
          href="/dashboard/nuevo"
          className="inline-flex items-center justify-center px-5 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl font-bold transition-all shadow-md shadow-blue-500/10 hover:scale-[1.02] text-sm"
        >
          <PlusIcon className="mr-2 h-4 w-4" />
          Registrar Prospecto
        </Link>
      </div>

      {/* Date Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex flex-col sm:flex-row items-center justify-between gap-4 select-none">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-indigo-500 flex-shrink-0" />
          <div>
            <h4 className="text-xs font-bold text-slate-800">Filtrar por Fecha</h4>
            <p className="text-[10px] text-slate-400 mt-0.5">Filtra el embudo y listados por fecha de registro.</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 flex-1 sm:flex-none">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Desde:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-indigo-500 transition-all w-full sm:w-auto"
            />
          </div>
          <div className="flex items-center gap-2 flex-1 sm:flex-none">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Hasta:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-indigo-500 transition-all w-full sm:w-auto"
            />
          </div>
          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Sales Funnel Section */}
      <SalesFunnel prospects={filteredByDate} />

      {/* Incidencia Alert Bar (Incompletos) */}
      {faltaDocumentos.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 animate-pulse" />
            <div>
              <h4 className="text-xs font-bold text-amber-900">Prospectos Incompletos ({faltaDocumentos.length})</h4>
              <p className="text-[11px] text-amber-700 mt-0.5">Se han detectado expedientes en evaluación con documentación faltante. Completa los requisitos para emitir dictamen.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {faltaDocumentos.map((fd) => (
              <Link
                key={fd.id}
                href={`/prospectos/${fd.id}`}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-bold transition-colors"
              >
                Completar: {fd.full_name.split(" ")[0]}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex flex-col md:flex-row items-center justify-between gap-4 select-none">
        {/* Search */}
        <div className="relative w-full md:flex-1">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por Nombre, NSS o CURP..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-indigo-500 transition-all"
          />
        </div>

        {/* Stage Filter */}
        <div className="w-full md:w-52 flex items-center gap-2">
          <Layers className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <select
            value={stageFilter}
            onChange={(e) => {
              setStageFilter(e.target.value);
              setSubStageFilter("all"); // Reset sub-stage filter on stage change
            }}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold outline-none focus:border-indigo-500 transition-colors cursor-pointer"
          >
            <option value="all">Todas las Etapas</option>
            {STAGES_LIST.map((stage) => (
              <option key={stage.id} value={stage.id}>{stage.label}</option>
            ))}
          </select>
        </div>

        {/* Sub-stage Filter */}
        <div className="w-full md:w-52 flex items-center gap-2">
          <Layers className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <select
            value={subStageFilter}
            onChange={(e) => setSubStageFilter(e.target.value)}
            disabled={stageFilter === "all"}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold outline-none focus:border-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <option value="all">Todas las Subetapas</option>
            {stageFilter !== "all" && (SUB_STAGES_BY_STAGE[stageFilter] || []).map((sub) => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Segmented Controller Tab Selector */}
      <div className="bg-slate-200/60 p-1 rounded-2xl max-w-xl flex border border-slate-200">
        <button
          onClick={() => setActiveTab("evaluacion")}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
            activeTab === "evaluacion" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          En Evaluación ({enEvaluacion.length})
        </button>
        <button
          onClick={() => setActiveTab("listo")}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
            activeTab === "listo" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          Listo para Presentar ({listoPresentar.length})
        </button>
        <button
          onClick={() => setActiveTab("activos")}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
            activeTab === "activos" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          Proyectos Activos ({proyectosActivos.length})
        </button>
        <button
          onClick={() => setActiveTab("papelera")}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
            activeTab === "papelera" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          Papelera ({deletedProspects.length})
        </button>
      </div>

      {/* Tab Panels */}
      <div className="space-y-6">
        {/* TAB 1: EN EVALUACIÓN */}
        {activeTab === "evaluacion" && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">En Evaluación Técnica</h3>
            </div>
            
            {enEvaluacion.length === 0 ? (
              <div className="py-16 text-center">
                <Clock className="mx-auto h-12 w-12 text-slate-300" />
                <h4 className="text-sm font-bold text-slate-700 mt-3">No hay prospectos en evaluación</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-[280px] mx-auto">Cuando registres un prospecto y subas sus archivos, aparecerá aquí durante su validación.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-150 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-left">
                      <th className="px-6 py-4.5">Nombre Completo</th>
                      <th className="px-6 py-4.5">NSS</th>
                      <th className="px-6 py-4.5">CURP</th>
                      <th className="px-6 py-4.5">Teléfono</th>
                      <th className="px-6 py-4.5">Email</th>
                      <th className="px-6 py-4.5">Notas</th>
                      <th className="px-6 py-4.5">Fecha Registro</th>
                      <th className="px-6 py-4.5">Estado</th>
                      <th className="px-6 py-4.5 relative"><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {enEvaluacion.map((p) => {
                      const isIncomplete = p.documents.length < 2;
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/40 transition-colors group">
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-extrabold text-slate-800">
                            {p.full_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-600">
                            {p.nss}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-600 uppercase">
                            {p.curp}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-600">
                            {p.phone}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-600">
                            {p.email}
                          </td>
                          <td className="px-6 py-4 max-w-[200px] truncate text-xs text-slate-500 font-medium" title={p.notes_aliado}>
                            {p.notes_aliado || <span className="text-slate-300 italic font-normal">Sin notas</span>}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-500">
                            {new Date(p.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold border ${getStageColor(p.status)}`}>
                              {getStageLabel(p.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Link
                                href={`/prospectos/${p.id}`}
                                className="inline-flex p-1.5 bg-slate-100 group-hover:bg-blue-50 text-slate-500 group-hover:text-blue-600 rounded-xl transition-all border border-slate-200/60"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Link>
                              <button
                                onClick={async () => {
                                  if (confirm(`¿Enviar a ${p.full_name} a la papelera por 7 días?`)) {
                                    await deleteProspect(p.id);
                                  }
                                }}
                                className="inline-flex p-1.5 bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-xl transition-all border border-slate-200/60"
                                title="Mover a Papelera"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LISTO PARA PRESENTAR (PROPUESSTAS EMITIDAS) */}
        {activeTab === "listo" && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">Dictámenes Listos para Presentar</h3>
            </div>

            {listoPresentar.length === 0 ? (
              <div className="py-16 text-center">
                <CheckSquare className="mx-auto h-12 w-12 text-slate-300" />
                <h4 className="text-sm font-bold text-slate-700 mt-3">Ninguna simulación aprobada aún</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-[280px] mx-auto">Una vez que el Director de Operaciones analice los casos y emita el dictamen Ley 73, aparecerán listos aquí.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-150 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-left">
                      <th className="px-6 py-4.5">Nombre Completo</th>
                      <th className="px-6 py-4.5">NSS</th>
                      <th className="px-6 py-4.5">CURP</th>
                      <th className="px-6 py-4.5">Teléfono</th>
                      <th className="px-6 py-4.5">Email</th>
                      <th className="px-6 py-4.5">Notas</th>
                      <th className="px-6 py-4.5">Crédito Total</th>
                      <th className="px-6 py-4.5">Estado</th>
                      <th className="px-6 py-4.5 relative"><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {listoPresentar.map((p) => {
                      if (!p.simulation) return null;
                      const gainPercent = Math.round(
                        ((p.simulation.pensionMejorada - p.simulation.pensionActual) / p.simulation.pensionActual) * 100
                      );
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/40 transition-colors group">
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-extrabold text-slate-800">
                            {p.full_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-600">
                            {p.nss}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-600 uppercase">
                            {p.curp}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-600">
                            {p.phone}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-600">
                            {p.email}
                          </td>
                          <td className="px-6 py-4 max-w-[150px] truncate text-xs text-slate-500 font-medium" title={p.notes_aliado}>
                            {p.notes_aliado || <span className="text-slate-300 italic font-normal">Sin notas</span>}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <span className="block text-xs font-bold text-slate-700">${p.simulation.totalCredito.toLocaleString()}</span>
                              <span className="block text-[9px] text-slate-400">M40 + Gestión</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStageColor(p.status)}`}>
                              {getStageLabel(p.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="flex items-center gap-2 justify-end">
                              <Link
                                href={`/prospectos/${p.id}`}
                                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors border border-slate-200/60"
                                title="Ver Expediente"
                              >
                                <FileText className="h-4 w-4" />
                              </Link>
                              <a
                                href="https://api.leadconnectorhq.com/widget/booking/tTynbYT83ugTjMBmwCf5"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl shadow border border-blue-400 transition-all hover:scale-105 active:scale-95 flex items-center justify-center"
                                title="Abrir Agenda Externa"
                              >
                                <Calendar className="h-4 w-4" />
                              </a>
                              <button
                                onClick={async () => {
                                  if (confirm(`¿Confirmar que ya agendaste la asesoría para ${p.full_name}?`)) {
                                    await scheduleAssessment(p.id, "LeadConnector", "Enlace Directo");
                                  }
                                }}
                                className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-xl transition-all border border-emerald-250/60 flex items-center justify-center"
                                title="Confirmar Agendado (Avanzar a Activos)"
                              >
                                <CheckSquare className="h-4 w-4" />
                              </button>
                              <button
                                onClick={async () => {
                                  if (confirm(`¿Enviar a ${p.full_name} a la papelera por 7 días?`)) {
                                    await deleteProspect(p.id);
                                  }
                                }}
                                className="p-1.5 bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-xl transition-all border border-slate-200/60"
                                title="Mover a Papelera"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PROYECTOS ACTIVOS */}
        {activeTab === "activos" && (
          <div className="space-y-6">
            {proyectosActivos.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm py-16 text-center">
                <Folder className="mx-auto h-12 w-12 text-slate-300" />
                <h4 className="text-sm font-bold text-slate-700 mt-3">Sin proyectos activos en curso</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-[280px] mx-auto">Una vez que agendes la reunión de presentación de simulación, el caso se moverá automáticamente aquí para seguimiento.</p>
              </div>
            ) : (
              proyectosActivos.map((p) => {
                const activeIndex = getActiveStageIndex(p.status);
                const isPaid = p.status === "pagado_comision";
                return (
                  <div key={p.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6 hover:shadow-md hover:border-slate-300 transition-all">
                    {/* Header Details in Horizontal Grid */}
                    <div className="pb-4 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4 flex-1">
                        <div>
                          <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">Cliente</span>
                          <span className="text-xs font-extrabold text-slate-800 leading-tight block mt-0.5 flex items-center gap-1.5">
                            {p.full_name}
                            {isPaid && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-50 text-amber-600 border border-amber-200">
                                ★
                              </span>
                            )}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">NSS</span>
                          <span className="text-xs font-semibold text-slate-600 block mt-0.5">{p.nss}</span>
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">CURP</span>
                          <span className="text-xs font-semibold text-slate-600 block mt-0.5 uppercase">{p.curp}</span>
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">Teléfono</span>
                          <span className="text-xs font-semibold text-slate-600 block mt-0.5">{p.phone}</span>
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">Email</span>
                          <span className="text-xs font-semibold text-slate-600 block mt-0.5">{p.email}</span>
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">Notas</span>
                          <span className="text-xs text-slate-500 block mt-0.5 truncate" title={p.notes_aliado}>
                            {p.notes_aliado || <span className="text-slate-350 italic">Sin notas</span>}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">Etapa / Subetapa</span>
                          <div className="mt-1">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold border ${getStageColor(p.status)}`}>
                              {getStageLabel(p.status)}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between xl:justify-end gap-6 border-t xl:border-t-0 pt-3 xl:pt-0 border-slate-100">
                        {p.simulation && (
                          <div className="text-left xl:text-right xl:border-r xl:pr-4 xl:border-slate-100">
                            <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">Crédito Total</span>
                            <span className="block text-xs font-extrabold text-slate-700 mt-0.5">${p.simulation.totalCredito.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/prospectos/${p.id}`}
                            className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-650 text-xs font-bold rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5"
                          >
                            Expediente <ArrowUpRight className="h-3 w-3" />
                          </Link>
                          <button
                            onClick={async () => {
                              if (confirm(`¿Enviar a ${p.full_name} a la papelera por 7 días?`)) {
                                await deleteProspect(p.id);
                              }
                            }}
                            className="p-1.5 bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-xl transition-colors border border-slate-200/60"
                            title="Mover a Papelera"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Stepper Pipeline Progress Bar */}
                    <div className="space-y-4 pt-2">
                      <div className="relative">
                        {/* Connecting Track */}
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                          <div className="w-full border-t-2 border-slate-200" />
                        </div>
                        {/* Completed/Active Progress Fill */}
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                          <div
                            className="border-t-2 border-emerald-500 transition-all duration-500"
                            style={{ width: `${(activeIndex / 4) * 100}%` }}
                          />
                        </div>

                        {/* Interactive Steps */}
                        <div className="relative flex justify-between w-full">
                          {activeSteps.map((step, idx) => {
                            const isCompleted = idx < activeIndex;
                            const isActive = idx === activeIndex;
                            return (
                              <div key={idx} className="flex flex-col items-center group relative">
                                <div
                                  className={`h-7 w-7 rounded-full flex items-center justify-center transition-all border-2 text-[10px] font-bold ${
                                    isCompleted
                                      ? "bg-emerald-500 border-emerald-600 text-white shadow-sm shadow-emerald-500/20"
                                      : isActive
                                        ? "bg-blue-600 border-blue-700 text-white shadow-md ring-4 ring-blue-500/10 scale-110"
                                        : "bg-slate-100 border-slate-200 text-slate-400"
                                  }`}
                                >
                                  {isCompleted ? <CheckCircle2 className="h-4 w-4 text-white" /> : idx + 1}
                                </div>
                                <span
                                  className={`text-[9px] font-bold mt-2 text-center transition-colors uppercase tracking-wider hidden sm:block ${
                                    isActive ? "text-blue-600" : isCompleted ? "text-emerald-600" : "text-slate-400"
                                  }`}
                                >
                                  {step.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Congratulations Banner / Commission status */}
                    {isPaid && p.simulation && (
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between shadow-inner">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">💸</span>
                          <div>
                            <h4 className="text-xs font-bold text-emerald-900">¡Comisión Pagada con éxito!</h4>
                            <p className="text-[10px] text-emerald-600 mt-0.5">La comisión acordada por capturar y coordinar este proyecto ha sido liberada por dirección.</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="block text-[8px] text-emerald-500 font-bold uppercase tracking-wider">Tu Comisión</span>
                          <span className="block text-sm font-black text-emerald-600">${p.simulation.costoGestion.toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 4: PAPELERA */}
        {activeTab === "papelera" && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-655 uppercase tracking-widest">Papelera de Reciclaje (Se eliminan permanentemente en 7 días)</h3>
            </div>
            
            {filteredDeletedBySearchAndFilters.length === 0 ? (
              <div className="py-16 text-center">
                <Trash2 className="mx-auto h-12 w-12 text-slate-350" />
                <h4 className="text-sm font-bold text-slate-700 mt-3">La papelera está vacía</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-[280px] mx-auto">Los clientes que elimines aparecerán aquí por 7 días antes de borrarse definitivamente.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-150 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-left">
                      <th className="px-6 py-4.5">Nombre Completo</th>
                      <th className="px-6 py-4.5">NSS</th>
                      <th className="px-6 py-4.5">CURP</th>
                      <th className="px-6 py-4.5">Teléfono</th>
                      <th className="px-6 py-4.5">Fecha Eliminación</th>
                      <th className="px-6 py-4.5">Días Restantes</th>
                      <th className="px-6 py-4.5 text-right"><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDeletedBySearchAndFilters.map((p) => {
                      const deletedAt = getProspectDeletedAt(p);
                      const remainingDays = deletedAt ? Math.max(0, Math.ceil((deletedAt.getTime() + 7 * 24 * 60 * 60 * 1000 - Date.now()) / (1000 * 60 * 60 * 24))) : 7;
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/40 transition-colors group">
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-extrabold text-slate-800">
                            {p.full_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-600">
                            {p.nss}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-600 uppercase">
                            {p.curp}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-600">
                            {p.phone}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-500">
                            {deletedAt ? deletedAt.toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "N/A"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold border ${remainingDays <= 2 ? "bg-red-50 text-red-600 border-red-100" : "bg-amber-50 text-amber-700 border-amber-100"}`}>
                              {remainingDays} {remainingDays === 1 ? "día" : "días"}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={async () => {
                                  if (confirm(`¿Restaurar a ${p.full_name} al pipeline activo?`)) {
                                    await restoreProspect(p.id);
                                  }
                                }}
                                className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-xl border border-emerald-200 transition-colors flex items-center gap-1"
                                title="Restaurar prospecto"
                              >
                                <RotateCcw className="h-3 w-3" />
                                Restaurar
                              </button>
                              <button
                                onClick={async () => {
                                  if (confirm(`¿Eliminar permanentemente a ${p.full_name}? Esta acción borrará todos sus archivos de Google Drive de forma irreversible.`)) {
                                    await permanentlyDeleteProspect(p.id);
                                  }
                                }}
                                className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-655 text-[10px] font-bold rounded-xl border border-red-200 transition-colors flex items-center gap-1"
                                title="Eliminar permanente"
                              >
                                <Trash2 className="h-3 w-3" />
                                Borrar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Interactive Scheduling Modal */}
      {selectedProspect && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[999] p-6 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 max-w-md w-full overflow-hidden transform transition-all animate-scale-in">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <span className="text-[9px] text-blue-500 font-bold uppercase tracking-widest block">Calendario Integrado</span>
                <h3 className="text-sm font-extrabold text-slate-800 mt-0.5">Agendar Presentación</h3>
              </div>
              <button
                onClick={() => setSelectedProspect(null)}
                className="p-1.5 bg-slate-200/50 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4">
                <span className="text-[9px] text-blue-500 font-bold uppercase tracking-wider block">Prospecto</span>
                <h4 className="text-xs font-extrabold text-slate-800 mt-0.5">{selectedProspect.full_name}</h4>
                {selectedProspect.simulation && (
                  <p className="text-[10px] text-slate-500 mt-1">Pensión Mejorada: ${selectedProspect.simulation.pensionMejorada.toLocaleString()} • ROI: {selectedProspect.simulation.roiMonths} meses</p>
                )}
              </div>

              {schedulingStep === "datetime" ? (
                <div className="space-y-4">
                  {/* Direct Link Section */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Agendamiento Directo
                    </span>
                    <p className="text-[11px] text-slate-500 mb-3 leading-normal">
                      Haz clic en el enlace para agendar directamente la sesión con el cliente:
                    </p>
                    <a
                      href="https://api.leadconnectorhq.com/widget/booking/tTynbYT83ugTjMBmwCf5"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-blue-500/10 hover:scale-[1.01] gap-1.5"
                    >
                      <span>Abrir Agenda Oficial</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                    <span className="block text-[9px] text-slate-400 mt-2">
                      Una vez agendada la asesoría en el enlace anterior, registra la fecha y hora a continuación para sincronizar el expediente.
                    </span>
                  </div>

                  {/* Select Date */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">1. Seleccionar Día</label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      min={new Date().toISOString().split("T")[0]}
                      className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-blue-500 transition-all"
                    />
                  </div>

                  {/* Select Time slot */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">2. Seleccionar Horario</label>
                    <div className="grid grid-cols-3 gap-2">
                      {["09:00 AM", "11:00 AM", "01:00 PM", "04:00 PM", "06:00 PM"].map((time) => {
                        const isSelected = selectedTime === time;
                        return (
                          <button
                            key={time}
                            onClick={() => setSelectedTime(time)}
                            className={`py-2 text-[10px] font-bold rounded-xl border transition-all ${
                              isSelected
                                ? "bg-blue-600 border-blue-700 text-white shadow-sm shadow-blue-500/10"
                                : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            {time}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 text-center py-4">
                  <div className="h-12 w-12 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-500 flex items-center justify-center mx-auto text-xl animate-bounce">
                    📅
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-700">Confirmación de Invitación</h4>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-[280px] mx-auto">
                      Se agendará una sesión de presentación vía Zoom. Al confirmar, el sistema enviará correos de invitación automáticos y avanzará el caso a **Proyectos Activos**.
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-150 rounded-2xl p-3 max-w-[280px] mx-auto text-xs font-semibold text-slate-600 space-y-1">
                    <div>Fecha: {selectedDate}</div>
                    <div>Horario: {selectedTime}</div>
                    <div className="text-[10px] text-slate-400 mt-1">Agendado vía LeadConnector</div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3">
              <button
                onClick={() => setSelectedProspect(null)}
                className="flex-1 py-2.5 text-xs font-bold bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-700 transition-colors"
              >
                Cancelar
              </button>
              {schedulingStep === "datetime" ? (
                <button
                  disabled={!selectedDate || !selectedTime}
                  onClick={() => setSchedulingStep("confirm")}
                  className="flex-1 py-2.5 text-xs font-bold bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl shadow shadow-blue-500/10 border border-blue-400 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:pointer-events-none"
                >
                  Continuar
                </button>
              ) : (
                <button
                  onClick={handleConfirmSchedule}
                  className="flex-1 py-2.5 text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl shadow shadow-emerald-500/10 border border-emerald-400 transition-all hover:scale-[1.02]"
                >
                  Confirmar Agendamiento
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlusIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5v14" />
    </svg>
  );
}
