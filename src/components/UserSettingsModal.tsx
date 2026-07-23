"use client";
import React, { useState, useEffect, useRef } from "react";
import { useApp, getProfileCompletion } from "@/utils/context/AppContext";
import {
  User,
  Mail,
  Phone,
  Shield,
  Globe,
  HelpCircle,
  Sun,
  Moon,
  CheckCircle,
  X,
  Send,
  MessageSquare,
  Camera,
  MapPin,
  Fingerprint,
  BadgeCheck,
  Loader2,
} from "lucide-react";

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserSettingsModal({ isOpen, onClose }: UserSettingsModalProps) {
  const { user, updateUserProfile, uploadAvatar, triggerPushNotification } = useApp();

  const [activeTab, setActiveTab] = useState<"personal" | "profile" | "display" | "help">("personal");

  // Form states
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [curp, setCurp] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [pais, setPais] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  // Avatar states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  // Settings states
  const [language, setLanguage] = useState("es");
  const [theme, setTheme] = useState("light");

  // Help states
  const [helpSubject, setHelpSubject] = useState("");
  const [helpMessage, setHelpMessage] = useState("");
  const [helpSent, setHelpSent] = useState(false);

  // Load initial data
  useEffect(() => {
    if (user) {
      setFullName(user.full_name);
      setPhone(user.phone || "");
      setCurp(user.curp || "");
      setCiudad(user.ciudad || "");
      setPais(user.pais || "México");
    }
  }, [user, isOpen]);

  // Load theme and language settings on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("pensionflow_theme") || "light";
      setTheme(savedTheme);
      const savedLang = localStorage.getItem("pensionflow_lang") || "es";
      setLanguage(savedLang);
    }
  }, [isOpen]);

  if (!isOpen || !user) return null;

  // Role based premium styling
  const isAM = user.role === "account_manager";
  const isDirector = user.role === "director";

  const primaryBg = isAM
    ? "bg-blue-600 hover:bg-blue-700 shadow-blue-600/10 disabled:bg-blue-400"
    : isDirector
    ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/10 disabled:bg-emerald-400"
    : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/10 disabled:bg-indigo-400";

  const activeTabClass = isAM
    ? "bg-blue-600 text-white shadow-md shadow-blue-600/10"
    : isDirector
    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/10"
    : "bg-indigo-600 text-white shadow-md shadow-indigo-600/10";

  const textColor = isAM
    ? "text-blue-600 dark:text-blue-400"
    : isDirector
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-indigo-600 dark:text-indigo-400";

  const focusBorder = isAM
    ? "focus:border-blue-500"
    : isDirector
    ? "focus:border-emerald-500"
    : "focus:border-indigo-500";

  const avatarBg = isAM
    ? "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"
    : isDirector
    ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
    : "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400";

  // Estado de completado del perfil (motivación, no limita nada).
  const completion = getProfileCompletion(user);
  const accentHex = isAM ? "#2563eb" : isDirector ? "#059669" : "#4f46e5";

  const curpTrimmed = curp.trim().toUpperCase();
  const curpLooksValid = curpTrimmed === "" || /^[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(curpTrimmed);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim()) {
      alert("Por favor completa tu nombre y teléfono.");
      return;
    }
    setIsUpdating(true);
    setUpdateSuccess(false);
    try {
      // CURP/ciudad/país son opcionales: no bloquean el guardado (solo suman al %).
      await updateUserProfile({
        full_name: fullName.trim(),
        phone: phone.trim(),
        curp: curpTrimmed || null,
        ciudad: ciudad.trim() || null,
        pais: pais.trim() || null,
      });
      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      alert("Error al actualizar los datos personales.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;
    setAvatarError("");
    setAvatarUploading(true);
    try {
      await uploadAvatar(file);
    } catch (err: any) {
      console.error(err);
      setAvatarError(err?.message || "No se pudo subir la foto.");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleThemeChange = (newTheme: "light" | "dark") => {
    setTheme(newTheme);
    localStorage.setItem("pensionflow_theme", newTheme);
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    localStorage.setItem("pensionflow_lang", lang);
    triggerPushNotification(
      `Idioma cambiado a ${lang === "es" ? "Español" : "Inglés"}`,
      "email",
      user.email
    );
  };

  const handleSendHelp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!helpSubject.trim() || !helpMessage.trim()) return;
    setHelpSent(true);
    triggerPushNotification(
      `Soporte Recibido: ${helpSubject}`,
      "whatsapp",
      user.phone || "Soporte"
    );
    setTimeout(() => {
      setHelpSent(false);
      setHelpSubject("");
      setHelpMessage("");
    }, 4000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row overflow-hidden max-h-[90vh] md:h-[550px] transition-colors duration-200">
        
        {/* Left Side: Navigation Tabs */}
        <div className="w-full md:w-56 bg-slate-50 dark:bg-slate-950 p-6 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between shrink-0">
          <div className="space-y-6">
            <div>
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Ajustes generales</span>
              <h3 className="text-sm font-black text-slate-800 dark:text-white tracking-tight mt-1">Configuración</h3>
            </div>

            <nav className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0">
              {[
                { id: "personal", label: "Datos Personales", icon: User },
                { id: "profile", label: "Mi Perfil", icon: BadgeCheck },
                { id: "display", label: "Pantalla e Idioma", icon: Globe },
                { id: "help", label: "Ayuda y Soporte", icon: HelpCircle },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
                      isActive
                        ? activeTabClass
                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-850 hover:text-slate-800 dark:hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="hidden md:block">
            <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center gap-2">
              <div className={`h-7 w-7 rounded-lg overflow-hidden flex items-center justify-center text-[10px] font-black shrink-0 ${avatarBg}`}>
                {user.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatar_url} alt={user.full_name} className="h-full w-full object-cover" />
                ) : (
                  user.full_name.charAt(0)
                )}
              </div>
              <div className="min-w-0">
                <span className="block text-[10px] font-bold text-slate-800 dark:text-slate-200 truncate">{user.full_name}</span>
                <span className="block text-[8px] text-slate-400 dark:text-slate-500 truncate capitalize font-semibold">{user.role}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Tab content */}
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 overflow-y-auto">
          {/* Header Close button */}
          <div className="p-6 pb-2 flex items-center justify-between border-b border-slate-100 dark:border-slate-850 shrink-0">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              {activeTab === "personal" && "Edición de perfil"}
              {activeTab === "profile" && "Estado del perfil"}
              {activeTab === "display" && "Preferencias de interfaz"}
              {activeTab === "help" && "Canal de soporte B2B"}
            </span>
            <button
              onClick={onClose}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-lg transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 p-6">
            
            {/* 1. Personal Data Tab */}
            {activeTab === "personal" && (
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                {/* Foto de perfil */}
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    <div className={`h-20 w-20 rounded-2xl overflow-hidden flex items-center justify-center text-2xl font-black ${avatarBg}`}>
                      {user.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={user.avatar_url} alt={user.full_name} className="h-full w-full object-cover" />
                      ) : (
                        user.full_name.charAt(0)
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={avatarUploading}
                      className={`absolute -bottom-1.5 -right-1.5 h-8 w-8 rounded-xl ${primaryBg} text-white flex items-center justify-center shadow-lg border-2 border-white dark:border-slate-900 transition-all active:scale-95 disabled:opacity-70`}
                      aria-label="Cambiar foto de perfil"
                    >
                      {avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-black text-slate-800 dark:text-white">Foto de perfil</h4>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5 leading-relaxed">
                      Se comprime automáticamente para cargar rápido. JPG o PNG.
                    </p>
                    {avatarError && <p className="text-[11px] text-rose-500 font-bold mt-1">{avatarError}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                      Nombre Completo
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className={`w-full pl-9.5 pr-3 bg-slate-50 dark:bg-slate-950 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-800 ${focusBorder} outline-none rounded-xl py-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 transition-colors`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                      Teléfono
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={`w-full pl-9.5 pr-3 bg-slate-50 dark:bg-slate-950 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-800 ${focusBorder} outline-none rounded-xl py-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 transition-colors`}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                    CURP
                  </label>
                  <div className="relative">
                    <Fingerprint className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={curp}
                      onChange={(e) => setCurp(e.target.value.toUpperCase())}
                      maxLength={18}
                      placeholder="18 caracteres — ej. GOVN680820HDFLNS02"
                      className={`w-full pl-9.5 pr-3 bg-slate-50 dark:bg-slate-950 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-800 ${focusBorder} outline-none rounded-xl py-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 transition-colors uppercase tracking-wide`}
                    />
                  </div>
                  {!curpLooksValid && (
                    <p className="text-[10px] text-amber-500 dark:text-amber-400 font-bold mt-1">
                      El formato de la CURP no parece correcto, pero puedes guardarlo igual.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                      Ciudad
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={ciudad}
                        onChange={(e) => setCiudad(e.target.value)}
                        placeholder="Ej. Guadalajara"
                        className={`w-full pl-9.5 pr-3 bg-slate-50 dark:bg-slate-950 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-800 ${focusBorder} outline-none rounded-xl py-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 transition-colors`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                      País
                    </label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={pais}
                        onChange={(e) => setPais(e.target.value)}
                        placeholder="México"
                        className={`w-full pl-9.5 pr-3 bg-slate-50 dark:bg-slate-950 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-800 ${focusBorder} outline-none rounded-xl py-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 transition-colors`}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                    Correo Electrónico (No modificable)
                  </label>
                  <div className="relative opacity-65">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      value={user.email}
                      disabled
                      className="w-full pl-9.5 pr-3 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl py-2.5 text-xs font-bold text-slate-500 dark:text-slate-500 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                      Perfil
                    </label>
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-xl">
                      <Shield className={`h-4 w-4 shrink-0 ${textColor}`} />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-350">
                        {user.role === "director" ? "Director de Operaciones" : user.role === "account_manager" ? "Account Manager" : "Aliado Comercial"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between gap-4">
                  {updateSuccess ? (
                    <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-bold animate-bounce">
                      <CheckCircle className="h-4 w-4" /> Datos actualizados con éxito
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
                      Los datos se sincronizan en Supabase
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isUpdating}
                    className={`px-6 py-2.5 ${primaryBg} text-white font-extrabold rounded-xl text-xs transition-all flex items-center gap-2 active:scale-95`}
                  >
                    {isUpdating ? "Guardando..." : "Actualizar Datos"}
                  </button>
                </div>
              </form>
            )}

            {/* 2. My Profile (completion) Tab */}
            {activeTab === "profile" && (
              <div className="space-y-5">
                {/* Hero: anillo de progreso + estado */}
                <div className="flex flex-col sm:flex-row items-center gap-5 p-5 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-3xl">
                  <div className="relative h-28 w-28 shrink-0">
                    <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="44" fill="none" strokeWidth="7" className="stroke-slate-200 dark:stroke-slate-800" />
                      <circle
                        cx="50"
                        cy="50"
                        r="44"
                        fill="none"
                        strokeWidth="7"
                        strokeLinecap="round"
                        stroke={completion.verified ? "#059669" : accentHex}
                        strokeDasharray={2 * Math.PI * 44}
                        strokeDashoffset={2 * Math.PI * 44 * (1 - completion.percent / 100)}
                        style={{ transition: "stroke-dashoffset .6s ease" }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center p-3.5">
                      <div className={`h-full w-full rounded-full overflow-hidden flex items-center justify-center text-2xl font-black ${avatarBg}`}>
                        {user.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={user.avatar_url} alt={user.full_name} className="h-full w-full object-cover" />
                        ) : (
                          user.full_name.charAt(0)
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-center sm:text-left min-w-0">
                    <div className="flex items-center justify-center sm:justify-start gap-2">
                      <span className="text-3xl font-black text-slate-800 dark:text-white tabular-nums">{completion.percent}%</span>
                      {completion.verified && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <BadgeCheck className="h-3.5 w-3.5" /> Verificado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1.5 leading-relaxed max-w-xs">
                      {completion.verified
                        ? "¡Tu perfil está completo y verificado! Gracias por mantener tus datos al día."
                        : `Completa tu perfil para verificarlo. Te ${completion.missing.length === 1 ? "falta" : "faltan"} ${completion.missing.length} ${completion.missing.length === 1 ? "dato" : "datos"}. No es obligatorio, pero nos ayuda a tener tu información al día.`}
                    </p>
                  </div>
                </div>

                {/* Checklist de datos */}
                <div className="space-y-2">
                  <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Checklist de datos
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {completion.items.map((item) => (
                      <div
                        key={item.key}
                        className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-colors ${
                          item.done
                            ? "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-900/40 text-slate-700 dark:text-slate-300"
                            : "bg-slate-50 dark:bg-slate-950 border-slate-150 dark:border-slate-850 text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        {item.done ? (
                          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
                        ) : (
                          <div className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-300 dark:border-slate-700" />
                        )}
                        {item.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA a completar */}
                {!completion.verified && (
                  <button
                    onClick={() => setActiveTab("personal")}
                    className={`w-full py-2.5 ${primaryBg} text-white font-extrabold rounded-xl text-xs transition-all active:scale-95 flex items-center justify-center gap-2`}
                  >
                    <User className="h-3.5 w-3.5" /> Completar datos faltantes
                  </button>
                )}
              </div>
            )}

            {/* 3. Display & Language Tab */}
            {activeTab === "display" && (
              <div className="space-y-6">
                
                {/* Language selection */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5">
                    Idioma de la plataforma
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: "es", label: "Español (MX) 🇲🇽" },
                      { id: "en", label: "English (US) 🇺🇸" },
                    ].map((lang) => {
                      const isSelected = language === lang.id;
                      return (
                        <div
                          key={lang.id}
                          onClick={() => handleLanguageChange(lang.id)}
                          className={`p-3.5 border rounded-2xl cursor-pointer text-center text-xs font-bold transition-all ${
                            isSelected
                              ? isAM
                                ? "border-blue-600 bg-blue-50/20 text-blue-700 dark:text-blue-450"
                                : isDirector
                                ? "border-emerald-600 bg-emerald-50/20 text-emerald-700 dark:text-emerald-450"
                                : "border-indigo-600 bg-indigo-50/20 text-indigo-700 dark:text-indigo-450"
                              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:border-slate-300 hover:bg-slate-50/30"
                          }`}
                        >
                          {lang.label}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Theme Selector */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5">
                    Ajustes de Pantalla (Tema)
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    
                    {/* Light Theme */}
                    <div
                      onClick={() => handleThemeChange("light")}
                      className={`p-4 border rounded-2xl cursor-pointer flex flex-col items-center gap-2 transition-all ${
                        theme === "light"
                          ? isAM
                            ? "border-blue-600 bg-blue-50/20 text-blue-700 dark:text-blue-450"
                            : isDirector
                            ? "border-emerald-600 bg-emerald-50/20 text-emerald-700 dark:text-emerald-450"
                            : "border-indigo-600 bg-indigo-50/20 text-indigo-700 dark:text-indigo-450"
                          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                      }`}
                    >
                      <Sun className="h-5 w-5 text-amber-500" />
                      <span className="text-xs font-extrabold">Tema Claro</span>
                    </div>

                    {/* Dark Theme */}
                    <div
                      onClick={() => handleThemeChange("dark")}
                      className={`p-4 border rounded-2xl cursor-pointer flex flex-col items-center gap-2 transition-all ${
                        theme === "dark"
                          ? isAM
                            ? "border-blue-600 bg-blue-50/20 text-blue-750 dark:text-blue-400"
                            : isDirector
                            ? "border-emerald-600 bg-emerald-50/20 text-emerald-750 dark:text-emerald-400"
                            : "border-indigo-600 bg-indigo-50/20 text-indigo-750 dark:text-indigo-400"
                          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                      }`}
                    >
                      <Moon className={`h-5 w-5 ${isAM ? "text-blue-500" : isDirector ? "text-emerald-500" : "text-indigo-500"}`} />
                      <span className="text-xs font-extrabold">Tema Oscuro</span>
                    </div>

                  </div>
                </div>

              </div>
            )}

            {/* 4. Help & Support Tab */}
            {activeTab === "help" && (
              <div className="space-y-4">
                <div className="bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 p-4.5 rounded-2xl flex items-center gap-3">
                  <MessageSquare className={`h-5 w-5 shrink-0 ${textColor}`} />
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed font-semibold">
                    ¿Tienes dudas operativas sobre el simulador Ley 73 o problemas con algún expediente? Escríbenos directamente y te daremos soporte prioritario.
                  </p>
                </div>

                <form onSubmit={handleSendHelp} className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                      Asunto o Problema
                    </label>
                    <input
                      type="text"
                      value={helpSubject}
                      onChange={(e) => setHelpSubject(e.target.value)}
                      placeholder="Ej. Error al subir visor AFORE o discrepancia en semanas..."
                      className={`w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-800 ${focusBorder} outline-none rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 transition-colors`}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                      Mensaje Detallado
                    </label>
                    <textarea
                      value={helpMessage}
                      onChange={(e) => setHelpMessage(e.target.value)}
                      rows={3}
                      placeholder="Escribe paso a paso lo que sucede o la duda técnica..."
                      className={`w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-800 ${focusBorder} outline-none rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors resize-none`}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    {helpSent ? (
                      <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-1">
                        <CheckCircle className="h-4 w-4" /> Mensaje enviado. ¡Nos contactaremos pronto!
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold">
                        Soporte B2B 24/7 disponible
                      </span>
                    )}

                    <button
                      type="submit"
                      disabled={helpSent || !helpSubject.trim() || !helpMessage.trim()}
                      className={`px-5 py-2 ${primaryBg} text-white font-extrabold rounded-xl text-xs transition-colors flex items-center gap-2 active:scale-95`}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Enviar Soporte
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
