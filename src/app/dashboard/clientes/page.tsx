"use client";

import React, { useState, useEffect, Suspense } from "react";
import {
  useApp,
  Prospect,
  getStageAndSubStage,
  STAGES_LIST,
  SUB_STAGES_BY_STAGE,
} from "@/utils/context/AppContext";
import {
  Search,
  ChevronRight,
  Plus,
  Calendar,
  CheckSquare,
  FileText,
  ArrowUpRight,
  Folder,
  Trash2,
  X,
  AlertCircle,
  XCircle,
  MinusCircle,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { ProjectStepper, getActiveStageIndex, formatCita } from "@/components/ui/projectStepper";
import { AgendaAsesoriaModal } from "@/components/ui/agendaModal";
import MeetingModalityModal from "@/components/MeetingModalityModal";
import { ModalidadFilterValue, prospectMatchesModalidadFilter } from "@/components/ui/ModalidadFilter";
import { TipoFinanciamientoBadge } from "@/components/ui/tipoFinanciamiento";
import { ClientTabId, classifyProspect, prospectMatchesTab, getTabMeta } from "@/components/ui/clientTabs";
import { PipelineTabs } from "@/components/ui/pipelineTabs";

function ClientesContent() {
  const {
    user,
    prospects,
    profiles,
    scheduleAssessment,
    deleteProspect,
    restoreProspect,
    permanentlyDeleteProspect,
    isProspectDeleted,
    isProspectPurged,
    getProspectDeletedAt,
    appSettings,
    isDemoMode,
  } = useApp();

  const searchParams = useSearchParams();

  // Los aliados ya no pueden eliminar/enviar proyectos a la papelera (solo AM/Dirección).
  const canDelete = user?.role !== "aliado";

  // URL Filter parameters
  const startDate = searchParams.get("desde") || "";
  const endDate = searchParams.get("hasta") || "";
  const stageFilter = searchParams.get("etapa") || "all";
  const subStageFilter = searchParams.get("subetapa") || "all";
  // Optional ally focus — used by leaders drilling into a specific ally's projects
  const aliadoFilter = searchParams.get("aliado") || "";
  const aliadoFocus = aliadoFilter
    ? profiles.find((p) => p.id === aliadoFilter)
    : null;

  // Page local states
  const [searchTerm, setSearchTerm] = useState("");
  // Filtro por modalidad de aprobación — lo controla el panel izquierdo (FILTRAR) vía URL.
  const modalidadFilter = (searchParams.get("modalidad") || "all") as ModalidadFilterValue;
  const [activeTab, setActiveTab] = useState<ClientTabId>("evaluacion_pendiente");

  // States for Scheduling Modal
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [modalityOpen, setModalityOpen] = useState(false);

  // Fechas por etapa desde prospect_status_history: prospectId -> (status -> primer timestamp ms).
  // El sistema las registra automáticamente en cada cambio de estado (trigger en BD).
  const [statusDates, setStatusDates] = useState<Record<string, Record<string, number>>>({});

  // Get stage label
  const getStageLabel = (status: Prospect["status"]) => {
    const { stage } = getStageAndSubStage(status);
    const stageObj = STAGES_LIST.find((s) => s.id === stage);
    return stageObj ? stageObj.label : stage;
  };

  const getSubStageLabel = (status: Prospect["status"]) => {
    const { subStage } = getStageAndSubStage(status);
    return subStage || "Ninguna";
  };

  const getStageBadgeColor = (status: Prospect["status"]) => {
    const { stage } = getStageAndSubStage(status);
    switch (stage) {
      case "evaluacion_pendiente":
        return "bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-800/40";
      case "rechazado":
        return "bg-red-50 text-red-600 border-red-100 dark:bg-red-950/20 dark:text-red-400 dark:border-red-800/40";
      case "condicionado":
        return "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800/40";
      case "aprobado":
        return "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800/40";
      case "otorgado":
        return "bg-teal-50 text-teal-600 border-teal-100 dark:bg-teal-950/20 dark:text-teal-400 dark:border-teal-800/40";
      case "cerrado_perdido":
        return "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-750";
      default:
        return "bg-slate-50 text-slate-500 border-slate-100";
    }
  };

  const getSubStageBadgeColor = (status: Prospect["status"]) => {
    const { stage, subStage } = getStageAndSubStage(status);
    if (!subStage) return "bg-slate-50 text-slate-400 dark:bg-slate-900/50 dark:text-slate-600";
    
    switch (stage) {
      case "evaluacion_pendiente":
        return "bg-slate-900 text-white border-slate-700 dark:bg-black dark:text-slate-300 dark:border-slate-800";
      case "rechazado":
      case "condicionado":
        return "bg-red-50 text-red-600 border-red-100 dark:bg-red-950/20 dark:text-red-400 dark:border-red-800/40";
      case "aprobado":
      case "otorgado":
        return "bg-emerald-50/70 text-emerald-600 border-emerald-100 dark:bg-emerald-950/15 dark:text-emerald-400 dark:border-emerald-900/30";
      default:
        return "bg-slate-50 text-slate-500 border-slate-100 dark:bg-slate-800 dark:text-slate-400";
    }
  };

  // Filter Active vs Deleted (optionally scoped to a single ally when focusing one)
  const scopedProspects = aliadoFilter
    ? prospects.filter((p) => p.aliado_id === aliadoFilter)
    : prospects;
  const activeProspects = scopedProspects.filter((p) => !isProspectDeleted(p) && !isProspectPurged(p));
  const deletedProspects = scopedProspects.filter((p) => isProspectDeleted(p));

  // Apply filters to active list
  const filteredActive = activeProspects.filter((p) => {
    // Search Term filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        p.full_name.toLowerCase().includes(term) ||
        p.nss.includes(term) ||
        p.curp.toLowerCase().includes(term);
      if (!matchesSearch) return false;
    }

    // Date filters
    if (p.created_at) {
      const createdDateStr = p.created_at.substring(0, 10);
      if (startDate && createdDateStr < startDate) return false;
      if (endDate && createdDateStr > endDate) return false;
    }

    // Stage filters
    const { stage, subStage } = getStageAndSubStage(p.status);
    if (stageFilter !== "all" && stage !== stageFilter) {
      return false;
    }

    // Substage filters
    if (subStageFilter !== "all" && subStage !== subStageFilter) {
      return false;
    }

    // Modalidad / tipo de financiamiento (Todos / M40 / M10 / CN)
    if (!prospectMatchesModalidadFilter(p, modalidadFilter)) {
      return false;
    }

    return true;
  });

  // Apply filters to deleted list
  const filteredDeleted = deletedProspects.filter((p) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        p.full_name.toLowerCase().includes(term) ||
        p.nss.includes(term) ||
        p.curp.toLowerCase().includes(term)
      );
    }
    return true;
  });

  // Clasificación por hito de la línea de tiempo — vive en components/ui/clientTabs
  // para que el aliado, el AM y el director vean exactamente el mismo recorrido.
  const tabCounts: Record<string, number> = { papelera: filteredDeleted.length };
  for (const p of filteredActive) {
    const tab = classifyProspect(p);
    if (tab) tabCounts[tab] = (tabCounts[tab] || 0) + 1;
  }

  // Clientes de la pestaña abierta.
  const tabProspects = filteredActive.filter((p) => prospectMatchesTab(p, activeTab));

  // Qué panel se pinta para cada hito: antes del dictamen, la tabla de evaluación;
  // en "Listo para Presentar", la tabla con crédito y el botón de agendar; del
  // agendado en adelante, las tarjetas con línea de tiempo.
  const PANEL_BY_TAB: Record<string, "evaluacion" | "listo" | "activos" | "rechazados" | "cerrados" | "papelera"> = {
    evaluacion_pendiente: "evaluacion",
    condicionado: "evaluacion",
    aprobado_listo: "listo",
    asesoria_agendada: "activos",
    doc_proceso: "activos",
    analisis_riesgo: "activos",
    firma_contrato: "activos",
    firma_programada: "activos",
    pagado_comision: "activos",
    rechazados: "rechazados",
    cerrados: "cerrados",
    papelera: "papelera",
  };
  const panel = PANEL_BY_TAB[activeTab] ?? "evaluacion";
  const proyectosActivos = panel === "activos" ? tabProspects : [];

  // Los hitos del pipeline y su formato de fecha viven en el componente compartido
  // ProjectStepper (src/components/ui/projectStepper) para que aliado y dirección
  // vean exactamente la misma línea de tiempo.

  // Cargar el historial de fechas de los proyectos activos visibles.
  const activeIdsKey = proyectosActivos.map((p) => p.id).sort().join(",");
  useEffect(() => {
    if (isDemoMode) {
      setStatusDates({});
      return;
    }
    const ids = activeIdsKey ? activeIdsKey.split(",") : [];
    if (ids.length === 0) {
      setStatusDates({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("prospect_status_history")
          .select("prospect_id, status, changed_at")
          .in("prospect_id", ids)
          .order("changed_at", { ascending: true });
        if (error) throw error;
        const map: Record<string, Record<string, number>> = {};
        (data || []).forEach((r: any) => {
          const t = new Date(r.changed_at).getTime();
          if (!map[r.prospect_id]) map[r.prospect_id] = {};
          const cur = map[r.prospect_id][r.status];
          if (cur === undefined || t < cur) map[r.prospect_id][r.status] = t;
        });
        if (!cancelled) setStatusDates(map);
      } catch {
        // Tabla no migrada aún o error transitorio — el stepper se muestra sin fechas.
        if (!cancelled) setStatusDates({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeIdsKey, isDemoMode]);

  // El modal precarga solo la cita que ya tenga el proyecto.
  const handleOpenSchedule = (prospect: Prospect) => {
    setSelectedProspect(prospect);
    setScheduling(false);
  };

  // Link de la agenda según la modalidad que fijó Dirección al aprobar.
  const meetingLinkFor = (prospect: Prospect): string | null => {
    if (!prospect.modalidad) return null;
    const url = prospect.modalidad === "40" ? appSettings.meeting_link_m40 : appSettings.meeting_link_m10;
    return url && url.trim() ? url : null;
  };

  // El Director/AM define la modalidad al aprobar; el aliado solo abre esa agenda.
  // Si aún no está definida (casos previos), se le deja elegir (modal 40/10).
  const handleOpenAgenda = (prospect: Prospect) => {
    if (!prospect.modalidad) {
      setModalityOpen(true);
      return;
    }
    const url = meetingLinkFor(prospect);
    if (!url) {
      alert(`El director aún no ha configurado el link de Modalidad ${prospect.modalidad}. Solicítalo a Dirección.`);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleConfirmSchedule = async (date: string, time: string) => {
    if (!selectedProspect || !date || !time) return;
    setScheduling(true);
    try {
      await scheduleAssessment(selectedProspect.id, date, time);
      setSelectedProspect(null);
      setActiveTab("asesoria_agendada"); // el proyecto queda justo en el hito que acaba de alcanzar
    } catch (err) {
      console.error("Error al agendar la asesoría:", err);
      alert("No se pudo guardar la cita. Intenta de nuevo.");
    } finally {
      setScheduling(false);
    }
  };

  // Shared executive table cells — keep every tab consistent and scroll-free
  const renderProspectoCell = (p: Prospect) => (
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-350 flex items-center justify-center text-xs font-bold border border-slate-200 dark:border-slate-750 shrink-0 group-hover:bg-emerald-50/60 dark:group-hover:bg-emerald-950/20 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-all">
        {p.full_name.charAt(0)}
      </div>
      <div className="min-w-0">
        <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 block leading-tight truncate max-w-[210px]">{p.full_name}</span>
        <span className="block font-mono tabular-nums text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-1 leading-none">{p.nss}</span>
        <span className="block text-[9px] font-mono uppercase tracking-wide text-slate-350 dark:text-slate-600 mt-0.5 truncate max-w-[210px]">{p.curp}</span>
        {p.tipo_financiamiento && (
          <TipoFinanciamientoBadge value={p.tipo_financiamiento} modalidad={p.modalidad} className="mt-1.5" />
        )}
      </div>
    </div>
  );

  const renderContactoCell = (p: Prospect) => (
    <div className="min-w-0">
      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 block truncate max-w-[190px]">{p.email || "—"}</span>
      <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 block mt-0.5">Tel {p.phone}</span>
    </div>
  );

  const renderEtapaCell = (p: Prospect) => (
    <div className="flex flex-col items-start gap-1.5">
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold border ${getStageBadgeColor(p.status)}`}>
        {getStageLabel(p.status)}
      </span>
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold border ${getSubStageBadgeColor(p.status)}`}>
        {getSubStageLabel(p.status)}
      </span>
      {p.modalidad && (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wider ${
          p.modalidad === "40"
            ? "bg-blue-50 text-blue-700 border-blue-150 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/50"
            : "bg-emerald-50 text-emerald-700 border-emerald-150 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50"
        }`}>
          Modalidad {p.modalidad}
        </span>
      )}
    </div>
  );

  // Account Manager que atiende el PROYECTO: se lee directo de prospect.account_manager_id
  // (el AM ya no es un atributo del aliado). Devuelve el nombre, o un estado especial:
  //   null            → hay AM pero su perfil no es visible en el contexto (p.ej. un
  //                     líder viendo proyectos de su equipo, cuyos AM no vienen) → "—"
  //   "__SIN_AM__"    → el proyecto no tiene AM asignado (mesa de dirección)
  const AM_NONE = "__SIN_AM__";
  const resolveAccountManager = (p: Prospect): string | null => {
    const amId = p.account_manager_id;
    if (!amId) return AM_NONE;
    // Para el aliado, exposedProfiles ya incluye a los AMs de sus proyectos.
    return profiles.find((pr) => pr.id === amId)?.full_name ?? null;
  };

  const renderAccountManagerCell = (p: Prospect) => {
    const am = resolveAccountManager(p);
    if (am === null) {
      return <span className="text-xs font-semibold text-slate-300 dark:text-slate-600">—</span>;
    }
    if (am === AM_NONE) {
      return <span className="text-[11px] font-semibold italic text-slate-400 dark:text-slate-500">En mesa de dirección</span>;
    }
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className="h-6 w-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-black border border-indigo-100 dark:border-indigo-900/40 shrink-0">
          {am.charAt(0)}
        </span>
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 truncate max-w-[150px]">{am}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-[1700px] mx-auto animate-fade-in text-slate-800 dark:text-slate-100">

      {/* Ally focus banner — shown when a leader drills into a specific ally's projects */}
      {aliadoFilter && (
        <div className="flex items-center justify-between gap-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-black border border-blue-200/40 shrink-0">
              {(aliadoFocus?.full_name || "A").charAt(0)}
            </div>
            <div className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 dark:text-blue-400 leading-none">Proyectos del aliado</span>
              <span className="block text-sm font-extrabold text-slate-800 dark:text-slate-100 truncate leading-tight mt-0.5">
                {aliadoFocus?.full_name || "Aliado comercial"}
              </span>
            </div>
          </div>
          <Link
            href="/dashboard/clientes"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5" /> Quitar filtro
          </Link>
        </div>
      )}

      {/* La línea de tiempo del proyecto, hecha botonera: cada hito dice cuántos clientes
          están parados ahí y al apretarlo se despliegan. Es el mismo recorrido que ven el
          account manager y el director, y el que dibuja el stepper del expediente. */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm px-4 pt-3 pb-2.5">
        <PipelineTabs counts={tabCounts} activeTab={activeTab} onChange={setActiveTab} isAdmin={canDelete} />
      </div>

      <div className="flex justify-end">
        <Link
          href="/dashboard/nuevo"
          className="inline-flex items-center justify-center px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-650 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold transition-all shadow-md shadow-emerald-500/10 hover:scale-[1.02] active:scale-[0.98] text-sm shrink-0"
        >
          <Plus className="mr-2 h-4 w-4 stroke-[2.5]" />
          Subir Prospecto
        </Link>
      </div>

      {/* Search Input Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm p-4">
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-2.5 h-4.5 w-4.5 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por Nombre, NSS o CURP..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/60 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl text-xs font-semibold outline-none focus:border-emerald-500 transition-all dark:text-slate-200"
          />
        </div>
      </div>

      {/* Tab Panels */}
      <div className="space-y-6">
        
        {/* TAB 1: EVALUADOS */}
        {panel === "evaluacion" && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{getTabMeta(activeTab).label}</h3>
            </div>

            {tabProspects.length === 0 ? (
              <div className="py-16 text-center">
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center shadow-sm">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-3">{getTabMeta(activeTab).empty}</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-[280px] mx-auto">
                  {activeTab === "condicionado"
                    ? "Aquí caen los proyectos que Dirección condicionó: en cuanto se resuelva el pendiente, vuelven a la línea."
                    : "Cuando registres un prospecto y subas sus archivos, aparecerá aquí durante su validación."}
                </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/60 dark:bg-slate-950/20 border-b border-slate-150 dark:border-slate-800 text-[9px] font-black text-slate-500 dark:text-slate-450 uppercase tracking-[0.12em] text-left">
                      <th className="px-5 py-3.5">Prospecto</th>
                      <th className="px-4 py-3.5">Contacto</th>
                      <th className="px-4 py-3.5">Account Manager</th>
                      <th className="px-4 py-3.5">Etapa · Subetapa</th>
                      <th className="px-4 py-3.5">Registro</th>
                      <th className="px-5 py-3.5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {tabProspects.map((p) => {
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/10 transition-colors group">
                          <td className="px-5 py-3.5">{renderProspectoCell(p)}</td>
                          <td className="px-4 py-3.5">{renderContactoCell(p)}</td>
                          <td className="px-4 py-3.5">{renderAccountManagerCell(p)}</td>
                          <td className="px-4 py-3.5">{renderEtapaCell(p)}</td>
                          <td className="px-4 py-3.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {new Date(p.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Link
                                href={`/prospectos/${p.id}`}
                                className="inline-flex p-2 bg-slate-100 dark:bg-slate-800 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-950/20 text-slate-550 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 rounded-xl transition-all border border-slate-200/60 dark:border-slate-700"
                                title="Ver Expediente"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Link>
                              {canDelete && (
                                <button
                                  onClick={async () => {
                                    if (confirm(`¿Enviar a ${p.full_name} a la papelera por 7 días?`)) {
                                      await deleteProspect(p.id);
                                    }
                                  }}
                                  className="inline-flex p-2 bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-500 dark:text-slate-400 hover:text-red-650 dark:hover:text-red-400 rounded-xl transition-all border border-slate-200/60 dark:border-slate-700"
                                  title="Mover a Papelera"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
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

        {/* TAB 2: LISTO PARA PRESENTAR */}
        {panel === "listo" && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Dictámenes Listos para Presentar</h3>
            </div>

            {tabProspects.length === 0 ? (
              <div className="py-16 text-center">
                <CheckSquare className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-650" />
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-3">Ninguna simulación aprobada aún</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-[280px] mx-auto">
                  Cuando Dirección o el Account Manager aprueben un caso, lo dejarán en “Listo para Presentar” y aparecerá aquí para que agendes la asesoría.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/60 dark:bg-slate-950/20 border-b border-slate-150 dark:border-slate-800 text-[9px] font-black text-slate-500 dark:text-slate-450 uppercase tracking-[0.12em] text-left">
                      <th className="px-5 py-3.5">Prospecto</th>
                      <th className="px-4 py-3.5">Contacto</th>
                      <th className="px-4 py-3.5">Account Manager</th>
                      <th className="px-4 py-3.5">Crédito Total</th>
                      <th className="px-4 py-3.5">Etapa · Subetapa</th>
                      <th className="px-5 py-3.5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {tabProspects.map((p) => {
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/10 transition-colors group">
                          <td className="px-5 py-3.5">{renderProspectoCell(p)}</td>
                          <td className="px-4 py-3.5">{renderContactoCell(p)}</td>
                          <td className="px-4 py-3.5">{renderAccountManagerCell(p)}</td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {p.simulation ? (
                              <div>
                                <span className="block text-xs font-black text-emerald-700 dark:text-emerald-300 tabular-nums">
                                  ${p.simulation.totalCredito.toLocaleString()}
                                </span>
                                <span className="block text-[9px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">{p.modalidad ? `M${p.modalidad} + Gestión` : "Financiamiento + Gestión"}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">N/A</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">{renderEtapaCell(p)}</td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center gap-2 justify-end">
                              <Link
                                href={`/prospectos/${p.id}`}
                                className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-xl transition-colors border border-slate-200/60 dark:border-slate-700"
                                title="Ver Expediente"
                              >
                                <FileText className="h-4 w-4" />
                              </Link>
                              {/* Abrir la agenda y grabar la fecha. En rojo mientras el
                                  proyecto no tenga una fecha de reunión grabada. */}
                              <div className="flex items-center gap-1.5 ml-1 pl-2.5 border-l border-slate-200 dark:border-slate-750">
                                <button
                                  onClick={() => handleOpenAgenda(p)}
                                  className={`p-1.5 rounded-xl text-white shadow border transition-all hover:scale-105 active:scale-[0.95] flex items-center justify-center ${
                                    p.asesoria_at
                                      ? "bg-gradient-to-r from-emerald-600 to-teal-650 hover:from-emerald-550 hover:to-teal-550 border-emerald-450"
                                      : "bg-gradient-to-r from-red-600 to-rose-650 hover:from-red-550 hover:to-rose-550 border-red-450"
                                  }`}
                                  title={p.modalidad ? `Abrir agenda de Modalidad ${p.modalidad}` : "Abrir agenda de asesoría"}
                                >
                                  <Calendar className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleOpenSchedule(p)}
                                  className={`p-1.5 rounded-xl transition-all border flex items-center justify-center ${
                                    p.asesoria_at
                                      ? "bg-emerald-50 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-250/60 dark:border-emerald-800/40"
                                      : "bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 border-red-250/60 dark:border-red-800/40"
                                  }`}
                                  title={
                                    formatCita(p.asesoria_at)
                                      ? `Cambiar la fecha · cita actual ${formatCita(p.asesoria_at)}`
                                      : "Grabar la fecha de la asesoría (avanza al hito Agenda de Asesoría)"
                                  }
                                >
                                  <CheckSquare className="h-4 w-4" />
                                </button>
                              </div>
                              {canDelete && (
                                <button
                                  onClick={async () => {
                                    if (confirm(`¿Enviar a ${p.full_name} a la papelera por 7 días?`)) {
                                      await deleteProspect(p.id);
                                    }
                                  }}
                                  className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-xl transition-all border border-slate-200/60 dark:border-slate-700"
                                  title="Mover a Papelera"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
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
        {panel === "activos" && (
          <div className="space-y-6">
            {proyectosActivos.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm py-16 text-center">
                <Folder className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-650" />
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-3">{getTabMeta(activeTab).empty}</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-[280px] mx-auto">
                  {activeTab === "asesoria_agendada"
                    ? "En cuanto grabes la fecha de la reunión con el cliente, el proyecto llegará a este hito."
                    : "Los proyectos van llegando a este hito conforme avanzan por la línea de tiempo."}
                </p>
              </div>
            ) : (
              proyectosActivos.map((p) => {
                const activeIndex = getActiveStageIndex(p.status);
                const isPaid = p.status === "pagado_comision";
                return (
                  <div key={p.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm p-6 space-y-6 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all">
                    
                    {/* Header Details in Horizontal Grid */}
                    <div className="pb-4 border-b border-slate-100 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                      {/* Campos repartidos a lo largo del renglón: cada celda arranca del ancho
                          de su contenido (NSS/CURP nunca se cortan) y crece con `flex-auto` para
                          ocupar el espacio libre hasta el bloque de crédito. En pantallas chicas
                          el bloque envuelve en vez de truncar. */}
                      <div className="flex flex-wrap items-start gap-x-3 gap-y-3 flex-1 min-w-0">
                        <div className="flex-auto min-w-0 max-w-[140px]">
                          <span className="block text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider whitespace-nowrap">Cliente</span>
                          <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 leading-tight mt-0.5 flex items-start gap-1.5 min-w-0">
                            <span className="break-words">{p.full_name}</span>
                            {isPaid && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-250 dark:border-amber-900/30 shrink-0">
                                ★
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex-auto shrink-0">
                          <span className="block text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider whitespace-nowrap">NSS</span>
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-350 block mt-0.5 whitespace-nowrap">{p.nss}</span>
                        </div>
                        <div className="flex-auto shrink-0">
                          <span className="block text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider whitespace-nowrap">CURP</span>
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-350 block mt-0.5 uppercase whitespace-nowrap tracking-tight">{p.curp}</span>
                        </div>
                        <div className="flex-auto min-w-0 max-w-[140px]">
                          <span className="block text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider whitespace-nowrap">Aliado</span>
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-350 block mt-0.5 leading-tight break-words">
                            {p.aliado_name || "—"}
                          </span>
                        </div>
                        {/* Etapa y subetapa comparten celda (apiladas), igual que la columna
                            "Etapa · Subetapa" de Gestión de Clientes: ocupa la mitad de ancho. */}
                        <div className="flex-auto shrink-0 max-w-[130px]">
                          <span className="block text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider whitespace-nowrap">Etapa · Subetapa</span>
                          <div className="mt-1 flex flex-col items-start gap-1">
                            <span className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-[9px] font-bold border ${getStageBadgeColor(p.status)}`}>
                              {getStageLabel(p.status)}
                            </span>
                            <span className={`inline-flex items-center text-center leading-tight px-2 py-0.5 rounded-full text-[9px] font-bold border ${getSubStageBadgeColor(p.status)}`}>
                              {getSubStageLabel(p.status)}
                            </span>
                          </div>
                        </div>
                        <div className="flex-auto min-w-0 max-w-[110px]">
                          <span className="block text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tight whitespace-nowrap">Account Manager</span>
                          {(() => {
                            const am = resolveAccountManager(p);
                            const label = am === null ? "—" : am === AM_NONE ? "En mesa de dirección" : am;
                            return (
                              <span className="text-xs font-semibold text-slate-600 dark:text-slate-350 block mt-0.5 leading-tight break-words">
                                {label}
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="flex items-center justify-between xl:justify-end gap-4 border-t xl:border-t-0 pt-3 xl:pt-0 border-slate-100 dark:border-slate-800">
                        {p.simulation && (
                          <div className="text-left xl:text-right xl:border-r xl:pr-4 xl:border-slate-100 dark:xl:border-slate-800">
                            <span className="block text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Crédito Total</span>
                            <span className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mt-0.5">${p.simulation.totalCredito.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/prospectos/${p.id}`}
                            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1.5"
                          >
                            Expediente <ArrowUpRight className="h-3 w-3" />
                          </Link>
                          {canDelete && (
                            <button
                              onClick={async () => {
                                if (confirm(`¿Enviar a ${p.full_name} a la papelera por 7 días?`)) {
                                  await deleteProspect(p.id);
                                }
                              }}
                              className="p-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-xl transition-colors border border-slate-200/60 dark:border-slate-700"
                              title="Mover a Papelera"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Barra de progreso del pipeline (componente compartido) */}
                    <div className="space-y-4 pt-2">
                      <ProjectStepper activeIndex={activeIndex} dates={statusDates[p.id]} createdAt={p.created_at} asesoriaAt={p.asesoria_at} />
                    </div>

                    {/* Congratulations Banner / Commission status */}
                    {isPaid && p.simulation && (
                      <div className="bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 dark:border-emerald-500/30 rounded-2xl p-4 flex items-center shadow-inner">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">🎉</span>
                          <div>
                            <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                              Felicitaciones {p.aliado_name || user?.full_name || "Aliado"}, has concluido este proyecto con éxito
                            </h4>
                            <p className="text-[10px] text-emerald-600 dark:text-emerald-450 mt-0.5">
                              ¡Vamos por más!
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 4: PAPELERA (oculta para aliados: no pueden eliminar ni gestionar la papelera) */}
        {canDelete && panel === "papelera" && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                Papelera de Reciclaje (Se eliminan permanentemente en 7 días)
              </h3>
            </div>

            {filteredDeleted.length === 0 ? (
              <div className="py-16 text-center">
                <Trash2 className="mx-auto h-12 w-12 text-slate-350 dark:text-slate-650" />
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-3">La papelera está vacía</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-[280px] mx-auto">
                  Los clientes que elimines aparecerán aquí por 7 días antes de borrarse definitivamente.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/60 dark:bg-slate-950/20 border-b border-slate-150 dark:border-slate-800 text-[9px] font-black text-slate-500 dark:text-slate-450 uppercase tracking-[0.12em] text-left">
                      <th className="px-5 py-3.5">Prospecto</th>
                      <th className="px-4 py-3.5">Eliminado · Vence</th>
                      <th className="px-5 py-3.5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredDeleted.map((p) => {
                      const deletedAt = getProspectDeletedAt(p);
                      const remainingDays = deletedAt
                        ? Math.max(0, Math.ceil((deletedAt.getTime() + 7 * 24 * 60 * 60 * 1000 - Date.now()) / (1000 * 60 * 60 * 24)))
                        : 7;
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/10 transition-colors group">
                          <td className="px-5 py-3.5">{renderProspectoCell(p)}</td>
                          <td className="px-4 py-3.5">
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                              {deletedAt ? deletedAt.toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "N/A"}
                            </span>
                            <span className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${remainingDays <= 2 ? "bg-red-50 text-red-600 border-red-100 dark:bg-red-950/15 dark:text-red-400 dark:border-red-800/50" : "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/15 dark:text-amber-400 dark:border-amber-800/50"}`}>
                              Vence en {remainingDays} {remainingDays === 1 ? "día" : "días"}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={async () => {
                                  if (confirm(`¿Restaurar a ${p.full_name} al pipeline activo?`)) {
                                    await restoreProspect(p.id);
                                  }
                                }}
                                className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded-xl border border-emerald-200 dark:border-emerald-850 transition-colors"
                              >
                                Restaurar
                              </button>
                              <button
                                onClick={async () => {
                                  if (confirm(`¿Eliminar permanentemente a ${p.full_name}?`)) {
                                    await permanentlyDeleteProspect(p.id);
                                  }
                                }}
                                className="px-3 py-1.5 bg-red-50 dark:bg-red-950/10 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-750 dark:text-red-400 text-[10px] font-bold rounded-xl border border-red-200 dark:border-red-850 transition-colors"
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
            )}
          </div>
        )}

        {/* TAB 4: RECHAZADOS */}
        {panel === "rechazados" && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                Prospectos Rechazados
              </h3>
            </div>

            {tabProspects.length === 0 ? (
              <div className="py-16 text-center">
                <XCircle className="mx-auto h-12 w-12 text-slate-350 dark:text-slate-650" />
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-3">No hay prospectos rechazados</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-[280px] mx-auto">
                  Aquí aparecerán los clientes cuyos expedientes no hayan sido aprobados.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/60 dark:bg-slate-950/20 border-b border-slate-150 dark:border-slate-800 text-[9px] font-black text-slate-500 dark:text-slate-450 uppercase tracking-[0.12em] text-left">
                      <th className="px-5 py-3.5">Prospecto</th>
                      <th className="px-4 py-3.5">Contacto</th>
                      <th className="px-4 py-3.5">Account Manager</th>
                      <th className="px-4 py-3.5">Motivo del Rechazo</th>
                      <th className="px-4 py-3.5">Etapa · Subetapa</th>
                      <th className="px-5 py-3.5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {tabProspects.map((p) => {
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/10 transition-colors group">
                          <td className="px-5 py-3.5">{renderProspectoCell(p)}</td>
                          <td className="px-4 py-3.5">{renderContactoCell(p)}</td>
                          <td className="px-4 py-3.5">{renderAccountManagerCell(p)}</td>
                          <td className="px-4 py-3.5 text-[11px] font-semibold text-slate-600 dark:text-slate-350 max-w-[200px] truncate" title={p.notes_director || "Sin motivo especificado"}>
                            {p.notes_director || <span className="text-slate-400 italic">Sin motivo especificado</span>}
                          </td>
                          <td className="px-4 py-3.5">{renderEtapaCell(p)}</td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center gap-2 justify-end">
                              <Link
                                href={`/prospectos/${p.id}`}
                                className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-xl transition-colors border border-slate-200/60 dark:border-slate-700"
                                title="Ver Expediente"
                              >
                                <FileText className="h-4 w-4" />
                              </Link>
                              {canDelete && (
                                <button
                                  onClick={async () => {
                                    if (confirm(`¿Enviar a ${p.full_name} a la papelera por 7 días?`)) {
                                      await deleteProspect(p.id);
                                    }
                                  }}
                                  className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-xl transition-all border border-slate-200/60 dark:border-slate-700"
                                  title="Mover a Papelera"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
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

        {/* TAB 5: CERRADOS PERDIDOS */}
        {panel === "cerrados" && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                Prospectos Cerrados Perdidos
              </h3>
            </div>

            {tabProspects.length === 0 ? (
              <div className="py-16 text-center">
                <MinusCircle className="mx-auto h-12 w-12 text-slate-350 dark:text-slate-650" />
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-3">No hay clientes cerrados perdidos</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-[280px] mx-auto">
                  Aquí aparecerán los clientes marcados como cerrados perdidos. Es solo un estado de seguimiento y no cuenta como rechazo.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/60 dark:bg-slate-950/20 border-b border-slate-150 dark:border-slate-800 text-[9px] font-black text-slate-500 dark:text-slate-450 uppercase tracking-[0.12em] text-left">
                      <th className="px-5 py-3.5">Prospecto</th>
                      <th className="px-4 py-3.5">Contacto</th>
                      <th className="px-4 py-3.5">Account Manager</th>
                      <th className="px-4 py-3.5">Motivo del Cierre</th>
                      <th className="px-4 py-3.5">Etapa · Subetapa</th>
                      <th className="px-5 py-3.5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {tabProspects.map((p) => {
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/10 transition-colors group">
                          <td className="px-5 py-3.5">{renderProspectoCell(p)}</td>
                          <td className="px-4 py-3.5">{renderContactoCell(p)}</td>
                          <td className="px-4 py-3.5">{renderAccountManagerCell(p)}</td>
                          <td className="px-4 py-3.5 text-[11px] font-semibold text-slate-600 dark:text-slate-350 max-w-[200px] truncate" title={p.notes_director || "Sin motivo especificado"}>
                            {p.notes_director || <span className="text-slate-400 italic">Sin motivo especificado</span>}
                          </td>
                          <td className="px-4 py-3.5">{renderEtapaCell(p)}</td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center gap-2 justify-end">
                              <Link
                                href={`/prospectos/${p.id}`}
                                className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-xl transition-colors border border-slate-200/60 dark:border-slate-700"
                                title="Ver Expediente"
                              >
                                <FileText className="h-4 w-4" />
                              </Link>
                              {canDelete && (
                                <button
                                  onClick={async () => {
                                    if (confirm(`¿Enviar a ${p.full_name} a la papelera por 7 días?`)) {
                                      await deleteProspect(p.id);
                                    }
                                  }}
                                  className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-xl transition-all border border-slate-200/60 dark:border-slate-700"
                                  title="Mover a Papelera"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
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

      {/* Selector de modalidad para agendar (abre el link configurado por Dirección) */}
      <MeetingModalityModal isOpen={modalityOpen} onClose={() => setModalityOpen(false)} />

      {/* Agenda de Asesoría — misma pantalla que usan el director y el AM */}
      <AgendaAsesoriaModal
        prospect={selectedProspect}
        meetingLink={selectedProspect ? meetingLinkFor(selectedProspect) : null}
        saving={scheduling}
        onClose={() => setSelectedProspect(null)}
        onConfirm={handleConfirmSchedule}
      />
    </div>
  );
}

export default function MisClientes() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-400">Cargando listado de clientes...</div>}>
      <ClientesContent />
    </Suspense>
  );
}
