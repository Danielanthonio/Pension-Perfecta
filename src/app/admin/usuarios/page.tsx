"use client";

import React, { useState } from "react";
import { useApp } from "@/utils/context/AppContext";
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
} from "lucide-react";

const COUNTRIES = [
  { code: "+52", flag: "🇲🇽", label: "México (+52)" },
  { code: "+1", flag: "🇺🇸", label: "EE.UU. (+1)" },
  { code: "+57", flag: "🇨🇴", label: "Colombia (+57)" },
  { code: "+34", flag: "🇪🇸", label: "España (+34)" },
  { code: "+54", flag: "🇦🇷", label: "Argentina (+54)" },
  { code: "+56", flag: "🇨🇱", label: "Chile (+56)" },
  { code: "+51", flag: "🇵🇪", label: "Perú (+51)" },
  { code: "+1", flag: "🇨🇦", label: "Canadá (+1)" },
];

export default function GestionUsuarios() {
  const { profiles, createProfile, deleteProfile, triggerPushNotification } = useApp();

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "aliado" | "director">("all");
  
  // Registration Form States
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+52");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"aliado" | "director">("aliado");
  
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedUserEmail, setCopiedUserEmail] = useState<string | null>(null);
  const [createdUser, setCreatedUser] = useState<{ name: string; email: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Deletion Modal States
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  // Validations
  const isNameValid = fullName.trim().length >= 3;
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isPhoneValid = /^\d{10}$/.test(phone.replace(/\D/g, ""));
  const isFormValid = isNameValid && isEmailValid && isPhoneValid;

  const handleRegisterUser = async (e: React.FormEvent) => {
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
      await createProfile({
        full_name: fullName,
        email: email.toLowerCase(),
        phone: fullPhoneNumber,
        role,
      });

      setCreatedUser({ name: fullName, email: email.toLowerCase() });

      // Clear Form State
      setFullName("");
      setEmail("");
      setPhone("");
      setRole("aliado");
      setFormSubmitted(false);
    } catch (error: any) {
      console.error(error);
      setErrorMsg(error.message || "Ocurrió un error al registrar el colaborador.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyEmail = (userEmail: string) => {
    navigator.clipboard.writeText(userEmail);
    setCopiedUserEmail(userEmail);
    setTimeout(() => setCopiedUserEmail(null), 2000);
  };

  const handleSimulateActivation = (userName: string, userEmail: string) => {
    triggerPushNotification(
      `✉️ Activación de Cuenta: Se ha enviado un enlace seguro de configuración de contraseña al correo comercial: ${userEmail}. Asegurado por SSL.`,
      "email",
      userName
    );
  };

  // Filter profiles by search query and role
  const filteredProfiles = profiles
    .filter(
      (p) =>
        p.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.email.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .filter((p) => {
      if (roleFilter === "all") return true;
      return p.role === roleFilter;
    });

  // Statistics
  const totalUsers = profiles.length;
  const totalDirectors = profiles.filter((p) => p.role === "director").length;
  const totalAllies = profiles.filter((p) => p.role === "aliado").length;
  
  // Sort profiles to show the newest first
  const sortedProfilesForLog = [...profiles].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const latestRegisteredUser = sortedProfilesForLog[0]?.full_name || "N/A";

  return (
    <div className="space-y-8 select-none max-w-[1700px] mx-auto animate-fade-in pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Administración de Accesos</h1>
          <p className="text-slate-500 text-sm mt-1">
            Registra nuevos directores de operaciones y asesores comerciales, y administra las llaves del sistema.
          </p>
        </div>
      </div>

      {/* Statistics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between h-28 relative overflow-hidden">
          <div className="absolute right-[-10px] top-[-10px] bg-indigo-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Usuarios Totales</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-800">{totalUsers}</span>
            <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">Activos</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between h-28 relative overflow-hidden">
          <div className="absolute right-[-10px] top-[-10px] bg-indigo-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Directores</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-indigo-600">{totalDirectors}</span>
            <span className="text-[9px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-bold">Auditoría Técnica</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between h-28 relative overflow-hidden">
          <div className="absolute right-[-10px] top-[-10px] bg-emerald-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Aliados Comerciales</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-emerald-600">{totalAllies}</span>
            <span className="text-[9px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-bold">Prospección Activa</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between h-28 relative overflow-hidden">
          <div className="absolute right-[-10px] top-[-10px] bg-amber-500/5 h-16 w-16 rounded-full blur-lg" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Último Registro</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-sm font-black text-slate-800 truncate max-w-[150px] block">{latestRegisteredUser}</span>
            <span className="text-[9px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-bold">Reciente</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Form Left vs Directory Right */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
        {/* Left Side: Create User Form (2/5) */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-6">
            <div className="space-y-1">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <UserPlus className="h-4.5 w-4.5 text-indigo-500" />
                Registrar Nuevo Colaborador
              </h3>
              <p className="text-slate-500 text-xs leading-normal">
                Registra un perfil para emitir una cuenta operativa. Se inyectará en la base de datos local de inmediato.
              </p>
            </div>

            {errorMsg && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs space-y-2 animate-fade-in relative">
                <button 
                  type="button" 
                  onClick={() => setErrorMsg("")} 
                  className="absolute top-2 right-2 text-rose-500 hover:text-rose-700 font-bold text-sm"
                >
                  ✕
                </button>
                <div className="font-extrabold flex items-center gap-1.5 text-rose-950">
                  <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
                  No se pudo registrar el colaborador
                </div>
                <p className="leading-relaxed whitespace-pre-line">
                  {errorMsg.replace("LÍMITE_CORREOS: ", "")}
                </p>
                {errorMsg.includes("LÍMITE_CORREOS") && (
                  <div className="bg-rose-100/50 p-3 rounded-xl border border-rose-200/50 mt-2 space-y-2 text-[10px]">
                    <div className="font-extrabold text-rose-950 uppercase tracking-wider">Pasos para Resolver esto en Supabase:</div>
                    <ol className="list-decimal list-inside space-y-1 text-rose-900 leading-normal font-medium">
                      <li>Ingresa a tu <strong>Supabase Dashboard</strong>.</li>
                      <li>Ve a <strong>Authentication</strong> &gt; <strong>Providers</strong> &gt; <strong>Email</strong>.</li>
                      <li>Desmarca la casilla <strong>"Confirm email"</strong> (o "Confirmar correo electrónico").</li>
                      <li>Haz clic en <strong>Save</strong> (Guardar).</li>
                    </ol>
                    <p className="text-[9px] font-semibold text-rose-700 mt-1">
                      Esto desactivará el envío obligatorio de correos de verificación, resolviendo definitivamente el límite SMTP gratuito de Supabase.
                    </p>
                  </div>
                )}
              </div>
            )}

            {createdUser && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-xs space-y-2 animate-fade-in relative">
                <button 
                  type="button" 
                  onClick={() => setCreatedUser(null)} 
                  className="absolute top-2 right-2 text-emerald-500 hover:text-emerald-700 font-bold text-sm"
                >
                  ✕
                </button>
                <div className="font-extrabold flex items-center gap-1.5 text-emerald-950">
                  <Check className="h-4 w-4 text-emerald-600" />
                  ¡Colaborador Creado Exitosamente!
                </div>
                <div className="leading-relaxed">
                  Se ha creado el usuario para <strong>{createdUser.name}</strong> ({createdUser.email}).
                </div>
                <div className="bg-emerald-100/50 p-2.5 rounded-xl border border-emerald-200/50 mt-1 space-y-1">
                  <div className="text-[10px] text-emerald-900 font-bold uppercase tracking-wider">Acceso de Autenticación Supabase:</div>
                  <div>Contraseña Temporal: <code className="bg-white px-1.5 py-0.5 rounded font-black select-all text-emerald-900">PensionPerfecta2026!</code></div>
                </div>
                <p className="text-[10px] text-emerald-700 leading-normal">
                  Comparte esta contraseña temporal con el colaborador para que pueda iniciar sesión y configurarla a su gusto.
                </p>
              </div>
            )}

            <form onSubmit={handleRegisterUser} className="space-y-4">
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
                      className="appearance-none h-full pl-2 pr-7 bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500 transition-colors cursor-pointer text-slate-700"
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
                    className={`py-2 px-3.5 border rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
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
                    className={`py-2 px-3.5 border rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                      role === "director"
                        ? "bg-indigo-50 border-indigo-500 text-indigo-600"
                        : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100/40"
                    }`}
                  >
                    <ShieldCheck className="h-4 w-4" /> Director Operativo
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/10 transition-all transform hover:-translate-y-0.5 active:scale-95 flex items-center justify-center gap-1.5"
              >
                <PlusIcon className="h-4.5 w-4.5" />
                {isSubmitting ? "Registrando..." : "Registrar Colaborador"}
              </button>
            </form>
          </div>
        </div>

        {/* Right Side: Users List Directory (3/5) */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
            {/* Header / Search bar & Role Filter */}
            <div className="p-6 bg-slate-50 border-b border-slate-100 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block">Directorio Interno</span>
                  <span className="text-xs font-bold text-slate-600 mt-1 block">Visualiza las cuentas de asesores y auditores del sistema.</span>
                </div>
                
                <div className="relative max-w-xs w-full sm:w-60">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Search className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar usuario por nombre o correo..."
                    className="pl-10 pr-4 py-2 w-full bg-white hover:bg-slate-100/50 focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-indigo-500 transition-colors shadow-sm"
                  />
                </div>
              </div>

              {/* Segmented Controller Tab Selector for Roles */}
              <div className="bg-slate-200/55 p-1 rounded-xl max-w-xs flex border border-slate-200/70 shadow-inner">
                <button
                  onClick={() => setRoleFilter("all")}
                  className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                    roleFilter === "all" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Todos ({totalUsers})
                </button>
                <button
                  onClick={() => setRoleFilter("aliado")}
                  className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                    roleFilter === "aliado" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Aliados ({totalAllies})
                </button>
                <button
                  onClick={() => setRoleFilter("director")}
                  className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                    roleFilter === "director" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Directores ({totalDirectors})
                </button>
              </div>
            </div>

            {/* List Table */}
            {filteredProfiles.length === 0 ? (
              <div className="py-20 text-center space-y-3">
                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
                  <User className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700">Sin usuarios encontrados</h4>
                  <p className="text-xs text-slate-400 mt-1">Prueba refinando los criterios de búsqueda.</p>
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
                      <th className="px-6 py-4 text-center">Registro</th>
                      <th className="px-6 py-4 relative"><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150">
                    {filteredProfiles.map((p) => {
                      const isDirector = p.role === "director";
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/40 transition-colors group">
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
                            <span className="text-xs font-semibold text-slate-600">
                              {p.phone ? (p.phone.startsWith("+") ? p.phone : p.phone.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3")) : "N/A"}
                            </span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                isDirector
                                  ? "bg-indigo-50 text-indigo-600 border-indigo-150"
                                  : "bg-emerald-50 text-emerald-600 border-emerald-150"
                              }`}
                            >
                              {isDirector ? "Director Operaciones" : "Aliado Comercial"}
                            </span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center text-[10px] font-bold text-slate-400">
                            {new Date(p.created_at).toLocaleDateString("es-MX", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                            <div className="flex items-center justify-end gap-2">
                              {/* Copy details */}
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

                              {/* Simulate Activation Email */}
                              <button
                                onClick={() => handleSimulateActivation(p.full_name, p.email)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-[10px] font-bold text-slate-500 hover:text-indigo-600 rounded-lg transition-colors"
                                title="Enviar Acceso"
                              >
                                <Send className="h-3.5 w-3.5" />
                                Acceso
                              </button>

                              {/* Delete Profile */}
                              <button
                                onClick={() => setDeleteTarget(p)}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-500 hover:text-rose-700 rounded-lg transition-colors border border-rose-200"
                                title="Eliminar Usuario"
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
      </div>

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

// Inline mini Plus icon component to resolve any missing Lucide export issues
function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      stroke="currentColor"
      strokeWidth="3"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      {...props}
    >
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  );
}
