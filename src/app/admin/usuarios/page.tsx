"use client";

import React, { useState } from "react";
import { useApp, UserProfile } from "@/utils/context/AppContext";
import { StatCard } from "@/components/ui/StatCard";
import { useSortable, SortControl, SortHeader } from "@/components/ui/sorting";
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
  ChevronDown,
  Link2,
  Loader2,
  Save,
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
    user,
    profiles,
    createProfile,
    deleteProfile,
    updateProfileAdmin,
    invitationCodes,
    generateInvitationCode,
    triggerPushNotification,
    appSettings,
    updateAppSettings,
    dbError,
  } = useApp();

  const isCurrentUserDirector = user?.role === "director";

  const isCurrentUserAM = user?.role === "account_manager";

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "aliado" | "director" | "account_manager">("all");
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
  const [role, setRole] = useState<"aliado" | "director" | "account_manager">("aliado");
  const [isActive, setIsActive] = useState(true);
  const [passwordProvisional, setPasswordProvisional] = useState("");

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

  // Collapsible panel for the secondary widgets (latest registrations + codes)
  const [showExtras, setShowExtras] = useState(false);

  // Meeting links (Modalidad 40 / 10) — global config editable solo por Dirección
  const [linkM40, setLinkM40] = useState("");
  const [linkM10, setLinkM10] = useState("");
  const [savingLinks, setSavingLinks] = useState(false);
  const [linksSaved, setLinksSaved] = useState(false);
  const [linksError, setLinksError] = useState("");

  // Sincroniza los inputs con la config global cuando ésta cambie/cargue
  React.useEffect(() => {
    setLinkM40(appSettings.meeting_link_m40 || "");
    setLinkM10(appSettings.meeting_link_m10 || "");
  }, [appSettings.meeting_link_m40, appSettings.meeting_link_m10]);

  const linksDirty =
    linkM40.trim() !== (appSettings.meeting_link_m40 || "").trim() ||
    linkM10.trim() !== (appSettings.meeting_link_m10 || "").trim();

  const handleSaveMeetingLinks = async () => {
    setLinksError("");
    const isValidUrl = (u: string) => u.trim() === "" || /^https?:\/\/.+/i.test(u.trim());
    if (!isValidUrl(linkM40) || !isValidUrl(linkM10)) {
      setLinksError("Los links deben iniciar con http:// o https://");
      return;
    }
    setSavingLinks(true);
    try {
      await updateAppSettings({
        meeting_link_m40: linkM40.trim(),
        meeting_link_m10: linkM10.trim(),
      });
      setLinksSaved(true);
      setTimeout(() => setLinksSaved(false), 2500);
    } catch (err: any) {
      setLinksError(err?.message || "No se pudieron guardar los links. Intenta de nuevo.");
    } finally {
      setSavingLinks(false);
    }
  };

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
    setPasswordProvisional("");
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
    setPasswordProvisional(u.password_provisional || "");
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
          role: isCurrentUserAM ? "aliado" : role,
          is_active: isActive,
          password_provisional: passwordProvisional || undefined,
          // El Account Manager NO se fija aquí: se sortea entre los AM que están en
          // la ruleta de asignación automática (aun cuando lo crea un AM). El
          // director puede re-asignarlo después en la Matriz de Asignaciones.
        });

        setCreatedUser({ name: fullName, email: email.toLowerCase(), isNew: true });
        
        // Reset form
        setFullName("");
        setEmail("");
        setPhone("");
        setRole("aliado");
        setIsActive(true);
        setPasswordProvisional("");
        setFormSubmitted(false);
        setIsModalOpen(false);
      } else if (modalMode === "edit" && editingUserId) {
        await updateProfileAdmin(editingUserId, {
          full_name: fullName,
          email: email.toLowerCase(),
          phone: fullPhoneNumber,
          role,
          is_active: isActive,
          password_provisional: passwordProvisional || null,
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
        user?.full_name || "Eduardo Director"
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

  // Invitation codes details filtered by creator if it's an AM
  const myInvitationCodes = isCurrentUserAM
    ? invitationCodes.filter((c) => c.created_by === user?.id)
    : invitationCodes;

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
      if (isCurrentUserAM) {
        // AM only manages and lists allies
        return p.role === "aliado";
      }
      if (roleFilter === "all") return true;
      return p.role === roleFilter;
    })
    .filter((p) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "active") return p.is_active !== false;
      return p.is_active === false;
    });

  const sortU = useSortable<UserProfile>(
    filteredProfiles,
    {
      nombre: (p) => p.full_name,
      correo: (p) => p.email,
      rol: (p) => (p.role === "director" ? 0 : p.role === "account_manager" ? 1 : 2),
      estado: (p) => (p.is_active === false ? 0 : 1),
    },
    "nombre",
    "asc"
  );
  const sortOptionsUsers = [
    { id: "nombre", label: "Nombre" },
    { id: "correo", label: "Correo" },
    { id: "rol", label: "Rol" },
    { id: "estado", label: "Estado" },
  ];

  // User Counts Statistics
  const totalUsers = isCurrentUserAM
    ? profiles.filter((p) => p.role === "aliado").length
    : profiles.length;
  const totalActive = isCurrentUserAM
    ? profiles.filter((p) => p.role === "aliado" && p.is_active !== false).length
    : profiles.filter((p) => p.is_active !== false).length;
  const totalInactive = isCurrentUserAM
    ? profiles.filter((p) => p.role === "aliado" && p.is_active === false).length
    : profiles.filter((p) => p.is_active === false).length;
  const totalDirectors = profiles.filter((p) => p.role === "director").length;
  const totalAllies = profiles.filter((p) => p.role === "aliado").length;
  const totalAMs = profiles.filter((p) => p.role === "account_manager").length;

  // Invitation codes details
  const unusedCodesCount = myInvitationCodes.filter((c) => !c.is_used).length;

  // 3 Latest registered users
  const latestRegisteredUsers = [...profiles]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 3);

  // Per-role visual identity — keeps colors and labels consistent across the directory,
  // the accent spine and the "latest registrations" widget (clear color sequences).
  const getRoleMeta = (r: UserProfile["role"]) => {
    if (r === "director") {
      return {
        label: "Director Operativo",
        short: "Director",
        Icon: ShieldCheck,
        accent: "border-l-emerald-500",
        avatar: "bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800/40",
        badge: "bg-emerald-50 text-emerald-700 border-emerald-150 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-850",
      };
    }
    if (r === "account_manager") {
      return {
        label: "Account Manager",
        short: "Account Manager",
        Icon: UserCheck,
        accent: "border-l-blue-500",
        avatar: "bg-blue-500/10 text-blue-600 border-blue-200 dark:text-blue-400 dark:border-blue-800/40",
        badge: "bg-blue-50 text-blue-700 border-blue-150 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-850",
      };
    }
    return {
      label: "Aliado Comercial",
      short: "Aliado",
      Icon: User,
      accent: "border-l-teal-500",
      avatar: "bg-teal-500/10 text-teal-650 border-teal-200 dark:text-teal-400 dark:border-teal-800/40",
      badge: "bg-teal-50 text-teal-700 border-teal-150 dark:bg-teal-950/20 dark:text-teal-400 dark:border-teal-850",
    };
  };

  return (
    <div className="space-y-8 max-w-[1700px] mx-auto animate-fade-in pb-12 text-slate-800 dark:text-slate-100">
      {/* Top actions */}
      <div className="flex items-center justify-end gap-2.5">
        <button
          onClick={() => setShowExtras((v) => !v)}
          aria-expanded={showExtras}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition-all active:scale-95"
        >
          <Key className="h-3.5 w-3.5 text-slate-400" />
          Registros y códigos
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showExtras ? "rotate-180" : ""}`} />
        </button>
        <button
          onClick={handleOpenCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-500/20 transition-all hover:-translate-y-0.5 active:scale-95"
        >
          <UserPlus className="h-4 w-4" />
          {isCurrentUserAM ? "Registrar Aliado" : "Registrar Colaborador"}
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

      {/* Status Notifications */}
      {createdUser && (
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-250 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300 p-4 rounded-2xl text-xs space-y-2 animate-fade-in relative max-w-4xl">
          <button
            type="button"
            onClick={() => setCreatedUser(null)}
            className="absolute top-3 right-3 text-emerald-500 hover:text-emerald-700 dark:text-emerald-450 dark:hover:text-emerald-300 font-bold text-sm"
          >
            ✕
          </button>
          <div className="font-extrabold flex items-center gap-1.5 text-emerald-950 dark:text-emerald-200">
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            {createdUser.isNew ? "¡Colaborador Creado Exitosamente!" : "¡Colaborador Actualizado Exitosamente!"}
          </div>
          <div className="leading-relaxed">
            Se ha {createdUser.isNew ? "registrado" : "actualizado"} el usuario para <strong>{createdUser.name}</strong> ({createdUser.email}).
          </div>
          {createdUser.isNew && (
            <div className="bg-emerald-100/50 dark:bg-emerald-900/30 p-2.5 rounded-xl border border-emerald-200/50 dark:border-emerald-800/30 mt-1 space-y-1">
              <div className="text-[10px] text-emerald-900 dark:text-emerald-300 font-bold uppercase tracking-wider">Acceso de Autenticación Temporal:</div>
              <div className="dark:text-slate-300">Contraseña: <code className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded font-black select-all text-emerald-900 dark:text-emerald-300 border dark:border-slate-700">PensionPerfecta2026!</code></div>
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-250 dark:border-rose-800/40 text-rose-800 dark:text-rose-350 p-4 rounded-2xl text-xs space-y-2 animate-fade-in relative max-w-4xl">
          <button
            type="button"
            onClick={() => setErrorMsg("")}
            className="absolute top-3 right-3 text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 font-bold text-sm"
          >
            ✕
          </button>
          <div className="font-extrabold flex items-center gap-1.5 text-rose-950 dark:text-rose-200">
            <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-450 flex-shrink-0" />
            No se pudo procesar la solicitud
          </div>
          <p className="leading-relaxed whitespace-pre-line">
            {errorMsg.replace("LÍMITE_CORREOS: ", "")}
          </p>
        </div>
      )}

      {/* Links de Reunión (Modalidad 40 / 10) — solo Dirección */}
      {isCurrentUserDirector && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm max-w-4xl">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-sm shrink-0">
              <Link2 className="h-5 w-5" strokeWidth={2.2} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800 dark:text-white tracking-tight">Links de Reunión</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal mt-0.5">
                Agenda que se abre cuando un aliado programa una asesoría. Actualízalos aquí cuando cambien.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                <span className="h-5 w-5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-black">40</span>
                Modalidad 40
              </label>
              <input
                type="url"
                inputMode="url"
                value={linkM40}
                onChange={(e) => setLinkM40(e.target.value)}
                placeholder="https://…"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                <span className="h-5 w-5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[10px] font-black">10</span>
                Modalidad 10
              </label>
              <input
                type="url"
                inputMode="url"
                value={linkM10}
                onChange={(e) => setLinkM10(e.target.value)}
                placeholder="https://…"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-all"
              />
            </div>
          </div>

          {linksError && (
            <p className="mt-3 text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {linksError}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 mt-4">
            {linksSaved && (
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 animate-fade-in">
                <Check className="h-3.5 w-3.5" />
                Guardado
              </span>
            )}
            <button
              onClick={handleSaveMeetingLinks}
              disabled={savingLinks || !linksDirty}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-600"
            >
              {savingLinks ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {savingLinks ? "Guardando…" : "Guardar links"}
            </button>
          </div>
        </div>
      )}

      {/* Statistics Cards Grid */}
      {isCurrentUserAM ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Aliados Asignados" value={totalAllies} tone="slate" icon={Users} sub={`${totalActive} act · ${totalInactive} inact`} />
          <StatCard label="Activos" value={totalActive} tone="emerald" icon={UserCheck} />
          <StatCard label="Invitaciones Libres" value={unusedCodesCount} tone="cyan" icon={Key} />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Usuarios Totales" value={totalUsers} tone="slate" icon={Users} sub={`${totalActive} act · ${totalInactive} inact`} />
          <StatCard label="Directores" value={totalDirectors} tone="emerald" icon={ShieldCheck} />
          <StatCard label="Account Managers" value={totalAMs} tone="blue" icon={UserCheck} />
          <StatCard label="Aliados" value={totalAllies} tone="teal" icon={User} />
          <StatCard label="Invitaciones Libres" value={unusedCodesCount} tone="cyan" icon={Key} />
        </div>
      )}

      {/* Main Content Layout: collapsible extras above, full-width directory below */}
      <div className="flex flex-col gap-5">

        {/* Directory (full width) */}
        <div className="order-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm overflow-hidden">
            
            {/* Search, Filter Roles, Filter Status */}
            <div className="p-6 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-widest block">Directorio de Accesos</span>
                  <span className="text-xs font-bold text-slate-650 dark:text-slate-400 mt-1 block">Monitorea y configura las cuentas del personal registrado en la aplicación.</span>
                </div>
                
                <div className="relative w-full sm:w-64">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                    <Search className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nombre, correo, cel..."
                    className="pl-9 pr-4 py-2 w-full bg-white dark:bg-slate-850 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 focus:bg-white dark:focus:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl text-xs font-semibold outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition-colors shadow-sm dark:text-slate-200"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                {/* Segmented Selector for Roles */}
                {!isCurrentUserAM && (
                  <div className="bg-slate-200/55 dark:bg-slate-950 p-1 rounded-xl flex border border-slate-250/70 dark:border-slate-800/80 shadow-inner w-full sm:w-auto">
                    <button
                      onClick={() => setRoleFilter("all")}
                      className={`flex-1 sm:flex-none px-3.5 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                        roleFilter === "all" ? "bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      Todos ({totalUsers})
                    </button>
                    <button
                      onClick={() => setRoleFilter("aliado")}
                      className={`flex-1 sm:flex-none px-3.5 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                        roleFilter === "aliado" ? "bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      Aliados ({totalAllies})
                    </button>
                    <button
                      onClick={() => setRoleFilter("account_manager")}
                      className={`flex-1 sm:flex-none px-3.5 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                        roleFilter === "account_manager" ? "bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      AM ({totalAMs})
                    </button>
                    <button
                      onClick={() => setRoleFilter("director")}
                      className={`flex-1 sm:flex-none px-3.5 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                        roleFilter === "director" ? "bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      Directores ({totalDirectors})
                    </button>
                  </div>
                )}

                {/* Filter by Activation Status + Sort */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 dark:text-slate-500 font-semibold text-[10px] uppercase tracking-[0.08em]">Estado</span>
                    <select
                      value={statusFilter}
                      onChange={(e: any) => setStatusFilter(e.target.value)}
                      className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition-colors cursor-pointer"
                    >
                      <option value="all">Todos los estados</option>
                      <option value="active">Activos</option>
                      <option value="inactive">Inactivos</option>
                    </select>
                  </div>
                  <SortControl options={sortOptionsUsers} sort={sortU} accent="emerald" />
                </div>
              </div>
            </div>

            {/* Profiles Directory Table */}
            {filteredProfiles.length === 0 ? (
              <div className="py-20 text-center space-y-3 bg-white dark:bg-slate-900">
                <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mx-auto">
                  <UserX className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Sin usuarios encontrados</h4>
                  <p className="text-xs text-slate-450 dark:text-slate-500 mt-1">Prueba cambiando los filtros de búsqueda.</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/60 dark:bg-slate-900/30 border-b border-slate-150 dark:border-slate-800 text-left">
                      <SortHeader col="nombre" label="Usuario" sort={sortU} className="pl-6" />
                      <SortHeader col="rol" label="Rol del Sistema" sort={sortU} align="center" />
                      <SortHeader col="estado" label="Estado" sort={sortU} align="center" />
                      <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    {sortU.sorted.map((p) => {
                      const isUserActive = p.is_active !== false;
                      const meta = getRoleMeta(p.role);
                      const RoleIcon = meta.Icon;
                      return (
                        <tr key={p.id} className={`hover:bg-slate-50/60 dark:hover:bg-slate-850/20 transition-colors group ${!isUserActive ? "opacity-60" : ""}`}>
                          <td className={`pl-5 pr-4 py-2.5 border-l-2 ${meta.accent}`}>
                            <div className="flex items-center gap-2.5">
                              <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold border shrink-0 ${meta.avatar}`}>
                                {p.full_name.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <span className="font-bold text-slate-800 dark:text-slate-200 block leading-tight truncate">{p.full_name}</span>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-none block truncate">{p.email}</span>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-2.5 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${meta.badge}`}>
                              <RoleIcon className="h-3 w-3" strokeWidth={2.4} />
                              {meta.label}
                            </span>
                          </td>

                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {/* Status: clear label + toggle */}
                            <div className="flex items-center justify-center gap-2">
                              <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold ${isUserActive ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${isUserActive ? "bg-emerald-500" : "bg-slate-400"}`} />
                                {isUserActive ? "Activo" : "Inactivo"}
                              </span>
                              <button
                                onClick={() => handleToggleUserActive(p)}
                                title={isUserActive ? "Desactivar acceso" : "Activar acceso"}
                                className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                                style={{ backgroundColor: isUserActive ? "#10B981" : "#D1D5DB" }}
                              >
                                <span
                                  className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                                  style={{ transform: isUserActive ? "translateX(16px)" : "translateX(0px)" }}
                                />
                              </button>
                            </div>
                          </td>

                          <td className="px-4 py-2.5 whitespace-nowrap text-right text-xs">
                            <div className="flex items-center justify-end gap-2">
                              {/* Copy email */}
                              <button
                                onClick={() => handleCopyEmail(p.email)}
                                className="p-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-lg transition-colors border border-slate-200 dark:border-slate-750"
                                title="Copiar Correo"
                              >
                                {copiedUserEmail === p.email ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>

                              {/* Edit details */}
                              <button
                                onClick={() => handleOpenEditModal(p)}
                                className="p-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 dark:border-emerald-800/60 rounded-lg transition-colors border border-emerald-200 dark:border-emerald-850"
                                title="Editar Colaborador"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>

                              {/* Simulate Activation Email */}
                              <button
                                onClick={() => handleSimulateActivation(p.full_name, p.email)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 dark:border-slate-750 hover:bg-slate-50 dark:hover:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg transition-colors"
                                title="Enviar Enlace de Acceso"
                              >
                                <Send className="h-3.5 w-3.5" />
                                Acceso
                              </button>

                              {/* Delete Profile */}
                              <button
                                onClick={() => setDeleteTarget(p)}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-900/30 text-rose-500 dark:text-rose-400 dark:border-rose-800/60 rounded-lg transition-colors border border-rose-200 dark:border-rose-850"
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

        {/* Collapsible extras (latest registrations + invitation codes) — shown above the directory */}
        {showExtras && (
        <div className="order-1 grid grid-cols-1 md:grid-cols-2 gap-5 animate-fade-in">

          {/* Latest registrations Widget */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-4">
            <div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">Últimos Registros</span>
              <span className="text-xs font-bold text-slate-650 dark:text-slate-400 block mt-0.5">Novedades recientes en los accesos del sistema.</span>
            </div>

            <div className="space-y-3">
              {latestRegisteredUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-150 dark:border-slate-800/60">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-[10px] font-black border ${
                      u.role === "director" 
                        ? "bg-emerald-50 text-emerald-600 border-emerald-150 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-800/40" 
                        : u.role === "account_manager"
                          ? "bg-blue-50 text-blue-600 border-blue-150 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-800/40"
                          : "bg-teal-50 text-teal-650 border-teal-150 dark:bg-teal-500/10 dark:text-teal-400 dark:border-teal-800/40"
                    }`}>
                      {u.full_name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">{u.full_name}</span>
                      <span className="text-[9px] text-slate-450 dark:text-slate-500 font-semibold block uppercase">
                        {u.role === "director" ? "Director" : u.role === "account_manager" ? "Account Manager" : "Aliado Comercial"}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="block text-[8px] font-bold text-slate-450 dark:text-slate-500 uppercase">
                      {new Date(u.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                    </span>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full mt-1 ${u.is_active !== false ? "bg-emerald-500" : "bg-rose-450"}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Invitation Codes Widget */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Key className="h-4 w-4 text-emerald-500" />
                  Códigos de Invitación B2B
                </h3>
                <p className="text-slate-500 dark:text-slate-450 text-[10px] mt-0.5 leading-normal">
                  Genera códigos de seguridad de un solo uso para invitar a nuevos aliados comerciales.
                </p>
              </div>
              <button
                onClick={handleGenerateCode}
                disabled={isGenerating}
                className="p-2 bg-emerald-50 hover:bg-emerald-100/80 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-xl transition-all disabled:opacity-50 border border-emerald-100 dark:border-emerald-800/50"
                title="Generar Nuevo Código"
              >
                <Key className="h-4 w-4" />
              </button>
            </div>

            {/* In-Line Generated Code Widget */}
            {newlyGeneratedCode && (
              <div className="p-3 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 border border-emerald-150 dark:border-emerald-850/50 rounded-2xl animate-fade-in space-y-2 relative">
                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Nuevo Código Creado
                </span>
                <div className="flex items-center justify-between bg-white dark:bg-slate-850 border border-emerald-150 dark:border-emerald-800 rounded-xl p-2 shadow-sm">
                  <code className="text-slate-850 dark:text-slate-100 font-extrabold text-xs select-all tracking-wide">
                    {newlyGeneratedCode}
                  </code>
                  <button
                    onClick={() => handleCopyCode(newlyGeneratedCode)}
                    className="p-1 hover:bg-slate-150 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg transition-all"
                    title="Copiar Código"
                  >
                    {copiedCode === newlyGeneratedCode ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* List log of active/used invitation codes */}
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest block">
                Historial de Códigos
              </span>
              {myInvitationCodes.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 dark:text-slate-500 text-xs bg-slate-50/50 dark:bg-slate-950/20">
                  No hay códigos generados.
                </div>
              ) : (
                myInvitationCodes.map((code) => (
                  <div
                    key={code.id}
                    className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950/60 hover:bg-slate-100/50 dark:hover:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800/80 transition-colors"
                  >
                    <div className="space-y-0.5">
                      <code className="text-xs font-bold text-slate-700 dark:text-slate-200 select-all">{code.code}</code>
                      <span className="block text-[8px] text-slate-400 dark:text-slate-500 font-medium">
                        {new Date(code.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[8px] font-bold border ${
                          code.is_used
                            ? "bg-slate-100 text-slate-450 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700/50"
                            : "bg-teal-50 text-teal-600 border-teal-150 dark:bg-teal-950/20 dark:text-teal-400 dark:border-teal-850"
                        }`}
                      >
                        {code.is_used ? "Usado" : "Libre"}
                      </span>
                      {!code.is_used && (
                        <button
                          onClick={() => handleCopyCode(code.code)}
                          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                        >
                          {copiedCode === code.code ? (
                            <Check className="h-3 w-3 text-emerald-500 dark:text-emerald-400" />
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
        )}
      </div>

      {/* Creation & Editing Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl max-w-xl w-full p-6 border border-slate-200 dark:border-slate-800 mx-4 relative">
            
            {/* Modal Header */}
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-350"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-150 dark:border-slate-800 pb-3.5 mb-4">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${
                modalMode === "create" 
                  ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-150 dark:border-emerald-800/40 text-emerald-600 dark:text-emerald-400" 
                  : "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-150 dark:border-emerald-800/40 text-emerald-600 dark:text-emerald-400"
              }`}>
                {modalMode === "create" ? <UserPlus className="h-5 w-5" /> : <Edit3 className="h-5 w-5" />}
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-white">
                  {modalMode === "create" ? "Registrar Nuevo Colaborador" : "Editar Colaborador"}
                </h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
                  {modalMode === "create" ? "Genera un nuevo perfil y contraseña temporal de acceso." : "Edita datos personales y roles de acceso."}
                </p>
              </div>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitUser} className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="ej: Laura Martínez"
                  className={`w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 focus:bg-white dark:focus:bg-slate-850 border rounded-xl text-xs font-semibold outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition-colors text-slate-800 dark:text-slate-200 ${
                    formSubmitted && !isNameValid ? "border-red-400 dark:border-red-500" : "border-slate-200 dark:border-slate-750"
                  }`}
                  required
                />
                {formSubmitted && !isNameValid && (
                  <span className="text-[9px] text-red-500 dark:text-red-400 font-bold mt-1 block flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> El nombre debe ser más largo.
                  </span>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                    <Mail className="h-4 w-4" />
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ej: laura@prevision.com"
                    className={`w-full pl-10 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 focus:bg-white dark:focus:bg-slate-850 border rounded-xl text-xs font-semibold outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition-colors text-slate-800 dark:text-slate-200 ${
                      formSubmitted && !isEmailValid ? "border-red-400 dark:border-red-500" : "border-slate-200 dark:border-slate-750"
                    }`}
                    required
                  />
                </div>
                {formSubmitted && !isEmailValid && (
                  <span className="text-[9px] text-red-500 dark:text-red-400 font-bold mt-1 block flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Ingresa un correo electrónico válido.
                  </span>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Teléfono Móvil
                </label>
                <div className="flex gap-2">
                  <div className="relative">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="appearance-none h-full pl-2.5 pr-7 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 border border-slate-200 dark:border-slate-750 rounded-xl text-xs font-bold outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition-colors cursor-pointer text-slate-700 dark:text-slate-300"
                    >
                      {COUNTRIES.map((c) => (
                        <option key={`${c.flag}-${c.code}`} value={c.code} className="dark:bg-slate-900">
                          {c.flag} {c.code}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                      <span className="text-[8px]">▼</span>
                    </div>
                  </div>
                  <div className="relative flex-1">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                      <Phone className="h-4 w-4" />
                    </span>
                    <input
                      type="tel"
                      maxLength={10}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                      placeholder="10 dígitos"
                      className={`w-full pl-10 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 focus:bg-white dark:focus:bg-slate-850 border rounded-xl text-xs font-semibold outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition-colors text-slate-800 dark:text-slate-200 ${
                        formSubmitted && !isPhoneValid ? "border-red-400 dark:border-red-500" : "border-slate-200 dark:border-slate-750"
                      }`}
                      required
                    />
                  </div>
                </div>
                {formSubmitted && !isPhoneValid && (
                  <span className="text-[9px] text-red-500 dark:text-red-400 font-bold mt-1 block flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> El teléfono debe contener 10 dígitos exactos.
                  </span>
                )}
              </div>

              {/* Role Selection */}
              {!isCurrentUserAM && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Rol Asignado
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setRole("aliado")}
                      className={`py-2.5 px-3.5 border rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                        role === "aliado"
                          ? "bg-teal-50 dark:bg-teal-950/30 border-teal-500 text-teal-600 dark:text-teal-400"
                          : "bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-slate-750 text-slate-500 dark:text-slate-450 hover:bg-slate-100/40 dark:hover:bg-slate-800/40"
                      }`}
                    >
                      <UserCheck className="h-4 w-4" /> Aliado Comercial
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole("account_manager")}
                      className={`py-2.5 px-3.5 border rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                        role === "account_manager"
                          ? "bg-blue-50 dark:bg-blue-950/30 border-blue-500 text-blue-600 dark:text-blue-400"
                          : "bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-slate-750 text-slate-500 dark:text-slate-450 hover:bg-slate-100/40 dark:hover:bg-slate-800/40"
                      }`}
                    >
                      <ShieldCheck className="h-4 w-4" /> Account Manager
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole("director")}
                      className={`py-2.5 px-3.5 border rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                        role === "director"
                          ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 text-emerald-600 dark:text-emerald-400"
                          : "bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-slate-750 text-slate-500 dark:text-slate-450 hover:bg-slate-100/40 dark:hover:bg-slate-800/40"
                      }`}
                    >
                      <ShieldCheck className="h-4 w-4" /> Director Operativo
                    </button>
                  </div>
                </div>
              )}

              {/* Contraseña Provisoria */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Contraseña Provisoria <span className="text-slate-400 dark:text-slate-500 font-normal normal-case">(opcional – permite acceso directo sin verificar correo)</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                    <Key className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    value={passwordProvisional}
                    onChange={(e) => setPasswordProvisional(e.target.value)}
                    placeholder="ej: MiPass2026"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 focus:bg-white dark:focus:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl text-xs font-semibold outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition-colors text-slate-800 dark:text-slate-200"
                  />
                </div>
                {passwordProvisional && (
                  <span className="text-[9px] text-amber-500 dark:text-amber-400 font-semibold mt-1.5 block flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Esta contraseña permitirá al usuario iniciar sesión sin confirmar su correo electrónico.
                  </span>
                )}
              </div>

              {/* Activation Switch */}
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-150 dark:border-slate-800/80">
                <div>
                  <span className="block text-xs font-extrabold text-slate-800 dark:text-slate-200">Estado Operativo</span>
                  <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-none">Indica si el usuario puede acceder al sistema.</span>
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
                  className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition-all active:scale-95"
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 dark:from-emerald-500 dark:to-teal-500 dark:hover:from-emerald-600 dark:hover:to-teal-600 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-500/10 transition-all transform active:scale-95 flex items-center justify-center gap-1.5"
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
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200 dark:border-slate-800 mx-4">
            <div className="flex items-center gap-3 border-b border-slate-150 dark:border-slate-800 pb-3">
              <div className="h-10 w-10 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-500 dark:text-red-400 flex items-center justify-center border border-red-150 dark:border-red-800/40">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-white">Eliminar Colaborador</h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5">Esta acción revocará accesos y eliminará su código de invitación.</p>
              </div>
            </div>

            <div className="text-xs text-slate-650 dark:text-slate-350 leading-relaxed font-medium">
              ¿Estás seguro de que deseas eliminar permanentemente a <strong>{deleteTarget.full_name}</strong> ({deleteTarget.email})? 
              <br/><br/>
              Esta acción no se puede deshacer y también eliminará del sistema el código de invitación asociado a este perfil.
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition-all active:scale-95 transform"
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
                className="flex-1 py-2.5 bg-red-650 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white font-bold rounded-xl text-xs shadow-md shadow-red-500/10 transition-all transform active:scale-95"
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
