"use client";

import React, { useState, Suspense } from "react";
import {
  useApp,
  Prospect,
  getStageAndSubStage,
  getStatusFromStageAndSubStage,
  STAGES_LIST,
  SUB_STAGES_BY_STAGE,
} from "@/utils/context/AppContext";
import {
  Search,
  Users,
  Trash2,
  FolderKanban,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function ClientesAdminContent() {
  const {
    user,
    prospects,
    profiles,
    updateProspectStatus,
    deleteProspect,
    restoreProspect,
    permanentlyDeleteProspect,
    isProspectDeleted,
    isProspectPurged,
    getProspectDeletedAt,
  } = useApp();

  const isAM = user?.role === "account_manager";
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"activos" | "papelera">("activos");
  const [searchTerm, setSearchTerm] = useState("");

  const startDate = searchParams.get("desde") || "";
  const endDate = searchParams.get("hasta") || "";
  const stageFilter = searchParams.get("etapa") || "all";
  const subStageFilter = searchParams.get("subetapa") || "all";
  const selectedAlly = searchParams.get("aliado") || "all";

  // Director filtering states
  const [directorFilterType, setDirectorFilterType] = useState<"todos" | "am" | "aliado" | "gestion_directa">("todos");
  const [selectedAMId, setSelectedAMId] = useState<string>("all");
  const [selectedAllyId, setSelectedAllyId] = useState<string>("all");

  const baseFilteredProspects = React.useMemo(() => {
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
  const deletedProspects = baseFilteredProspects.filter((p) => isProspectDeleted(p));

  const filteredByDate = activeProspects.filter((p) => {
    if (!p.created_at) return true;
    const createdDateStr = p.created_at.substring(0, 10);

    if (startDate && createdDateStr < startDate) return false;
    if (endDate && createdDateStr > endDate) return false;

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
    const { stage } = getStageAndSubStage(status);
    switch (stage) {
      case "evaluacion_pendiente":
        return "bg-blue-50 dark:bg-blue-950/15 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-800/40";
      case "rechazado":
        return "bg-red-50 dark:bg-red-950/20 text-red-650 dark:text-red-400 border-red-100 dark:border-red-800/40";
      case "condicionado":
        return "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border-amber-100 dark:border-amber-800/40";
      case "aprobado":
        return "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/40";
      case "cerrado_perdido":
        return "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700";
      default:
        return "";
    }
  };

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

  const deletedByDate = deletedProspects.filter((p) => {
    if (!p.created_at) return true;
    const createdDateStr = p.created_at.substring(0, 10);
    if (startDate && createdDateStr < startDate) return false;
    if (endDate && createdDateStr > endDate) return false;
    return true;
  });

  const filteredDeletedProspects = deletedByDate
    .filter((p) => {
      const term = searchTerm.toLowerCase();
      return (
        p.full_name.toLowerCase().includes(term) ||
        p.nss.includes(term) ||
        p.curp.toLowerCase().includes(term)
      );
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
      <div className="space-y-8 max-w-[1700px] mx-auto animate-fade-in text-slate-800 dark:text-slate-100">
        
        {/* Director Pipeline Assignment Filters */}
        {!isAM && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 flex-shrink-0 text-emerald-500" />
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-white">Filtro de Asignación / Origen</h4>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Filtra la lista de clientes por supervisor, aliado comercial o tu gestión directa.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div className="bg-slate-200/60 dark:bg-slate-950 p-1 rounded-xl flex border border-slate-200 dark:border-slate-850 text-xs font-bold">
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
                    directorFilterType === "am" ? "bg-white dark:bg-slate-850 text-slate-850 dark:text-white shadow-sm font-black" : "text-slate-500 hover:text-slate-850"
                  }`}
                >
                  Por AM
                </button>
                <button
                  onClick={() => setDirectorFilterType("aliado")}
                  className={`px-3 py-1.5 rounded-lg transition-all text-[10px] ${
                    directorFilterType === "aliado" ? "bg-white dark:bg-slate-850 text-slate-850 dark:text-white shadow-sm font-black" : "text-slate-500 hover:text-slate-850"
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
                  className="bg-slate-55 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl py-1.5 px-3 text-xs font-semibold outline-none transition-colors cursor-pointer dark:text-slate-350 focus:border-emerald-500"
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

        {/* Search Bar */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm p-4">
          <div className="relative w-full">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
              <Search className="h-4.5 w-4.5" />
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar prospecto por Nombre, NSS o CURP..."
              className={`w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/60 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl text-xs font-semibold outline-none transition-all dark:text-slate-200 ${
                isAM ? "focus:border-blue-500" : "focus:border-emerald-500"
              }`}
            />
          </div>
        </div>

        {/* Segmented Controller Tab Selector */}
        <div className="bg-slate-200/60 dark:bg-slate-900 p-1 rounded-2xl max-w-xs flex border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveTab("activos")}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === "activos"
                ? "bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
            }`}
          >
            Casos Activos ({filteredProspects.length})
          </button>
          <button
            onClick={() => setActiveTab("papelera")}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === "papelera"
                ? "bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
            }`}
          >
            Papelera ({filteredDeletedProspects.length})
          </button>
        </div>

        {/* Kanban List Table */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Listado Pipeline Operativo</span>
            <span className={`text-[10px] font-bold flex items-center gap-1 ${isAM ? "text-blue-500" : "text-emerald-500"}`}>
              <Sparkles className="h-3.5 w-3.5" />
              Dictamina abriendo el Expediente
            </span>
          </div>

          {activeTab === "papelera" ? (
            filteredDeletedProspects.length === 0 ? (
              <div className="py-20 text-center space-y-3 bg-white dark:bg-slate-900">
                <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mx-auto">
                  <Trash2 className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">La papelera está vacía</h4>
                  <p className="text-xs text-slate-450 dark:text-slate-500 mt-1 max-w-[280px] mx-auto">Los expedientes eliminados aparecerán aquí por 7 días.</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-150 dark:border-slate-800 text-[10px] font-bold text-slate-550 dark:text-slate-450 uppercase tracking-widest text-left">
                      <th className="px-6 py-4">Prospecto</th>
                      <th className="px-6 py-4">NSS / CURP</th>
                      <th className="px-6 py-4">Aliado Comercial</th>
                      <th className="px-6 py-4">Líder Asignado</th>
                      <th className="px-6 py-4">Fecha Eliminación</th>
                      <th className="px-6 py-4">Días Restantes</th>
                      <th className="px-6 py-4 relative"><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 dark:divide-slate-800">
                    {filteredDeletedProspects.map((p) => {
                      const deletedAt = getProspectDeletedAt(p);
                      const remainingDays = deletedAt ? Math.max(0, Math.ceil((deletedAt.getTime() + 7 * 24 * 60 * 60 * 1000 - Date.now()) / (1000 * 60 * 60 * 24))) : 7;
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-850/20 transition-colors group">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-350 flex items-center justify-center text-xs font-bold border border-slate-200 dark:border-slate-750">
                                {p.full_name.charAt(0)}
                              </div>
                              <div>
                                <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 block leading-tight">
                                  {p.full_name}
                                </span>
                                <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-none">
                                  Tel: {p.phone}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-400">
                            <div>
                              <span>NSS: {p.nss}</span>
                              <span className="block text-[9px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wide mt-0.5">CURP: {p.curp}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{p.aliado_name || "Asesor Comercial"}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-xs font-semibold text-slate-650 dark:text-slate-400">
                              {(() => {
                                const allyProfile = profiles.find((prof) => prof.id === p.aliado_id);
                                if (!allyProfile) return "Sin Líder";
                                const leaders = profiles.filter((prof) => allyProfile.lider_ids?.includes(prof.id));
                                return leaders.length > 0
                                  ? leaders.map((prof) => prof.full_name).join(", ")
                                  : "Sin Líder";
                              })()}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {deletedAt ? deletedAt.toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "N/A"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold border ${remainingDays <= 2 ? "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-800/50" : "bg-amber-50 dark:bg-amber-950/15 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-800/50"}`}>
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
                                className="px-2.5 py-1.5 bg-emerald-55 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold rounded-xl border border-emerald-200 dark:border-emerald-850 transition-colors"
                              >
                                Restaurar
                              </button>
                              <button
                                onClick={async () => {
                                  if (confirm(`¿Eliminar permanentemente a ${p.full_name}? Esta acción borrará todos sus archivos de Google Drive de forma irreversible.`)) {
                                    await permanentlyDeleteProspect(p.id);
                                  }
                                }}
                                className="px-2.5 py-1.5 bg-rose-50 dark:bg-rose-950/15 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-700 dark:text-rose-400 text-[10px] font-bold rounded-xl border border-rose-250 dark:border-rose-850 transition-colors"
                              >
                                Eliminar Permanente
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            filteredProspects.length === 0 ? (
              <div className="py-20 text-center space-y-3 bg-white dark:bg-slate-900">
                <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mx-auto">
                  <FolderKanban className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Sin prospectos en este estado</h4>
                  <p className="text-xs text-slate-450 dark:text-slate-500 mt-1 max-w-[280px] mx-auto">Prueba ajustando los filtros de etapas o del asesor que capturó el caso.</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-150 dark:border-slate-800 text-[10px] font-bold text-slate-550 dark:text-slate-450 uppercase tracking-widest text-left">
                      <th className="px-6 py-4">Prospecto</th>
                      <th className="px-6 py-4">NSS / CURP</th>
                      <th className="px-6 py-4">Aliado Comercial</th>
                      <th className="px-6 py-4">Líder Asignado</th>
                      <th className="px-6 py-4">Expediente</th>
                      <th className="px-6 py-4">Estado Interno (8 Etapas)</th>
                      <th className="px-6 py-4 relative"><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 dark:divide-slate-800">
                    {filteredProspects.map((p) => {
                      const hasAfore = p.documents.some((d) => d.file_type === "AFORE");
                      const hasImss = p.documents.some((d) => d.file_type === "IMSS");
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-850/20 transition-colors group">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className={`h-9 w-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-350 flex items-center justify-center text-xs font-bold border border-slate-200 dark:border-slate-750 transition-all ${
                                isAM 
                                  ? "group-hover:bg-blue-50/50 dark:group-hover:bg-blue-950/20 group-hover:text-blue-500 dark:group-hover:text-blue-400"
                                  : "group-hover:bg-emerald-50/50 dark:group-hover:bg-emerald-950/20 group-hover:text-emerald-500 dark:group-hover:text-emerald-400"
                              }`}>
                                {p.full_name.charAt(0)}
                              </div>
                              <div>
                                <Link
                                  href={`/prospectos/${p.id}`}
                                  className={`text-xs font-extrabold text-slate-800 dark:text-slate-200 block hover:underline leading-tight ${
                                    isAM ? "hover:text-blue-600 dark:hover:text-blue-400" : "hover:text-emerald-600 dark:hover:text-emerald-400"
                                  }`}
                                >
                                  {p.full_name}
                                </Link>
                                <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-none">
                                  Tel: {p.phone}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-400">
                            <div>
                              <span>NSS: {p.nss}</span>
                              <span className="block text-[9px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wide mt-0.5">CURP: {p.curp}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{p.aliado_name || "Asesor Comercial"}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-xs font-semibold text-slate-650 dark:text-slate-400">
                              {(() => {
                                const allyProfile = profiles.find((prof) => prof.id === p.aliado_id);
                                if (!allyProfile) return "Sin Líder";
                                const leaders = profiles.filter((prof) => allyProfile.lider_ids?.includes(prof.id));
                                return leaders.length > 0
                                  ? leaders.map((prof) => prof.full_name).join(", ")
                                  : "Sin Líder";
                              })()}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              {hasAfore ? (
                                <span className="inline-flex px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/25 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold border border-emerald-100 dark:border-emerald-850">
                                  AFORE
                                </span>
                              ) : (
                                <span className="inline-flex px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/20 text-red-500 dark:text-red-400 text-[9px] font-bold border border-red-100 dark:border-red-850">
                                  No AFORE
                                </span>
                              )}
                              {hasImss ? (
                                <span className="inline-flex px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/25 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold border border-emerald-100 dark:border-emerald-850">
                                  IMSS
                                </span>
                              ) : (
                                <span className="inline-flex px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/20 text-red-500 dark:text-red-400 text-[9px] font-bold border border-red-100 dark:border-red-850">
                                  No IMSS
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1.5 min-w-[150px]">
                              <select
                                value={getStageAndSubStage(p.status).stage}
                                onChange={async (e) => {
                                  const newStage = e.target.value;
                                  const defaultSubStage = SUB_STAGES_BY_STAGE[newStage]?.[0] || "";
                                  const newStatus = getStatusFromStageAndSubStage(newStage, defaultSubStage);
                                  await handleStageChange(p.id, newStatus as any);
                                }}
                                className={`py-1.5 px-3 border rounded-xl text-[10px] font-black outline-none transition-all cursor-pointer dark:bg-slate-900 ${
                                  isAM ? "focus:ring-1 focus:ring-blue-500" : "focus:ring-1 focus:ring-emerald-500"
                                } ${getStageColor(p.status)}`}
                              >
                                {STAGES_LIST.map((stage) => (
                                  <option key={stage.id} value={stage.id} className="dark:bg-slate-900">{stage.label}</option>
                                ))}
                              </select>
                              <select
                                value={getStageAndSubStage(p.status).subStage}
                                onChange={async (e) => {
                                  const currentMapping = getStageAndSubStage(p.status);
                                  const newStatus = getStatusFromStageAndSubStage(currentMapping.stage, e.target.value);
                                  await handleStageChange(p.id, newStatus as any);
                                }}
                                className={`py-1 px-2 border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-[10px] font-bold text-slate-700 dark:text-slate-300 outline-none transition-all cursor-pointer ${
                                  isAM ? "focus:ring-1 focus:ring-blue-500" : "focus:ring-1 focus:ring-emerald-500"
                                }`}
                              >
                                <option value="" className="dark:bg-slate-900">Ninguna</option>
                                {(SUB_STAGES_BY_STAGE[getStageAndSubStage(p.status).stage] || []).map((sub) => (
                                  <option key={sub} value={sub} className="dark:bg-slate-900">{sub}</option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <Link
                              href={`/prospectos/${p.id}`}
                              className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                                isAM ? "text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300" : "text-emerald-650 hover:text-emerald-800 dark:text-emerald-450 dark:hover:text-emerald-300"
                              }`}
                            >
                              Auditar <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                            </Link>
                            <button
                              onClick={() => openDeleteModal(p)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-red-400 dark:text-red-400 hover:text-red-650 dark:hover:text-red-300 transition-colors ml-3 p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20"
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
            )
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-5 border border-slate-200 dark:border-slate-800 mx-4">
            <div className="flex items-center gap-3 border-b border-slate-150 dark:border-slate-800 pb-4">
              <div className="h-11 w-11 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-500 dark:text-red-400 flex items-center justify-center border border-red-150 dark:border-red-800/40 shadow-sm">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-white">
                  {deleteStep === 1 ? "¿Eliminar este prospecto?" : "Confirmación Final"}
                </h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
                  {deleteStep === 1
                    ? "Esta acción enviará al prospecto a la papelera por 7 días, visible para el director y aliados."
                    : "Escribe ELIMINAR para confirmar el envío a la papelera."}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-1.5">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-red-100 dark:bg-red-950/20 text-red-600 dark:text-red-400 flex items-center justify-center text-sm font-black">
                  {deleteTarget.full_name.charAt(0)}
                </div>
                <div>
                  <span className="text-sm font-black text-slate-800 dark:text-slate-200 block">{deleteTarget.full_name}</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">NSS: {deleteTarget.nss} • CURP: {deleteTarget.curp}</span>
                </div>
              </div>
            </div>

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
                  className="w-full bg-red-50/50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 focus:border-red-500 outline-none rounded-xl px-3.5 py-2.5 text-xs font-bold text-red-750 dark:text-red-400 transition-colors placeholder:text-red-300 tracking-widest text-center"
                  autoFocus
                />
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={closeDeleteModal}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition-all active:scale-95 transform"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteStep === 2 && deleteConfirmText !== "ELIMINAR" || deleting}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs shadow-md shadow-red-500/10 transition-all transform hover:-translate-y-0.5 active:scale-95 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleting ? "Eliminando..." : deleteStep === 1 ? "Sí, Mover a Papelera" : "Confirmar Envío"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function ClientesAdminPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-450">Cargando gestión de clientes...</div>}>
      <ClientesAdminContent />
    </Suspense>
  );
}
