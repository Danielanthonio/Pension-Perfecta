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
} from "lucide-react";

export default function AsignacionAliados() {
  const {
    profiles,
    prospects,
    updateProfileAdmin,
    triggerPushNotification,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState<"all" | "assigned" | "unassigned">("all");
  const [selectedAMFilter, setSelectedAMFilter] = useState<string>("all");
  
  // Local pending assignments: allyId -> selectedAMId (string | null)
  const [pendingAssignments, setPendingAssignments] = useState<Record<string, string | null>>({});

  // Loading states for individual rows
  const [updatingRow, setUpdatingRow] = useState<string | null>(null);
  const [successRow, setSuccessRow] = useState<string | null>(null);

  const allies = profiles.filter((p) => p.role === "aliado");
  const accountManagers = profiles.filter((p) => p.role === "account_manager");

  // Handle local change before database update
  const handleSelectAM = (allyId: string, value: string) => {
    const dbValue = allies.find((a) => a.id === allyId)?.account_manager_id || "";
    if (value === dbValue) {
      setPendingAssignments((prev) => {
        const next = { ...prev };
        delete next[allyId];
        return next;
      });
    } else {
      setPendingAssignments((prev) => ({
        ...prev,
        [allyId]: value === "" ? null : value,
      }));
    }
  };

  // Confirm pending assignment to DB
  const handleConfirmAssign = async (allyId: string) => {
    setUpdatingRow(allyId);
    setSuccessRow(null);
    try {
      const pendingAMId = pendingAssignments[allyId];
      await updateProfileAdmin(allyId, { account_manager_id: pendingAMId });
      
      const ally = allies.find((a) => a.id === allyId);
      const am = accountManagers.find((m) => m.id === pendingAMId);
      
      if (ally) {
        const msg = pendingAMId 
          ? `💼 Asignación Comercial: El aliado ${ally.full_name} ha sido asignado al Account Manager ${am?.full_name || "Desconocido"}.`
          : `⚠️ Aliado Desasignado: El aliado ${ally.full_name} ha sido retirado de su Account Manager y queda en espera en la mesa del Director.`;
        
        triggerPushNotification(msg, "whatsapp", ally.full_name);
      }
      
      // Clean from pending state
      setPendingAssignments((prev) => {
        const next = { ...prev };
        delete next[allyId];
        return next;
      });

      setSuccessRow(allyId);
      setTimeout(() => setSuccessRow(null), 3000);
    } catch (e) {
      console.error(e);
      alert("Error al guardar la asignación del Account Manager");
    } finally {
      setUpdatingRow(null);
    }
  };

  // Cancel/decline pending assignment and restore DB value
  const handleDeclineAssign = (allyId: string) => {
    setPendingAssignments((prev) => {
      const next = { ...prev };
      delete next[allyId];
      return next;
    });
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
      // Determine what the current value is (taking pending into account or database)
      const currentAMId = pendingAssignments[a.id] !== undefined ? pendingAssignments[a.id] : a.account_manager_id;
      const isAssigned = currentAMId !== null && currentAMId !== undefined;
      if (assignmentFilter === "assigned") return isAssigned;
      if (assignmentFilter === "unassigned") return !isAssigned;
      return true;
    })
    .filter((a) => {
      const currentAMId = pendingAssignments[a.id] !== undefined ? pendingAssignments[a.id] : a.account_manager_id;
      if (selectedAMFilter === "all") return true;
      return currentAMId === selectedAMFilter;
    });

  // Stats
  const totalAllies = allies.length;
  const assignedCount = allies.filter((a) => {
    const val = pendingAssignments[a.id] !== undefined ? pendingAssignments[a.id] : a.account_manager_id;
    return val !== null && val !== undefined;
  }).length;
  const unassignedCount = totalAllies - assignedCount;
  const totalAMs = accountManagers.length;

  return (
    <div className="space-y-8 max-w-[1700px] mx-auto animate-fade-in pb-12 text-slate-800 dark:text-slate-100">
      
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-850 pb-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Asignación de Aliados</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Asigna aliados comerciales a sus respectivos Account Managers. Confirma o declina los cambios manualmente antes de guardarlos.
          </p>
        </div>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between h-28 relative overflow-hidden transition-colors">
          <div className="absolute right-[-10px] top-[-10px] bg-emerald-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Aliados Comerciales</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-800 dark:text-white">{totalAllies}</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">
              Total en sistema
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between h-28 relative overflow-hidden transition-colors">
          <div className="absolute right-[-10px] top-[-10px] bg-amber-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Aliados Sin Asignar</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-amber-600 dark:text-amber-500">{unassignedCount}</span>
            <span className="text-[9px] bg-amber-50 dark:bg-amber-955/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-bold">
              Requieren Atención
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between h-28 relative overflow-hidden transition-colors">
          <div className="absolute right-[-10px] top-[-10px] bg-emerald-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Aliados Asignados</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-emerald-600 dark:text-emerald-500">{assignedCount}</span>
            <span className="text-[9px] bg-emerald-50 dark:bg-emerald-955/30 text-emerald-650 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold">
              Bajo Gestión de AM
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between h-28 relative overflow-hidden transition-colors">
          <div className="absolute right-[-10px] top-[-10px] bg-indigo-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Account Managers</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-indigo-650 dark:text-indigo-400">{totalAMs}</span>
            <span className="text-[9px] bg-indigo-50 dark:bg-indigo-950/30 text-indigo-650 dark:text-indigo-400 px-2 py-0.5 rounded-full font-bold">
              Supervisores
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Layout: Assignment Matrix + AM Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left Area (2/3 width): Ally List & Assignment dropdowns */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
            
            {/* Search and Filters Bar */}
            <div className="p-6 bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-850 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-widest block">Matriz de Asignaciones</span>
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-1 block">Asigna supervisores a cada aliado comercial. Los cambios requieren confirmación manual.</span>
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
                    Sin Asignar ({unassignedCount})
                  </button>
                  <button
                    onClick={() => setAssignmentFilter("assigned")}
                    className={`flex-1 sm:flex-none px-3.5 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                      assignmentFilter === "assigned" ? "bg-white dark:bg-slate-850 text-slate-800 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-850"
                    }`}
                  >
                    Asignados ({assignedCount})
                  </button>
                </div>

                {/* Filter by Specific AM */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 dark:text-slate-550 font-bold text-[10px] uppercase">Account Manager:</span>
                  <select
                    value={selectedAMFilter}
                    onChange={(e) => setSelectedAMFilter(e.target.value)}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                  >
                    <option value="all">Todos los AM</option>
                    {accountManagers.map((am) => (
                      <option key={am.id} value={am.id}>{am.full_name}</option>
                    ))}
                  </select>
                </div>
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
                      <th className="px-6 py-4">Aliado Comercial</th>
                      <th className="px-6 py-4">Información de Contacto</th>
                      <th className="px-6 py-4 text-center">Prospectos Activos</th>
                      <th className="px-6 py-4">Asignar Account Manager</th>
                      <th className="px-6 py-4 text-center">Estado / Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 dark:divide-slate-850">
                    {filteredAllies.map((a) => {
                      // Get pending choice if any, or fall back to DB value
                      const isPending = pendingAssignments[a.id] !== undefined;
                      const currentSelectedVal = isPending ? (pendingAssignments[a.id] || "") : (a.account_manager_id || "");
                      
                      const isAssignedInDB = a.account_manager_id !== null && a.account_manager_id !== undefined;
                      const isAssignedNow = currentSelectedVal !== "";
                      
                      const currentProspects = getProspectCount(a.id);
                      const isUpdating = updatingRow === a.id;
                      const isSuccess = successRow === a.id;

                      return (
                        <tr key={a.id} className="hover:bg-slate-50/45 dark:hover:bg-slate-850/10 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-black border border-emerald-250/25">
                                {a.full_name.charAt(0)}
                              </div>
                              <div>
                                <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 block leading-tight">{a.full_name}</span>
                                <span className="text-[10px] text-slate-450 dark:text-slate-500 block mt-0.5 leading-none">
                                  Registrado: {new Date(a.created_at).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-xs font-semibold text-slate-650 dark:text-slate-300 block">{a.email}</span>
                            <span className="text-[10px] text-slate-450 block mt-0.5">{a.phone || "Sin Celular"}</span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-650 dark:text-slate-300 text-[10px] font-bold rounded-full">
                              {currentProspects} {currentProspects === 1 ? "prospecto" : "prospectos"}
                            </span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            <select
                              value={currentSelectedVal}
                              onChange={(e) => handleSelectAM(a.id, e.target.value)}
                              disabled={isUpdating}
                              className={`text-xs font-semibold rounded-xl px-2.5 py-1.5 border outline-none bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-350 focus:border-emerald-500 transition-all cursor-pointer ${
                                isAssignedNow
                                  ? "border-emerald-200/50 bg-emerald-50/10 text-slate-705 dark:text-slate-200" 
                                  : "border-amber-250/50 bg-amber-50/10 text-amber-705 dark:text-amber-400"
                              }`}
                            >
                              <option value="" className="text-slate-500 dark:bg-slate-900">⚠️ Sin Asignar (Director)</option>
                              {accountManagers.map((am) => (
                                <option key={am.id} value={am.id} className="text-slate-850 dark:bg-slate-900">
                                  👤 {am.full_name}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center text-xs font-bold">
                            {isUpdating ? (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1">
                                <span className="h-3 w-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                                Guardando...
                              </span>
                            ) : isSuccess ? (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1 animate-pulse">
                                <CheckCircle className="h-3.5 w-3.5" />
                                Guardado
                              </span>
                            ) : isPending ? (
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleConfirmAssign(a.id)}
                                  className="p-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors shadow-sm active:scale-90"
                                  title="Confirmar asignación"
                                >
                                  <Check className="h-3.5 w-3.5 stroke-[3]" />
                                </button>
                                <button
                                  onClick={() => handleDeclineAssign(a.id)}
                                  className="p-1 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors shadow-sm active:scale-90"
                                  title="Declinar cambio"
                                >
                                  <X className="h-3.5 w-3.5 stroke-[3]" />
                                </button>
                              </div>
                            ) : isAssignedInDB ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900">
                                <UserCheck className="h-3 w-3" /> Asignado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] bg-amber-50 dark:bg-amber-955/20 text-amber-600 dark:text-amber-450 border border-amber-100 dark:border-amber-900">
                                <Clock className="h-3 w-3" /> En Espera
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

        {/* Right Area (1/3 width): AM Workload Overview */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4 transition-colors">
            <div>
              <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider block">Cartera de Supervisores</span>
              <span className="text-xs font-bold text-slate-650 dark:text-slate-400 block mt-0.5">Distribución de aliados comerciales asignados por Account Manager.</span>
            </div>

            <div className="space-y-3">
              {accountManagers.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-slate-200 dark:border-slate-850 rounded-2xl text-slate-450 text-xs">
                  No hay Account Managers registrados. Crea uno en la sección "Gestión de Usuarios".
                </div>
              ) : (
                accountManagers.map((am) => {
                  // Calculate using current DB assigned state to avoid premature UI change on sidebar
                  const assignedAllies = allies.filter((a) => a.account_manager_id === am.id);
                  const totalProspects = assignedAllies.reduce((sum, a) => sum + getProspectCount(a.id), 0);

                  return (
                    <div key={am.id} className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-2xl transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                           <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-650 dark:text-indigo-400 flex items-center justify-center text-[10px] font-black border border-indigo-250/25">
                            {am.full_name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">{am.full_name}</span>
                            <span className="text-[9px] text-slate-400 font-semibold block uppercase">
                              {am.email}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Workload Stats */}
                      <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-200/50 dark:border-slate-850">
                        <div className="text-center p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-150 dark:border-slate-850">
                          <span className="block text-[8px] text-slate-450 dark:text-slate-500 font-extrabold uppercase">Aliados</span>
                          <span className="block text-sm font-black text-indigo-650 dark:text-indigo-400 mt-1">
                            {assignedAllies.length}
                          </span>
                        </div>
                        <div className="text-center p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-150 dark:border-slate-850">
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

          {/* Allocation Tip banner */}
          <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/15 dark:border-emerald-500/10 rounded-3xl p-6 relative overflow-hidden">
            <div className="absolute top-[-20px] right-[-20px] h-32 w-32 bg-emerald-500/5 rounded-full blur-2xl" />
            <span className="text-[8px] font-extrabold text-emerald-600 dark:text-emerald-450 uppercase tracking-widest block">Confirmación Requerida</span>
            <h4 className="text-sm font-black text-slate-800 dark:text-white tracking-tight mt-1">Flujo No Automático</h4>
            <p className="text-[11px] text-slate-550 dark:text-slate-450 mt-3 leading-relaxed font-semibold">
              Al seleccionar un Account Manager para un aliado comercial, la asignación permanecerá pendiente. Debes confirmar presionando el botón <span className="text-emerald-600 font-extrabold">✓</span> o cancelarla con <span className="text-red-500 font-extrabold">✗</span>. Ningún cambio se guardará en la base de datos automáticamente.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
