"use client";

import React, { useState } from "react";
import { useApp } from "@/utils/context/AppContext";
import { useRouter } from "next/navigation";
import {
  Users,
  Key,
  Copy,
  Plus,
  ArrowRight,
  ShieldAlert,
  UserCheck,
  TrendingUp,
  Coins,
  CheckCircle,
  Clock,
  Sparkles,
  Search,
  Check,
  Eye,
} from "lucide-react";

export default function GestorAliados() {
  const {
    prospects,
    invitationCodes,
    generateInvitationCode,
    switchRole,
    triggerPushNotification,
  } = useApp();
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [newlyGeneratedCode, setNewlyGeneratedCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // High-fidelity allies catalogue
  const alliesList = [
    {
      id: "aliado-123",
      name: "Roberto Asesor",
      email: "roberto@asesores.com",
      phone: "5512345678",
      status: "Activo",
      avatarColor: "bg-indigo-500/10 text-indigo-600 border-indigo-200",
    },
    {
      id: "aliado-laura",
      name: "Laura Martínez",
      email: "laura@prevision.com",
      phone: "5588776655",
      status: "Activo",
      avatarColor: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    },
    {
      id: "aliado-juan",
      name: "Juan Carlos Previsor",
      email: "juan.carlos@pensiones.com",
      phone: "5577664422",
      status: "Inactivo",
      avatarColor: "bg-slate-500/10 text-slate-600 border-slate-200",
    },
  ];

  // Perform calculations for each ally based on active prospects state
  const getAllMetrics = (allyName: string) => {
    const allyProspects = prospects.filter(
      (p) => p.aliado_name?.toLowerCase() === allyName.toLowerCase()
    );

    const total = allyProspects.length;
    const pending = allyProspects.filter((p) => p.status === "evaluacion_pendiente").length;
    const ready = allyProspects.filter((p) => p.status === "aprobado_listo").length;
    const closed = allyProspects.filter((p) => p.status === "pagado_comision").length;
    const active = total - pending - ready - closed;

    const conversionRate = total > 0 ? Math.round((closed / total) * 100) : 0;
    
    // Hardcoded commission average per M40 closed case (e.g. $15,000 MXN)
    const commissionsReleased = closed * 15000;

    return {
      total,
      pending,
      ready,
      closed,
      active,
      conversionRate,
      commissionsReleased,
    };
  };

  const handleGenerateCode = async () => {
    setIsGenerating(true);
    try {
      const newCode = await generateInvitationCode();
      setNewlyGeneratedCode(newCode.code);
      triggerPushNotification(
        `🔑 Nuevo código de invitación creado: ${newCode.code}. Compártelo con tu nuevo aliado comercial para su registro.`,
        "email",
        "Eduardo Director"
      );
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleImpersonate = (allyName: string) => {
    // Switch state to Allied role and redirect
    switchRole("aliado");
    triggerPushNotification(
      `👤 Impersonación Activa: Ahora estás visualizando PensiónFlow con el perfil de ${allyName}.`,
      "whatsapp",
      "Roberto Asesor"
    );
    router.push("/dashboard");
  };

  // Filter allies by search query
  const filteredAllies = alliesList.filter(
    (a) =>
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Global aggregate stats
  const totalAlliesCount = alliesList.length;
  const activeAlliesCount = alliesList.filter((a) => a.status === "Activo").length;
  const totalClosedCommissionCount = prospects.filter((p) => p.status === "pagado_comision").length;
  const totalCommissionsPool = totalClosedCommissionCount * 15000;
  const unusedCodesCount = invitationCodes.filter((c) => !c.is_used).length;

  return (
    <div className="space-y-8 select-none max-w-6xl mx-auto animate-fade-in pb-12">
      {/* Upper description header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Fuerza Comercial B2B</h1>
          <p className="text-slate-500 text-sm mt-1">
            Supervisa el rendimiento de tu red de asesores, genera códigos de invitación y audita el pipeline de prospección.
          </p>
        </div>
        <button
          onClick={handleGenerateCode}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 px-5 py-3 border border-transparent text-xs font-bold rounded-2xl shadow-md text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 transition-all transform hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
        >
          <Key className="h-4.5 w-4.5" />
          {isGenerating ? "Generando..." : "Generar Código Invitación"}
        </button>
      </div>

      {/* Aggregate metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between h-28 relative overflow-hidden">
          <div className="absolute right-[-10px] top-[-10px] bg-indigo-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Asesores Activos</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-800">
              {activeAlliesCount} <span className="text-sm font-semibold text-slate-400">/ {totalAlliesCount}</span>
            </span>
            <span className="text-[9px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-bold">Ventas Activas</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between h-28 relative overflow-hidden">
          <div className="absolute right-[-10px] top-[-10px] bg-emerald-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Comisiones Dispersadas</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-600">${totalCommissionsPool.toLocaleString()}</span>
            <span className="text-[9px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-bold">Éxito Comercial</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between h-28 relative overflow-hidden">
          <div className="absolute right-[-10px] top-[-10px] bg-amber-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Prospectos Totales</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-800">{prospects.length}</span>
            <span className="text-[9px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-bold">En Pipeline</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between h-28 relative overflow-hidden">
          <div className="absolute right-[-10px] top-[-10px] bg-cyan-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Códigos Disponibles</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-cyan-600">{unusedCodesCount}</span>
            <span className="text-[9px] bg-cyan-50 text-cyan-600 px-2 py-0.5 rounded-full font-bold">Registros Libres</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Side: Allies List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
            {/* Table search filter header */}
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block">Asesores Registrados</span>
                <span className="text-xs font-bold text-slate-600 mt-1 block">Monitorea y realiza auditorías de visualización en vivo.</span>
              </div>
              <div className="relative max-w-xs">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar aliado comercial..."
                  className="pl-9 pr-4 py-2 w-full bg-white hover:bg-slate-100/50 focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            {/* Allies responsive table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-150 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-left">
                    <th className="px-6 py-4">Asesor</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4 text-center">Prospectos</th>
                    <th className="px-6 py-4 text-center">Comisiones</th>
                    <th className="px-6 py-4 text-center">Conversión</th>
                    <th className="px-6 py-4 relative"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150">
                  {filteredAllies.map((ally) => {
                    const metrics = getAllMetrics(ally.name);
                    return (
                      <tr key={ally.id} className="hover:bg-slate-50/40 transition-colors group">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className={`h-10 w-10 rounded-2xl flex items-center justify-center text-sm font-black border transition-all ${ally.avatarColor}`}>
                              {ally.name.charAt(0)}
                            </div>
                            <div>
                              <span className="text-xs font-extrabold text-slate-800 block">{ally.name}</span>
                              <span className="text-[10px] text-slate-400 block mt-0.5">{ally.email}</span>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                              ally.status === "Activo"
                                ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                : "bg-slate-50 text-slate-400 border-slate-150"
                            }`}
                          >
                            {ally.status}
                          </span>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div>
                            <span className="text-xs font-extrabold text-slate-700">{metrics.total}</span>
                            <span className="block text-[9px] text-slate-400 font-semibold mt-0.5">
                              {metrics.pending} eval • {metrics.active} act
                            </span>
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="text-xs font-black text-emerald-600">
                            ${metrics.commissionsReleased.toLocaleString()}
                          </span>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="inline-flex flex-col items-center">
                            <span className="text-xs font-extrabold text-indigo-600">{metrics.conversionRate}%</span>
                            <div className="w-12 bg-slate-100 h-1.5 rounded-full mt-1 overflow-hidden border border-slate-200">
                              <div
                                className="bg-indigo-500 h-full rounded-full"
                                style={{ width: `${metrics.conversionRate}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <button
                            onClick={() => handleImpersonate(ally.name)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 border border-indigo-100 hover:border-indigo-200 text-[10px] font-bold text-indigo-600 bg-indigo-50/50 hover:bg-indigo-50 rounded-xl transition-all active:scale-95 transform"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Ver como
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Side: Invitation Codes */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden p-6">
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-2">
              <Key className="h-4.5 w-4.5 text-indigo-500" />
              Códigos de Invitación B2B
            </h3>
            <p className="text-slate-500 text-xs leading-normal">
              Comparte estos códigos de seguridad de un solo uso para registrar nuevos asesores en la plataforma.
            </p>

            {/* In-Line Generated Alert Container */}
            {newlyGeneratedCode && (
              <div className="mt-5 p-4 bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl animate-pulse-once relative">
                <span className="absolute -top-2.5 -right-1.5 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                </span>
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" /> Nuevo Código Creado
                </span>
                <div className="mt-2.5 flex items-center justify-between bg-white border border-indigo-200 rounded-xl p-2.5 shadow-sm">
                  <code className="text-slate-800 font-extrabold text-sm select-all tracking-wide">
                    {newlyGeneratedCode}
                  </code>
                  <button
                    onClick={() => handleCopyCode(newlyGeneratedCode)}
                    className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 rounded-lg transition-all"
                    title="Copiar Código"
                  >
                    {copiedCode === newlyGeneratedCode ? (
                      <Check className="h-4 w-4 text-emerald-500 animate-scale-up" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 font-medium mt-2 leading-none">
                  * Código válido para un único registro comercial.
                </p>
              </div>
            )}

            {/* Log list of active/used invitation codes */}
            <div className="mt-6 space-y-3 max-h-96 overflow-y-auto">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block">
                Historial de Invitaciones
              </span>
              {invitationCodes.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                  Aún no has generado ningún código de invitación.
                </div>
              ) : (
                invitationCodes.map((code) => {
                  return (
                    <div
                      key={code.id}
                      className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100/50 rounded-2xl border border-slate-200 transition-colors"
                    >
                      <div className="space-y-1">
                        <code className="text-xs font-bold text-slate-700 select-all">{code.code}</code>
                        <span className="block text-[9px] text-slate-400 font-medium">
                          Creado el: {new Date(code.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[8px] font-bold border ${
                            code.is_used
                              ? "bg-slate-100 text-slate-400 border-slate-200"
                              : "bg-cyan-50 text-cyan-600 border-cyan-100 animate-pulse"
                          }`}
                        >
                          {code.is_used ? "Utilizado" : "Disponible"}
                        </span>
                        {!code.is_used && (
                          <button
                            onClick={() => handleCopyCode(code.code)}
                            className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-700 transition-colors"
                          >
                            {copiedCode === code.code ? (
                              <Check className="h-3.5 w-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
