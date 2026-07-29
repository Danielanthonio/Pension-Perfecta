"use client";

import React, { useState, Suspense } from "react";
import {
  useApp,
  Prospect,
  getStageAndSubStage,
  getStatusFromStageAndSubStage,
  STAGES_LIST,
  SUB_STAGES_BY_STAGE,
  EDITABLE_SUB_STAGES_BY_STAGE,
} from "@/utils/context/AppContext";
import {
  Search,
  Trash2,
  FolderKanban,
  ArrowRight,
  ArrowLeftRight,
  ChevronDown,
  Plus,
  SlidersHorizontal,
  RotateCcw,
  CheckCircle,
  UserCog,
  Building2,
  Calendar,
  CheckSquare,
  ExternalLink,
  X,
} from "lucide-react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useSortable, SortControl, SortHeader } from "@/components/ui/sorting";
import { ModalidadFilterValue, prospectMatchesModalidadFilter } from "@/components/ui/ModalidadFilter";
import { AliadoPicker, prospectMatchesSelection } from "@/components/ui/AliadoPicker";
import { TipoFinanciamientoBadge } from "@/components/ui/tipoFinanciamiento";
import { ProjectStepper, getActiveStageIndex, hasProjectTimeline, formatCita } from "@/components/ui/projectStepper";
import { AgendaAsesoriaModal } from "@/components/ui/agendaModal";
import MeetingModalityModal from "@/components/MeetingModalityModal";
import { ClientTabId, classifyProspect, prospectMatchesTab, getTabMeta } from "@/components/ui/clientTabs";
import { PipelineTabs } from "@/components/ui/pipelineTabs";
import { createClient } from "@/utils/supabase/client";
import Link from "next/link";

// Estados en los que tiene sentido agendar. Antes de aprobar no hay propuesta que
// presentar; después de la reunión el proyecto ya avanzó y regrabar la fecha lo
// devolvería un hito atrás. En `asesoria_agendada` sí se permite: es reagendar.
const SCHEDULABLE_STATUSES = ["aprobado_listo", "asesoria_agendada"];

function ClientesAdminContent() {
  const {
    user,
    prospects,
    profiles,
    assignmentProfiles,
    updateProspectStatus,
    reassignProspect,
    reassignAccountManager,
    deleteProspect,
    restoreProspect,
    permanentlyDeleteProspect,
    isProspectDeleted,
    isProspectPurged,
    getProspectDeletedAt,
    empresasMultialiado,
    scheduleAssessment,
    appSettings,
    isDemoMode,
  } = useApp();

  const isAM = user?.role === "account_manager";
  const accent = isAM ? "blue" : "emerald";
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Pestañas de pipeline (las mismas del portal aliado) + "Todos" y "Papelera".
  // Abre en "Todos" para no perder la vista global de la cartera.
  const [activeTab, setActiveTab] = useState<ClientTabId>("todos");
  const [searchTerm, setSearchTerm] = useState("");

  const startDate = searchParams.get("desde") || "";
  const endDate = searchParams.get("hasta") || "";
  const stageFilter = searchParams.get("etapa") || "all";
  const subStageFilter = searchParams.get("subetapa") || "all";
  const selectedAlly = searchParams.get("aliado") || "all";

  // Filtro de asignación (director): multi-selección de aliados y/o account managers.
  // Vacío = Todos. Ver AliadoPicker / prospectMatchesSelection.
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  // Filtro por modalidad de aprobación — lo controla la barra de filtros superior vía URL.
  const modalidadFilter = (searchParams.get("modalidad") || "all") as ModalidadFilterValue;
  // Filtro por origen del aliado: "empresa" (pertenece a una empresa multialiado) vs
  // "independiente" (sin empresa). Se controla desde la barra de filtros superior vía URL.
  const origenFilter = searchParams.get("origen") || "all"; // all | empresa | independiente
  // Empresa multialiado concreta — solo aplica cuando el origen es "empresa".
  const empresaFilter = searchParams.get("empresa") || "all";

  // Empresa multialiado del prospecto según el aliado dueño: se prefiere la empresa ACTUAL
  // del perfil dueño (fuente de verdad de la Asignación Multialiado) y, si no está el perfil,
  // se usa la empresa que quedó guardada en el propio prospecto al capturarlo.
  const getProspectEmpresaId = React.useCallback(
    (p: Prospect): string | null => {
      const owner = profiles.find((pr) => pr.id === p.aliado_id);
      return (owner ? owner.empresa_multialiado_id ?? null : p.empresa_multialiado_id ?? null) || null;
    },
    [profiles]
  );

  // Clasifica un prospecto: si el aliado dueño pertenece a una empresa multialiado ->
  // "empresa", si no -> "independiente".
  const getProspectOrigen = React.useCallback(
    (p: Prospect): "empresa" | "independiente" => (getProspectEmpresaId(p) ? "empresa" : "independiente"),
    [getProspectEmpresaId]
  );

  // Barra de filtros superior (formato clásico, dropdowns): escribe los mismos
  // params de URL que antes controlaba el panel lateral (etapa/subetapa/modalidad/origen).
  const updateParams = (mutate: (p: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };
  const clearTopFilters = () => {
    setSelectedEntities([]);
    updateParams((p) => ["etapa", "subetapa", "modalidad", "origen", "empresa"].forEach((k) => p.delete(k)));
  };
  // Subetapas disponibles para la etapa elegida (dropdown dependiente).
  const topSubStages = stageFilter !== "all" ? SUB_STAGES_BY_STAGE[stageFilter] || [] : [];
  const anyTopFilterActive =
    stageFilter !== "all" ||
    subStageFilter !== "all" ||
    modalidadFilter !== "all" ||
    origenFilter !== "all" ||
    empresaFilter !== "all" ||
    selectedEntities.length > 0;
  // Estilo compartido de los <select> clásicos de la barra superior.
  const topSelectCls = `px-2.5 py-1.5 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 outline-none transition-all cursor-pointer ${
    isAM ? "focus:border-blue-500" : "focus:border-emerald-500"
  }`;

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

  // Reasignar Account Manager: modal de confirmación (Sí/No) + toast de éxito arriba.
  const [amReassignTarget, setAmReassignTarget] = useState<{ prospect: Prospect; newAmId: string } | null>(null);
  const [amReassigning, setAmReassigning] = useState(false);
  // Toast de éxito compartido (reasignación de AM, agenda de asesoría...).
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null);

  const showToast = (title: string, message: string) => {
    setToast({ title, message });
    window.setTimeout(() => setToast(null), 5000);
  };

  // Agenda de asesoría — la graban por igual el aliado, el AM y el director. Grabar
  // la fecha es el ÚNICO camino al hito "Agenda de Asesoría" (la subetapa no se
  // puede elegir a mano, ver EDITABLE_SUB_STAGES_BY_STAGE).
  const [scheduleTarget, setScheduleTarget] = useState<Prospect | null>(null);
  const [scheduling, setScheduling] = useState(false);

  const openScheduleModal = (prospect: Prospect) => {
    setScheduleTarget(prospect);
    setScheduling(false);
  };

  // Abrir la agenda oficial: la de la modalidad que fijó Dirección al aprobar y, si
  // el proyecto todavía no tiene modalidad, el selector 40/10 (igual que el aliado).
  const [modalityOpen, setModalityOpen] = useState(false);

  const handleOpenAgenda = (prospect: Prospect) => {
    if (!prospect.modalidad) {
      setModalityOpen(true);
      return;
    }
    const url = meetingLinkFor(prospect);
    if (!url) {
      alert(`Aún no está configurado el link de Modalidad ${prospect.modalidad}. Se define en Gestión de Usuarios.`);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleConfirmSchedule = async (date: string, time: string) => {
    if (!scheduleTarget || !date || !time) return;
    setScheduling(true);
    try {
      await scheduleAssessment(scheduleTarget.id, date, time);
      const nombre = scheduleTarget.full_name;
      setScheduleTarget(null);
      // Si estábamos parados en "Listo para Presentar" el proyecto acaba de salir de
      // esa lista: mover la vista al hito que alcanzó para que se vea a dónde fue.
      if (activeTab === "aprobado_listo") setActiveTab("asesoria_agendada");
      showToast("Asesoría agendada 📅", `${nombre} avanzó al hito “Agenda de Asesoría” · ${date} a las ${time} hrs.`);
    } catch (err) {
      console.error("Error al agendar la asesoría:", err);
      alert("No se pudo agendar la asesoría. Intenta de nuevo.");
    } finally {
      setScheduling(false);
    }
  };

  // Link de reunión que le toca según la modalidad que fijó Dirección al aprobar.
  const meetingLinkFor = (prospect: Prospect): string | null => {
    if (!prospect.modalidad) return null;
    const url = prospect.modalidad === "40" ? appSettings.meeting_link_m40 : appSettings.meeting_link_m10;
    return url && url.trim() ? url : null;
  };

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

  // Lista activa con TODOS los filtros menos el de origen: sirve para pintar los
  // contadores del selector Empresa / Independiente (que vive junto a Activos/Papelera).
  const activeBeforeOrigen = filteredByDate
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
    .filter((p) => prospectMatchesModalidadFilter(p, modalidadFilter));

  const filteredProspects = activeBeforeOrigen
    .filter((p) => origenFilter === "all" || getProspectOrigen(p) === origenFilter)
    .filter((p) => empresaFilter === "all" || getProspectEmpresaId(p) === empresaFilter);

  // Filas visibles: lo anterior, acotado a la pestaña de pipeline elegida.
  // "Todos" no descarta nada (y es la red de seguridad de cualquier estado sin grupo).
  const tabProspects = filteredProspects.filter((p) => prospectMatchesTab(p, activeTab));

  const deletedByDate = deletedProspects.filter((p) => {
    if (!p.created_at) return true;
    const createdDateStr = p.created_at.substring(0, 10);
    if (startDate && createdDateStr < startDate) return false;
    if (endDate && createdDateStr > endDate) return false;
    return true;
  });

  const deletedBeforeOrigen = deletedByDate
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

  const filteredDeletedProspects = deletedBeforeOrigen
    .filter((p) => origenFilter === "all" || getProspectOrigen(p) === origenFilter)
    .filter((p) => empresaFilter === "all" || getProspectEmpresaId(p) === empresaFilter);

  // Contadores de las píldoras de pipeline: se calculan sobre la lista ya filtrada
  // (búsqueda, fechas, etapa, aliado, origen/empresa…) para que cuadren con lo que se ve.
  const tabCounts: Record<string, number> = {
    todos: filteredProspects.length,
    papelera: filteredDeletedProspects.length,
  };
  for (const p of filteredProspects) {
    const tab = classifyProspect(p);
    if (tab) tabCounts[tab] = (tabCounts[tab] || 0) + 1;
  }

  // Contadores del selector de origen: se calculan sobre la pestaña visible ignorando
  // los filtros de origen/empresa, para que las 3 opciones sean legibles.
  const origenCountSource =
    activeTab === "papelera"
      ? deletedBeforeOrigen
      : activeBeforeOrigen.filter((p) => prospectMatchesTab(p, activeTab));
  const origenCounts = React.useMemo(() => {
    let empresa = 0;
    for (const p of origenCountSource) if (getProspectOrigen(p) === "empresa") empresa += 1;
    return { all: origenCountSource.length, empresa, independiente: origenCountSource.length - empresa };
  }, [origenCountSource, getProspectOrigen]);

  // Empresas con proyectos en la pestaña visible (con su conteo) para el selector que
  // aparece al elegir "Empresa". Se listan solo las que tienen proyectos, ordenadas por
  // nombre; si una empresa ya no existe en el catálogo se muestra como "Empresa sin nombre"
  // para que sus proyectos sigan siendo alcanzables.
  const empresaOptions = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of origenCountSource) {
      const id = getProspectEmpresaId(p);
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([id, count]) => ({
        id,
        count,
        nombre: empresasMultialiado.find((e) => e.id === id)?.nombre || "Empresa sin nombre",
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [origenCountSource, getProspectEmpresaId, empresasMultialiado]);

  // Account Managers disponibles para asignar (lista CRUDA `assignmentProfiles`, que
  // incluye a los AMs) y helper para resolver el nombre del AM de un proyecto.
  const accountManagers = React.useMemo(
    () =>
      assignmentProfiles
        .filter((pr) => pr.role === "account_manager" && pr.is_active !== false)
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [assignmentProfiles]
  );
  const getAmName = React.useCallback(
    (p: Prospect): string | null => {
      if (!p.account_manager_id) return null;
      return assignmentProfiles.find((pr) => pr.id === p.account_manager_id)?.full_name || "Account Manager";
    },
    [assignmentProfiles]
  );

  // Nombre legible de un AM por id (para el modal / toast). "" o null = Sin asignar.
  const amNameById = (amId: string | null) =>
    amId ? accountManagers.find((a) => a.id === amId)?.full_name || "Account Manager" : "Sin asignar";

  // Confirma la reasignación del AM desde el modal. Al terminar: notifica al nuevo AM
  // (dentro de reassignAccountManager) y muestra un toast de éxito arriba para el director.
  const confirmAmReassign = async () => {
    if (!amReassignTarget) return;
    const { prospect, newAmId } = amReassignTarget;
    const target = newAmId || null;
    setAmReassigning(true);
    try {
      await reassignAccountManager(prospect.id, target);
      setAmReassignTarget(null);
      showToast("Reasignación exitosa ✅", `Proyecto de ${prospect.full_name} reasignado con éxito a ${amNameById(target)}.`);
    } catch (e) {
      console.error("Error reasignando AM:", e);
      alert("No se pudo reasignar el Account Manager.");
    } finally {
      setAmReassigning(false);
    }
  };

  // Sorting — active list and trash each get their own sort state/controls.
  const sortA = useSortable<Prospect>(
    tabProspects,
    {
      fecha: (p) => p.created_at || "",
      nombre: (p) => p.full_name,
      tipo: (p) => p.tipo_financiamiento || "",
      aliado: (p) => p.aliado_name || "",
      am: (p) => getAmName(p) || "",
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
    { id: "am", label: "Account Manager" },
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

        {/* La línea de tiempo del proyecto, hecha botonera: cada hito muestra cuántos
            clientes están parados ahí y al apretarlo se despliegan. Misma línea que ve
            el aliado y que dibuja el stepper del expediente. */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm px-4 pt-3 pb-2.5">
          <PipelineTabs counts={tabCounts} activeTab={activeTab} onChange={setActiveTab} isAdmin />
        </div>

        {/* Barra compacta de filtros (formato clásico) + acción Subir Proyecto */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm px-3 py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 pr-0.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtros
            </span>

            {/* Asignación / Aliado comercial (mismo filtro): buscador multi-selección */}
            {!isAM && (
              <AliadoPicker
                profiles={profiles}
                selected={selectedEntities}
                onChange={setSelectedEntities}
                accent="emerald"
              />
            )}

            {/* Etapa */}
            <select
              value={stageFilter}
              onChange={(e) => {
                const v = e.target.value;
                updateParams((p) => {
                  if (v === "all") p.delete("etapa");
                  else p.set("etapa", v);
                  p.delete("subetapa"); // al cambiar de etapa se limpia la subetapa
                });
              }}
              className={topSelectCls}
              title="Etapa"
            >
              <option value="all">Todas las etapas</option>
              {STAGES_LIST.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>

            {/* Subetapa (dependiente de la etapa) */}
            <select
              value={subStageFilter}
              disabled={topSubStages.length === 0}
              onChange={(e) =>
                updateParams((p) => (e.target.value === "all" ? p.delete("subetapa") : p.set("subetapa", e.target.value)))
              }
              className={`${topSelectCls} disabled:opacity-40 disabled:cursor-not-allowed`}
              title="Subetapa"
            >
              <option value="all">Todas las subetapas</option>
              {topSubStages.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>

            {/* Modalidad / Financiamiento */}
            <select
              value={modalidadFilter}
              onChange={(e) =>
                updateParams((p) => (e.target.value === "all" ? p.delete("modalidad") : p.set("modalidad", e.target.value)))
              }
              className={topSelectCls}
              title="Modalidad / Financiamiento"
            >
              <option value="all">Todas las modalidades</option>
              <option value="40">Modalidad 40</option>
              <option value="10">Modalidad 10</option>
              <option value="cn">Crédito de nómina</option>
            </select>

            {anyTopFilterActive && (
              <button
                onClick={clearTopFilters}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
                title="Limpiar filtros"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Limpiar
              </button>
            )}
          </div>

          <Link
            href="/admin/nuevo"
            className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition-all active:scale-95 shrink-0 ${
              isAM
                ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20"
            }`}
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Subir Proyecto
          </Link>
        </div>

        {/* Kanban List Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-3 py-2.5 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="flex flex-1 flex-wrap items-center gap-2.5 min-w-0">
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
              {/* Tipo de aliado: empresa (pertenece a una empresa multialiado) vs. independiente.
                  Escribe el mismo param `origen` de la URL que usaba el dropdown superior. */}
              <div className="bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg flex ring-1 ring-inset ring-slate-200/70 dark:ring-slate-800 shrink-0">
                {([
                  { id: "all", label: "Todos", count: origenCounts.all },
                  { id: "empresa", label: "Empresa", count: origenCounts.empresa },
                  { id: "independiente", label: "Independiente", count: origenCounts.independiente },
                ] as const).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() =>
                      updateParams((p) => {
                        if (opt.id === "all") p.delete("origen");
                        else p.set("origen", opt.id);
                        // La empresa concreta solo tiene sentido dentro de "Empresa".
                        if (opt.id !== "empresa") p.delete("empresa");
                      })
                    }
                    className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-all ${
                      origenFilter === opt.id
                        ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                    }`}
                    title={
                      opt.id === "empresa"
                        ? "Solo aliados de una empresa multialiado"
                        : opt.id === "independiente"
                        ? "Solo aliados independientes"
                        : "Empresa e independientes"
                    }
                  >
                    {opt.label} <span className="tabular-nums opacity-70">({opt.count})</span>
                  </button>
                ))}
              </div>

              {/* Al elegir "Empresa" se despliega el selector de la empresa concreta. */}
              {origenFilter === "empresa" && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <Building2 className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                  <select
                    value={empresaFilter}
                    onChange={(e) =>
                      updateParams((p) =>
                        e.target.value === "all" ? p.delete("empresa") : p.set("empresa", e.target.value)
                      )
                    }
                    className={`px-2.5 py-1 bg-white dark:bg-slate-850 border rounded-lg text-[11px] font-semibold outline-none transition-all cursor-pointer max-w-[220px] ${
                      empresaFilter === "all"
                        ? "border-slate-200 dark:border-slate-750 text-slate-600 dark:text-slate-300"
                        : isAM
                        ? "border-blue-400 text-blue-700 dark:text-blue-300"
                        : "border-emerald-400 text-emerald-700 dark:text-emerald-300"
                    } ${isAM ? "focus:border-blue-500" : "focus:border-emerald-500"}`}
                    title="Empresa multialiado"
                  >
                    <option value="all">Todas las empresas ({origenCounts.empresa})</option>
                    {empresaOptions.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre} ({e.count})
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
                      <SortHeader col="aliado" label="Aliado" sort={sortT} />
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
            tabProspects.length === 0 ? (
              <div className="py-16 text-center space-y-3 bg-white dark:bg-slate-900">
                <div className="h-11 w-11 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mx-auto">
                  <FolderKanban className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    {getTabMeta(activeTab).label}
                  </h4>
                  <p className="text-xs text-slate-450 dark:text-slate-500 mt-1 max-w-[280px] mx-auto">
                    {getTabMeta(activeTab).empty}
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/60 dark:bg-slate-900/30 border-b border-slate-150 dark:border-slate-800 text-left">
                      <SortHeader col="nombre" label="Prospecto" sort={sortA} className="pl-5" />
                      <SortHeader col="tipo" label="Tipo de financiamiento" sort={sortA} />
                      <SortHeader col="aliado" label="Aliado" sort={sortA} />
                      <SortHeader col="am" label="Account Manager" sort={sortA} />
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
                      // Agendar la asesoría: mismos dos gestos que hace el aliado en su
                      // portal. Van en rojo hasta que haya una fecha de reunión grabada.
                      const canSchedule = SCHEDULABLE_STATUSES.includes(p.status);
                      const citaGrabada = formatCita(p.asesoria_at);
                      const sinFecha = !citaGrabada;
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
                          {/* Aliado */}
                          <td className="px-4 py-2.5">
                            <span className="font-semibold text-slate-700 dark:text-slate-300 block truncate max-w-[150px]">{p.aliado_name || "Asesor Comercial"}</span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 block truncate max-w-[150px] mt-0.5">Líder: {leaderNames}</span>
                          </td>
                          {/* Account Manager — editable (reasignar el dueño de la gestión) */}
                          <td className="px-4 py-2.5">
                            <select
                              value={p.account_manager_id || ""}
                              onChange={(e) => setAmReassignTarget({ prospect: p, newAmId: e.target.value })}
                              onClick={(e) => e.stopPropagation()}
                              title="Reasignar Account Manager"
                              className={`min-w-[140px] max-w-[190px] px-2 py-1.5 border rounded-lg text-[11px] font-semibold outline-none transition-all cursor-pointer truncate ${
                                p.account_manager_id
                                  ? "bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-750 text-slate-700 dark:text-slate-300"
                                  : "bg-slate-50 dark:bg-slate-850/40 border-dashed border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500"
                              } ${isAM ? "focus:border-blue-500" : "focus:border-emerald-500"}`}
                            >
                              <option value="">Sin asignar</option>
                              {accountManagers.map((am) => (
                                <option key={am.id} value={am.id}>
                                  {am.full_name}
                                </option>
                              ))}
                            </select>
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
                                  const defaultSubStage = EDITABLE_SUB_STAGES_BY_STAGE[newStage]?.[0] || "";
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
                                  {(() => {
                                    const { stage, subStage } = getStageAndSubStage(p.status);
                                    const selectable = EDITABLE_SUB_STAGES_BY_STAGE[stage] || [];
                                    // "Agenda de Asesoría" no se elige a mano (la fija la fecha de la
                                    // reunión), pero si el proyecto está ahí hay que poder mostrarla:
                                    // se pinta como opción deshabilitada.
                                    const fixed = subStage && !selectable.includes(subStage) ? subStage : null;
                                    return (
                                      <>
                                        {fixed && (
                                          <option value={fixed} disabled className="dark:bg-slate-900">
                                            {fixed} (la fija la fecha)
                                          </option>
                                        )}
                                        {selectable.map((sub) => (
                                          <option key={sub} value={sub} className="dark:bg-slate-900">{sub}</option>
                                        ))}
                                      </>
                                    );
                                  })()}
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
                              {canSchedule && (
                              /* Los dos mismos controles que tiene el aliado, en su
                                 propio grupo: abrir la agenda y grabar la fecha. En
                                 rojo mientras no haya fecha grabada. */
                              <div className="flex items-center gap-1.5 mr-1 pr-2.5 border-r border-slate-200 dark:border-slate-750">
                                <button
                                  onClick={() => handleOpenAgenda(p)}
                                  className={`p-1.5 rounded-xl text-white shadow border transition-all hover:scale-105 active:scale-[0.95] flex items-center justify-center ${
                                    sinFecha
                                      ? "bg-gradient-to-r from-red-600 to-rose-650 hover:from-red-550 hover:to-rose-550 border-red-450"
                                      : "bg-gradient-to-r from-emerald-600 to-teal-650 hover:from-emerald-550 hover:to-teal-550 border-emerald-450"
                                  }`}
                                  title={p.modalidad ? `Abrir agenda de Modalidad ${p.modalidad}` : "Abrir agenda de asesoría"}
                                >
                                  <Calendar className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => openScheduleModal(p)}
                                  className={`p-1.5 rounded-xl transition-all border flex items-center justify-center ${
                                    sinFecha
                                      ? "bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 border-red-250/60 dark:border-red-800/40"
                                      : "bg-emerald-50 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-250/60 dark:border-emerald-800/40"
                                  }`}
                                  title={
                                    citaGrabada
                                      ? `Cambiar la fecha · cita actual ${citaGrabada}`
                                      : "Grabar la fecha de la asesoría (avanza al hito Agenda de Asesoría)"
                                  }
                                >
                                  <CheckSquare className="h-4 w-4" />
                                </button>
                              </div>
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
                            <td colSpan={8} className="px-6 pt-1 pb-6 border-b-0">
                              <div className="max-w-3xl mx-auto">
                                <div className="flex items-center gap-2 mb-5">
                                  <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                                    Línea de tiempo · {p.aliado_name || "Asesor Comercial"}
                                  </span>
                                  <span className="text-[9px] font-semibold text-slate-350 dark:text-slate-600">
                                    · se registran solas al avanzar de etapa · la asesoría muestra la fecha de la reunión
                                  </span>
                                </div>
                                <ProjectStepper activeIndex={getActiveStageIndex(p.status)} dates={statusDates[p.id]} createdAt={p.created_at} asesoriaAt={p.asesoria_at} />
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

      {/* Selector 40/10 para abrir la agenda cuando el proyecto no tiene modalidad */}
      <MeetingModalityModal isOpen={modalityOpen} onClose={() => setModalityOpen(false)} />

      {/* Agenda de Asesoría — misma pantalla que usa el aliado */}
      <AgendaAsesoriaModal
        prospect={scheduleTarget}
        meetingLink={scheduleTarget ? meetingLinkFor(scheduleTarget) : null}
        saving={scheduling}
        onClose={() => setScheduleTarget(null)}
        onConfirm={handleConfirmSchedule}
      />

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

      {/* Modal de confirmación — reasignar Account Manager (Sí / No) */}
      {amReassignTarget && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 border border-slate-200 dark:border-slate-800 mx-4 animate-scale-up">
            <div className="flex items-center gap-3 border-b border-slate-150 dark:border-slate-800 pb-4">
              <div className="h-11 w-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500 dark:text-emerald-400 flex items-center justify-center border border-emerald-150 dark:border-emerald-800/40">
                <UserCog className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">Reasignar Account Manager</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                  ¿Confirmas que deseas reasignar este proyecto?
                </p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center text-sm font-bold">
                  {amReassignTarget.prospect.full_name.charAt(0)}
                </div>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block truncate">
                  {amReassignTarget.prospect.full_name}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-1 rounded-lg bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 text-slate-500 dark:text-slate-400 font-semibold truncate max-w-[42%]">
                  {amNameById(amReassignTarget.prospect.account_manager_id || null)}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400 font-bold truncate max-w-[42%]">
                  {amNameById(amReassignTarget.newAmId || null)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => setAmReassignTarget(null)}
                disabled={amReassigning}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-all active:scale-95 disabled:opacity-50"
              >
                No
              </button>
              <button
                onClick={confirmAmReassign}
                disabled={amReassigning}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs shadow-sm shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                {amReassigning ? "Reasignando..." : "Sí, reasignar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast de éxito (arriba) — confirma al director que la acción se logró */}
      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[9999] max-w-md w-[calc(100%-2rem)] animate-fade-in">
          <div className="flex items-start gap-3 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/50 border-l-4 border-l-emerald-500 rounded-2xl shadow-2xl px-4 py-3.5">
            <div className="h-9 w-9 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/50">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{toast.title}</h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
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
