"use client";

import React, { useState } from "react";
import { useApp, EmpresaMultialiado } from "@/utils/context/AppContext";
import { useSortable, SortControl, SortHeader } from "@/components/ui/sorting";
import {
  Building2,
  Plus,
  Edit3,
  Trash2,
  AlertCircle,
  X,
  Check,
  Search,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

export default function EmpresasMultialiadoPage() {
  const {
    user,
    profiles,
    empresasMultialiado,
    createEmpresa,
    updateEmpresa,
    deleteEmpresa,
    dbError,
  } = useApp();

  const isAM = user?.role === "account_manager";
  const isDirector = user?.role === "director";
  const hasAccess = isAM || isDirector;

  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  // Expanded empresa rows (to reveal member leaders/allies)
  const [expandedEmpresas, setExpandedEmpresas] = useState<Record<string, boolean>>({});
  const toggleEmpresa = (id: string) => setExpandedEmpresas((prev) => ({ ...prev, [id]: !prev[id] }));
  const getEmpresaMembers = (empresaId: string) => {
    const members = (profiles || []).filter((p) => p.role === "aliado" && p.empresa_multialiado_id === empresaId);
    return {
      lideres: members.filter((m) => m.aliado_tipo === "lider"),
      aliados: members.filter((m) => m.aliado_tipo !== "lider"),
    };
  };

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedEmpresa, setSelectedEmpresa] = useState<EmpresaMultialiado | null>(null);
  
  // Form states
  const [nombre, setNombre] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<EmpresaMultialiado | null>(null);

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="h-16 w-16 rounded-full bg-rose-50 dark:bg-rose-950/20 flex items-center justify-center text-rose-500 mb-4 border border-rose-100 dark:border-rose-900/30">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">No Autorizado</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 max-w-md">
          Solo los Account Managers y Directores de Administración tienen acceso a esta sección.
        </p>
      </div>
    );
  }

  // Handle open create
  const handleOpenCreateModal = () => {
    setModalMode("create");
    setSelectedEmpresa(null);
    setNombre("");
    setErrorMsg("");
    setSuccessMsg("");
    setIsModalOpen(true);
  };

  // Handle open edit
  const handleOpenEditModal = (empresa: EmpresaMultialiado) => {
    setModalMode("edit");
    setSelectedEmpresa(empresa);
    setNombre(empresa.nombre);
    setErrorMsg("");
    setSuccessMsg("");
    setIsModalOpen(true);
  };

  // Submit create or edit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setErrorMsg("El nombre de la empresa es obligatorio.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      if (modalMode === "create") {
        await createEmpresa(nombre.trim());
        setSuccessMsg("Empresa creada exitosamente.");
        setTimeout(() => setIsModalOpen(false), 1500);
      } else if (modalMode === "edit" && selectedEmpresa) {
        await updateEmpresa(selectedEmpresa.id, nombre.trim());
        setSuccessMsg("Empresa actualizada exitosamente.");
        setTimeout(() => setIsModalOpen(false), 1500);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Ocurrió un error al guardar la empresa.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deleteTarget) return;

    if ((deleteTarget.lideres_count || 0) > 0) {
      setErrorMsg("No se puede eliminar una empresa con líderes asignados.");
      setDeleteTarget(null);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      await deleteEmpresa(deleteTarget.id);
      setSuccessMsg("Empresa eliminada exitosamente.");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Error al eliminar la empresa.");
    } finally {
      setIsSubmitting(false);
      setDeleteTarget(null);
    }
  };

  // Filter list
  const filteredEmpresas = (empresasMultialiado || []).filter((e) =>
    e.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortE = useSortable<EmpresaMultialiado>(
    filteredEmpresas,
    {
      nombre: (e) => e.nombre,
      lideres: (e) => e.lideres_count || 0,
      fecha: (e) => e.created_at || "",
    },
    "nombre",
    "asc"
  );
  const sortOptionsEmpresas = [
    { id: "nombre", label: "Nombre" },
    { id: "lideres", label: "Líderes" },
    { id: "fecha", label: "Fecha creación" },
  ];

  return (
    <div className="space-y-8 max-w-[1700px] mx-auto animate-fade-in pb-12 text-slate-800 dark:text-slate-100">
      {/* Top Header */}
      <div className="flex items-center justify-end">
        <button
          onClick={handleOpenCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-500/20 transition-all hover:-translate-y-0.5 active:scale-95"
        >
          <Plus className="h-4 w-4" />
          Crear Nueva Empresa
        </button>
      </div>

      {/* Database Error Warning */}
      {dbError && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-250 dark:border-rose-800/40 text-rose-800 dark:text-rose-300 p-4 rounded-2xl text-xs flex items-center gap-3 animate-fade-in max-w-4xl shadow-md shadow-rose-500/5">
          <AlertCircle className="h-5 w-5 text-rose-500 dark:text-rose-400 shrink-0" />
          <div>
            <span className="font-extrabold block mb-0.5">Fallo de Comunicación con Base de Datos</span>
            <p className="font-medium opacity-90">{dbError}</p>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {successMsg && (
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-250 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300 p-4 rounded-2xl text-xs flex items-center gap-3 animate-fade-in max-w-4xl">
          <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <span className="font-bold">{successMsg}</span>
        </div>
      )}

      {/* Error Notification */}
      {errorMsg && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-250 dark:border-rose-800/40 text-rose-800 dark:text-rose-350 p-4 rounded-2xl text-xs flex items-center gap-3 animate-fade-in max-w-4xl">
          <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-450" />
          <span className="font-bold">{errorMsg}</span>
        </div>
      )}

      {/* Main Table Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm overflow-hidden">
        {/* Search Header */}
        <div className="px-4 py-3 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Listado de Empresas</span>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative w-full sm:w-56">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                <Search className="h-4 w-4" />
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar empresa..."
                className="pl-9 pr-4 py-2 w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl text-xs font-semibold outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition-colors shadow-sm dark:text-slate-200"
              />
            </div>
            <SortControl options={sortOptionsEmpresas} sort={sortE} accent="emerald" />
          </div>
        </div>

        {/* Table representation */}
        {filteredEmpresas.length === 0 ? (
          <div className="py-20 text-center space-y-3 bg-white dark:bg-slate-900">
            <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mx-auto">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">No se encontraron empresas</h4>
              <p className="text-xs text-slate-450 dark:text-slate-500 mt-1">Crea una nueva empresa o modifica tu búsqueda.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/60 dark:bg-slate-900/30 border-b border-slate-150 dark:border-slate-800 text-left">
                  <SortHeader col="nombre" label="Nombre" sort={sortE} className="pl-5" />
                  <SortHeader col="lideres" label="Líderes Asignados" sort={sortE} align="center" />
                  <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">Creada Por</th>
                  <SortHeader col="fecha" label="Fecha de Creación" sort={sortE} />
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {sortE.sorted.map((empresa) => {
                  const mem = getEmpresaMembers(empresa.id);
                  const memberCount = mem.lideres.length + mem.aliados.length;
                  const isOpen = !!expandedEmpresas[empresa.id];
                  return (
                  <React.Fragment key={empresa.id}>
                  <tr className={`hover:bg-slate-50/40 dark:hover:bg-slate-850/20 transition-colors ${isOpen ? "bg-slate-50/60 dark:bg-slate-900/40" : ""}`}>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleEmpresa(empresa.id)}
                        className="flex items-center gap-2 group"
                        title={memberCount > 0 ? "Ver líderes y aliados" : "Sin integrantes"}
                      >
                        <span className="text-slate-400 dark:text-slate-500">
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </span>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {empresa.nombre}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums">· {memberCount}</span>
                      </button>
                    </td>

                    <td className="px-4 py-2.5 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-full text-xs font-bold ${
                        (empresa.lideres_count || 0) > 0
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800/40"
                          : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                      }`}>
                        {empresa.lideres_count || 0}
                      </span>
                    </td>

                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                        {empresa.created_by || "Sistema"}
                      </span>
                    </td>

                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-450">
                        {new Date(empresa.created_at).toLocaleDateString("es-MX", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </td>

                    <td className="px-4 py-2.5 whitespace-nowrap text-right text-xs">
                      <div className="flex items-center justify-end gap-2">
                        {/* Edit Button */}
                        <button
                          onClick={() => handleOpenEditModal(empresa)}
                          className="p-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 dark:border-emerald-800/60 rounded-lg transition-colors border border-emerald-200 dark:border-emerald-850"
                          title="Editar Nombre"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => setDeleteTarget(empresa)}
                          disabled={(empresa.lideres_count || 0) > 0}
                          className={`p-1.5 rounded-lg transition-colors border ${
                            (empresa.lideres_count || 0) > 0
                              ? "bg-slate-50 text-slate-300 border-slate-150 dark:bg-slate-850 dark:text-slate-700 dark:border-slate-800 cursor-not-allowed opacity-50"
                              : "bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-900/30 text-rose-500 dark:text-rose-400 dark:border-rose-800/60 border-rose-200 dark:border-rose-850"
                          }`}
                          title={
                            (empresa.lideres_count || 0) > 0
                              ? "No se puede eliminar: tiene líderes asociados"
                              : "Eliminar Empresa"
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-slate-50/40 dark:bg-slate-950/30">
                      <td colSpan={5} className="px-4 pb-3 pt-1">
                        <div className="pl-6 space-y-2">
                          {memberCount === 0 ? (
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">Esta empresa aún no tiene integrantes asignados.</p>
                          ) : (
                            <>
                              {mem.lideres.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mr-1">Líderes</span>
                                  {mem.lideres.map((l) => (
                                    <span key={l.id} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900/40">
                                      <span className="h-4 w-4 rounded bg-blue-500/15 text-blue-600 dark:text-blue-300 flex items-center justify-center text-[8px] font-bold">{l.full_name.charAt(0)}</span>
                                      {l.full_name}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {mem.aliados.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mr-1">Aliados</span>
                                  {mem.aliados.map((a) => (
                                    <span key={a.id} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                      <span className="h-4 w-4 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 flex items-center justify-center text-[8px] font-bold">{a.full_name.charAt(0)}</span>
                                      {a.full_name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
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
        )}
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden transform transition-all animate-scale-up">
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest">
                {modalMode === "create" ? "Crear Empresa" : "Editar Empresa"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-350 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {errorMsg && (
                <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-250 dark:border-rose-800/40 text-rose-850 dark:text-rose-300 p-3 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                  <span className="font-semibold">{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-250 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-350 p-3 rounded-xl text-xs flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold">{successMsg}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider block">
                  Nombre de la Empresa
                </label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Apoyamax"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 focus:border-emerald-500 dark:focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-850 rounded-xl text-xs font-semibold outline-none transition-all shadow-sm text-slate-800 dark:text-slate-200"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 mt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !nombre.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-650 hover:from-emerald-700 hover:to-teal-700 dark:from-emerald-500 dark:to-teal-500 disabled:opacity-50 transition-all shadow-md shadow-emerald-500/10"
                >
                  {isSubmitting ? "Guardando..." : "Guardar Empresa"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 text-center transform transition-all animate-scale-up">
            <div className="h-12 w-12 rounded-full bg-rose-50 dark:bg-rose-950/20 flex items-center justify-center text-rose-500 mx-auto mb-4 border border-rose-100 dark:border-rose-900/30">
              <Trash2 className="h-6 w-6" />
            </div>
            <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-200">
              ¿Eliminar empresa?
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-2">
              Esta acción eliminará permanentemente la empresa <strong>{deleteTarget.nombre}</strong>. Esta acción no se puede deshacer.
            </p>
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
              >
                No, cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-550 hover:bg-rose-600 dark:bg-rose-500 dark:hover:bg-rose-600 transition-colors shadow-md shadow-rose-500/10"
              >
                {isSubmitting ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
