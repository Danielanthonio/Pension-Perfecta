"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  useApp,
  Prospect,
  getStageAndSubStage,
  UserProfile,
} from "@/utils/context/AppContext";
import SalesFunnel from "@/components/SalesFunnel";
import {
  Users,
  TrendingUp,
  Briefcase,
  Calendar,
  Sparkles,
  PieChart,
  Target,
  CircleDollarSign,
  Heart,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

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

  const activeProspects = baseFilteredProspects.filter((p) => !isProspectDeleted(p) && !isProspectPurged(p));

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
          // Independent
          newExpanded[`${amRowId}-independientes`] = true;
        } else {
          // Company
          newExpanded[`${amRowId}-empresas`] = true;
          newExpanded[`${amRowId}-empresas-${selectedAlly.empresa_multialiado_id}`] = true;
        }
        setExpandedRows(newExpanded);
      }
    }
  }, [directorFilterType, selectedAMId, selectedAllyId, profiles, isAM, user]);

  interface EfficiencyTableRow {
    id: string;
    level: number;
    name: string;
    subLabel?: string;
    type: "am" | "category" | "company" | "role-group" | "ally";
    alliesCount?: number;
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
    hasChildren: boolean;
    isExpanded: boolean;
    parentId?: string;
  }

  // Calculate hierarchical visible rows
  const visibleRows = useMemo(() => {
    const rows: EfficiencyTableRow[] = [];

    const getStats = (prospectsList: Prospect[]) => {
      const totalClientes = prospectsList.length;
      const evaluados = totalClientes;
      const aprobados = prospectsList.filter((p) =>
        ["aprobado_listo", "asesoria_agendada", "firma_programada"].includes(p.status)
      ).length;
      const condicionados = prospectsList.filter((p) =>
        ["falta_reporte", "falta_afore", "pendiente_documentos", "falta_semanas", "falta_afore_cuenta", "posible_simulacion", "aportacion"].includes(p.status)
      ).length;
      const rechazados = prospectsList.filter((p) =>
        ["rechazado", "cerrado_perdido"].includes(p.status)
      ).length;

      const approvedStatuses = [
        "aprobado_listo",
        "aportacion",
        "asesoria_agendada",
        "doc_proceso",
        "analisis_riesgo",
        "firma_programada",
        "pagado_comision",
      ];
      const finAprobados = prospectsList
        .filter((p) => approvedStatuses.includes(p.status) && p.simulation)
        .reduce((sum, p) => sum + (p.simulation?.totalCredito || p.simulation?.financiamiento || 0), 0);

      const finOtorgados = prospectsList
        .filter((p) => p.status === "pagado_comision" && p.simulation)
        .reduce((sum, p) => sum + (p.simulation?.totalCredito || p.simulation?.financiamiento || 0), 0);

      const tasaEvaluacion = totalClientes > 0 ? (evaluados / totalClientes) * 100 : 0;
      const tasaAprobacion = evaluados > 0 ? (aprobados / evaluados) * 100 : 0;
      const tasaCierre = aprobados > 0 ? (prospectsList.filter((p) => p.status === "pagado_comision").length / aprobados) * 100 : 0;

      return {
        clientes: totalClientes,
        evaluados,
        aprobados,
        condicionados,
        rechazados,
        finAprobados,
        finOtorgados,
        tasaEvaluacion,
        tasaAprobacion,
        tasaCierre,
      };
    };

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
        selectedAMs = amsList.map(am => ({ id: am.id, name: am.full_name }));
        const unassignedAllies = profiles.filter(p => p.role === "aliado" && p.is_active && !p.account_manager_id);
        const unassignedProspects = filteredByDate.filter(p => unassignedAllies.some(a => a.id === p.aliado_id));
        if (unassignedAllies.length > 0 || unassignedProspects.length > 0) {
          selectedAMs.push({ id: null, name: "Gestión Directa (Sin AM)" });
        }
      }
    }

    selectedAMs.forEach((am) => {
      const amRowId = `am-${am.id || "direct"}`;
      const amAllies = profiles.filter(
        (p) => p.role === "aliado" && p.is_active && (am.id ? p.account_manager_id === am.id : !p.account_manager_id)
      );
      const amAllyIds = amAllies.map((a) => a.id);
      const amProspects = filteredByDate.filter((p) => amAllyIds.includes(p.aliado_id));
      const amStats = getStats(amProspects);
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
            independentAllies.forEach((ally) => {
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
                    clientes: 0,
                    evaluados: 0,
                    aprobados: 0,
                    condicionados: 0,
                    rechazados: 0,
                    finAprobados: 0,
                    finOtorgados: 0,
                    tasaEvaluacion: 0,
                    tasaAprobacion: 0,
                    tasaCierre: 0,
                    hasChildren: false,
                    isExpanded: false,
                    parentId: companyRowId,
                  });

                  companyLeaders.forEach((leader) => {
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
                    clientes: 0,
                    evaluados: 0,
                    aprobados: 0,
                    condicionados: 0,
                    rechazados: 0,
                    finAprobados: 0,
                    finOtorgados: 0,
                    tasaEvaluacion: 0,
                    tasaAprobacion: 0,
                    tasaCierre: 0,
                    hasChildren: false,
                    isExpanded: false,
                    parentId: companyRowId,
                  });

                  companyAlliesOnly.forEach((ally) => {
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
  }, [amsList, profiles, filteredByDate, empresasMultialiado, expandedRows, user, isAM, directorFilterType, selectedAMId, selectedAllyId]);

  const toggleRow = (rowId: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [rowId]: !prev[rowId],
    }));
  };

  const getActionButtonText = (row: EfficiencyTableRow) => {
    if (row.type === "am") return row.isExpanded ? "Ocultar" : "Ver aliados";
    if (row.type === "category" && row.name === "Independientes") return row.isExpanded ? "Ocultar" : "Ver aliados";
    if (row.type === "category" && row.name === "Empresas") return row.isExpanded ? "Ocultar" : "Ver empresas";
    if (row.type === "company") return row.isExpanded ? "Ocultar" : "Ver detalle";
    return null;
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  const themeColorText = isAM ? "text-blue-500" : "text-emerald-500";

  return (
    <div className="space-y-8 max-w-[1700px] mx-auto animate-fade-in text-slate-800 dark:text-slate-100">
      
      {/* Director Pipeline Assignment Filters */}
      {!isAM && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 flex-shrink-0 text-emerald-500" />
            <div>
              <h4 className="text-xs font-bold text-slate-800 dark:text-white">Filtro de Asignación / Origen</h4>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Filtra todo el embudo y el comparativo por supervisor, aliado comercial o gestión directa.</p>
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
                Por Account Manager
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

      {/* Sales Funnel Section */}
      <SalesFunnel prospects={filteredByDate} />

      {/* Account Manager Performance Comparative Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">
            {isAM ? "Mis Indicadores de Eficiencia" : "Indicadores de Gestión de los Account Managers"}
          </span>
          <span className={`text-[10px] font-bold flex items-center gap-1 ${themeColorText}`}>
            <Sparkles className="h-3.5 w-3.5" />
            Comparativa de eficiencia en tiempo real
          </span>
        </div>

        {visibleRows.length === 0 ? (
          <div className="py-20 text-center space-y-3 bg-white dark:bg-slate-900">
            <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mx-auto">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Sin datos de rendimiento</h4>
              <p className="text-xs text-slate-450 dark:text-slate-500 mt-1 max-w-[280px] mx-auto">
                No hay asesores asignados ni prospectos registrados bajo el filtro actual.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-150 dark:border-slate-800 text-[9px] font-bold text-slate-550 dark:text-slate-450 uppercase tracking-widest text-left">
                  <th className="px-6 py-4">Account Manager / Entidad</th>
                  <th className="px-4 py-4 text-center">Aliados</th>
                  <th className="px-4 py-4 text-center">Clientes</th>
                  <th className="px-4 py-4 text-center">Evaluados</th>
                  <th className="px-4 py-4 text-center">Aprobados</th>
                  <th className="px-4 py-4 text-center">Condicionados</th>
                  <th className="px-4 py-4 text-center">Rechazados</th>
                  <th className="px-5 py-4 text-right">Fin. Aprobados</th>
                  <th className="px-5 py-4 text-right">Fin. Otorgados</th>
                  <th className="px-4 py-4 text-center">Tasa Eval.</th>
                  <th className="px-4 py-4 text-center">Tasa Aprob.</th>
                  <th className="px-4 py-4 text-center">Tasa Cierre</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 dark:divide-slate-800">
                {visibleRows.map((row) => {
                  if (row.type === "role-group") {
                    return (
                      <tr key={row.id} className="bg-slate-100/50 dark:bg-slate-950/20">
                        <td
                          colSpan={12}
                          className="px-6 py-2.5 text-[9px] font-black text-slate-450 dark:text-slate-550 uppercase tracking-widest"
                          style={{ paddingLeft: `${row.level * 1.5}rem` }}
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
                      className={`hover:bg-slate-50/40 dark:hover:bg-slate-850/10 transition-colors group ${
                        isLevel1 ? "bg-slate-50/20 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-800" : ""
                      }`}
                    >
                      <td
                        className={`py-4 pr-4 select-none cursor-pointer`}
                        onClick={() => row.hasChildren && toggleRow(row.id)}
                        style={{ paddingLeft: `${row.level * 1.5}rem` }}
                      >
                        <div className="flex items-center gap-2">
                          {row.hasChildren ? (
                            <span className="flex-shrink-0">
                              {row.isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300" />
                              )}
                            </span>
                          ) : (
                            <span className="w-4 h-4 flex-shrink-0" />
                          )}

                          <div className="flex flex-col">
                            <span className={`text-xs ${isLevel1 ? "text-slate-900 dark:text-white font-extrabold" : "text-slate-700 dark:text-slate-300 font-semibold"}`}>
                              {row.name}
                            </span>
                            {row.subLabel && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">
                                {row.subLabel}
                              </span>
                            )}
                          </div>

                          {row.hasChildren && actionText && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRow(row.id);
                              }}
                              className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[9px] text-slate-500 dark:text-slate-400 font-bold transition-all cursor-pointer border border-slate-200 dark:border-slate-700/80"
                            >
                              {actionText}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-350">
                        {row.alliesCount !== undefined ? row.alliesCount : "-"}
                      </td>
                      <td className="px-4 py-4 text-center whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-350">
                        {row.clientes}
                      </td>
                      <td className="px-4 py-4 text-center whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-350">
                        {row.evaluados}
                      </td>
                      <td className="px-4 py-4 text-center whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-350">
                        {row.aprobados}
                      </td>
                      <td className="px-4 py-4 text-center whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-350">
                        {row.condicionados}
                      </td>
                      <td className="px-4 py-4 text-center whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-350">
                        {row.rechazados}
                      </td>
                      <td className="px-5 py-4 text-right whitespace-nowrap text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                        {formatCurrency(row.finAprobados)}
                      </td>
                      <td className="px-5 py-4 text-right whitespace-nowrap text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(row.finOtorgados)}
                      </td>
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/20 text-blue-650 dark:text-blue-400 border border-blue-100">
                          {row.tasaEvaluacion.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 dark:bg-purple-950/20 text-purple-650 dark:text-purple-400 border border-purple-100">
                          {row.tasaAprobacion.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-650 dark:text-emerald-400 border border-emerald-100">
                          {row.tasaCierre.toFixed(1)}%
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
