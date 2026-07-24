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
  ArrowRight,
  ArrowLeftRight,
  ChevronDown,
  Plus,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useSortable, SortControl, SortHeader } from "@/components/ui/sorting";
import { ModalidadFilterValue, prospectMatchesModalidadFilter } from "@/components/ui/ModalidadFilter";
import { AliadoPicker, prospectMatchesSelection } from "@/components/ui/AliadoPicker";
import { TipoFinanciamientoBadge } from "@/components/ui/tipoFinanciamiento";
import { ProjectStepper, getActiveStageIndex, hasProjectTimeline } from "@/components/ui/projectStepper";
import { createClient } from "@/utils/supabase/client";
import Link from "next/link";

function ClientesAdminContent() {
  const {
    user,
    prospects,
    profiles,
    assignmentProfiles,
    updateProspectStatus,
    reassignProspect,
    deleteProspect,
    restoreProspect,
    permanentlyDeleteProspect,
    isProspectDeleted,
    isProspectPurged,
    getProspectDeletedAt,
    isDemoMode,
  } = useApp();

  const isAM = user?.role === "account_manager";
  const accent = isAM ? "blue" : "emerald";
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"activos" | "papelera">("activos");
  const [searchTerm, setSearchTerm] = useState("");

  const startDate = searchParams.get("desde") || "";
  const endDate = searchParams.get("hasta") || "";
  const stageFilter = searchParams.get("etapa") || "all";
  const subStageFilter = searchParams.get("subetapa") || "all";
  const selectedAlly = searchParams.get("aliado") || "all";

  // Filtro de asignación (director): multi-selección de aliados y/o account managers.
  // Vacío = Todos. Ver AliadoPicker / prospectMatchesSelection.
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  // Filtro por modalidad de aprobación — lo controla el panel izquierdo (FILTRAR) vía URL.
  const modalidadFilter = (searchParams.get("modalidad") || "all") as ModalidadFilterValue;
  // Filtro por origen del aliado: "empresa" (pertenece a una empresa multialiado) vs
  // "independiente" (sin empresa). Se controla desde el panel izquierdo (FILTRAR) vía URL.
  const origenFilter = searchParams.get("origen") || "all"; // all | empresa | independiente

  // Clasifica un prospecto según el aliado dueño: si el aliado pertenece a una empresa
  // multialiado -> "empresa", si no -> "independiente". Se prefiere la empresa ACTUAL del
  // perfil dueño (fuente de verdad de la Asignación Multialiado) y, si no está el perfil,
  // se usa la empresa que quedó guardada en el propio prospecto al capturarlo.
  const getProspectOrigen = React.useCallback(
    (p: Prospect): "empresa" | "independiente" => {
      const owner = profiles.find((pr) => pr.id === p.aliado_id);
      const empresaId = owner ? owner.empresa_multialiado_id ?? null : p.empresa_multialiado_id ?? null;
      return empresaId ? "empresa" : "independiente";
    },
    [profiles]
  );

  const baseFilteredProspects = React.useMemo(() => {
    if (user?.role !== "director") return prospects;
    return prospects.filter((p) => prospectMatchesSelection(p, selectedEntities, profiles));
  }, [prospects, user, selectedEntities, profiles]);

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

  // Reassign modal state — director/AM pueden mover un proyecto a otro aliado.
  const [reassignTarget, setReassignTarget] = useState<Prospect | null>(null);
  const [reassignAllyId, setReassignAllyId] = useState<string>("");
  const [reassigning, setReassigning] = useState(false);

  // Aliados a los que se puede reasignar: director y AM pueden mover el proyecto a
  // CUALQUIER aliado del sistema (la "cartera" del AM ya no existe: el AM es por
  // proyecto). Se usa la lista CRUDA `assignmentProfiles`, igual que al capturar.
  const eligibleAllies = React.useMemo(
    () =>
      assignmentProfiles
        .filter((p) => p.role === "aliado" && p.is_active !== false)
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [assignmentProfiles]
  );

  const openReassignModal = (prospect: Prospect) => {
    setReassignTarget(prospect);
    setReassignAllyId("");
    setReassigning(false);
  };

  const closeReassignModal = () => {
    setReassignTarget(null);
    setReassignAllyId("");
    setReassigning(false);
  };

  const handleConfirmReassign = async () => {
    if (!reassignTarget || !reassignAllyId) return;
    setReassigning(true);
    try {
      await reassignProspect(reassignTarget.id, reassignAllyId);
      closeReassignModal();
    } catch (err) {
      console.error("Error al reasignar el proyecto:", err);
      alert("No se pudo reasignar el proyecto. Intenta de nuevo.");
      setReassigning(false);
    }
  };

  // Línea de tiempo del aliado por fila (misma que ve el aliado en Mis Clientes).
  // Se carga bajo demanda al expandir para no traer todo el historial de golpe.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusDates, setStatusDates] = useState<Record<string, Record<string, number>>>({});

  const toggleTimeline = async (id: string) => {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    if (!next || statusDates[next] || isDemoMode) return;
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("prospect_status_history")
        .select("status, changed_at")
        .eq("prospect_id", next)
        .order("changed_at", { ascending: true });
      if (error) throw error;
      const map: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        const t = new Date(r.changed_at).getTime();
        if (map[r.status] === undefined || t < map[r.status]) map[r.status] = t;
      });
      setStatusDates((prev) => ({ ...prev, [next]: map }));
    } catch {
      // Tabla no migrada aún o error transitorio — se muestra sin fechas.
      setStatusDates((prev) => ({ ...prev, [next]: {} }));
    }
  };

  const stageIndex = (status: Prospect["status"]) =>
    STAGES_LIST.findIndex((s) => s.id === getStageAndSubStage(status).stage);

  const getStageColor = (status: Prospect["status"]) => {
    const { stage } = getStageAndSubStage(status);
    switch (stage) {
      case "evaluacion_pendiente":
        return "bg-blue-50 dark:bg-blue-950/15 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-800/40";
      case "rechazado":
        return "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-800/40";
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
    })
    .filter((p) => prospectMatchesModalidadFilter(p, modalidadFilter))
    .filter((p) => origenFilter === "all" || getProspectOrigen(p) === origenFilter);

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
    })
    .filter((p) => origenFilter === "all" || getProspectOrigen(p) === origenFilter);

  // Sorting — active list and trash each get their own sort state/controls.
  const sortA = useSortable<Prospect>(
    filteredProspects,
    {
      fecha: (p) => p.created_at || "",
      nombre: (p) => p.full_name,
      tipo: (p) => p.tipo_financiamiento || "",
      aliado: (p) => p.aliado_name || "",
      etapa: (p) => stageIndex(p.status),
      expediente: (p) => p.documents.length,
    },
    "fecha",
    "desc"
  );
  const sortT = useSortable<Prospect>(
    filteredDeletedProspects,
    {
      eliminado: (p) => getProspectDeletedAt(p)?.getTime() ?? 0,
      nombre: (p) => p.full_name,
      aliado: (p) => p.aliado_name || "",
    },
    "eliminado",
    "desc"
  );

  const sortOptionsActive = [
    { id: "fecha", label: "Fecha registro" },
    { id: "nombre", label: "Nombre" },
    { id: "tipo", label: "Tipo de financiamiento" },
    { id: "aliado", label: "Aliado" },
    { id: "etapa", label: "Etapa" },
    { id: "expediente", label: "Documentos" },
  ];
  const sortOptionsTrash = [
    { id: "eliminado", label: "Fecha eliminado" },
    { id: "nombre", label: "Nombre" },
    { id: "aliado", label: "Aliado" },
  ];

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
      <div className="space-y-5 max-w-[1700px] mx-auto animate-fade-in text-slate-800 dark:text-slate-100">

        {/* Barra de acción: subir un nuevo proyecto (director / account manager) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">Pipeline de expedientes</h3>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Sube un nuevo proyecto o gestiona los expedientes existentes.</p>
          </div>
          <Link
            href="/admin/nuevo"
            className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm transition-all active:scale-95 shrink-0 ${
              isAM
                ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20"
            }`}
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Subir Proyecto
          </Link>
        </div>

        {/* Director Pipeline Assignment Filters */}
        {!isAM && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-emerald-500/10">
                <Users className="h-4 w-4" strokeWidth={2.2} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-white">Filtro de Asignación / Origen</h4>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Selecciona uno o varios aliados y/o account managers para comparar sus gestiones.</p>
              </div>
            </div>

            <AliadoPicker
              profiles={profiles}
              selected={selectedEntities}
              onChange={setSelectedEntities}
              accent="emerald"
            />
          </div>
        )}

        {/* Kanban List Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-3 py-2.5 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="flex flex-1 items-center gap-2.5 min-w-0">
              <div className="relative w-full max-w-[280px]">
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                  <Search className="h-3.5 w-3.5" />
                </span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar Nombre, NSS o CURP..."
                  className={`w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-lg text-xs font-semibold outline-none transition-all dark:text-slate-200 ${
                    isAM ? "focus:border-blue-500" : "focus:border-emerald-500"
                  }`}
                />
              </div>
              <div className="bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg flex ring-1 ring-inset ring-slate-200/70 dark:ring-slate-800 shrink-0">
                <button
                  onClick={() => setActiveTab("activos")}
                  className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-all ${
                    activeTab === "activos"
                      ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                  }`}
                >
                  Activos <span className="tabular-nums opacity-70">({filteredProspects.length})</span>
                </button>
                <button
                  onClick={() => setActiveTab("papelera")}
                  className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-all ${
                    activeTab === "papelera"
                      ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                  }`}
                >
                  Papelera <span className="tabular-nums opacity-70">({filteredDeletedProspects.length})</span>
                </button>
              </div>
            </div>
            <SortControl
              options={activeTab === "papelera" ? sortOptionsTrash : sortOptionsActive}
              sort={activeTab === "papelera" ? sortT : sortA}
              accent={accent as any}
            />
          </div>

          {activeTab === "papelera" ? (
            filteredDeletedProspects.length === 0 ? (
              <div className="py-16 text-center space-y-3 bg-white dark:bg-slate-900">
                <div className="h-11 w-11 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mx-auto">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">La papelera está vacía</h4>
                  <p className="text-xs text-slate-450 dark:text-slate-500 mt-1 max-w-[280px] mx-auto">Los expedientes eliminados aparecerán aquí por 7 días.</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/60 dark:bg-slate-900/30 border-b border-slate-150 dark:border-slate-800 text-left">
                      <SortHeader col="nombre" label="Prospecto" sort={sortT} className="pl-5" />
                      <SortHeader col="aliado" label="Asignación" sort={sortT} />
                      <SortHeader col="eliminado" label="Eliminado · Vence" sort={sortT} />
                      <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    {sortT.sorted.map((p) => {
                      const deletedAt = getProspectDeletedAt(p);
                      const remainingDays = deletedAt ? Math.max(0, Math.ceil((deletedAt.getTime() + 7 * 24 * 60 * 60 * 1000 - Date.now()) / (1000 * 60 * 60 * 24))) : 7;
                      const allyProfile = profiles.find((prof) => prof.id === p.aliado_id);
                      const leaders = allyProfile ? profiles.filter((prof) => allyProfile.lider_ids?.includes(prof.id)) : [];
                      const leaderNames = leaders.length > 0 ? leaders.map((prof) => prof.full_name).join(", ") : "Sin líder";
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-850/20 transition-colors group">
                          <td className="pl-5 pr-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center text-xs font-bold shrink-0">
                                {p.full_name.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <span className="font-bold text-slate-800 dark:text-slate-200 block leading-tight truncate max-w-[220px]">{p.full_name}</span>
                                <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-medium text-slate-400 dark:text-slate-500 leading-none tabular-nums">
                                  <span>{p.nss}</span>
                                  <span className="text-slate-300 dark:text-slate-700">·</span>
                                  <span>Tel {p.phone}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="font-semibold text-slate-700 dark:text-slate-300 block truncate max-w-[150px]">{p.aliado_name || "Asesor Comercial"}</span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 block truncate max-w-[150px] mt-0.5">Líder: {leaderNames}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                              {deletedAt ? deletedAt.toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "N/A"}
                            </span>
                            <span className={`inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold ${remainingDays <= 2 ? "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400" : "bg-amber-50 dark:bg-amber-950/15 text-amber-700 dark:text-amber-400"}`}>
                              Vence en {remainingDays} {remainingDays === 1 ? "día" : "días"}
                            </span>
                          </td>
                          <td className="px-5 py-2.5 text-right">
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={async () => {
                                  if (confirm(`¿Restaurar a ${p.full_name} al pipeline activo?`)) {
                                    await restoreProspect(p.id);
                                  }
                                }}
                                className="px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold rounded-lg transition-colors active:scale-95"
                              >
                                Restaurar
                              </button>
                              <button
                                onClick={async () => {
                                  if (confirm(`¿Eliminar permanentemente a ${p.full_name}? Esta acción borrará todos sus archivos de Google Drive de forma irreversible.`)) {
                                    await permanentlyDeleteProspect(p.id);
                                  }
                                }}
                                className="px-2.5 py-1.5 bg-rose-50 dark:bg-rose-950/15 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-700 dark:text-rose-400 text-[10px] font-bold rounded-lg transition-colors active:scale-95"
                              >
                                Eliminar
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
              <div className="py-16 text-center space-y-3 bg-white dark:bg-slate-900">
                <div className="h-11 w-11 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mx-auto">
                  <FolderKanban className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Sin prospectos en este estado</h4>
                  <p className="text-xs text-slate-450 dark:text-slate-500 mt-1 max-w-[280px] mx-auto">Prueba ajustando los filtros de etapas o del asesor que capturó el caso.</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/60 dark:bg-slate-900/30 border-b border-slate-150 dark:border-slate-800 text-left">
                      <SortHeader col="nombre" label="Prospecto" sort={sortA} className="pl-5" />
                      <SortHeader col="tipo" label="Tipo de financiamiento" sort={sortA} />
                      <SortHeader col="aliado" label="Asignación" sort={sortA} />
                      <SortHeader col="expediente" label="Expediente" sort={sortA} align="center" />
                      <SortHeader col="etapa" label="Etapa · Subetapa" sort={sortA} />
                      <SortHeader col="fecha" label="Registrado" sort={sortA} align="center" />
                      <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    {sortA.sorted.map((p) => {
                      const hasAfore = p.documents.some((d) => d.file_type === "AFORE");
                      const hasImss = p.documents.some((d) => d.file_type === "IMSS");
                      const allyProfile = profiles.find((prof) => prof.id === p.aliado_id);
                      const leaders = allyProfile ? profiles.filter((prof) => allyProfile.lider_ids?.includes(prof.id)) : [];
                      const leaderNames = leaders.length > 0 ? leaders.map((prof) => prof.full_name).join(", ") : "Sin líder";
                      // La línea de tiempo solo aplica a proyectos aprobados (o más adelante
                      // en el pipeline de cierre). Antes del dictamen de aprobación no se muestra.
                      const showTimeline = hasProjectTimeline(p.status);
                      const isExpanded = expandedId === p.id && showTimeline;
                      return (
                        <React.Fragment key={p.id}>
                        <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-850/20 transition-colors group">
                          {/* Prospecto */}
                          <td className="pl-5 pr-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className={`h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                                isAM
                                  ? "group-hover:bg-blue-50 dark:group-hover:bg-blue-950/20 group-hover:text-blue-500"
                                  : "group-hover:bg-emerald-50 dark:group-hover:bg-emerald-950/20 group-hover:text-emerald-500"
                              }`}>
                                {p.full_name.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <Link
                                  href={`/prospectos/${p.id}`}
                                  className={`font-bold text-slate-800 dark:text-slate-200 block hover:underline leading-tight truncate max-w-[220px] ${
                                    isAM ? "hover:text-blue-600 dark:hover:text-blue-400" : "hover:text-emerald-600 dark:hover:text-emerald-400"
                                  }`}
                                >
                                  {p.full_name}
                                </Link>
                                <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-medium text-slate-400 dark:text-slate-500 leading-none tabular-nums">
                                  <span>{p.nss}</span>
                                  <span className="text-slate-300 dark:text-slate-700">·</span>
                                  <span>Tel {p.phone}</span>
                                </div>
                                <span className="block text-[9px] font-medium uppercase tracking-wide text-slate-350 dark:text-slate-600 mt-0.5 truncate max-w-[220px]">{p.curp}</span>
                              </div>
                            </div>
                          </td>
                          {/* Tipo de financiamiento */}
                          <td className="px-4 py-2.5">
                            <TipoFinanciamientoBadge value={p.tipo_financiamiento} modalidad={p.modalidad} />
                          </td>
                          {/* Asignación */}
                          <td className="px-4 py-2.5">
                            <span className="font-semibold text-slate-700 dark:text-slate-300 block truncate max-w-[150px]">{p.aliado_name || "Asesor Comercial"}</span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 block truncate max-w-[150px] mt-0.5">Líder: {leaderNames}</span>
                          </td>
                          {/* Expediente */}
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-center gap-1.5">
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${hasAfore ? "bg-emerald-50 dark:bg-emerald-950/25 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-850" : "bg-slate-50 dark:bg-slate-850/40 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800 border-dashed"}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${hasAfore ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />AFORE
                              </span>
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${hasImss ? "bg-emerald-50 dark:bg-emerald-950/25 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-850" : "bg-slate-50 dark:bg-slate-850/40 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800 border-dashed"}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${hasImss ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />IMSS
                              </span>
                            </div>
                          </td>
                          {/* Etapa · Subetapa */}
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col gap-1.5 w-[164px]">
                              <select
                                value={getStageAndSubStage(p.status).stage}
                                onChange={async (e) => {
                                  const newStage = e.target.value;
                                  const defaultSubStage = SUB_STAGES_BY_STAGE[newStage]?.[0] || "";
                                  const newStatus = getStatusFromStageAndSubStage(newStage, defaultSubStage);
                                  await handleStageChange(p.id, newStatus as any);
                                }}
                                className={`py-1.5 px-2.5 border rounded-lg text-[10px] font-bold outline-none transition-all cursor-pointer dark:bg-slate-900 ${
                                  isAM ? "focus:ring-1 focus:ring-blue-500" : "focus:ring-1 focus:ring-emerald-500"
                                } ${getStageColor(p.status)}`}
                              >
                                {STAGES_LIST.map((stage) => (
                                  <option key={stage.id} value={stage.id} className="dark:bg-slate-900">{stage.label}</option>
                                ))}
                              </select>
                              {(SUB_STAGES_BY_STAGE[getStageAndSubStage(p.status).stage]?.length ?? 0) > 0 && (
                                <select
                                  value={getStageAndSubStage(p.status).subStage}
                                  onChange={async (e) => {
                                    const currentMapping = getStageAndSubStage(p.status);
                                    const newStatus = getStatusFromStageAndSubStage(currentMapping.stage, e.target.value);
                                    await handleStageChange(p.id, newStatus as any);
                                  }}
                                  className={`py-1 px-2 border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-[10px] font-semibold text-slate-700 dark:text-slate-300 outline-none transition-all cursor-pointer ${
                                    isAM ? "focus:ring-1 focus:ring-blue-500" : "focus:ring-1 focus:ring-emerald-500"
                                  }`}
                                >
                                  <option value="" className="dark:bg-slate-900">Ninguna</option>
                                  {(SUB_STAGES_BY_STAGE[getStageAndSubStage(p.status).stage] || []).map((sub) => (
                                    <option key={sub} value={sub} className="dark:bg-slate-900">{sub}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </td>
                          {/* Registrado */}
                          <td className="px-4 py-2.5 text-center whitespace-nowrap">
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                              {p.created_at
                                ? new Date(p.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" })
                                : "—"}
                            </span>
                          </td>
                          {/* Acciones */}
                          <td className="px-5 py-2.5">
                            <div className="flex items-center justify-end gap-2">
                              {showTimeline && (
                              <button
                                onClick={() => toggleTimeline(p.id)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide border transition-all active:scale-95 ${
                                  isExpanded
                                    ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700"
                                    : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-750 hover:bg-slate-50 dark:hover:bg-slate-850"
                                }`}
                                title="Ver línea de tiempo del aliado"
                                aria-expanded={isExpanded}
                              >
                                Línea de tiempo
                                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                              </button>
                              )}
                              <Link
                                href={`/prospectos/${p.id}`}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all active:scale-95 ${
                                  isAM
                                    ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/20"
                                    : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-500/20"
                                }`}
                              >
                                Auditar <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                              </Link>
                              <button
                                onClick={() => openReassignModal(p)}
                                className="inline-flex items-center justify-center h-8 w-8 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/20"
                                title="Reasignar a otro aliado"
                              >
                                <ArrowLeftRight className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => openDeleteModal(p)}
                                className="inline-flex items-center justify-center h-8 w-8 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20"
                                title="Eliminar prospecto"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-50/50 dark:bg-slate-900/30">
                            <td colSpan={7} className="px-6 pt-1 pb-6 border-b-0">
                              <div className="max-w-3xl mx-auto">
                                <div className="flex items-center gap-2 mb-5">
                                  <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                                    Línea de tiempo · {p.aliado_name || "Asesor Comercial"}
                                  </span>
                                  <span className="text-[9px] font-semibold text-slate-350 dark:text-slate-600">
                                    · las fechas se registran solas al avanzar de etapa
                                  </span>
                                </div>
                                <ProjectStepper activeIndex={getActiveStageIndex(p.status)} dates={statusDates[p.id]} />
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 border border-slate-200 dark:border-slate-800 mx-4 animate-scale-up">
            <div className="flex items-center gap-3 border-b border-slate-150 dark:border-slate-800 pb-4">
              <div className="h-11 w-11 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-500 dark:text-red-400 flex items-center justify-center border border-red-150 dark:border-red-800/40">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                  {deleteStep === 1 ? "¿Eliminar este prospecto?" : "Confirmación Final"}
                </h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">
                  {deleteStep === 1
                    ? "Esta acción enviará al prospecto a la papelera por 7 días, visible para el director y aliados."
                    : "Escribe ELIMINAR para confirmar el envío a la papelera."}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-red-100 dark:bg-red-950/20 text-red-600 dark:text-red-400 flex items-center justify-center text-sm font-bold">
                  {deleteTarget.full_name.charAt(0)}
                </div>
                <div>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">{deleteTarget.full_name}</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium tabular-nums">NSS: {deleteTarget.nss} • CURP: {deleteTarget.curp}</span>
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
                  className="w-full bg-red-50/50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 focus:border-red-500 outline-none rounded-xl px-3.5 py-2.5 text-xs font-bold text-red-700 dark:text-red-400 transition-colors placeholder:text-red-300 tracking-widest text-center"
                  autoFocus
                />
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={closeDeleteModal}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-all active:scale-95"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteStep === 2 && deleteConfirmText !== "ELIMINAR" || deleting}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-xs shadow-sm shadow-red-500/20 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleting ? "Eliminando..." : deleteStep === 1 ? "Sí, Mover a Papelera" : "Confirmar Envío"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      {reassignTarget && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 border border-slate-200 dark:border-slate-800 mx-4 animate-scale-up">
            <div className="flex items-center gap-3 border-b border-slate-150 dark:border-slate-800 pb-4">
              <div className="h-11 w-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 text-indigo-500 dark:text-indigo-400 flex items-center justify-center border border-indigo-150 dark:border-indigo-800/40">
                <ArrowLeftRight className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">Reasignar proyecto</h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">
                  Transfiere este expediente a otro aliado. Se le notificará y aparecerá en su cartera.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-indigo-100 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-sm font-bold">
                  {reassignTarget.full_name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block truncate">{reassignTarget.full_name}</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                    Aliado actual: {reassignTarget.aliado_name || "Asesor Comercial"}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Nuevo aliado
              </label>
              <select
                value={reassignAllyId}
                onChange={(e) => setReassignAllyId(e.target.value)}
                className="w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 focus:border-indigo-500 outline-none rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                autoFocus
              >
                <option value="">Selecciona un aliado...</option>
                {eligibleAllies
                  .filter((a) => a.id !== reassignTarget.aliado_id)
                  .map((a) => (
                    <option key={a.id} value={a.id} className="dark:bg-slate-900">
                      {a.full_name}
                    </option>
                  ))}
              </select>
              {eligibleAllies.filter((a) => a.id !== reassignTarget.aliado_id).length === 0 && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mt-2">
                  No hay otros aliados disponibles para reasignar.
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={closeReassignModal}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-all active:scale-95"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmReassign}
                disabled={!reassignAllyId || reassigning}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs shadow-sm shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-1.5"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                {reassigning ? "Reasignando..." : "Confirmar reasignación"}
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
