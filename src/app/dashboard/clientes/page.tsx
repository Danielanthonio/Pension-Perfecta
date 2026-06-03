"use client";

import React, { useState } from "react";
import { useApp, Prospect } from "@/utils/context/AppContext";
import SalesFunnel from "@/components/SalesFunnel";
import {
  Search,
  SlidersHorizontal,
  ChevronRight,
  User,
  AlertCircle,
  FileCheck,
  CheckCircle,
  ArrowUpDown,
  FileText,
  Calendar,
} from "lucide-react";
import Link from "next/link";

export default function MisClientes() {
  const { prospects } = useApp();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "name">("recent");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Format Date Helper
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const getStatusBadge = (status: Prospect["status"]) => {
    switch (status) {
      case "evaluacion_pendiente":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-100">
            En Evaluación
          </span>
        );
      case "rechazado":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-600 border border-red-100">
            Rechazado
          </span>
        );
      case "aprobado_listo":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">
            Listo para Presentar
          </span>
        );
      case "asesoria_agendada":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-600 border border-purple-100">
            Asesoría Agendada
          </span>
        );
      case "doc_proceso":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100">
            En Trámite (M40)
          </span>
        );
      case "analisis_riesgo":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-50 text-cyan-600 border border-cyan-100">
            Análisis de Riesgo
          </span>
        );
      case "firma_programada":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
            Firma Programada
          </span>
        );
      case "pagado_comision":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 border border-amber-500/25">
            ★ Comisión Liberada
          </span>
        );
      default:
        return null;
    }
  };

  // 0. Filter by date first
  const filteredByDate = prospects.filter((p) => {
    if (!p.created_at) return true;
    const createdDate = new Date(p.created_at).getTime();
    
    if (startDate) {
      const start = new Date(startDate + "T00:00:00").getTime();
      if (createdDate < start) return false;
    }
    
    if (endDate) {
      const end = new Date(endDate + "T23:59:59").getTime();
      if (createdDate > end) return false;
    }
    
    return true;
  });

  // 1. Text Search Filter (FullName, NSS, CURP)
  const filteredSearch = filteredByDate.filter((p) => {
    const term = searchTerm.toLowerCase();
    return (
      p.full_name.toLowerCase().includes(term) ||
      p.nss.includes(term) ||
      p.curp.toLowerCase().includes(term)
    );
  });

  // 2. Status Grouping Filter
  const filteredStatus = filteredSearch.filter((p) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "evaluacion") return p.status === "evaluacion_pendiente";
    if (statusFilter === "listo") return p.status === "aprobado_listo";
    if (statusFilter === "rechazado") return p.status === "rechazado";
    if (statusFilter === "activos") {
      return [
        "asesoria_agendada",
        "doc_proceso",
        "analisis_riesgo",
        "firma_programada",
        "pagado_comision",
      ].includes(p.status);
    }
    return true;
  });

  // 3. Sorting list
  const sortedProspects = [...filteredStatus].sort((a, b) => {
    if (sortBy === "recent") {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    if (sortBy === "oldest") {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    if (sortBy === "name") {
      return a.full_name.localeCompare(b.full_name);
    }
    return 0;
  });

  return (
    <div className="max-w-[1700px] mx-auto space-y-6 select-none animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Expedientes de Prospectos</h1>
          <p className="text-slate-500 text-sm mt-1">Busca, filtra y audita el historial de todos tus clientes registrados.</p>
        </div>
      </div>

      {/* Date Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex flex-col sm:flex-row items-center justify-between gap-4 select-none">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-indigo-500 flex-shrink-0" />
          <div>
            <h4 className="text-xs font-bold text-slate-800">Filtrar por Fecha</h4>
            <p className="text-[10px] text-slate-400 mt-0.5">Filtra el embudo y listado por fecha de registro.</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 flex-1 sm:flex-none">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Desde:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-indigo-500 transition-all w-full sm:w-auto"
            />
          </div>
          <div className="flex items-center gap-2 flex-1 sm:flex-none">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Hasta:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-indigo-500 transition-all w-full sm:w-auto"
            />
          </div>
          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Embudo comercial */}
      <SalesFunnel prospects={filteredByDate} />

      {/* Query Search Matrix bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex flex-col md:flex-row gap-4 items-center">
        {/* Text Search Input */}
        <div className="relative w-full md:flex-1">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="h-4.5 w-4.5" />
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por Nombre, NSS o CURP..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-blue-500 transition-all"
          />
        </div>

        {/* Status Dropdown */}
        <div className="w-full md:w-44 flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold outline-none focus:border-blue-500 transition-colors"
          >
            <option value="all">Todos los Estados</option>
            <option value="evaluacion">En Evaluación</option>
            <option value="listo">Listo para Presentar</option>
            <option value="activos">Proyectos Activos</option>
            <option value="rechazado">Rechazados</option>
          </select>
        </div>

        {/* Sorting Dropdown */}
        <div className="w-full md:w-44 flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold outline-none focus:border-blue-500 transition-colors"
          >
            <option value="recent">Más recientes</option>
            <option value="oldest">Más antiguos</option>
            <option value="name">Nombre A-Z</option>
          </select>
        </div>
      </div>

      {/* Main Results Table container */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        {sortedProspects.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-700">Sin resultados coincidentes</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-[280px] mx-auto">Prueba ajustando los términos de búsqueda o los filtros aplicados en las pestañas.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-150 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-left">
                  <th className="px-6 py-4.5 w-1/3">Cliente</th>
                  <th className="px-6 py-4.5">NSS / CURP</th>
                  <th className="px-6 py-4.5">Fecha de Subida</th>
                  <th className="px-6 py-4.5">Estado</th>
                  <th className="px-6 py-4.5 relative"><span className="sr-only">Expediente</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedProspects.map((p) => {
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/40 transition-colors group cursor-pointer"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="h-8.5 w-8.5 rounded-xl bg-slate-100 group-hover:bg-blue-50/50 group-hover:text-blue-500 text-slate-500 flex items-center justify-center text-xs font-bold border border-slate-200 transition-colors">
                            {p.full_name.charAt(0)}
                          </div>
                          <div>
                            <span className="block text-xs font-extrabold text-slate-800 leading-tight group-hover:text-blue-600 transition-colors">
                              {p.full_name}
                            </span>
                            <span className="block text-[10px] text-slate-400 mt-0.5 leading-none">
                              Contacto: {p.phone}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <span className="block text-[11px] font-semibold text-slate-600 leading-tight">
                            NSS: {p.nss}
                          </span>
                          <span className="block text-[9px] text-slate-400 font-medium mt-0.5 uppercase tracking-wide leading-none">
                            CURP: {p.curp}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-500">
                        {formatDate(p.created_at)}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(p.status)}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <Link
                          href={`/prospectos/${p.id}`}
                          className="inline-flex p-1.5 bg-slate-100/60 hover:bg-blue-50 text-slate-400 hover:text-blue-500 rounded-xl transition-all border border-slate-200 group-hover:scale-105"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
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
