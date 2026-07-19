"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  useApp,
  Prospect,
  UserProfile,
} from "@/utils/context/AppContext";
import SalesFunnel from "@/components/SalesFunnel";
import { SortControl, SortHeader, SortDir, SortState } from "@/components/ui/sorting";
import { ModalidadFilter, ModalidadFilterValue } from "@/components/ui/ModalidadFilter";
import {
  Users,
  Filter,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

// Status buckets shared by the comparative table and the KPI strip.
// "Aprobado" = misma etapa que usa Gestión Clientes (getStageAndSubStage → stage "aprobado"):
// el dictamen de aprobación + todo el pipeline de cierre posterior (Agenda Asesoría, Firma Carta
// Compromiso, Análisis de Riesgo, Firma de Contrato, Cerrada Ganada). Ya fueron aprobados.
const APPROVED_STAGE = ["aprobado_listo", "asesoria_agendada", "doc_proceso", "analisis_riesgo", "firma_contrato", "firma_programada"];
const CONDITIONED_STAGE = ["falta_reporte", "falta_afore", "pendiente_documentos", "falta_semanas", "falta_afore_cuenta", "posible_simulacion", "aportacion"];
const FINANCED_APPROVED = ["aprobado_listo", "aportacion", "asesoria_agendada", "doc_proceso", "analisis_riesgo", "firma_contrato", "firma_programada", "pagado_comision"];
// "Evaluados" = proyectos con dictamen/respuesta (aprobado, condicionado, rechazado u otorgado).
// El único estado previo al dictamen que se excluye es evaluacion_pendiente.
const EVALUATED_STAGE = [...APPROVED_STAGE, ...CONDITIONED_STAGE, "rechazado", "pagado_comision"];

function PipelineManagerContent() {
  const {
    user,
    prospects,
    profiles,
    isProspectDeleted,
    isProspectPurged,
    empresasMultialiado,
  } = useApp();

  const isAM = user?.role === "account_manager";
  const searchParams = useSearchParams();

  const startDate = searchParams.get("desde") || "";
  const endDate = searchParams.get("hasta") || "";

  // Director filtering states
  const [directorFilterType, setDirectorFilterType] = useState<"todos" | "am" | "aliado" | "gestion_directa">("todos");
  const [selectedAMId, setSelectedAMId] = useState<string>("all");
  const [selectedAllyId, setSelectedAllyId] = useState<string>("all");
  // Filtro por modalidad de aprobación (Todos / M40 / M10): recalcula todos los KPIs.
  const [modalidadFilter, setModalidadFilter] = useState<ModalidadFilterValue>("all");

  // Sort state for the comparative table (top-level entities + leaves).
  const [sortKey, setSortKey] = useState("clientes");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const sort: SortState = {
    sortKey,
    sortDir,
    setSortKey,
    setSortDir,
    toggle: (key: string) => {
      if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
  };

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

  const activeProspects = baseFilteredProspects.filter(
    (p) =>
      !isProspectDeleted(p) &&
      !isProspectPurged(p) &&
      (modalidadFilter === "all" || p.modalidad === modalidadFilter)
  );

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

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  // State for expanded rows in hierarchical view
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Auto-expand hierarchy when filters change
  useEffect(() => {
    if (isAM && user) {
      setExpandedRows({ [`am-${user.id}`]: true });
      return;
    }

    if (directorFilterType === "am" && selectedAMId !== "all") {
      setExpandedRows({ [`am-${selectedAMId}`]: true });
    } else if (directorFilterType === "gestion_directa") {
      setExpandedRows({ "am-direct": true });
    } else if (directorFilterType === "aliado" && selectedAllyId !== "all") {
      const selectedAlly = profiles.find((p) => p.id === selectedAllyId);
      if (selectedAlly) {
        const amId = selectedAlly.account_manager_id || "direct";
        const amRowId = `am-${amId}`;
        const newExpanded: Record<string, boolean> = { [amRowId]: true };

        if (!selectedAlly.empresa_multialiado_id) {
          newExpanded[`${amRowId}-independientes`] = true;
        } else {
          newExpanded[`${amRowId}-empresas`] = true;
          newExpanded[`${amRowId}-empresas-${selectedAlly.empresa_multialiado_id}`] = true;
        }
        setExpandedRows(newExpanded);
      }
    }
  }, [directorFilterType, selectedAMId, selectedAllyId, profiles, isAM, user]);

  interface RowStats {
    clientes: number;
    evaluados: number;
    aprobados: number;
    condicionados: number;
    rechazados: number;
    finAprobados: number;
    finOtorgados: number;
    tasaEvaluacion: number;
    tasaAprobacion: number;
    tasaCierre: number;
  }

  interface EfficiencyTableRow extends RowStats {
    id: string;
    level: number;
    name: string;
    subLabel?: string;
    type: "am" | "category" | "company" | "role-group" | "ally";
    alliesCount?: number;
    hasChildren: boolean;
    isExpanded: boolean;
    parentId?: string;
  }

  // Calculate hierarchical visible rows
  const visibleRows = useMemo(() => {
    const rows: EfficiencyTableRow[] = [];

    const getStats = (prospectsList: Prospect[]): RowStats => {
      // "Cerrado perdido" es SOLO un estado del cliente: no forma parte del embudo/pipeline,
      // así que se excluye de TODOS los conteos (igual que el Embudo Comercial), incluida la
      // base "Clientes". De lo contrario la tabla no cuadra con el embudo (un AM podría mostrar
      // más clientes que el total de proyectos del embudo).
      const active = prospectsList.filter((p) => p.status !== "cerrado_perdido");
      const totalClientes = active.length;
      const evaluados = active.filter((p) => EVALUATED_STAGE.includes(p.status)).length;
      const aprobados = active.filter((p) => APPROVED_STAGE.includes(p.status)).length;
      const condicionados = active.filter((p) => CONDITIONED_STAGE.includes(p.status)).length;
      const rechazados = active.filter((p) => p.status === "rechazado").length;

      const finAprobados = active
        .filter((p) => FINANCED_APPROVED.includes(p.status) && p.simulation)
        .reduce((sum, p) => sum + (p.simulation?.totalCredito || p.simulation?.financiamiento || 0), 0);

      const finOtorgados = active
        .filter((p) => p.status === "pagado_comision" && p.simulation)
        .reduce((sum, p) => sum + (p.simulation?.totalCredito || p.simulation?.financiamiento || 0), 0);

      const tasaEvaluacion = totalClientes > 0 ? (evaluados / totalClientes) * 100 : 0;
      const tasaAprobacion = evaluados > 0 ? (aprobados / evaluados) * 100 : 0;
      const tasaCierre = aprobados > 0 ? (active.filter((p) => p.status === "pagado_comision").length / aprobados) * 100 : 0;

      return { clientes: totalClientes, evaluados, aprobados, condicionados, rechazados, finAprobados, finOtorgados, tasaEvaluacion, tasaAprobacion, tasaCierre };
    };

    // Value used to order rows, per the selected sort key.
    const sortVal = (stats: RowStats, alliesCount: number, name: string): number | string => {
      switch (sortKey) {
        case "name": return name;
        case "aliados": return alliesCount;
        case "clientes": return stats.clientes;
        case "evaluados": return stats.evaluados;
        case "aprobados": return stats.aprobados;
        case "condicionados": return stats.condicionados;
        case "rechazados": return stats.rechazados;
        case "finAprobados": return stats.finAprobados;
        case "finOtorgados": return stats.finOtorgados;
        case "tasaEvaluacion": return stats.tasaEvaluacion;
        case "tasaAprobacion": return stats.tasaAprobacion;
        case "tasaCierre": return stats.tasaCierre;
        default: return stats.clientes;
      }
    };
    const cmp = (va: number | string, vb: number | string) => {
      let d: number;
      if (typeof va === "number" && typeof vb === "number") d = va - vb;
      else d = String(va).localeCompare(String(vb), "es", { numeric: true });
      return sortDir === "desc" ? -d : d;
    };
    const sortAllies = (arr: UserProfile[]) =>
      [...arr].sort((a, b) =>
        cmp(
          sortVal(getStats(filteredByDate.filter((p) => p.aliado_id === a.id)), 0, a.full_name),
          sortVal(getStats(filteredByDate.filter((p) => p.aliado_id === b.id)), 0, b.full_name)
        )
      );

    let selectedAMs: { id: string | null; name: string }[] = [];
    if (isAM) {
      if (user) {
        selectedAMs = [{ id: user.id, name: user.full_name }];
      }
    } else {
      if (directorFilterType === "am" && selectedAMId !== "all") {
        const amProf = profiles.find((p) => p.id === selectedAMId);
        if (amProf) {
          selectedAMs = [{ id: amProf.id, name: amProf.full_name }];
        }
      } else if (directorFilterType === "gestion_directa") {
        selectedAMs = [{ id: null, name: "Gestión Directa (Sin AM)" }];
      } else if (directorFilterType === "aliado" && selectedAllyId !== "all") {
        const selectedAlly = profiles.find((p) => p.id === selectedAllyId);
        if (selectedAlly) {
          if (selectedAlly.account_manager_id) {
            const managingAM = profiles.find((p) => p.id === selectedAlly.account_manager_id);
            if (managingAM) {
              selectedAMs = [{ id: managingAM.id, name: managingAM.full_name }];
            }
          } else {
            selectedAMs = [{ id: null, name: "Gestión Directa (Sin AM)" }];
          }
        }
      } else {
        selectedAMs = amsList.map((am) => ({ id: am.id, name: am.full_name }));
        const unassignedAllies = profiles.filter((p) => p.role === "aliado" && p.is_active && !p.account_manager_id);
        const unassignedProspects = filteredByDate.filter((p) => unassignedAllies.some((a) => a.id === p.aliado_id));
        if (unassignedAllies.length > 0 || unassignedProspects.length > 0) {
          selectedAMs.push({ id: null, name: "Gestión Directa (Sin AM)" });
        }
      }
    }

    // Build top-level entities with their stats, then order them by the sort key.
    const amEntries = selectedAMs.map((am) => {
      const amRowId = `am-${am.id || "direct"}`;
      const amAllies = profiles.filter(
        (p) => p.role === "aliado" && p.is_active && (am.id ? p.account_manager_id === am.id : !p.account_manager_id)
      );
      const amAllyIds = amAllies.map((a) => a.id);
      const amProspects = filteredByDate.filter((p) => amAllyIds.includes(p.aliado_id));
      const amStats = getStats(amProspects);
      return { am, amRowId, amAllies, amStats };
    });
    amEntries.sort((a, b) => cmp(sortVal(a.amStats, a.amAllies.length, a.am.name), sortVal(b.amStats, b.amAllies.length, b.am.name)));

    amEntries.forEach(({ am, amRowId, amAllies, amStats }) => {
      const amExpanded = !!expandedRows[amRowId];

      rows.push({
        id: amRowId,
        level: 1,
        name: am.name,
        type: "am",
        alliesCount: amAllies.length,
        ...amStats,
        hasChildren: amAllies.length > 0,
        isExpanded: amExpanded,
      });

      if (amExpanded) {
        // Category 1: Independientes
        const independentAllies = amAllies.filter((p) => !p.empresa_multialiado_id);
        const independentAllyIds = independentAllies.map((a) => a.id);
        const independentProspects = filteredByDate.filter((p) => independentAllyIds.includes(p.aliado_id));
        const independentStats = getStats(independentProspects);
        const indRowId = `${amRowId}-independientes`;
        const indExpanded = !!expandedRows[indRowId];

        if (independentAllies.length > 0 || independentProspects.length > 0) {
          rows.push({
            id: indRowId,
            level: 2,
            name: "Independientes",
            type: "category",
            alliesCount: independentAllies.length,
            ...independentStats,
            hasChildren: independentAllies.length > 0,
            isExpanded: indExpanded,
            parentId: amRowId,
          });

          if (indExpanded) {
            sortAllies(independentAllies).forEach((ally) => {
              const allyRowId = `${indRowId}-${ally.id}`;
              const allyProspects = filteredByDate.filter((p) => p.aliado_id === ally.id);
              const allyStats = getStats(allyProspects);

              rows.push({
                id: allyRowId,
                level: 3,
                name: ally.full_name,
                type: "ally",
                ...allyStats,
                hasChildren: false,
                isExpanded: false,
                parentId: indRowId,
              });
            });
          }
        }

        // Category 2: Empresas
        const companyAllies = amAllies.filter((p) => !!p.empresa_multialiado_id);
        const companyAllyIds = companyAllies.map((a) => a.id);
        const companyProspects = filteredByDate.filter((p) => companyAllyIds.includes(p.aliado_id));
        const companyStats = getStats(companyProspects);
        const empCategoryRowId = `${amRowId}-empresas`;
        const empCategoryExpanded = !!expandedRows[empCategoryRowId];

        if (companyAllies.length > 0 || companyProspects.length > 0) {
          rows.push({
            id: empCategoryRowId,
            level: 2,
            name: "Empresas",
            type: "category",
            alliesCount: companyAllies.length,
            ...companyStats,
            hasChildren: companyAllies.length > 0,
            isExpanded: empCategoryExpanded,
            parentId: amRowId,
          });

          if (empCategoryExpanded) {
            const companyMap = companyAllies.reduce((acc, ally) => {
              const empId = ally.empresa_multialiado_id || "unknown";
              if (!acc[empId]) {
                const companyObj = empresasMultialiado.find((e) => e.id === empId);
                acc[empId] = {
                  id: empId,
                  name: companyObj ? companyObj.nombre : (ally.lider_grupo || "Empresa Desconocida"),
                  allies: [],
                };
              }
              acc[empId].allies.push(ally);
              return acc;
            }, {} as Record<string, { id: string; name: string; allies: UserProfile[] }>);

            Object.values(companyMap).forEach((company) => {
              const companyRowId = `${empCategoryRowId}-${company.id}`;
              const companyProspects = filteredByDate.filter((p) =>
                company.allies.some((a) => a.id === p.aliado_id)
              );
              const companyStats = getStats(companyProspects);
              const companyExpanded = !!expandedRows[companyRowId];

              rows.push({
                id: companyRowId,
                level: 3,
                name: company.name,
                type: "company",
                alliesCount: company.allies.length,
                ...companyStats,
                hasChildren: company.allies.length > 0,
                isExpanded: companyExpanded,
                parentId: empCategoryRowId,
              });

              if (companyExpanded) {
                const companyLeaders = company.allies.filter((a) => a.aliado_tipo === "lider");
                const companyAlliesOnly = company.allies.filter((a) => a.aliado_tipo !== "lider");

                if (companyLeaders.length > 0) {
                  const leadersHeaderId = `${companyRowId}-lideres-header`;
                  rows.push({
                    id: leadersHeaderId,
                    level: 4,
                    name: "Líderes",
                    type: "role-group",
                    clientes: 0, evaluados: 0, aprobados: 0, condicionados: 0, rechazados: 0,
                    finAprobados: 0, finOtorgados: 0, tasaEvaluacion: 0, tasaAprobacion: 0, tasaCierre: 0,
                    hasChildren: false,
                    isExpanded: false,
                    parentId: companyRowId,
                  });

                  sortAllies(companyLeaders).forEach((leader) => {
                    const leaderRowId = `${leadersHeaderId}-${leader.id}`;
                    const leaderProspects = filteredByDate.filter((p) => p.aliado_id === leader.id);
                    const leaderStats = getStats(leaderProspects);

                    rows.push({
                      id: leaderRowId,
                      level: 5,
                      name: leader.full_name,
                      type: "ally",
                      ...leaderStats,
                      hasChildren: false,
                      isExpanded: false,
                      parentId: leadersHeaderId,
                    });
                  });
                }

                if (companyAlliesOnly.length > 0) {
                  const alliesHeaderId = `${companyRowId}-aliados-header`;
                  rows.push({
                    id: alliesHeaderId,
                    level: 4,
                    name: "Aliados",
                    type: "role-group",
                    clientes: 0, evaluados: 0, aprobados: 0, condicionados: 0, rechazados: 0,
                    finAprobados: 0, finOtorgados: 0, tasaEvaluacion: 0, tasaAprobacion: 0, tasaCierre: 0,
                    hasChildren: false,
                    isExpanded: false,
                    parentId: companyRowId,
                  });

                  sortAllies(companyAlliesOnly).forEach((ally) => {
                    const allyRowId = `${alliesHeaderId}-${ally.id}`;
                    const allyProspects = filteredByDate.filter((p) => p.aliado_id === ally.id);
                    const allyStats = getStats(allyProspects);

                    const getLeaderNames = (a: UserProfile) => {
                      if (!a.lider_ids || a.lider_ids.length === 0) return "Sin líder asignado";
                      const names = a.lider_ids
                        .map((lId: string) => profiles.find((p) => p.id === lId)?.full_name)
                        .filter(Boolean);
                      return names.join(", ") || "Sin líder asignado";
                    };

                    rows.push({
                      id: allyRowId,
                      level: 5,
                      name: ally.full_name,
                      subLabel: `Líder: ${getLeaderNames(ally)}`,
                      type: "ally",
                      ...allyStats,
                      hasChildren: false,
                      isExpanded: false,
                      parentId: alliesHeaderId,
                    });
                  });
                }
              }
            });
          }
        }
      }
    });

    return rows;
  }, [amsList, profiles, filteredByDate, empresasMultialiado, expandedRows, user, isAM, directorFilterType, selectedAMId, selectedAllyId, sortKey, sortDir]);

  const toggleRow = (rowId: string) => {
    setExpandedRows((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
  };

  const getActionButtonText = (row: EfficiencyTableRow) => {
    if (row.type === "am") return row.isExpanded ? "Ocultar" : "Ver aliados";
    if (row.type === "category" && row.name === "Independientes") return row.isExpanded ? "Ocultar" : "Ver aliados";
    if (row.type === "category" && row.name === "Empresas") return row.isExpanded ? "Ocultar" : "Ver empresas";
    if (row.type === "company") return row.isExpanded ? "Ocultar" : "Ver detalle";
    return null;
  };

  const accent = isAM ? "blue" : "emerald";
  const sortOptions = [
    { id: "clientes", label: "Proyectos" },
    { id: "aprobados", label: "Aprobados" },
    { id: "condicionados", label: "Condicionados" },
    { id: "rechazados", label: "Rechazados" },
    { id: "finAprobados", label: "Fin. aprobado" },
    { id: "finOtorgados", label: "Fin. otorgado" },
    { id: "tasaAprobacion", label: "Tasa aprobación" },
    { id: "tasaCierre", label: "Tasa cierre" },
    { id: "aliados", label: "Nº de aliados" },
    { id: "name", label: "Nombre (A-Z)" },
  ];

  const filterTabs: { id: typeof directorFilterType; label: string }[] = [
    { id: "todos", label: "Todos" },
    { id: "am", label: "Por AM" },
    { id: "aliado", label: "Por Aliado" },
    { id: "gestion_directa", label: "Gestión Directa" },
  ];

  return (
    <div className="space-y-5 max-w-[1700px] mx-auto animate-fade-in text-slate-800 dark:text-slate-100">

      {/* Director Pipeline Assignment Filters */}
      {!isAM && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-emerald-500/10">
              <Users className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800 dark:text-white">Filtro de Asignación / Origen</h4>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Filtra el embudo y el comparativo por supervisor, aliado o gestión directa.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            <div className="bg-slate-100 dark:bg-slate-950 p-0.5 rounded-xl flex ring-1 ring-inset ring-slate-200/70 dark:ring-slate-800 text-xs">
              {filterTabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setDirectorFilterType(t.id)}
                  className={`px-3 py-1.5 rounded-lg transition-all text-[10px] font-semibold ${
                    directorFilterType === t.id
                      ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {directorFilterType === "am" && (
              <select
                value={selectedAMId}
                onChange={(e) => setSelectedAMId(e.target.value)}
                className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl py-1.5 px-3 text-xs font-semibold outline-none transition-colors cursor-pointer text-slate-700 dark:text-slate-300 focus:border-emerald-500"
              >
                <option value="all">Todos los AM...</option>
                {profiles.filter((p) => p.role === "account_manager").map((am) => (
                  <option key={am.id} value={am.id}>{am.full_name}</option>
                ))}
              </select>
            )}

            {directorFilterType === "aliado" && (
              <select
                value={selectedAllyId}
                onChange={(e) => setSelectedAllyId(e.target.value)}
                className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl py-1.5 px-3 text-xs font-semibold outline-none transition-colors cursor-pointer text-slate-700 dark:text-slate-300 focus:border-emerald-500"
              >
                <option value="all">Todos los aliados...</option>
                {profiles.filter((p) => p.role === "aliado").map((ally) => (
                  <option key={ally.id} value={ally.id}>{ally.full_name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {/* Filtro por modalidad de aprobación — recalcula todos los KPIs (Director y AM) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-indigo-500/10">
            <Filter className="h-4 w-4" strokeWidth={2.2} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-white">Modalidad de aprobación</h4>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Recalcula el embudo y los indicadores por modalidad (M40 / M10).</p>
          </div>
        </div>
        <ModalidadFilter value={modalidadFilter} onChange={setModalidadFilter} />
      </div>

      {/* Sales Funnel Section */}
      <SalesFunnel prospects={filteredByDate} />

      {/* Account Manager Performance Comparative Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
            {isAM ? "Mis Indicadores de Eficiencia" : "Indicadores de Gestión — Account Managers"}
          </span>
          <SortControl options={sortOptions} sort={sort} accent={accent as any} />
        </div>

        {visibleRows.length === 0 ? (
          <div className="py-16 text-center space-y-3 bg-white dark:bg-slate-900">
            <div className="h-11 w-11 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mx-auto">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Sin datos de rendimiento</h4>
              <p className="text-xs text-slate-450 dark:text-slate-500 mt-1 max-w-[280px] mx-auto">
                No hay asesores asignados ni prospectos registrados bajo el filtro actual.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/60 dark:bg-slate-900/30 border-b border-slate-150 dark:border-slate-800 text-left">
                  <SortHeader col="name" label="Account Manager / Entidad" sort={sort} align="left" className="pl-4" />
                  <SortHeader col="aliados" label="Aliados" sort={sort} align="center" />
                  <SortHeader col="clientes" label="Proyectos" sort={sort} align="center" />
                  <SortHeader col="evaluados" label="Eval." sort={sort} align="center" />
                  <SortHeader col="aprobados" label="Aprob." sort={sort} align="center" />
                  <SortHeader col="condicionados" label="Condic." sort={sort} align="center" />
                  <SortHeader col="rechazados" label="Rechaz." sort={sort} align="center" />
                  <SortHeader col="finAprobados" label="Fin. Aprob." sort={sort} align="right" />
                  <SortHeader col="finOtorgados" label="Fin. Otorg." sort={sort} align="right" />
                  <SortHeader col="tasaEvaluacion" label="T. Eval." sort={sort} align="center" />
                  <SortHeader col="tasaAprobacion" label="T. Aprob." sort={sort} align="center" />
                  <SortHeader col="tasaCierre" label="T. Cierre" sort={sort} align="center" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {visibleRows.map((row) => {
                  if (row.type === "role-group") {
                    return (
                      <tr key={row.id} className="bg-slate-50 dark:bg-slate-950/30">
                        <td
                          colSpan={12}
                          className="px-4 py-1.5 text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.1em]"
                          style={{ paddingLeft: `${row.level * 1.25}rem` }}
                        >
                          {row.name}
                        </td>
                      </tr>
                    );
                  }

                  const actionText = getActionButtonText(row);
                  const isLevel1 = row.level === 1;

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-slate-50/60 dark:hover:bg-slate-850/20 transition-colors group ${
                        isLevel1 ? "bg-slate-50/40 dark:bg-slate-900/40" : ""
                      }`}
                    >
                      <td
                        className="py-2.5 pr-3 select-none cursor-pointer"
                        onClick={() => row.hasChildren && toggleRow(row.id)}
                        style={{ paddingLeft: `${0.75 + (row.level - 1) * 1.1}rem` }}
                      >
                        <div className="flex items-center gap-1.5">
                          {row.hasChildren ? (
                            <span className="flex-shrink-0 text-slate-400 dark:text-slate-500">
                              {row.isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </span>
                          ) : (
                            <span className="w-3.5 h-3.5 flex-shrink-0" />
                          )}

                          <div className="flex flex-col min-w-0">
                            <span className={`truncate ${isLevel1 ? "text-slate-900 dark:text-white font-bold" : "text-slate-700 dark:text-slate-300 font-medium"}`}>
                              {row.name}
                            </span>
                            {row.subLabel && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{row.subLabel}</span>
                            )}
                          </div>

                          {row.hasChildren && actionText && (
                            <span
                              onClick={(e) => { e.stopPropagation(); toggleRow(row.id); }}
                              className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[9px] text-slate-500 dark:text-slate-400 font-semibold transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                            >
                              {actionText}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap tabular-nums font-medium text-slate-500 dark:text-slate-400">
                        {row.alliesCount !== undefined ? row.alliesCount : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap tabular-nums font-semibold text-slate-800 dark:text-slate-200">{row.clientes}</td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap tabular-nums text-slate-500 dark:text-slate-400">{row.evaluados}</td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{row.aprobados}</td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap tabular-nums text-amber-600 dark:text-amber-400">{row.condicionados}</td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap tabular-nums text-rose-500 dark:text-rose-400">{row.rechazados}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums font-semibold text-indigo-600 dark:text-indigo-400">{formatCurrency(row.finAprobados)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(row.finOtorgados)}</td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        <span className="tabular-nums font-semibold text-slate-500 dark:text-slate-400">{row.tasaEvaluacion.toFixed(0)}%</span>
                      </td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        <span className="tabular-nums font-semibold text-slate-500 dark:text-slate-400">{row.tasaAprobacion.toFixed(0)}%</span>
                      </td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums ${
                          row.tasaCierre >= 50
                            ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
                            : row.tasaCierre > 0
                              ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                        }`}>
                          {row.tasaCierre.toFixed(0)}%
                        </span>
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
  );
}

export default function PipelineManager() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-450">Cargando consola...</div>}>
      <PipelineManagerContent />
    </Suspense>
  );
}
