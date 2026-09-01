"use client";

import React, { useState, useMemo, Suspense } from "react";
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
  CalendarClock,
  CalendarX2,
  ArrowRight,
  ArrowLeftRight,
  RotateCcw,
  CheckCircle,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useSortable, SortControl, SortHeader } from "@/components/ui/sorting";
import { ModalidadFilter, ModalidadFilterValue, prospectMatchesModalidadFilter } from "@/components/ui/ModalidadFilter";
import { AliadoPicker, prospectMatchesSelection } from "@/components/ui/AliadoPicker";
import { TipoFinanciamientoBadge } from "@/components/ui/tipoFinanciamiento";
import { TimelineToggleButton, TimelinePanel, hasProjectTimeline } from "@/components/ui/projectStepper";
import { createClient } from "@/utils/supabase/client";
import Link from "next/link";

// El módulo es una sola pregunta: ¿qué expedientes quedaron pospuestos para
// reevaluarse, y para cuándo? Por eso la lista es exactamente el estado
// `agenda_futura` (subetapa de Condicionado) y la fecha que manda es
// `reeval_date`, no `created_at`.
const AGENDA_FUTURA_STATUS = "agenda_futura";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Clave del bucket "sin fecha de reevaluación": esos clientes no pueden desaparecer. */
const SIN_FECHA = "__sin_fecha__";

/** `reeval_date` es un `date` de Postgres: se corta a YYYY-MM-DD para comparar como texto. */
const reevalKeyOf = (p: Prospect): string | null => {
  const raw = p.reeval_date;
  if (!raw) return null;
  const d = String(raw).substring(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
};

/** Se parsea con hora local (`T00:00:00`): sin eso, un date de Postgres se corre un día. */
const reevalDateOf = (p: Prospect): Date | null => {
  const key = reevalKeyOf(p);
  return key ? new Date(`${key}T00:00:00`) : null;
};

const fmtReeval = (p: Prospect): string | null => {
  const d = reevalDateOf(p);
  return d ? d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : null;
};

type Granularity = "mes" | "anio";

interface Bucket {
  key: string;
  /** Etiqueta corta del eje X. */
  label: string;
  /** Etiqueta larga (tooltips, encabezado del detalle). */
  full: string;
  count: number;
  /** Orden cronológico; el bucket "Sin fecha" va siempre al final. */
  order: number;
  tone: "vencido" | "actual" | "futuro" | "sin_fecha";
}

function AgendaFuturaContent() {
  const {
    user,
    prospects,
    profiles,
    assignmentProfiles,
    updateProspectStatus,
    reassignProspect,
    deleteProspect,
    isProspectDeleted,
    isProspectPurged,
    isDemoMode,
  } = useApp();

  const isAM = user?.role === "account_manager";
  const accent = isAM ? "blue" : "emerald";

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [modalidadFilter, setModalidadFilter] = useState<ModalidadFilterValue>("all");
  const [granularity, setGranularity] = useState<Granularity>("mes");
  // Mes (o año) seleccionado en el gráfico. null = total, que es como abre.
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);

  // Base del módulo: solo agendas futuras vivas, ya acotadas por el filtro de
  // asignación y el de modalidad. El gráfico y el detalle salen de aquí, así que
  // las barras siempre cuadran con la tabla.
  const agendas = useMemo(() => {
    const base = user?.role === "director"
      ? prospects.filter((p) => prospectMatchesSelection(p, selectedEntities, profiles))
      : prospects;
    return base.filter(
      (p) =>
        p.status === AGENDA_FUTURA_STATUS &&
        !isProspectDeleted(p) &&
        !isProspectPurged(p) &&
        prospectMatchesModalidadFilter(p, modalidadFilter)
    );
  }, [prospects, user, selectedEntities, profiles, modalidadFilter, isProspectDeleted, isProspectPurged]);

  // ── Buckets del gráfico ────────────────────────────────────────────────────
  // A qué barra pertenece cada prospecto. Sin `reeval_date` cae en "Sin fecha".
  const bucketKeyOf = React.useCallback(
    (p: Prospect): string => {
      const d = reevalDateOf(p);
      if (!d) return SIN_FECHA;
      return granularity === "anio" ? `${d.getFullYear()}` : `${d.getFullYear()}-${d.getMonth()}`;
    },
    [granularity]
  );

  const buckets = useMemo<Bucket[]>(() => {
    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth();

    const counts = new Map<string, number>();
    let sinFecha = 0;
    let minTime = Infinity;
    let maxTime = -Infinity;
    for (const p of agendas) {
      const d = reevalDateOf(p);
      if (!d) {
        sinFecha += 1;
        continue;
      }
      const key = bucketKeyOf(p);
      counts.set(key, (counts.get(key) || 0) + 1);
      const t = d.getTime();
      if (t < minTime) minTime = t;
      if (t > maxTime) maxTime = t;
    }

    const make = (y: number, m: number): Bucket => {
      const isYear = granularity === "anio";
      const past = isYear ? y < curY : y < curY || (y === curY && m < curM);
      const actual = isYear ? y === curY : y === curY && m === curM;
      return {
        key: isYear ? `${y}` : `${y}-${m}`,
        label: isYear ? `${y}` : `${MESES[m]} ${String(y).slice(2)}`,
        full: isYear ? `${y}` : `${MESES_LARGOS[m]} ${y}`,
        count: counts.get(isYear ? `${y}` : `${y}-${m}`) || 0,
        order: isYear ? y * 12 : y * 12 + m,
        tone: past ? "vencido" : actual ? "actual" : "futuro",
      };
    };

    let out: Bucket[] = [];
    if (counts.size > 0) {
      // Se rellenan los huecos para que el eje sea un calendario y no una lista de
      // meses sueltos. Si el rango se dispara (agendas a años de distancia) se cae
      // a "solo los periodos con datos" para no pintar cien barras vacías.
      const min = new Date(minTime);
      const max = new Date(maxTime);
      const cur = granularity === "anio" ? new Date(min.getFullYear(), 0, 1) : new Date(min.getFullYear(), min.getMonth(), 1);
      const guard = granularity === "anio" ? 20 : 36;
      while (out.length < guard) {
        out.push(make(cur.getFullYear(), cur.getMonth()));
        if (granularity === "anio") {
          if (cur.getFullYear() >= max.getFullYear()) break;
          cur.setFullYear(cur.getFullYear() + 1);
        } else {
          if (cur.getFullYear() === max.getFullYear() && cur.getMonth() === max.getMonth()) break;
          cur.setMonth(cur.getMonth() + 1);
        }
      }
      const spanCompleto =
        out.length > 0 &&
        out[out.length - 1].order >=
          (granularity === "anio" ? max.getFullYear() * 12 : max.getFullYear() * 12 + max.getMonth());
      if (!spanCompleto) {
        out = Array.from(counts.keys())
          .map((k) => {
            const [y, m] = k.split("-");
            return make(parseInt(y, 10), m === undefined ? 0 : parseInt(m, 10));
          })
          .sort((a, b) => a.order - b.order);
      }
    }

    if (sinFecha > 0) {
      out.push({
        key: SIN_FECHA,
        label: "Sin fecha",
        full: "Sin fecha de reevaluación",
        count: sinFecha,
        order: Number.MAX_SAFE_INTEGER,
        tone: "sin_fecha",
      });
    }
    return out;
  }, [agendas, granularity, bucketKeyOf]);

  const maxBucket = Math.max(...buckets.map((b) => b.count), 1);
  const totalAgendas = agendas.length;
  const activeBucket = selectedBucket ? buckets.find((b) => b.key === selectedBucket) || null : null;

  // Si cambia la granularidad (o los filtros) la selección anterior deja de existir:
  // se vuelve al total en vez de dejar la tabla vacía sin explicación.
  React.useEffect(() => {
    if (selectedBucket && !buckets.some((b) => b.key === selectedBucket)) setSelectedBucket(null);
  }, [buckets, selectedBucket]);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const hoy = new Date();
    const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    const mesActual = `${hoy.getFullYear()}-${hoy.getMonth()}`;
    let vencidas = 0;
    let esteMes = 0;
    let sinFecha = 0;
    for (const p of agendas) {
      const key = reevalKeyOf(p);
      if (!key) {
        sinFecha += 1;
        continue;
      }
      if (key < hoyStr) vencidas += 1;
      const d = new Date(`${key}T00:00:00`);
      if (`${d.getFullYear()}-${d.getMonth()}` === mesActual) esteMes += 1;
    }
    return { total: agendas.length, vencidas, esteMes, sinFecha };
  }, [agendas]);

  // ── Detalle ────────────────────────────────────────────────────────────────
  // La búsqueda solo acota la tabla: si también moviera el gráfico, las barras
  // bailarían mientras se escribe.
  // Se filtra por `activeBucket`, no por `selectedBucket`: si la selección dejó de
  // existir (cambió la granularidad o un filtro), la tabla vuelve al total en el acto
  // en vez de quedarse vacía esperando al efecto que limpia la selección.
  const detalle = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const bucketKey = activeBucket?.key ?? null;
    return agendas
      .filter((p) => (bucketKey ? bucketKeyOf(p) === bucketKey : true))
      .filter(
        (p) =>
          !term ||
          p.full_name.toLowerCase().includes(term) ||
          p.nss.includes(term) ||
          p.curp.toLowerCase().includes(term)
      );
  }, [agendas, activeBucket, bucketKeyOf, searchTerm]);

  const getAmName = React.useCallback(
    (p: Prospect): string | null => {
      if (!p.account_manager_id) return null;
      return assignmentProfiles.find((pr) => pr.id === p.account_manager_id)?.full_name || "Account Manager";
    },
    [assignmentProfiles]
  );

  // Abre ordenado por fecha de reevaluación ascendente: lo que toca primero, arriba.
  const sort = useSortable<Prospect>(
    detalle,
    {
      reeval: (p) => reevalKeyOf(p) || "",
      nombre: (p) => p.full_name,
      tipo: (p) => p.tipo_financiamiento || "",
      aliado: (p) => p.aliado_name || "",
      am: (p) => getAmName(p) || "",
      expediente: (p) => p.documents.length,
      fecha: (p) => p.created_at || "",
    },
    "reeval",
    "asc"
  );

  const sortOptions = [
    { id: "reeval", label: "Fecha de reevaluación" },
    { id: "nombre", label: "Nombre" },
    { id: "tipo", label: "Tipo de financiamiento" },
    { id: "aliado", label: "Aliado" },
    { id: "am", label: "Account Manager" },
    { id: "expediente", label: "Documentos" },
    { id: "fecha", label: "Fecha registro" },
  ];

  // ── Acciones de fila (mismas que Gestión de Clientes) ───────────────────────
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusDates, setStatusDates] = useState<Record<string, Record<string, number>>>({});
  const [deleteTarget, setDeleteTarget] = useState<Prospect | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<Prospect | null>(null);
  const [reassignAllyId, setReassignAllyId] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null);

  const showToast = (title: string, message: string) => {
    setToast({ title, message });
    window.setTimeout(() => setToast(null), 5000);
  };

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
      setStatusDates((prev) => ({ ...prev, [next]: {} }));
    }
  };

  const eligibleAllies = useMemo(
    () =>
      assignmentProfiles
        .filter((p) => p.role === "aliado" && p.is_active !== false)
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [assignmentProfiles]
  );

  const handleConfirmReassign = async () => {
    if (!reassignTarget || !reassignAllyId) return;
    setReassigning(true);
    try {
      await reassignProspect(reassignTarget.id, reassignAllyId);
      setReassignTarget(null);
      setReassignAllyId("");
    } catch (err) {
      console.error("Error al reasignar el proyecto:", err);
      alert("No se pudo reasignar el proyecto. Intenta de nuevo.");
    } finally {
      setReassigning(false);
    }
  };

  const handleStageChange = async (id: string, newStatus: Prospect["status"]) => {
    let comment = "";
    if (newStatus === "rechazado") {
      comment = prompt("Escribe el motivo del rechazo del prospecto:") || "Documento incompleto.";
    }
    await updateProspectStatus(id, newStatus, comment);
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
    setDeleteTarget(null);
    setDeleteStep(1);
    setDeleteConfirmText("");
    setDeleting(false);
  };

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

  // Paleta de las barras: vencido (ya se pasó la fecha) en rojo, mes en curso en
  // ámbar, futuro en índigo y sin fecha en gris.
  const barTone: Record<Bucket["tone"], { on: string; off: string; text: string }> = {
    vencido: { on: "bg-rose-500", off: "bg-rose-500/35 group-hover:bg-rose-500/60", text: "text-rose-600 dark:text-rose-400" },
    actual: { on: "bg-amber-500", off: "bg-amber-500/35 group-hover:bg-amber-500/60", text: "text-amber-600 dark:text-amber-400" },
    futuro: { on: "bg-indigo-500", off: "bg-indigo-500/35 group-hover:bg-indigo-500/60", text: "text-indigo-600 dark:text-indigo-400" },
    sin_fecha: { on: "bg-slate-400", off: "bg-slate-400/35 group-hover:bg-slate-400/60", text: "text-slate-500 dark:text-slate-400" },
  };

  const kpiCards = [
    { label: "Total agendadas", value: kpis.total, sub: "en agenda futura", tone: "text-indigo-600 dark:text-indigo-400", bar: "bg-indigo-500" },
    { label: "Vencidas", value: kpis.vencidas, sub: "ya tocaba reevaluar", tone: "text-rose-600 dark:text-rose-400", bar: "bg-rose-500" },
    { label: "Este mes", value: kpis.esteMes, sub: "reevaluación en curso", tone: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" },
    { label: "Sin fecha", value: kpis.sinFecha, sub: "falta agendar", tone: "text-slate-500 dark:text-slate-400", bar: "bg-slate-400" },
  ];

  const gBtn = (active: boolean) =>
    `px-3 py-1 rounded-lg text-[11px] font-semibold transition-all ${
      active ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
    }`;

  return (
    <>
      <div className="space-y-5 max-w-[1700px] mx-auto animate-fade-in text-slate-800 dark:text-slate-100">
        {/* Filtros del módulo — mueven el gráfico Y el detalle */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm px-3 py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 pr-0.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtros
            </span>
            {!isAM && (
              <AliadoPicker profiles={profiles} selected={selectedEntities} onChange={setSelectedEntities} accent="emerald" />
            )}
            <ModalidadFilter value={modalidadFilter} onChange={setModalidadFilter} />
            {(selectedEntities.length > 0 || modalidadFilter !== "all") && (
              <button
                onClick={() => {
                  setSelectedEntities([]);
                  setModalidadFilter("all");
                }}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
                title="Limpiar filtros"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Limpiar
              </button>
            )}
          </div>
          <div className="flex items-center gap-0.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 p-0.5 ring-1 ring-inset ring-slate-200/70 dark:ring-slate-700/50 shrink-0">
            <button onClick={() => setGranularity("mes")} className={gBtn(granularity === "mes")}>Mes</button>
            <button onClick={() => setGranularity("anio")} className={gBtn(granularity === "anio")}>Año</button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpiCards.map((c) => (
            <div
              key={c.label}
              className="relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-3.5 overflow-hidden flex flex-col justify-between min-h-[104px]"
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-400 dark:text-slate-500 leading-tight">{c.label}</span>
              <span className="block text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white leading-none mt-2">{c.value}</span>
              <span className={`text-[10px] font-semibold mt-1.5 ${c.tone}`}>{c.sub}</span>
              <span className={`absolute bottom-0 inset-x-0 h-1 ${c.bar}`} />
            </div>
          ))}
        </div>

        {/* Gráfico de barras — cada barra (y su número) es clicable */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-indigo-500/10">
                <CalendarClock className="h-4 w-4" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">
                  Agenda futura por {granularity === "anio" ? "año" : "mes"}
                </h3>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight">
                  {activeBucket
                    ? `Viendo ${activeBucket.full} · ${activeBucket.count} proyecto(s).`
                    : `${totalAgendas} proyecto(s) agendados para reevaluación. Toca una barra para verla sola.`}
                </p>
              </div>
            </div>
            {activeBucket && (
              <button
                onClick={() => setSelectedBucket(null)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm shadow-indigo-500/20 transition-all active:scale-95 shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.5} />
                Ver el total
              </button>
            )}
          </div>

          {buckets.length === 0 ? (
            <div className="py-16 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">
              No hay proyectos en agenda futura con los filtros activos.
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <div
                className="flex items-end gap-2 h-[240px] pt-5"
                style={{ minWidth: `${Math.max(buckets.length * 56, 320)}px` }}
              >
                {buckets.map((b) => {
                  const on = selectedBucket === b.key;
                  const dim = selectedBucket !== null && !on;
                  const tone = barTone[b.tone];
                  return (
                    <button
                      key={b.key}
                      onClick={() => setSelectedBucket(on ? null : b.key)}
                      title={`${b.full}: ${b.count} proyecto(s)`}
                      className={`group flex-1 flex flex-col items-center gap-1.5 h-full rounded-xl px-1 pb-1 transition-all ${
                        on ? "bg-slate-50 dark:bg-slate-850/60 ring-1 ring-inset ring-slate-200 dark:ring-slate-700" : "hover:bg-slate-50/70 dark:hover:bg-slate-850/30"
                      } ${dim ? "opacity-45" : ""}`}
                    >
                      <span className={`text-xs font-bold tabular-nums ${on ? tone.text : "text-slate-700 dark:text-slate-200"}`}>
                        {b.count}
                      </span>
                      {/* La barra vive en su propio tramo flexible: así el número de
                          arriba y la etiqueta de abajo nunca se salen del recuadro. */}
                      <div className="flex-1 min-h-0 w-full flex items-end justify-center">
                        <div
                          className={`w-full max-w-[38px] rounded-t-md transition-all duration-500 ${on ? tone.on : tone.off}`}
                          style={{ height: `${b.count > 0 ? Math.max((b.count / maxBucket) * 100, 3) : 2}%` }}
                        />
                      </div>
                      <span
                        className={`text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap ${
                          on ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        {b.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Leyenda de los tonos */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
            {[
              { c: "bg-rose-500", l: "Vencida" },
              { c: "bg-amber-500", l: granularity === "anio" ? "Año en curso" : "Mes en curso" },
              { c: "bg-indigo-500", l: "Por venir" },
              { c: "bg-slate-400", l: "Sin fecha" },
            ].map((x) => (
              <span key={x.l} className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 pt-2">
                <span className={`h-2 w-2 rounded-full ${x.c}`} />
                {x.l}
              </span>
            ))}
          </div>
        </div>

        {/* Detalle — misma tabla que Gestión de Clientes, solo agendas futuras */}
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
              {activeBucket && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 ring-1 ring-inset ring-indigo-200 dark:ring-indigo-900/50">
                  {activeBucket.full}
                  <button
                    onClick={() => setSelectedBucket(null)}
                    className="text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200 transition-colors"
                    title="Ver el total"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
              <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums">
                {detalle.length} de {totalAgendas}
              </span>
            </div>
            <SortControl options={sortOptions} sort={sort} accent={accent as any} />
          </div>

          {sort.sorted.length === 0 ? (
            <div className="py-16 text-center space-y-3 bg-white dark:bg-slate-900">
              <div className="h-11 w-11 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mx-auto">
                <CalendarX2 className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Sin agendas futuras</h4>
                <p className="text-xs text-slate-450 dark:text-slate-500 mt-1 max-w-[300px] mx-auto">
                  {activeBucket
                    ? `No hay proyectos agendados en ${activeBucket.full}.`
                    : "Aquí aparecen los expedientes pospuestos para una nueva evaluación en fecha futura."}
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/60 dark:bg-slate-900/30 border-b border-slate-150 dark:border-slate-800 text-left">
                    <SortHeader col="nombre" label="Prospecto" sort={sort} className="pl-5" />
                    <SortHeader col="reeval" label="Reevaluación" sort={sort} />
                    <SortHeader col="tipo" label="Tipo de financiamiento" sort={sort} />
                    <SortHeader col="aliado" label="Aliado" sort={sort} />
                    <SortHeader col="am" label="Account Manager" sort={sort} />
                    <SortHeader col="expediente" label="Expediente" sort={sort} align="center" />
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                      Etapa · Subetapa
                    </th>
                    <SortHeader col="fecha" label="Registrado" sort={sort} align="center" />
                    <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {sort.sorted.map((p) => {
                    const hasAfore = p.documents.some((d) => d.file_type === "AFORE");
                    const hasImss = p.documents.some((d) => d.file_type === "IMSS");
                    const allyProfile = profiles.find((prof) => prof.id === p.aliado_id);
                    const leaders = allyProfile ? profiles.filter((prof) => allyProfile.lider_ids?.includes(prof.id)) : [];
                    const leaderNames = leaders.length > 0 ? leaders.map((prof) => prof.full_name).join(", ") : "Sin líder";
                    const showTimeline = hasProjectTimeline(p.status);
                    const isExpanded = expandedId === p.id && showTimeline;
                    const reevalLabel = fmtReeval(p);
                    const reevalKey = reevalKeyOf(p);
                    // Días que faltan (o que se pasaron) para la nueva evaluación.
                    const dias = reevalKey
                      ? Math.round((new Date(`${reevalKey}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000)
                      : null;
                    return (
                      <React.Fragment key={p.id}>
                        <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-850/20 transition-colors group">
                          {/* Prospecto */}
                          <td className="pl-4 pr-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                                  isAM
                                    ? "group-hover:bg-blue-50 dark:group-hover:bg-blue-950/20 group-hover:text-blue-500"
                                    : "group-hover:bg-emerald-50 dark:group-hover:bg-emerald-950/20 group-hover:text-emerald-500"
                                }`}
                              >
                                {p.full_name.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <Link
                                  href={`/prospectos/${p.id}`}
                                  className={`font-bold text-slate-800 dark:text-slate-200 block hover:underline leading-tight truncate max-w-[180px] ${
                                    isAM ? "hover:text-blue-600 dark:hover:text-blue-400" : "hover:text-emerald-600 dark:hover:text-emerald-400"
                                  }`}
                                  title={p.full_name}
                                >
                                  {p.full_name}
                                </Link>
                                <div className="flex items-center gap-1.5 mt-0.5 max-w-[180px] text-[10px] font-medium text-slate-400 dark:text-slate-500 leading-none tabular-nums">
                                  <span className="truncate">{p.nss}</span>
                                  <span className="text-slate-300 dark:text-slate-700">·</span>
                                  <span className="truncate">Tel {p.phone}</span>
                                </div>
                                <span className="block text-[9px] font-medium uppercase tracking-wide text-slate-350 dark:text-slate-600 mt-0.5 truncate max-w-[180px]">
                                  {p.curp}
                                </span>
                              </div>
                            </div>
                          </td>
                          {/* Reevaluación */}
                          <td className="px-2 py-2.5 whitespace-nowrap">
                            {reevalLabel ? (
                              <>
                                <span className="block text-[11px] font-bold text-slate-700 dark:text-slate-200 tabular-nums">{reevalLabel}</span>
                                <span
                                  className={`inline-flex items-center mt-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold ${
                                    dias === null
                                      ? ""
                                      : dias < 0
                                      ? "bg-rose-50 dark:bg-rose-950/25 text-rose-600 dark:text-rose-400"
                                      : dias === 0
                                      ? "bg-amber-50 dark:bg-amber-950/25 text-amber-700 dark:text-amber-400"
                                      : "bg-indigo-50 dark:bg-indigo-950/25 text-indigo-600 dark:text-indigo-400"
                                  }`}
                                >
                                  {dias === null ? "" : dias < 0 ? `Vencida · ${Math.abs(dias)} d` : dias === 0 ? "Es hoy" : `En ${dias} d`}
                                </span>
                              </>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-700">
                                Sin fecha
                              </span>
                            )}
                          </td>
                          {/* Tipo de financiamiento */}
                          <td className="px-2 py-2.5">
                            <TipoFinanciamientoBadge value={p.tipo_financiamiento} modalidad={p.modalidad} />
                          </td>
                          {/* Aliado */}
                          <td className="px-2 py-2.5">
                            <span className="font-semibold text-slate-700 dark:text-slate-300 block truncate max-w-[124px]" title={p.aliado_name || "Asesor Comercial"}>
                              {p.aliado_name || "Asesor Comercial"}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 block truncate max-w-[124px] mt-0.5" title={leaderNames}>
                              Líder: {leaderNames}
                            </span>
                          </td>
                          {/* Account Manager — de SOLO LECTURA: va con el ALIADO y se
                              cambia en "Asignación AM" (20260831000001). */}
                          <td className="px-3 py-2.5">
                            <span
                              title={
                                p.account_manager_id
                                  ? "El AM va con el aliado. Se cambia en Asignación AM."
                                  : "Su aliado todavía no tiene Account Manager. Se le asigna en Asignación AM."
                              }
                              className={`inline-block w-[118px] px-2 py-1.5 border rounded-lg text-[11px] font-semibold truncate ${
                                p.account_manager_id
                                  ? "bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-750 text-slate-700 dark:text-slate-300"
                                  : "bg-slate-50 dark:bg-slate-850/40 border-dashed border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500"
                              }`}
                            >
                              {getAmName(p) || "Sin asignar"}
                            </span>
                          </td>
                          {/* Expediente */}
                          <td className="px-2 py-2.5">
                            <div className="flex items-center justify-center gap-1.5">
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${
                                  hasAfore
                                    ? "bg-emerald-50 dark:bg-emerald-950/25 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-850"
                                    : "bg-slate-50 dark:bg-slate-850/40 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800 border-dashed"
                                }`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${hasAfore ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                                AFORE
                              </span>
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${
                                  hasImss
                                    ? "bg-emerald-50 dark:bg-emerald-950/25 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-850"
                                    : "bg-slate-50 dark:bg-slate-850/40 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800 border-dashed"
                                }`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${hasImss ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                                IMSS
                              </span>
                            </div>
                          </td>
                          {/* Etapa · Subetapa — resolver la agenda futura desde aquí */}
                          <td className="px-3 py-2.5">
                            <div className="flex flex-col gap-1.5 w-[128px]">
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
                                  <option key={stage.id} value={stage.id} className="dark:bg-slate-900">
                                    {stage.label}
                                  </option>
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
                                  <option value="" className="dark:bg-slate-900">
                                    Ninguna
                                  </option>
                                  {(() => {
                                    const { stage, subStage } = getStageAndSubStage(p.status);
                                    const selectable = EDITABLE_SUB_STAGES_BY_STAGE[stage] || [];
                                    const fixed = subStage && !selectable.includes(subStage) ? subStage : null;
                                    return (
                                      <>
                                        {fixed && (
                                          <option value={fixed} disabled className="dark:bg-slate-900">
                                            {fixed} (la fija la fecha)
                                          </option>
                                        )}
                                        {selectable.map((sub) => (
                                          <option key={sub} value={sub} className="dark:bg-slate-900">
                                            {sub}
                                          </option>
                                        ))}
                                      </>
                                    );
                                  })()}
                                </select>
                              )}
                            </div>
                          </td>
                          {/* Registrado */}
                          <td className="px-2 py-2.5 text-center whitespace-nowrap">
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                              {p.created_at
                                ? new Date(p.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" })
                                : "—"}
                            </span>
                          </td>
                          {/* Acciones */}
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-1">
                              {showTimeline && <TimelineToggleButton expanded={isExpanded} onClick={() => toggleTimeline(p.id)} />}
                              <Link
                                href={`/prospectos/${p.id}`}
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all active:scale-95 ${
                                  isAM
                                    ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/20"
                                    : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-500/20"
                                }`}
                              >
                                Auditar <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                              </Link>
                              <button
                                onClick={() => {
                                  setReassignTarget(p);
                                  setReassignAllyId("");
                                  setReassigning(false);
                                }}
                                className="inline-flex items-center justify-center h-7 w-7 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/20"
                                title="Reasignar a otro aliado"
                              >
                                <ArrowLeftRight className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  setDeleteTarget(p);
                                  setDeleteStep(1);
                                  setDeleteConfirmText("");
                                  setDeleting(false);
                                }}
                                className="inline-flex items-center justify-center h-7 w-7 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20"
                                title="Eliminar prospecto"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-50/50 dark:bg-slate-900/30">
                            <td colSpan={9} className="px-6 pt-1 pb-6 border-b-0">
                              <TimelinePanel
                                status={p.status}
                                dates={statusDates[p.id]}
                                createdAt={p.created_at}
                                asesoriaAt={p.asesoria_at}
                                caption={`Línea de tiempo · ${p.aliado_name || "Asesor Comercial"}`}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Eliminar (a papelera) */}
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
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium tabular-nums">
                    NSS: {deleteTarget.nss} • CURP: {deleteTarget.curp}
                  </span>
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
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteStep(1);
                  setDeleteConfirmText("");
                  setDeleting(false);
                }}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-all active:scale-95"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={(deleteStep === 2 && deleteConfirmText !== "ELIMINAR") || deleting}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-xs shadow-sm shadow-red-500/20 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleting ? "Eliminando..." : deleteStep === 1 ? "Sí, Mover a Papelera" : "Confirmar Envío"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reasignar aliado */}
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
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Nuevo aliado</label>
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
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => {
                  setReassignTarget(null);
                  setReassignAllyId("");
                  setReassigning(false);
                }}
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

      {/* Toast de éxito */}
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

export default function AgendaFuturaPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-450">Cargando agenda futura...</div>}>
      <AgendaFuturaContent />
    </Suspense>
  );
}
