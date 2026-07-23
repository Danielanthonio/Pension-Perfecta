"use client";

import React, { useState } from "react";
import { useApp, UserProfile } from "@/utils/context/AppContext";
import { StatCard } from "@/components/ui/StatCard";
import { useSortable, SortControl, SortHeader } from "@/components/ui/sorting";
import {
  Users,
  UserX,
  Search,
  CheckCircle,
  Shield,
  Save,
} from "lucide-react";

export default function AsignacionAliados() {
  const {
    profiles,
    prospects,
    user,
    changeAllyType,
    assignAllyToLider,
    empresasMultialiado,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState("");

  // Loading states for individual rows
  const [updatingRow, setUpdatingRow] = useState<string | null>(null);
  const [successRow, setSuccessRow] = useState<string | null>(null);

  // Local state for tracking unsaved leader-type changes and group name inputs per row
  const [rowTypes, setRowTypes] = useState<Record<string, "aliado" | "lider">>({});
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});
  const [rowHasCompany, setRowHasCompany] = useState<Record<string, boolean>>({});
  
  // State for multiple leader selection dropdown
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  const isAM = user?.role === "account_manager";

  // Filter profiles based on access: AMs only see allies/leaders managed by them
  const allies = profiles.filter(
    (p) => p.role === "aliado" && (!isAM || p.account_manager_id === user?.id)
  );

  // Dynamic list of active leaders for assignment dropdown (under this AM, or all if Director)
  const activeLeaders = profiles.filter(
    (p) => p.role === "aliado" && p.aliado_tipo === "lider" && (!isAM || p.account_manager_id === user?.id)
  );

  // Handle immediate leader assignment for normal allies
  const handleToggleLider = async (allyId: string, currentLiderIds: string[], clickedLiderId: string) => {
    setUpdatingRow(allyId);
    setSuccessRow(null);
    try {
      let newLiderIds: string[];
      if (currentLiderIds.includes(clickedLiderId)) {
        newLiderIds = currentLiderIds.filter(id => id !== clickedLiderId);
      } else {
        newLiderIds = [...currentLiderIds, clickedLiderId];
      }
      await assignAllyToLider(allyId, newLiderIds);
      
      setSuccessRow(allyId);
      setTimeout(() => setSuccessRow(null), 3000);
    } catch (e) {
      console.error(e);
      alert("Error al guardar la asignación del Líder");
    } finally {
      setUpdatingRow(null);
    }
  };

  // Handle saving the Ally Type and Group Name
  const handleSaveType = async (allyId: string) => {
    const ally = allies.find(al => al.id === allyId);
    if (!ally) return;

    const nextHasCompany = rowHasCompany[allyId] !== undefined
      ? rowHasCompany[allyId]
      : !!ally.empresa_multialiado_id;

    const nextTipo = rowTypes[allyId] !== undefined
      ? rowTypes[allyId]
      : (ally.aliado_tipo || "aliado");

    const nextEmpresaId = groupNames[allyId] !== undefined
      ? groupNames[allyId]
      : (ally.empresa_multialiado_id || "");

    if (nextHasCompany && !nextEmpresaId.trim()) {
      alert("Seleccionar una empresa es obligatorio si pertenece a una empresa.");
      return;
    }

    setUpdatingRow(allyId);
    setSuccessRow(null);
    try {
      const targetTipo = nextHasCompany ? nextTipo : "aliado";
      const targetEmpresaId = nextHasCompany ? nextEmpresaId : null;

      await changeAllyType(allyId, targetTipo, targetEmpresaId);
      
      setSuccessRow(allyId);
      setTimeout(() => setSuccessRow(null), 3000);

      // Clear row local edit state
      const newTypes = { ...rowTypes };
      delete newTypes[allyId];
      setRowTypes(newTypes);

      const newGroups = { ...groupNames };
      delete newGroups[allyId];
      setGroupNames(newGroups);

      const newHasCompany = { ...rowHasCompany };
      delete newHasCompany[allyId];
      setRowHasCompany(newHasCompany);
    } catch (e) {
      console.error(e);
      // Keep state on failure so they don't lose typed text
    } finally {
      setUpdatingRow(null);
    }
  };

  // Cancel pending type edits
  const handleCancelTypeEdit = (allyId: string) => {
    const newTypes = { ...rowTypes };
    delete newTypes[allyId];
    setRowTypes(newTypes);

    const newGroups = { ...groupNames };
    delete newGroups[allyId];
    setGroupNames(newGroups);

    const newHasCompany = { ...rowHasCompany };
    delete newHasCompany[allyId];
    setRowHasCompany(newHasCompany);
  };

  // Helper to count active prospects of an ally
  const getProspectCount = (allyId: string) => {
    return prospects.filter((p) => p.aliado_id === allyId).length;
  };

  // Filters
  const filteredAllies = allies
    .filter((a) => {
      const term = searchTerm.toLowerCase();
      return (
        a.full_name.toLowerCase().includes(term) ||
        a.email.toLowerCase().includes(term) ||
        (a.phone && a.phone.toLowerCase().includes(term))
      );
    });

  const sortAsig = useSortable<UserProfile>(
    filteredAllies,
    {
      nombre: (a) => a.full_name,
      prospectos: (a) => getProspectCount(a.id),
      registro: (a) => a.created_at || "",
    },
    "nombre",
    "asc"
  );
  const sortOptionsAsig = [
    { id: "nombre", label: "Nombre" },
    { id: "prospectos", label: "Prospectos" },
    { id: "registro", label: "Registro" },
  ];

  // Stats
  const totalAllies = allies.length;

  return (
    <div className="space-y-8 max-w-[1700px] mx-auto animate-fade-in pb-12 text-slate-800 dark:text-slate-100">
      
      {/* Stats Cards Grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Aliados" value={totalAllies} sub="Total" tone="slate" icon={Users} />
        <StatCard label="Líderes de Grupo" value={activeLeaders.length} sub="Líderes activos" tone="indigo" icon={Shield} />
      </div>

      {/* Main Content Layout */}
      <div className="space-y-6">
        
        {/* Full Width Area: Ally List & Assignment matrix */}
        <div className="w-full space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
            
            {/* Search and Filters Bar */}
            <div className="px-4 py-3 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-850 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Asignación Multialiado</span>

                <div className="relative w-full sm:w-64">
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                    <Search className="h-3.5 w-3.5" />
                  </span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nombre, correo o celular..."
                    className="pl-8 pr-3 py-1.5 w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-lg text-xs font-semibold outline-none focus:border-emerald-500 transition-colors text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3">
                <SortControl options={sortOptionsAsig} sort={sortAsig} accent="emerald" />
              </div>
            </div>

            {/* Allies Assignment Table */}
            {filteredAllies.length === 0 ? (
              <div className="py-20 text-center space-y-3">
                <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-850 flex items-center justify-center text-slate-400 mx-auto">
                  <UserX className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">No se encontraron aliados</h4>
                  <p className="text-xs text-slate-400 mt-1">Modifica los filtros de búsqueda o registra nuevos aliados.</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/60 dark:bg-slate-950/20 border-b border-slate-150 dark:border-slate-850 text-left">
                      <SortHeader col="nombre" label="Aliado Comercial" sort={sortAsig} className="pl-5" />
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">Empresa</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">Rol</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">Asignar a Líder</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">Líder Asignado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                    {sortAsig.sorted.map((a) => {
                      const currentProspects = getProspectCount(a.id);
                      const isUpdating = updatingRow === a.id;
                      const isSuccess = successRow === a.id;

                      // Edit state for type & company belonging
                      const currentHasCompany = rowHasCompany[a.id] !== undefined ? rowHasCompany[a.id] : !!a.empresa_multialiado_id;
                      const currentTipo = rowTypes[a.id] !== undefined ? rowTypes[a.id] : (a.aliado_tipo || "aliado");
                      const currentEmpresaId = groupNames[a.id] !== undefined ? groupNames[a.id] : (a.empresa_multialiado_id || "");

                      const dbHasCompany = !!a.empresa_multialiado_id;
                      const dbEmpresaId = a.empresa_multialiado_id || "";
                      const dbTipo = a.aliado_tipo || "aliado";

                      const hasTypeChanged = 
                        currentHasCompany !== dbHasCompany ||
                        currentEmpresaId !== dbEmpresaId ||
                        currentTipo !== dbTipo;

                      // Filter leaders of the SAME company
                      const leadersOfSameCompany = activeLeaders.filter(
                        (l) => l.empresa_multialiado_id === currentEmpresaId
                      );

                      return (
                        <tr key={a.id} className="hover:bg-slate-50/45 dark:hover:bg-slate-850/10 transition-colors text-xs">
                          {/* 1. Ally Info */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className={`h-9 w-9 rounded-xl flex items-center justify-center text-xs font-black border ${
                                a.aliado_tipo === "lider"
                                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-250/20"
                                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-250/20"
                              }`}>
                                {a.full_name.charAt(0)}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-extrabold text-slate-800 dark:text-slate-200 block leading-tight">{a.full_name}</span>
                                  {a.aliado_tipo === "lider" && (
                                    <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 text-[8px] font-black rounded-full uppercase tracking-wider">
                                      LÍDER
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-450 dark:text-slate-500 block mt-0.5 leading-none">
                                  Reg. {new Date(a.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })} · <span className="font-semibold text-slate-500 dark:text-slate-400 tabular-nums">{currentProspects} prosp.</span>
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Empresa (incluye "Sin empresa") */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <select
                              value={currentHasCompany ? currentEmpresaId : ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === "") {
                                  setRowHasCompany({ ...rowHasCompany, [a.id]: false });
                                  setGroupNames({ ...groupNames, [a.id]: "" });
                                  setRowTypes({ ...rowTypes, [a.id]: "aliado" });
                                } else {
                                  setRowHasCompany({ ...rowHasCompany, [a.id]: true });
                                  setGroupNames({ ...groupNames, [a.id]: val });
                                }
                              }}
                              disabled={isUpdating}
                              className="font-semibold rounded-lg px-2 py-1 border border-slate-200 dark:border-slate-800 outline-none bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-350 focus:border-blue-500 cursor-pointer"
                            >
                              <option value="">Sin empresa</option>
                              {empresasMultialiado.map((emp) => (
                                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                              ))}
                            </select>
                          </td>

                          {/* Rol en Empresa */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {!currentHasCompany ? (
                              <span className="text-[10px] text-slate-400 italic block py-1.5">No aplica</span>
                            ) : (
                              <select
                                value={currentTipo}
                                onChange={(e) => {
                                  setRowTypes({ ...rowTypes, [a.id]: e.target.value as any });
                                }}
                                disabled={isUpdating}
                                className="font-bold rounded-xl px-2.5 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 focus:border-blue-500 cursor-pointer"
                              >
                                <option value="aliado">Aliado</option>
                                <option value="lider">Líder</option>
                              </select>
                            )}
                          </td>

                          {/* 8. Asignar a Líder */}
                          <td className="px-3 py-2.5 whitespace-nowrap relative">
                            {(!currentHasCompany || currentTipo === "lider") ? (
                              <span className="text-[10px] text-slate-400 italic block py-1.5">No aplica</span>
                            ) : (
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setOpenDropdownId(openDropdownId === a.id ? null : a.id)}
                                  disabled={isUpdating}
                                  className={`w-full text-left font-semibold rounded-xl px-3 py-1.5 border outline-none flex justify-between items-center transition-all cursor-pointer ${
                                    (a.lider_ids && a.lider_ids.length > 0)
                                      ? "border-indigo-200/50 bg-indigo-50/10 text-indigo-700 dark:text-indigo-400"
                                      : "border-slate-200/50 bg-slate-50/10 text-slate-500"
                                  }`}
                                >
                                  <span className="truncate max-w-[150px]">
                                    {(a.lider_ids && a.lider_ids.length > 0) 
                                      ? `👥 ${a.lider_ids.length} Líder${a.lider_ids.length > 1 ? 'es' : ''} asignado${a.lider_ids.length > 1 ? 's' : ''}` 
                                      : "👥 Sin asignar a Líder"}
                                  </span>
                                  <span className="ml-2 text-xs">▼</span>
                                </button>
                                
                                {openDropdownId === a.id && (
                                  <>
                                    <div 
                                      className="fixed inset-0 z-10" 
                                      onClick={() => setOpenDropdownId(null)}
                                    />
                                    <div className="absolute z-20 mt-2 w-64 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl shadow-xl overflow-hidden left-0 max-h-64 overflow-y-auto">
                                      <div className="p-2 space-y-1">
                                        {leadersOfSameCompany
                                          .filter(l => !isAM || l.account_manager_id === a.account_manager_id)
                                          .length === 0 ? (
                                            <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 text-center">
                                              No hay líderes disponibles en esta empresa
                                            </div>
                                          ) : (
                                          leadersOfSameCompany
                                            .filter(l => !isAM || l.account_manager_id === a.account_manager_id)
                                            .map((l) => {
                                              const isSelected = a.lider_ids?.includes(l.id) || false;
                                              return (
                                                <button
                                                  key={l.id}
                                                  type="button"
                                                  onClick={() => handleToggleLider(a.id, a.lider_ids || [], l.id)}
                                                  className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center justify-between ${
                                                    isSelected 
                                                      ? "bg-blue-500 text-white font-bold" 
                                                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                                                  }`}
                                                >
                                                  <span className="truncate">
                                                    {isSelected && <span className="mr-1.5">✓</span>}
                                                    {l.full_name} <span className={`text-[10px] ${isSelected ? "text-blue-100" : "text-slate-400 dark:text-slate-500"}`}>({l.lider_grupo || "Sin Grupo"})</span>
                                                  </span>
                                                </button>
                                              );
                                            })
                                        )}
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </td>

                          {/* 9. Líder Asignado & Save triggers */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {isUpdating ? (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1 font-bold">
                                <span className="h-3 w-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                                Guardando...
                              </span>
                            ) : hasTypeChanged ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => handleSaveType(a.id)}
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-[10px] font-extrabold flex items-center gap-1"
                                >
                                  <Save className="h-3 w-3" /> Guardar
                                </button>
                                <button
                                  onClick={() => handleCancelTypeEdit(a.id)}
                                  className="px-2 py-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-350 rounded-lg transition-colors text-[10px] font-extrabold"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : isSuccess ? (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1 font-bold animate-pulse">
                                <CheckCircle className="h-3.5 w-3.5" />
                                Guardado
                              </span>
                            ) : (!currentHasCompany || currentTipo === "lider") ? (
                              <span className="text-[10px] text-slate-400 italic block py-1.5 text-center">No aplica</span>
                            ) : (
                              <div className="flex flex-wrap gap-1 justify-start">
                                {(() => {
                                  const assignedLeaders = activeLeaders.filter(l => a.lider_ids?.includes(l.id));
                                  if (assignedLeaders.length > 0) {
                                    return assignedLeaders.map(l => (
                                      <span key={l.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-extrabold bg-indigo-50 dark:bg-indigo-950/30 text-indigo-650 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40">
                                        👤 {l.full_name}
                                      </span>
                                    ));
                                  } else {
                                    return <span className="text-[10px] text-slate-400 italic">Ningún líder asignado</span>;
                                  }
                                })()}
                              </div>
                            )}
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
      </div>
    </div>
  );
}
