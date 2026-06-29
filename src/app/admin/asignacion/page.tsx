"use client";

import React, { useState } from "react";
import { useApp } from "@/utils/context/AppContext";
import {
  Users,
  UserCheck,
  UserX,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Check,
  X,
  Shield,
  Briefcase,
  Save,
} from "lucide-react";

export default function AsignacionAliados() {
  const {
    profiles,
    prospects,
    user,
    updateProfileAdmin,
    changeAllyType,
    assignAllyToLider,
    triggerPushNotification,
    empresasMultialiado,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState<"all" | "assigned" | "unassigned">("all");
  const [selectedAMFilter, setSelectedAMFilter] = useState<string>("all");
  
  // Loading states for individual rows
  const [updatingRow, setUpdatingRow] = useState<string | null>(null);
  const [successRow, setSuccessRow] = useState<string | null>(null);

  // Local state for tracking unsaved leader-type changes and group name inputs per row
  const [rowTypes, setRowTypes] = useState<Record<string, "aliado" | "lider">>({});
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});
  
  // State for multiple leader selection dropdown
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  const isAM = user?.role === "account_manager";
  const isDirector = user?.role === "director";

  // Filter profiles based on access: AMs only see allies/leaders managed by them
  const allies = profiles.filter(
    (p) => p.role === "aliado" && (!isAM || p.account_manager_id === user?.id)
  );
  
  const accountManagers = profiles.filter((p) => p.role === "account_manager");
  
  // Dynamic list of active leaders for assignment dropdown (under this AM, or all if Director)
  const activeLeaders = profiles.filter(
    (p) => p.role === "aliado" && p.aliado_tipo === "lider" && (!isAM || p.account_manager_id === user?.id)
  );

  // Handle immediate database update when changing account manager (Directors only)
  const handleSelectAM = async (allyId: string, value: string) => {
    setUpdatingRow(allyId);
    setSuccessRow(null);
    try {
      const selectedAMId = value === "" ? null : value;
      await updateProfileAdmin(allyId, { account_manager_id: selectedAMId });
      
      const ally = allies.find((a) => a.id === allyId);
      const am = accountManagers.find((m) => m.id === selectedAMId);
      
      if (ally) {
        const msg = selectedAMId 
          ? `💼 Asignación Comercial: El aliado ${ally.full_name} ha sido asignado al Account Manager ${am?.full_name || "Desconocido"}.`
          : `⚠️ Aliado Desasignado: El aliado ${ally.full_name} ha sido retirado de su Account Manager y queda en espera en la mesa del Director.`;
        
        triggerPushNotification(msg, "whatsapp", ally.full_name);
      }

      setSuccessRow(allyId);
      setTimeout(() => setSuccessRow(null), 3000);
    } catch (e) {
      console.error(e);
      alert("Error al guardar la asignación del Account Manager");
    } finally {
      setUpdatingRow(null);
    }
  };

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
    const nextTipo = rowTypes[allyId] || "aliado";
    const nextEmpresaId = groupNames[allyId] || "";

    if (nextTipo === "lider" && !nextEmpresaId.trim()) {
      alert("Seleccionar una empresa es obligatorio para tipo 'Líder'");
      return;
    }

    setUpdatingRow(allyId);
    setSuccessRow(null);
    try {
      await changeAllyType(allyId, nextTipo, nextTipo === "lider" ? nextEmpresaId : undefined);
      
      setSuccessRow(allyId);
      setTimeout(() => setSuccessRow(null), 3000);

      // Clear row local edit state
      const newTypes = { ...rowTypes };
      delete newTypes[allyId];
      setRowTypes(newTypes);

      const newGroups = { ...groupNames };
      delete newGroups[allyId];
      setGroupNames(newGroups);
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
    })
    .filter((a) => {
      const isAssigned = a.account_manager_id !== null && a.account_manager_id !== undefined;
      if (assignmentFilter === "assigned") return isAssigned;
      if (assignmentFilter === "unassigned") return !isAssigned;
      return true;
    })
    .filter((a) => {
      if (selectedAMFilter === "all") return true;
      return a.account_manager_id === selectedAMFilter;
    });

  // Stats
  const totalAllies = allies.length;
  const assignedCount = allies.filter((a) => {
    return a.account_manager_id !== null && a.account_manager_id !== undefined;
  }).length;
  const unassignedCount = totalAllies - assignedCount;
  
  // Account Managers list workload filtering
  const visibleAMs = isAM ? accountManagers.filter(am => am.id === user?.id) : accountManagers;
  const totalAMs = visibleAMs.length;

  return (
    <div className="space-y-8 max-w-[1700px] mx-auto animate-fade-in pb-12 text-slate-800 dark:text-slate-100">
      
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-850 pb-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Asignación de Aliados</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {isAM 
              ? "Gestiona tu cartera de aliados, desígnalos como líderes o asígnales un líder de grupo."
              : "Asigna aliados comerciales a sus respectivos Account Managers y gestiona la estructura de liderazgo de grupos."}
          </p>
        </div>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between h-28 relative overflow-hidden transition-colors">
          <div className="absolute right-[-10px] top-[-10px] bg-emerald-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Mis Aliados</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-800 dark:text-white">{totalAllies}</span>
            <span className="text-[10px] text-slate-505 dark:text-slate-400 font-bold">
              Total asignado
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between h-28 relative overflow-hidden transition-colors">
          <div className="absolute right-[-10px] top-[-10px] bg-amber-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Sin Supervisor</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-amber-600 dark:text-amber-500">{unassignedCount}</span>
            <span className="text-[9px] bg-amber-50 dark:bg-amber-955/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-bold">
              En mesa Director
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between h-28 relative overflow-hidden transition-colors">
          <div className="absolute right-[-10px] top-[-10px] bg-emerald-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Bajo mi supervisión</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-emerald-600 dark:text-emerald-500">{assignedCount}</span>
            <span className="text-[9px] bg-emerald-50 dark:bg-emerald-955/30 text-emerald-650 dark:text-emerald-450 px-2 py-0.5 rounded-full font-bold">
              Bajo Gestión AM
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between h-28 relative overflow-hidden transition-colors">
          <div className="absolute right-[-10px] top-[-10px] bg-indigo-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Líderes de Grupo</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-indigo-650 dark:text-indigo-400">{activeLeaders.length}</span>
            <span className="text-[9px] bg-indigo-50 dark:bg-indigo-950/30 text-indigo-650 dark:text-indigo-400 px-2 py-0.5 rounded-full font-bold">
              Líderes Activos
            </span>
          </div>
        </div>
      </div>

      {/* Allocation Tip banner */}
      <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/15 dark:border-emerald-500/10 rounded-3xl p-6 relative overflow-hidden">
        <div className="absolute top-[-20px] right-[-20px] h-32 w-32 bg-emerald-500/5 rounded-full blur-2xl" />
        <span className="text-[8px] font-extrabold text-emerald-600 dark:text-emerald-450 uppercase tracking-widest block">Asignación en Tiempo Real</span>
        <h4 className="text-sm font-black text-slate-800 dark:text-white tracking-tight mt-1">Flujo Automatizado</h4>
        <p className="text-[11px] text-slate-555 dark:text-slate-450 mt-3 leading-relaxed font-semibold">
          Al seleccionar un Account Manager o un Líder de Grupo, la asignación se actualizará y guardará inmediatamente. Se enviará automáticamente una notificación al aliado comercial correspondiente.
        </p>
      </div>

      {/* Cartera de Supervisores Section */}
      <div className="space-y-4">
        <div>
          <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider block">Cartera de Supervisores</span>
          <span className="text-xs font-bold text-slate-650 dark:text-slate-400 block mt-0.5">Distribución de aliados comerciales asignados por Account Manager.</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {totalAMs === 0 ? (
            <div className="col-span-full text-center py-8 border border-dashed border-slate-200 dark:border-slate-850 rounded-2xl text-slate-450 text-xs">
              No hay Account Managers a mostrar.
            </div>
          ) : (
            visibleAMs.map((am) => {
              // Calculate using current DB assigned state to avoid premature UI change on sidebar
              const assignedAllies = profiles.filter((a) => a.role === "aliado" && a.account_manager_id === am.id);
              const totalProspects = assignedAllies.reduce((sum, a) => sum + getProspectCount(a.id), 0);

              return (
                <div key={am.id} className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl transition-colors shadow-sm flex flex-col justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-650 dark:text-indigo-400 flex items-center justify-center text-[10px] font-black border border-indigo-250/25 shrink-0">
                      {am.full_name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">{am.full_name}</span>
                      <span className="text-[9px] text-slate-400 font-semibold block uppercase truncate">
                        {am.email}
                      </span>
                    </div>
                  </div>

                  {/* Workload Stats */}
                  <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-200/50 dark:border-slate-850">
                    <div className="text-center p-2 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-150 dark:border-slate-850">
                      <span className="block text-[8px] text-slate-450 dark:text-slate-500 font-extrabold uppercase">Aliados</span>
                      <span className="block text-sm font-black text-indigo-650 dark:text-indigo-400 mt-1">
                        {assignedAllies.length}
                      </span>
                    </div>
                    <div className="text-center p-2 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-150 dark:border-slate-850">
                      <span className="block text-[8px] text-slate-450 dark:text-slate-500 font-extrabold uppercase">Clientes</span>
                      <span className="block text-sm font-black text-emerald-600 dark:text-emerald-400 mt-1">
                        {totalProspects}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="space-y-6">
        
        {/* Full Width Area: Ally List & Assignment matrix */}
        <div className="w-full space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
            
            {/* Search and Filters Bar */}
            <div className="p-6 bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-850 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-widest block">Matriz de Asignaciones</span>
                  <span className="text-xs font-bold text-slate-655 dark:text-slate-400 mt-1 block">Asigna supervisores a cada aliado comercial. Los cambios requieren confirmación manual.</span>
                </div>
                
                <div className="relative w-full sm:w-64">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Search className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nombre, correo o celular..."
                    className="pl-9 pr-4 py-2 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold outline-none focus:border-emerald-500 dark:focus:border-emerald-600 transition-colors shadow-sm text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                {/* Segmented Controller for Assignment State */}
                <div className="bg-slate-200/55 dark:bg-slate-900 p-1 rounded-xl flex border border-slate-250/70 dark:border-slate-800 shadow-inner w-full sm:w-auto">
                  <button
                    onClick={() => setAssignmentFilter("all")}
                    className={`flex-1 sm:flex-none px-3.5 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                      assignmentFilter === "all" ? "bg-white dark:bg-slate-850 text-slate-800 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-850"
                    }`}
                  >
                    Todos ({totalAllies})
                  </button>
                  <button
                    onClick={() => setAssignmentFilter("unassigned")}
                    className={`flex-1 sm:flex-none px-3.5 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                      assignmentFilter === "unassigned" ? "bg-white dark:bg-slate-850 text-slate-800 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-850"
                    }`}
                  >
                    Sin Supervisor ({unassignedCount})
                  </button>
                  <button
                    onClick={() => setAssignmentFilter("assigned")}
                    className={`flex-1 sm:flex-none px-3.5 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                      assignmentFilter === "assigned" ? "bg-white dark:bg-slate-850 text-slate-800 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-850"
                    }`}
                  >
                    Supervisados ({assignedCount})
                  </button>
                </div>

                {/* Filter by Specific AM (Only useful for Directors) */}
                {!isAM && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 dark:text-slate-550 font-bold text-[10px] uppercase">Account Manager:</span>
                    <select
                      value={selectedAMFilter}
                      onChange={(e) => setSelectedAMFilter(e.target.value)}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-705 dark:text-slate-300 outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                    >
                      <option value="all">Todos los AM</option>
                      {accountManagers.map((am) => (
                        <option key={am.id} value={am.id}>{am.full_name}</option>
                      ))}
                    </select>
                  </div>
                )}
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
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 dark:bg-slate-950/20 border-b border-slate-150 dark:border-slate-850 text-[10px] font-bold text-slate-550 uppercase tracking-widest text-left">
                      <th className="px-5 py-4">Aliado Comercial</th>
                      <th className="px-5 py-4">Contacto</th>
                      <th className="px-5 py-4 text-center">Prospectos</th>
                      <th className="px-5 py-4">Supervisor AM</th>
                      <th className="px-5 py-4">Tipo de Aliado</th>
                      <th className="px-5 py-4">Asignar a Líder</th>
                      <th className="px-5 py-4 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 dark:divide-slate-850">
                    {filteredAllies.map((a) => {
                      const currentSelectedVal = a.account_manager_id || "";
                      const isAssignedNow = currentSelectedVal !== "";
                      const currentProspects = getProspectCount(a.id);
                      const isUpdating = updatingRow === a.id;
                      const isSuccess = successRow === a.id;

                      // Edit state for type
                      const currentTipo = rowTypes[a.id] !== undefined ? rowTypes[a.id] : (a.aliado_tipo || "aliado");
                      const currentEmpresaId = groupNames[a.id] !== undefined ? groupNames[a.id] : (a.empresa_multialiado_id || "");
                      const hasTypeChanged = currentTipo !== (a.aliado_tipo || "aliado") || (currentTipo === "lider" && currentEmpresaId !== (a.empresa_multialiado_id || ""));

                      return (
                        <tr key={a.id} className="hover:bg-slate-50/45 dark:hover:bg-slate-850/10 transition-colors text-xs">
                          {/* 1. Ally Info */}
                          <td className="px-5 py-4 whitespace-nowrap">
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
                                    <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-955 text-blue-700 dark:text-blue-400 text-[8px] font-black rounded-full uppercase tracking-wider">
                                      LÍDER
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-450 dark:text-slate-500 block mt-0.5 leading-none">
                                  Registrado: {new Date(a.created_at).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 2. Contact details */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            <span className="font-semibold text-slate-650 dark:text-slate-300 block">{a.email}</span>
                            <span className="text-[10px] text-slate-450 block mt-0.5">{a.phone || "Sin Celular"}</span>
                          </td>

                          {/* 3. Prospects count */}
                          <td className="px-5 py-4 whitespace-nowrap text-center">
                            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-655 dark:text-slate-300 text-[10px] font-bold rounded-full">
                              {currentProspects}
                            </span>
                          </td>

                          {/* 4. Assign Account Manager */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            {isAM ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-800 text-slate-505 dark:text-slate-400 rounded-xl font-bold">
                                👤 {accountManagers.find(m => m.id === currentSelectedVal)?.full_name || "Sin Supervisor"}
                              </span>
                            ) : (
                              <select
                                value={currentSelectedVal}
                                onChange={(e) => handleSelectAM(a.id, e.target.value)}
                                disabled={isUpdating}
                                className={`font-semibold rounded-xl px-2 py-1.5 border outline-none bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-350 focus:border-emerald-500 transition-all cursor-pointer ${
                                  isAssignedNow
                                    ? "border-emerald-200/50 bg-emerald-50/10 text-slate-705 dark:text-slate-200" 
                                    : "border-amber-250/50 bg-amber-50/10 text-amber-705 dark:text-amber-400"
                                }`}
                              >
                                <option value="" className="text-slate-500 dark:bg-slate-900">⚠️ Sin AM (Director)</option>
                                {accountManagers.map((am) => (
                                  <option key={am.id} value={am.id} className="text-slate-800 dark:bg-slate-900">
                                    👤 {am.full_name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>

                          {/* 5. Tipo de Aliado */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
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
                              
                              {currentTipo === "lider" && (
                                <div className="flex items-center gap-1 mt-1">
                                  <select
                                    value={currentEmpresaId}
                                    onChange={(e) => {
                                      setGroupNames({ ...groupNames, [a.id]: e.target.value });
                                    }}
                                    className={`w-28 px-1.5 py-0.5 text-[10px] rounded-lg border outline-none bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 ${
                                      !currentEmpresaId
                                        ? "border-red-500 focus:border-red-650"
                                        : "border-slate-200 dark:border-slate-800 focus:border-blue-500"
                                    }`}
                                  >
                                    <option value="" className="text-slate-500">Selecciona Empresa</option>
                                    {empresasMultialiado.map((emp) => (
                                      <option key={emp.id} value={emp.id} className="text-slate-805 dark:text-slate-100">
                                        {emp.nombre}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              {a.aliado_tipo === "lider" && currentTipo === "lider" && !hasTypeChanged && (
                                <span className="text-[9px] text-slate-400 dark:text-slate-500 block leading-tight px-1 mt-0.5">
                                  Empresa: <strong className="text-blue-550 dark:text-blue-400">{a.lider_grupo}</strong>
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 6. Asignar a Líder */}
                          <td className="px-5 py-4 whitespace-nowrap relative">
                            {currentTipo === "lider" ? (
                              <span className="text-[10px] text-slate-400 italic block py-1.5">No aplica para Líderes</span>
                            ) : (
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setOpenDropdownId(openDropdownId === a.id ? null : a.id)}
                                  disabled={isUpdating || !a.account_manager_id}
                                  className={`w-full text-left font-semibold rounded-xl px-3 py-1.5 border outline-none flex justify-between items-center transition-all cursor-pointer ${
                                    !a.account_manager_id 
                                      ? "opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500"
                                      : (a.lider_ids && a.lider_ids.length > 0)
                                        ? "border-indigo-200/50 bg-indigo-50/10 text-indigo-705 dark:text-indigo-400"
                                        : "border-slate-200/50 bg-slate-50/10 text-slate-500"
                                  }`}
                                  title={!a.account_manager_id ? "Asigna primero un Account Manager a este aliado" : ""}
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
                                        {activeLeaders
                                          .filter(l => !isAM || l.account_manager_id === a.account_manager_id)
                                          .length === 0 ? (
                                            <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 text-center">
                                              No hay líderes disponibles
                                            </div>
                                          ) : (
                                          activeLeaders
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

                          {/* 7. Action Status / Save trigger */}
                          <td className="px-5 py-4 whitespace-nowrap text-center text-xs font-bold">
                            {isUpdating ? (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1">
                                <span className="h-3 w-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                                Guardando...
                              </span>
                            ) : hasTypeChanged ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => handleSaveType(a.id)}
                                  className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                                  title="Guardar tipo"
                                >
                                  <Save className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleCancelTypeEdit(a.id)}
                                  className="p-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-350 rounded-lg transition-colors"
                                  title="Cancelar"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : isSuccess ? (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1 animate-pulse">
                                <CheckCircle className="h-3.5 w-3.5" />
                                Guardado
                              </span>
                            ) : a.lider_id ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] bg-indigo-50 dark:bg-indigo-950/20 text-indigo-650 dark:text-indigo-400 border border-indigo-150 dark:border-indigo-900">
                                <Shield className="h-2.5 w-2.5" /> Líder: {activeLeaders.find(l => l.id === a.lider_id)?.lider_grupo || "Grupo"}
                              </span>
                            ) : isAssignedNow ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900">
                                <UserCheck className="h-3 w-3" /> Supervisado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] bg-amber-50 dark:bg-amber-955/20 text-amber-600 dark:text-amber-450 border border-amber-100 dark:border-amber-900">
                                <Clock className="h-3 w-3" /> Director
                              </span>
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
