"use client";

import React, { useState } from "react";
import { useApp, Prospect } from "@/utils/context/AppContext";
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
} from "lucide-react";
import Link from "next/link";

export default function DashboardAliado() {
  const { prospects, scheduleAssessment } = useApp();
  const [activeTab, setActiveTab] = useState<"evaluacion" | "listo" | "activos">("evaluacion");
  
  // States for Scheduling Modal
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [schedulingStep, setSchedulingStep] = useState<"datetime" | "confirm">("datetime");

  // Dynamic calculations based on global state
  const enEvaluacion = prospects.filter((p) =>
    ["evaluacion_pendiente", "falta_reporte", "falta_afore", "pendiente_documentos"].includes(p.status)
  );
  const listoPresentar = prospects.filter((p) =>
    ["aprobado_listo", "aportacion"].includes(p.status)
  );
  
  const activeStatuses = [
    "asesoria_agendada",
    "doc_proceso",
    "analisis_riesgo",
    "firma_programada",
    "pagado_comision",
  ];
  const proyectosActivos = prospects.filter((p) => activeStatuses.includes(p.status));
  
  // Missing docs: in evaluation but have less than 2 documents uploaded
  const faltaDocumentos = prospects.filter(
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
  const totalPorFinanciar = prospects
    .filter((p) => pendingFinancingStatuses.includes(p.status) && p.simulation)
    .reduce((sum, p) => sum + (p.simulation?.financiamiento || 0), 0);

  // Total Financing amount executed (sum of paid/closed M40 projects in pagado_comision status)
  const totalEjecutados = prospects
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
    { label: "Asesoría", desc: "Reunión agendada" },
    { label: "Documentos", desc: "Integración expediente" },
    { label: "Riesgos", desc: "Filtros técnicos" },
    { label: "Firma", desc: "Convenio formalizado" },
    { label: "Liberado", desc: "Comisión pagada" },
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
    <div className="space-y-8 select-none max-w-6xl mx-auto">
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

      {/* Metrics Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        {/* Card 1 */}
        <div
          onClick={() => setActiveTab("activos")}
          className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between h-36 relative overflow-hidden group"
        >
          <div className="absolute right-[-10px] top-[-10px] w-20 h-20 bg-blue-500/5 rounded-full blur-xl group-hover:scale-125 transition-transform" />
          <div className="flex justify-between items-start">
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Proyectos Activos</span>
            <Folder className="text-blue-500 h-5 w-5 bg-blue-50 p-1 rounded" />
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-800">{proyectosActivos.length}</div>
            <span className="text-[10px] text-slate-400 font-semibold mt-1 block">En proceso de firma o cierre</span>
          </div>
        </div>

        {/* Card 2 */}
        <div
          onClick={() => setActiveTab("evaluacion")}
          className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between h-36 relative overflow-hidden group"
        >
          <div className="absolute right-[-10px] top-[-10px] w-20 h-20 bg-amber-500/5 rounded-full blur-xl group-hover:scale-125 transition-transform" />
          <div className="flex justify-between items-start">
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">En Evaluación</span>
            <Hourglass className="text-amber-500 h-5 w-5 bg-amber-50 p-1 rounded" />
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-800">{enEvaluacion.length}</div>
            <span className="text-[10px] text-slate-400 font-semibold mt-1 block">Esperando dictamen técnico</span>
          </div>
        </div>

        {/* Card 3 */}
        <div
          onClick={() => setActiveTab("listo")}
          className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between h-36 relative overflow-hidden group"
        >
          <div className="absolute right-[-10px] top-[-10px] w-20 h-20 bg-emerald-500/5 rounded-full blur-xl group-hover:scale-125 transition-transform" />
          <div className="flex justify-between items-start">
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Listos para Presentar</span>
            <CheckSquare className="text-emerald-500 h-5 w-5 bg-emerald-50 p-1 rounded" />
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-emerald-600">{listoPresentar.length}</div>
            <span className="text-[10px] text-emerald-500 font-semibold mt-1 block">Simulaciones listas</span>
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 flex flex-col justify-between h-36 relative overflow-hidden group">
          <div className="absolute right-[-10px] top-[-10px] w-20 h-20 bg-blue-500/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex justify-between items-start">
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total por Financiar</span>
            <DollarSign className="text-blue-500 h-5 w-5 bg-blue-50 p-1 rounded" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-black text-blue-600">${totalPorFinanciar.toLocaleString()}</div>
            <span className="text-[10px] text-slate-400 font-semibold mt-1 block">Proyectos aprobados</span>
          </div>
        </div>

        {/* Card 5 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 flex flex-col justify-between h-36 relative overflow-hidden group">
          <div className="absolute right-[-10px] top-[-10px] w-20 h-20 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex justify-between items-start">
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Monto Ejecutado</span>
            <CheckCircle2 className="text-emerald-600 h-5 w-5 bg-emerald-50 p-1 rounded" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-black text-emerald-600">${totalEjecutados.toLocaleString()}</div>
            <span className="text-[10px] text-slate-400 font-semibold mt-1 block">Financiamientos pagados</span>
          </div>
        </div>
      </div>

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

      {/* Segmented Controller Tab Selector */}
      <div className="bg-slate-200/60 p-1 rounded-2xl max-w-md flex border border-slate-200">
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
              <div className="divide-y divide-slate-100">
                {enEvaluacion.map((p) => {
                  const isIncomplete = p.documents.length < 2;
                  return (
                    <div key={p.id} className="p-6 hover:bg-slate-50/50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-800">{p.full_name}</h4>
                          {isIncomplete ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-600 border border-amber-100">
                              <AlertCircle className="h-3 w-3" /> Falta Reporte IMSS
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-50 text-blue-600 border border-blue-100">
                              Validando
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">NSS: {p.nss} • CURP: {p.curp}</p>
                        {p.notes_aliado && <p className="text-[11px] text-slate-400 italic max-w-lg mt-1 font-medium">Nota: &quot;{p.notes_aliado}&quot;</p>}
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Sube</span>
                          <span className="block text-xs font-semibold text-slate-600 mt-0.5">
                            {new Date(p.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        </div>
                        <Link
                          href={`/prospectos/${p.id}`}
                          className="p-2 bg-slate-100 hover:bg-blue-50 text-slate-500 hover:text-blue-600 rounded-xl transition-all border border-slate-200/60"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LISTO PARA PRESENTAR (PROPUESSTAS EMITIDAS) */}
        {activeTab === "listo" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {listoPresentar.length === 0 ? (
              <div className="col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm py-16 text-center">
                <CheckSquare className="mx-auto h-12 w-12 text-slate-300" />
                <h4 className="text-sm font-bold text-slate-700 mt-3">Ninguna simulación aprobada aún</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-[280px] mx-auto">Una vez que el Director de Operaciones analice los casos y emita el dictamen Ley 73, aparecerán listos aquí.</p>
              </div>
            ) : (
              listoPresentar.map((p) => {
                if (!p.simulation) return null;
                const gainPercent = Math.round(
                  ((p.simulation.pensionMejorada - p.simulation.pensionActual) / p.simulation.pensionActual) * 100
                );
                return (
                  <div key={p.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md hover:border-slate-300 transition-all">
                    {/* Card Header */}
                    <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                      <div>
                        <h4 className="text-sm font-extrabold text-slate-800 leading-tight">{p.full_name}</h4>
                        <p className="text-[10px] text-slate-500 mt-0.5">NSS: {p.nss} • Semanas IMSS: {p.simulation.semanas}</p>
                      </div>
                      {p.status === "aportacion" ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-600 border border-teal-100 shadow-sm">
                          Requiere Aportación
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">
                          Dictamen Emitido
                        </span>
                      )}
                    </div>

                    {/* Simulation Metrics Visualizer */}
                    <div className="p-6 space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        {/* Comparison */}
                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex flex-col justify-between">
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Pensión Anterior</span>
                          <span className="text-sm font-bold text-slate-500 mt-1.5">${p.simulation.pensionActual.toLocaleString()}</span>
                        </div>
                        <div className="bg-emerald-500/10 rounded-xl p-3 border border-emerald-500/20 flex flex-col justify-between relative overflow-hidden">
                          <TrendingUp className="absolute top-2 right-2 h-4 w-4 text-emerald-500" />
                          <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">Mejora Ley 73</span>
                          <div className="flex items-baseline gap-1 mt-1.5">
                            <span className="text-base font-extrabold text-emerald-600">${p.simulation.pensionMejorada.toLocaleString()}</span>
                            <span className="text-[9px] font-bold text-emerald-500">+{gainPercent}%</span>
                          </div>
                        </div>
                      </div>

                      {/* Financing Numbers */}
                      <div className="bg-[#f8fafc] border border-slate-200/80 rounded-xl p-4 space-y-2 text-xs font-semibold">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Financiamiento Aprobado:</span>
                          <span className="text-slate-800">${p.simulation.financiamiento.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Costos Administrativos:</span>
                          <span className="text-slate-800">${p.simulation.costoGestion.toLocaleString()}</span>
                        </div>
                        <div className="border-t border-slate-200/60 my-2 pt-2 flex justify-between font-bold">
                          <span className="text-slate-500">Total Crédito (M40 + Gestión):</span>
                          <span className="text-slate-900">${p.simulation.totalCredito.toLocaleString()}</span>
                        </div>
                        
                        {p.simulation.aforePensionarse !== undefined && p.simulation.aforePensionarse > 0 && (
                          <div className="flex justify-between text-amber-600 font-semibold bg-amber-500/5 p-1.5 px-2 rounded-lg">
                            <span>(-) Afore al Pensionarse:</span>
                            <span>-${p.simulation.aforePensionarse.toLocaleString()}</span>
                          </div>
                        )}
                        {p.simulation.aportacion !== undefined && p.simulation.aportacion > 0 && (
                          <div className="flex justify-between text-teal-600 font-bold bg-teal-500/5 p-1.5 px-2 rounded-lg">
                            <span>(=) Aportación Requerida:</span>
                            <span>${p.simulation.aportacion.toLocaleString()}</span>
                          </div>
                        )}

                        <div className="flex justify-between text-emerald-600 font-bold bg-emerald-500/5 p-1 px-2 rounded-lg mt-2">
                          <span>Retorno ROI Estimado:</span>
                          <span>{p.simulation.roiMonths} Meses</span>
                        </div>
                      </div>

                      {/* Comments */}
                      {p.simulation.comments && (
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Notas del Evaluador:</span>
                          <p className="text-[11px] text-slate-500 leading-relaxed font-medium">&quot;{p.simulation.comments}&quot;</p>
                        </div>
                      )}
                    </div>

                    {/* Bottom CTA Actions */}
                    <div className="p-6 border-t border-slate-100 flex gap-3 bg-slate-50/50">
                      <Link
                        href={`/prospectos/${p.id}`}
                        className="flex-1 inline-flex justify-center items-center px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-300 transition-colors"
                      >
                        <FileText className="h-4 w-4 mr-1.5" />
                        Ver Expediente
                      </Link>
                      <button
                        onClick={() => handleOpenSchedule(p)}
                        className="flex-1 inline-flex justify-center items-center px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow shadow-blue-500/10 border border-blue-400 transition-all hover:scale-[1.02] active:scale-[0.98] transform animate-pulse hover:animate-none"
                      >
                        <Calendar className="h-4 w-4 mr-1.5" />
                        Agendar Asesoría
                      </button>
                    </div>
                  </div>
                );
              })
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
                    {/* Header Details */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                      <div>
                        <h4 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                          {p.full_name}
                          {isPaid && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-600 border border-amber-500/20 shadow-inner">
                              ★ Comisión Liberada
                            </span>
                          )}
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">NSS: {p.nss} • CURP: {p.curp}</p>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {p.simulation && (
                          <div className="text-right sm:border-r sm:pr-4 sm:border-slate-100">
                            <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-wider">Crédito Total</span>
                            <span className="block text-xs font-extrabold text-slate-700">${p.simulation.totalCredito.toLocaleString()}</span>
                          </div>
                        )}
                        <Link
                          href={`/prospectos/${p.id}`}
                          className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold rounded-xl border border-slate-200 transition-colors flex items-center gap-1"
                        >
                          Expediente <ArrowUpRight className="h-3 w-3" />
                        </Link>
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
                    <div className="text-[10px] text-slate-400 mt-1">Sincronizado vía Calendly</div>
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
