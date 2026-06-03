"use client";

import React, { useState } from "react";
import { useApp, UserProfile } from "@/utils/context/AppContext";
import {
  Users,
  UserPlus,
  Search,
  Mail,
  Phone,
  Calendar,
  Sparkles,
  Check,
  Copy,
  Send,
  ShieldCheck,
  UserCheck,
  User,
  Activity,
  AlertCircle,
  Trash2,
  Edit3,
  Key,
  X,
  UserX,
} from "lucide-react";

const COUNTRIES = [
  { code: "+52", flag: "🇲🇽", label: "México (+52)" },
  { code: "+1", flag: "🇺🇸", label: "EE.UU. (+1)" },
  { code: "+57", flag: "🇨🇴", label: "Colombia (+57)" },
  { code: "+34", flag: "🇪🇸", label: "España (+34)" },
  { code: "+54", flag: "🇦🇷", label: "Argentina (+54)" },
  { code: "+56", flag: "🇨🇱", label: "Chile (+56)" },
  { code: "+51", flag: "🇵🇪", label: "Perú (+51)" },
];

export default function GestionUsuarios() {
  const {
    profiles,
    createProfile,
    deleteProfile,
    updateProfileAdmin,
    invitationCodes,
    generateInvitationCode,
    triggerPushNotification,
  } = useApp();

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "aliado" | "director">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Modal / Drawer States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // Form States
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+52");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"aliado" | "director">("aliado");
  const [isActive, setIsActive] = useState(true);

  const [formSubmitted, setFormSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedUserEmail, setCopiedUserEmail] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [newlyGeneratedCode, setNewlyGeneratedCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [createdUser, setCreatedUser] = useState<{ name: string; email: string; isNew: boolean } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Deletion Modal States
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form Validations
  const isNameValid = fullName.trim().length >= 3;
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isPhoneValid = /^\d{10}$/.test(phone.replace(/\D/g, ""));
  const isFormValid = isNameValid && isEmailValid && isPhoneValid;

  // Open modal for User Creation
  const handleOpenCreateModal = () => {
    setModalMode("create");
    setEditingUserId(null);
    setFullName("");
    setEmail("");
    setPhone("");
    setRole("aliado");
    setIsActive(true);
    setFormSubmitted(false);
    setErrorMsg("");
    setCreatedUser(null);
    setIsModalOpen(true);
  };

  // Open modal for User Editing
  const handleOpenEditModal = (u: UserProfile) => {
    setModalMode("edit");
    setEditingUserId(u.id);
    setFullName(u.full_name);
    setEmail(u.email);
    setIsActive(u.is_active !== false);
    setRole(u.role);
    setFormSubmitted(false);
    setErrorMsg("");
    setCreatedUser(null);

    // Extract country code and phone number
    const phoneStr = u.phone || "";
    const matchedCountry = COUNTRIES.find((c) => phoneStr.startsWith(c.code));
    if (matchedCountry) {
      setCountryCode(matchedCountry.code);
      setPhone(phoneStr.replace(matchedCountry.code, "").trim());
    } else {
      setCountryCode("+52");
      setPhone(phoneStr.replace(/\D/g, ""));
    }

    setIsModalOpen(true);
  };

  // Submit handler (creates or updates)
  const handleSubmitUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitted(true);
    setCreatedUser(null);
    setErrorMsg("");

    if (!isFormValid) {
      return;
    }

    setIsSubmitting(true);
    try {
      const fullPhoneNumber = `${countryCode} ${phone.replace(/\D/g, "")}`;
      
      if (modalMode === "create") {
        await createProfile({
          full_name: fullName,
          email: email.toLowerCase(),
          phone: fullPhoneNumber,
          role,
          is_active: isActive,
        });

        setCreatedUser({ name: fullName, email: email.toLowerCase(), isNew: true });
        
        // Reset form
        setFullName("");
        setEmail("");
        setPhone("");
        setRole("aliado");
        setIsActive(true);
        setFormSubmitted(false);
        setIsModalOpen(false);
      } else if (modalMode === "edit" && editingUserId) {
        await updateProfileAdmin(editingUserId, {
          full_name: fullName,
          email: email.toLowerCase(),
          phone: fullPhoneNumber,
          role,
          is_active: isActive,
        });

        setCreatedUser({ name: fullName, email: email.toLowerCase(), isNew: false });
        setIsModalOpen(false);
      }
    } catch (error: any) {
      console.error(error);
      setErrorMsg(error.message || "Ocurrió un error al procesar el usuario.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle user activation status from the directory table directly
  const handleToggleUserActive = async (u: UserProfile) => {
    const newStatus = u.is_active === false ? true : false;
    try {
      await updateProfileAdmin(u.id, { is_active: newStatus });
      triggerPushNotification(
        `👤 Cuenta ${newStatus ? "Activada" : "Desactivada"}: El usuario ${u.full_name} ha sido ${newStatus ? "activado" : "desactivado"} en la plataforma.`,
        "whatsapp",
        u.full_name
      );
    } catch (e) {
      console.error("Error toggling user status", e);
    }
  };

  // Generate invitation code
  const handleGenerateCode = async () => {
    setIsGenerating(true);
    setNewlyGeneratedCode(null);
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

  // Impersonate or simulate link
  const handleSimulateActivation = (userName: string, userEmail: string) => {
    triggerPushNotification(
      `✉️ Activación de Cuenta: Se ha enviado un enlace seguro de configuración de contraseña al correo comercial: ${userEmail}. Asegurado por SSL.`,
      "email",
      userName
    );
  };

  const handleCopyEmail = (userEmail: string) => {
    navigator.clipboard.writeText(userEmail);
    setCopiedUserEmail(userEmail);
    setTimeout(() => setCopiedUserEmail(null), 2000);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Filters profiles list
  const filteredProfiles = profiles
    .filter((p) => {
      const term = searchTerm.toLowerCase();
      return (
        p.full_name.toLowerCase().includes(term) ||
        p.email.toLowerCase().includes(term) ||
        (p.phone && p.phone.toLowerCase().includes(term))
      );
    })
    .filter((p) => {
      if (roleFilter === "all") return true;
      return p.role === roleFilter;
    })
    .filter((p) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "active") return p.is_active !== false;
      return p.is_active === false;
    });

  // User Counts Statistics
  const totalUsers = profiles.length;
  const totalActive = profiles.filter((p) => p.is_active !== false).length;
  const totalInactive = profiles.filter((p) => p.is_active === false).length;
  const totalDirectors = profiles.filter((p) => p.role === "director").length;
  const totalAllies = profiles.filter((p) => p.role === "aliado").length;

  // Invitation codes details
  const unusedCodesCount = invitationCodes.filter((c) => !c.is_used).length;

  // 3 Latest registered users
  const latestRegisteredUsers = [...profiles]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 3);

  return (
    <div className="space-y-8 select-none max-w-[1700px] mx-auto animate-fade-in pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Gestión de Usuarios</h1>
          <p className="text-slate-500 text-sm mt-1">
            Administra los accesos de directores operativos y aliados comerciales, controla sus estados de activación e invitaciones.
          </p>
        </div>
        <button
          onClick={handleOpenCreateModal}
          className="inline-flex items-center gap-2 px-5 py-3 text-xs font-bold rounded-2xl shadow-md text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 transition-all transform hover:-translate-y-0.5 active:scale-95"
        >
          <UserPlus className="h-4.5 w-4.5" />
          Registrar Colaborador
        </button>
      </div>

      {/* Status Notifications */}
      {createdUser && (
        <div className="bg-emerald-50 border border-emerald-250 text-emerald-800 p-4 rounded-2xl text-xs space-y-2 animate-fade-in relative max-w-4xl">
          <button
            type="button"
            onClick={() => setCreatedUser(null)}
            className="absolute top-3 right-3 text-emerald-500 hover:text-emerald-700 font-bold text-sm"
          >
            ✕
          </button>
          <div className="font-extrabold flex items-center gap-1.5 text-emerald-950">
            <Check className="h-4 w-4 text-emerald-600" />
            {createdUser.isNew ? "¡Colaborador Creado Exitosamente!" : "¡Colaborador Actualizado Exitosamente!"}
          </div>
          <div className="leading-relaxed">
            Se ha {createdUser.isNew ? "registrado" : "actualizado"} el usuario para <strong>{createdUser.name}</strong> ({createdUser.email}).
          </div>
          {createdUser.isNew && (
            <div className="bg-emerald-100/50 p-2.5 rounded-xl border border-emerald-200/50 mt-1 space-y-1">
              <div className="text-[10px] text-emerald-900 font-bold uppercase tracking-wider">Acceso de Autenticación Temporal:</div>
              <div>Contraseña: <code className="bg-white px-1.5 py-0.5 rounded font-black select-all text-emerald-900">PensionPerfecta2026!</code></div>
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-250 text-rose-800 p-4 rounded-2xl text-xs space-y-2 animate-fade-in relative max-w-4xl">
          <button
            type="button"
            onClick={() => setErrorMsg("")}
            className="absolute top-3 right-3 text-rose-500 hover:text-rose-700 font-bold text-sm"
          >
            ✕
          </button>
          <div className="font-extrabold flex items-center gap-1.5 text-rose-950">
            <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
            No se pudo procesar la solicitud
          </div>
          <p className="leading-relaxed whitespace-pre-line">
            {errorMsg.replace("LÍMITE_CORREOS: ", "")}
          </p>
        </div>
      )}

      {/* Statistics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between h-28 relative overflow-hidden">
          <div className="absolute right-[-10px] top-[-10px] bg-indigo-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Usuarios Totales</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-800">{totalUsers}</span>
            <span className="text-[10px] text-slate-500 font-bold">
              {totalActive} <span className="text-emerald-500">Activos</span> / {totalInactive} <span className="text-rose-500">Inactivos</span>
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between h-28 relative overflow-hidden">
          <div className="absolute right-[-10px] top-[-10px] bg-indigo-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Directores Operativos</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-indigo-600">{totalDirectors}</span>
            <span className="text-[9px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-bold">Operaciones</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between h-28 relative overflow-hidden">
          <div className="absolute right-[-10px] top-[-10px] bg-emerald-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Aliados Comerciales</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-emerald-600">{totalAllies}</span>
            <span className="text-[9px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-bold">Fuerza Ventas</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between h-28 relative overflow-hidden">
          <div className="absolute right-[-10px] top-[-10px] bg-cyan-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Invitaciones Libres</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-cyan-600">{unusedCodesCount}</span>
            <span className="text-[9px] bg-cyan-50 text-cyan-600 px-2 py-0.5 rounded-full font-bold">Códigos</span>
          </div>
        </div>
      </div>

      {/* Main Content Layout: Directories + Codes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left Area (2/3 width): Directory and List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
            
            {/* Search, Filter Roles, Filter Status */}
            <div className="p-6 bg-slate-50 border-b border-slate-100 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block">Directorio de Accesos</span>
                  <span className="text-xs font-bold text-slate-600 mt-1 block">Monitorea y configura las cuentas del personal registrado en la aplicación.</span>
                </div>
                
                <div className="relative w-full sm:w-64">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Search className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nombre, correo, cel..."
                    className="pl-9 pr-4 py-2 w-full bg-white hover:bg-slate-100/50 focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-indigo-500 transition-colors shadow-sm"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                {/* Segmented Selector for Roles */}
                <div className="bg-slate-200/55 p-1 rounded-xl flex border border-slate-250/70 shadow-inner w-full sm:w-auto">
                  <button
                    onClick={() => setRoleFilter("all")}
                    className={`flex-1 sm:flex-none px-3.5 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                      roleFilter === "all" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Todos ({totalUsers})
                  </button>
                  <button
                    onClick={() => setRoleFilter("aliado")}
                    className={`flex-1 sm:flex-none px-3.5 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                      roleFilter === "aliado" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Aliados ({totalAllies})
                  </button>
                  <button
                    onClick={() => setRoleFilter("director")}
                    className={`flex-1 sm:flex-none px-3.5 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                      roleFilter === "director" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Directores ({totalDirectors})
                  </button>
                </div>

                {/* Filter by Activation Status */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 font-bold text-[10px] uppercase">Estado:</span>
                  <select
                    value={statusFilter}
                    onChange={(e: any) => setStatusFilter(e.target.value)}
                    className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                  >
                    <option value="all">Todos los estados</option>
                    <option value="active">Activos</option>
                    <option value="inactive">Inactivos</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Profiles Directory Table */}
            {filteredProfiles.length === 0 ? (
              <div className="py-20 text-center space-y-3">
                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
                  <UserX className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700">Sin usuarios encontrados</h4>
                  <p className="text-xs text-slate-400 mt-1">Prueba cambiando los filtros de búsqueda.</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-150 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-left">
                      <th className="px-6 py-4">Usuario</th>
                      <th className="px-6 py-4">Teléfono</th>
                      <th className="px-6 py-4 text-center">Rol del Sistema</th>
                      <th className="px-6 py-4 text-center">Estado</th>
                      <th className="px-6 py-4 relative"><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150">
                    {filteredProfiles.map((p) => {
                      const isDirector = p.role === "director";
                      const isUserActive = p.is_active !== false;
                      return (
                        <tr key={p.id} className={`hover:bg-slate-50/40 transition-colors group ${!isUserActive ? "opacity-75" : ""}`}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className={`h-9 w-9 rounded-xl flex items-center justify-center text-xs font-black border transition-all ${
                                isDirector
                                  ? "bg-indigo-500/10 text-indigo-600 border-indigo-200"
                                  : "bg-emerald-500/10 text-emerald-600 border-emerald-200"
                              }`}>
                                {p.full_name.charAt(0)}
                              </div>
                              <div>
                                <span className="text-xs font-extrabold text-slate-800 block leading-tight">{p.full_name}</span>
                                <span className="text-[10px] text-slate-400 block mt-0.5 font-medium leading-none">{p.email}</span>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-xs font-semibold text-slate-650">
                              {p.phone || "N/A"}
                            </span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold border ${
                                isDirector
                                  ? "bg-indigo-50 text-indigo-600 border-indigo-150"
                                  : "bg-emerald-50 text-emerald-600 border-emerald-150"
                              }`}
                            >
                              {isDirector ? "Director Operativo" : "Aliado Comercial"}
                            </span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            {/* Toggle Switch */}
                            <button
                              onClick={() => handleToggleUserActive(p)}
                              className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                              style={{ backgroundColor: isUserActive ? "#10B981" : "#D1D5DB" }}
                            >
                              <span
                                className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                                style={{ transform: isUserActive ? "translateX(16px)" : "translateX(0px)" }}
                              />
                            </button>
                            <span className="block text-[8px] font-bold text-slate-400 mt-1 uppercase">
                              {isUserActive ? "Activo" : "Inactivo"}
                            </span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                            <div className="flex items-center justify-end gap-2">
                              {/* Copy email */}
                              <button
                                onClick={() => handleCopyEmail(p.email)}
                                className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition-colors border border-slate-200"
                                title="Copiar Correo"
                              >
                                {copiedUserEmail === p.email ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>

                              {/* Edit details */}
                              <button
                                onClick={() => handleOpenEditModal(p)}
                                className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-500 hover:text-indigo-700 rounded-lg transition-colors border border-indigo-200"
                                title="Editar Colaborador"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>

                              {/* Simulate Activation Email */}
                              <button
                                onClick={() => handleSimulateActivation(p.full_name, p.email)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-[10px] font-bold text-slate-500 hover:text-indigo-600 rounded-lg transition-colors"
                                title="Enviar Enlace de Acceso"
                              >
                                <Send className="h-3.5 w-3.5" />
                                Acceso
                              </button>

                              {/* Delete Profile */}
                              <button
                                onClick={() => setDeleteTarget(p)}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-500 hover:text-rose-700 rounded-lg transition-colors border border-rose-200"
                                title="Eliminar Colaborador"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
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
        </div>

        {/* Right Area (1/3 width): Latest Registrations + Invitation Codes */}
        <div className="space-y-6">
          
          {/* Latest registrations Widget */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-4">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Últimos Registros</span>
              <span className="text-xs font-bold text-slate-650 block mt-0.5">Novedades recientes en los accesos del sistema.</span>
            </div>

            <div className="space-y-3">
              {latestRegisteredUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-150">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-[10px] font-black border ${
                      u.role === "director" 
                        ? "bg-indigo-50 text-indigo-600 border-indigo-150" 
                        : "bg-emerald-50 text-emerald-600 border-emerald-150"
                    }`}>
                      {u.full_name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-800 block truncate">{u.full_name}</span>
                      <span className="text-[9px] text-slate-400 font-semibold block uppercase">
                        {u.role === "director" ? "Director" : "Aliado Comercial"}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="block text-[8px] font-bold text-slate-450 uppercase">
                      {new Date(u.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                    </span>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full mt-1 ${u.is_active !== false ? "bg-emerald-500" : "bg-rose-450"}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Invitation Codes Widget */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <Key className="h-4.5 w-4.5 text-indigo-500" />
                  Códigos de Invitación B2B
                </h3>
                <p className="text-slate-500 text-[10px] mt-0.5 leading-normal">
                  Genera códigos de seguridad de un solo uso para invitar a nuevos colaboradores.
                </p>
              </div>
              <button
                onClick={handleGenerateCode}
                disabled={isGenerating}
                className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl transition-all disabled:opacity-50"
                title="Generar Nuevo Código"
              >
                <Key className="h-4 w-4" />
              </button>
            </div>

            {/* In-Line Generated Code Widget */}
            {newlyGeneratedCode && (
              <div className="p-3 bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-150 rounded-2xl animate-fade-in space-y-2 relative">
                <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Nuevo Código Creado
                </span>
                <div className="flex items-center justify-between bg-white border border-indigo-150 rounded-xl p-2 shadow-sm">
                  <code className="text-slate-800 font-extrabold text-xs select-all tracking-wide">
                    {newlyGeneratedCode}
                  </code>
                  <button
                    onClick={() => handleCopyCode(newlyGeneratedCode)}
                    className="p-1 hover:bg-slate-150 text-slate-500 hover:text-indigo-600 rounded-lg transition-all"
                    title="Copiar Código"
                  >
                    {copiedCode === newlyGeneratedCode ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* List log of active/used invitation codes */}
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block">
                Historial de Códigos
              </span>
              {invitationCodes.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                  No hay códigos generados.
                </div>
              ) : (
                invitationCodes.map((code) => (
                  <div
                    key={code.id}
                    className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100/50 rounded-2xl border border-slate-200 transition-colors"
                  >
                    <div className="space-y-0.5">
                      <code className="text-xs font-bold text-slate-700 select-all">{code.code}</code>
                      <span className="block text-[8px] text-slate-400 font-medium">
                        {new Date(code.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[8px] font-bold border ${
                          code.is_used
                            ? "bg-slate-100 text-slate-450 border-slate-200"
                            : "bg-cyan-50 text-cyan-600 border-cyan-150"
                        }`}
                      >
                        {code.is_used ? "Usado" : "Libre"}
                      </span>
                      {!code.is_used && (
                        <button
                          onClick={() => handleCopyCode(code.code)}
                          className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-700 transition-colors"
                        >
                          {copiedCode === code.code ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Creation & Editing Modal (Clean, modern, space-saving) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in select-none">
          <div className="bg-white rounded-3xl shadow-xl max-w-lg w-full p-6 border border-slate-200 mx-4 relative">
            
            {/* Modal Header */}
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-700"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-150 pb-3.5 mb-4">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${
                modalMode === "create" ? "bg-indigo-50 border-indigo-150 text-indigo-600" : "bg-indigo-50 border-indigo-150 text-indigo-600"
              }`}>
                {modalMode === "create" ? <UserPlus className="h-5 w-5" /> : <Edit3 className="h-5 w-5" />}
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800">
                  {modalMode === "create" ? "Registrar Nuevo Colaborador" : "Editar Colaborador"}
                </h3>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                  {modalMode === "create" ? "Genera un nuevo perfil y contraseña temporal de acceso." : "Edita datos personales y roles de acceso."}
                </p>
              </div>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitUser} className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="ej: Laura Martínez"
                  className={`w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border rounded-xl text-xs font-semibold outline-none focus:border-indigo-500 transition-colors ${
                    formSubmitted && !isNameValid ? "border-red-400" : "border-slate-200"
                  }`}
                  required
                />
                {formSubmitted && !isNameValid && (
                  <span className="text-[9px] text-red-500 font-bold mt-1 block flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> El nombre debe ser más largo.
                  </span>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="h-4 w-4" />
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ej: laura@prevision.com"
                    className={`w-full pl-10 pr-3.5 py-2.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border rounded-xl text-xs font-semibold outline-none focus:border-indigo-500 transition-colors ${
                      formSubmitted && !isEmailValid ? "border-red-400" : "border-slate-200"
                    }`}
                    required
                  />
                </div>
                {formSubmitted && !isEmailValid && (
                  <span className="text-[9px] text-red-500 font-bold mt-1 block flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Ingresa un correo electrónico válido.
                  </span>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Teléfono Móvil
                </label>
                <div className="flex gap-2">
                  <div className="relative">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="appearance-none h-full pl-2.5 pr-7 bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500 transition-colors cursor-pointer text-slate-700"
                    >
                      {COUNTRIES.map((c) => (
                        <option key={`${c.flag}-${c.code}`} value={c.code}>
                          {c.flag} {c.code}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-slate-400">
                      <span className="text-[8px]">▼</span>
                    </div>
                  </div>
                  <div className="relative flex-1">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Phone className="h-4 w-4" />
                    </span>
                    <input
                      type="tel"
                      maxLength={10}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                      placeholder="10 dígitos"
                      className={`w-full pl-10 pr-3.5 py-2.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border rounded-xl text-xs font-semibold outline-none focus:border-indigo-500 transition-colors ${
                        formSubmitted && !isPhoneValid ? "border-red-400" : "border-slate-200"
                      }`}
                      required
                    />
                  </div>
                </div>
                {formSubmitted && !isPhoneValid && (
                  <span className="text-[9px] text-red-500 font-bold mt-1 block flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> El teléfono debe contener 10 dígitos exactos.
                  </span>
                )}
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Rol Asignado
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole("aliado")}
                    className={`py-2.5 px-3.5 border rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                      role === "aliado"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-600"
                        : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100/40"
                    }`}
                  >
                    <UserCheck className="h-4 w-4" /> Aliado Comercial
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("director")}
                    className={`py-2.5 px-3.5 border rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                      role === "director"
                        ? "bg-indigo-50 border-indigo-500 text-indigo-600"
                        : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100/40"
                    }`}
                  >
                    <ShieldCheck className="h-4 w-4" /> Director Operativo
                  </button>
                </div>
              </div>

              {/* Activation Switch */}
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-150">
                <div>
                  <span className="block text-xs font-extrabold text-slate-800">Estado Operativo</span>
                  <span className="block text-[10px] text-slate-400 mt-0.5 leading-none">Indica si el usuario puede acceder al sistema.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                  style={{ backgroundColor: isActive ? "#10B981" : "#D1D5DB" }}
                >
                  <span
                    className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                    style={{ transform: isActive ? "translateX(16px)" : "translateX(0px)" }}
                  />
                </button>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all active:scale-95"
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-500/10 transition-all transform active:scale-95 flex items-center justify-center gap-1.5"
                >
                  {isSubmitting ? "Procesando..." : (modalMode === "create" ? "Registrar Usuario" : "Guardar Cambios")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal overlay */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in select-none">
          <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200 mx-4">
            <div className="flex items-center gap-3 border-b border-slate-150 pb-3">
              <div className="h-10 w-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center border border-red-150">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800">Eliminar Colaborador</h3>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Esta acción revocará accesos y eliminará su código de invitación.</p>
              </div>
            </div>

            <div className="text-xs text-slate-650 leading-relaxed font-medium">
              ¿Estás seguro de que deseas eliminar permanentemente a <strong>{deleteTarget.full_name}</strong> ({deleteTarget.email})? 
              <br/><br/>
              Esta acción no se puede deshacer y también eliminará del sistema el código de invitación asociado a este perfil.
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all active:scale-95 transform"
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  setDeleting(true);
                  await deleteProfile(deleteTarget.id);
                  setDeleting(false);
                  setDeleteTarget(null);
                }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs shadow-md shadow-red-500/10 transition-all transform active:scale-95"
                disabled={deleting}
              >
                {deleting ? "Eliminando..." : "Eliminar Colaborador"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
