"use client";

import React, { useState } from "react";
import { useApp, Prospect, getStageAndSubStage, getStatusFromStageAndSubStage, STAGES_LIST, SUB_STAGES_BY_STAGE } from "@/utils/context/AppContext";
import SalesFunnel from "@/components/SalesFunnel";
import {
  FolderKanban,
  Search,
  Users,
  AlertCircle,
  FileCheck,
  CheckCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Trash2,
  Calendar,
} from "lucide-react";
import Link from "next/link";

export default function PipelineManager() {
  const { prospects, updateProspectStatus, deleteProspect } = useApp();
  const [searchTerm, setSearchTerm] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [subStageFilter, setSubStageFilter] = useState<string>("all");
  const [selectedAlly, setSelectedAlly] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const filteredByDate = prospects.filter((p) => {
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

  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState<Prospect | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

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
      case "cerrado_perdido":
        return "bg-slate-100 text-slate-600 border-slate-200";
      default:
        return "";
    }
  };

  // Calculations for stats
  const totalCases = filteredByDate.length;
  const pendingCases = filteredByDate.filter((p) => p.status === "evaluacion_pendiente").length;
  const approvedCases = filteredByDate.filter((p) => p.status === "aprobado_listo").length;
  const closedCases = filteredByDate.filter((p) => p.status === "pagado_comision").length;

  const totalFundedAmount = filteredByDate
    .filter((p) => ["doc_proceso", "analisis_riesgo", "firma_programada", "pagado_comision"].includes(p.status))
    .reduce((sum, p) => sum + (p.simulation?.financiamiento || 0), 0);

  // Extract unique allies for filter dropdown
  const uniqueAllies = Array.from(new Set(filteredByDate.map((p) => p.aliado_name || "Asesor Comercial")));

  // Filtering matrices
  const filteredProspects = filteredByDate
    .filter((p) => {
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
    })
    .filter((p) => {
      if (selectedAlly === "all") return true;
      return p.aliado_name === selectedAlly;
    });

  const handleStageChange = async (id: string, newStage: Prospect["status"]) => {
    let comment = "";
    if (newStage === "rechazado") {
      comment = prompt("Escribe el motivo del rechazo del prospecto:") || "Documento incompleto.";
    }
    await updateProspectStatus(id, newStage, comment);
  };

  const openDeleteModal = (prospect: Prospect) => {
    setDeleteTarget(prospect);
    setDeleteStep(1);
    setDeleteConfirmText("");
    setDeleting(false);
  };

  const closeDeleteModal = () => {
    setDeleteTarget(null);
    setDeleteStep(1);
    setDeleteConfirmText("");
    setDeleting(false);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteStep === 1) {
      setDeleteStep(2);
      return;
    }
    if (deleteConfirmText !== "ELIMINAR") return;
    setDeleting(true);
    await deleteProspect(deleteTarget.id);
    closeDeleteModal();
  };

  return (
    <>
    <div className="space-y-8 select-none max-w-[1700px] mx-auto animate-fade-in">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Gestión Director</h1>
          <p className="text-slate-500 text-sm mt-1">Supervisa y audita las etapas operativas de los expedientes comerciales y tasas del embudo.</p>
        </div>
      </div>

      {/* Date Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex flex-col sm:flex-row items-center justify-between gap-4 select-none">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-indigo-500 flex-shrink-0" />
          <div>
            <h4 className="text-xs font-bold text-slate-800">Filtrar por Fecha</h4>
            <p className="text-[10px] text-slate-400 mt-0.5">Filtra el embudo y listado por fecha de registro.</p>
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

      {/* Query Search Matrix */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex flex-col md:flex-row gap-4 items-center">
        {/* Text Input Search */}
        <div className="relative w-full md:flex-1">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="h-4.5 w-4.5" />
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar prospecto por Nombre, NSS o CURP..."
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

        {/* Allied filter dropdown */}
        <div className="w-full md:w-52 flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <select
            value={selectedAlly}
            onChange={(e) => setSelectedAlly(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold outline-none focus:border-indigo-500 transition-colors"
          >
            <option value="all">Todos los Aliados</option>
            {uniqueAllies.map((ally) => (
              <option key={ally} value={ally}>
                {ally}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Kanban List Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Listado Pipeline Operativo</span>
          <span className="text-[10px] text-indigo-500 font-bold flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5" />
            Dictamina abriendo el Expediente
          </span>
        </div>

        {filteredProspects.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
              <FolderKanban className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-700">Sin prospectos en este estado</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-[280px] mx-auto">Prueba ajustando los filtros de etapas o del asesor que capturó el caso.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-150 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-left">
                  <th className="px-6 py-4">Prospecto</th>
                  <th className="px-6 py-4">NSS / CURP</th>
                  <th className="px-6 py-4">Aliado Comercial</th>
                  <th className="px-6 py-4">Expediente</th>
                  <th className="px-6 py-4">Estado Interno (8 Etapas)</th>
                  <th className="px-6 py-4 relative"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150">
                {filteredProspects.map((p) => {
                  const hasAfore = p.documents.some((d) => d.file_type === "AFORE");
                  const hasImss = p.documents.some((d) => d.file_type === "IMSS");
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/40 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-xl bg-slate-100 group-hover:bg-indigo-50/50 group-hover:text-indigo-500 text-slate-600 flex items-center justify-center text-xs font-bold border border-slate-200 transition-all">
                            {p.full_name.charAt(0)}
                          </div>
                          <div>
                            <Link
                              href={`/prospectos/${p.id}`}
                              className="text-xs font-extrabold text-slate-800 block hover:text-indigo-600 hover:underline leading-tight"
                            >
                              {p.full_name}
                            </Link>
                            <span className="block text-[10px] text-slate-400 mt-0.5 leading-none">
                              Tel: {p.phone}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-600">
                        <div>
                          <span>NSS: {p.nss}</span>
                          <span className="block text-[9px] text-slate-400 font-medium uppercase tracking-wide mt-0.5">CURP: {p.curp}</span>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs font-bold text-slate-700">{p.aliado_name || "Asesor Comercial"}</span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {hasAfore ? (
                            <span className="inline-flex px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 text-[9px] font-bold border border-emerald-100">
                              AFORE
                            </span>
                          ) : (
                            <span className="inline-flex px-1.5 py-0.5 rounded bg-red-50 text-red-500 text-[9px] font-bold border border-red-100">
                              No AFORE
                            </span>
                          )}
                          {hasImss ? (
                            <span className="inline-flex px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 text-[9px] font-bold border border-emerald-100">
                              IMSS
                            </span>
                          ) : (
                            <span className="inline-flex px-1.5 py-0.5 rounded bg-red-50 text-red-500 text-[9px] font-bold border border-red-100">
                              No IMSS
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1.5 min-w-[150px]">
                          {/* Selector de Etapa */}
                          <select
                            value={getStageAndSubStage(p.status).stage}
                            onChange={async (e) => {
                              const newStage = e.target.value;
                              const defaultSubStage = SUB_STAGES_BY_STAGE[newStage]?.[0] || "";
                              const newStatus = getStatusFromStageAndSubStage(newStage, defaultSubStage);
                              await handleStageChange(p.id, newStatus as any);
                            }}
                            className={`py-1.5 px-3 border rounded-xl text-[10px] font-black outline-none focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer ${getStageColor(p.status)}`}
                          >
                            {STAGES_LIST.map((stage) => (
                              <option key={stage.id} value={stage.id}>{stage.label}</option>
                            ))}
                          </select>

                          {/* Selector de Subetapa */}
                          <select
                            value={getStageAndSubStage(p.status).subStage}
                            onChange={async (e) => {
                              const currentMapping = getStageAndSubStage(p.status);
                              const newStatus = getStatusFromStageAndSubStage(currentMapping.stage, e.target.value);
                              await handleStageChange(p.id, newStatus as any);
                            }}
                            className="py-1 px-2 border border-slate-200 bg-slate-50 hover:bg-slate-100 rounded-lg text-[10px] font-bold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer"
                          >
                            <option value="">Ninguna</option>
                            {(SUB_STAGES_BY_STAGE[getStageAndSubStage(p.status).stage] || []).map((sub) => (
                              <option key={sub} value={sub}>{sub}</option>
                            ))}
                          </select>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <Link
                          href={`/prospectos/${p.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                        >
                          Auditar <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </Link>
                        <button
                          onClick={() => openDeleteModal(p)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-red-400 hover:text-red-600 transition-colors ml-3 p-1 rounded-lg hover:bg-red-50"
                          title="Eliminar prospecto"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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

    {/* Delete Confirmation Modal */}
    {deleteTarget && (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in select-none">
        <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-5 border border-slate-200 mx-4">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-slate-150 pb-4">
            <div className="h-11 w-11 rounded-xl bg-red-50 text-red-500 flex items-center justify-center border border-red-150 shadow-sm">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800">
                {deleteStep === 1 ? "¿Eliminar este prospecto?" : "Confirmación Final"}
              </h3>
              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                {deleteStep === 1
                  ? "Esta acción es irreversible y eliminará todos los datos del expediente."
                  : "Escribe ELIMINAR para confirmar la eliminación permanente."}
              </p>
            </div>
          </div>

          {/* Prospect info card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center text-sm font-black">
                {deleteTarget.full_name.charAt(0)}
              </div>
              <div>
                <span className="text-sm font-black text-slate-800 block">{deleteTarget.full_name}</span>
                <span className="text-[10px] text-slate-400 font-semibold">NSS: {deleteTarget.nss} • CURP: {deleteTarget.curp}</span>
              </div>
            </div>
          </div>

          {/* Step 2: Type confirmation */}
          {deleteStep === 2 && (
            <div>
              <label className="block text-[10px] font-bold text-red-500 uppercase tracking-wider mb-2">
                Escribe &quot;ELIMINAR&quot; para confirmar
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())}
                placeholder="ELIMINAR"
                className="w-full bg-red-50/50 border border-red-200 focus:border-red-500 outline-none rounded-xl px-3.5 py-2.5 text-xs font-bold text-red-700 transition-colors placeholder:text-red-300 tracking-widest text-center"
                autoFocus
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={closeDeleteModal}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all active:scale-95 transform"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={deleteStep === 2 && deleteConfirmText !== "ELIMINAR" || deleting}
              className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs shadow-md shadow-red-500/10 transition-all transform hover:-translate-y-0.5 active:scale-95 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleting ? "Eliminando..." : deleteStep === 1 ? "Sí, Eliminar" : "Confirmar Eliminación"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
