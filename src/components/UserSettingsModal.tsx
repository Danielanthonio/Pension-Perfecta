"use client";
import React, { useState, useEffect } from "react";
import { useApp } from "@/utils/context/AppContext";
import {
  User,
  Mail,
  Phone,
  Shield,
  Globe,
  HelpCircle,
  Sun,
  Moon,
  Sparkles,
  CheckCircle,
  X,
  Send,
  MessageSquare,
  Lock,
} from "lucide-react";

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserSettingsModal({ isOpen, onClose }: UserSettingsModalProps) {
  const { user, updateUserProfile, triggerPushNotification, profiles } = useApp();

  const [activeTab, setActiveTab] = useState<"personal" | "subscription" | "display" | "help">("personal");

  // Form states
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);

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
  const isAlly = user.role === "aliado";

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

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim()) {
      alert("Por favor completa tu nombre y teléfono.");
      return;
    }
    setIsUpdating(true);
    setUpdateSuccess(false);
    try {
      await updateUserProfile(fullName, phone);
      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      alert("Error al actualizar los datos personales.");
    } finally {
      setIsUpdating(false);
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
                { id: "subscription", label: "Suscripción", icon: Sparkles },
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
              <div className={`h-7.5 w-7.5 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${avatarBg}`}>
                {user.full_name.charAt(0)}
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
              {activeTab === "subscription" && "Detalles de membresía"}
              {activeTab === "display" && "Preferencias de interfaz"}
              {activeTab === "help" && "Canal de soporte B2B"}
            </span>
            <button
              onClick={onClose}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-lg transition-colors"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 p-6">
            
            {/* 1. Personal Data Tab */}
            {activeTab === "personal" && (
              <form onSubmit={handleUpdateProfile} className="space-y-4">
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
                      <Shield className={`h-4.5 w-4.5 shrink-0 ${textColor}`} />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-350">
                        {user.role === "director" ? "Director de Operaciones" : user.role === "account_manager" ? "Account Manager" : "Aliado Comercial"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Account Manager Asignado for Allies */}
                {isAlly && (
                  <div className="pt-2">
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                      Account Manager Asignado
                    </label>
                    <div className="flex items-center gap-2.5 px-3.5 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-xl">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                        profiles?.find((p) => p.id === user.account_manager_id)?.role === "account_manager"
                          ? "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                      }`}>
                        {profiles?.find((p) => p.id === user.account_manager_id)?.full_name.charAt(0) || "?"}
                      </div>
                      <div className="min-w-0">
                        <span className="block text-xs font-bold text-slate-700 dark:text-slate-300 truncate">
                          {profiles?.find((p) => p.id === user.account_manager_id)?.full_name || "Pendiente de asignación"}
                        </span>
                        <span className="block text-[9px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
                          {profiles?.find((p) => p.id === user.account_manager_id) ? "Asesor de pensiones asignado" : "Espera a ser asignado por el director"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

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

            {/* 2. Subscription Tab */}
            {activeTab === "subscription" && (
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-amber-500/10 to-yellow-600/10 border border-amber-500/20 rounded-3xl p-6 relative overflow-hidden">
                  <div className="absolute top-[-20px] right-[-20px] h-32 w-32 bg-amber-500/5 rounded-full blur-2xl" />
                  
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <span className="text-[8px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-widest">Plan Actual</span>
                      <h4 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
                        Acceso de Cortesía <Sparkles className="h-5 w-5 text-amber-500 fill-amber-500/20" />
                      </h4>
                    </div>
                    <span className="px-3 py-1 bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300/30 rounded-full text-[10px] font-black uppercase tracking-wider">
                      Gratuito e Ilimitado
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-4 leading-relaxed font-semibold">
                    Tu cuenta cuenta con una **licencia de cortesía corporativa**. Disfrutas de acceso completo sin costo a todos los cálculos financieros, visor de expedientes B2B, simulador interactivo Ley 73 y base de datos integrada en Supabase.
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-3.5 border-t border-slate-200/50 dark:border-slate-850 pt-5">
                    <div>
                      <span className="block text-[8px] text-slate-400 dark:text-slate-500 uppercase font-bold">Estado de Cuenta</span>
                      <span className="block text-xs font-black text-slate-800 dark:text-slate-200 mt-0.5">Activo (Sin vencimiento)</span>
                    </div>
                    <div>
                      <span className="block text-[8px] text-slate-400 dark:text-slate-500 uppercase font-bold">Costo del Plan</span>
                      <span className="block text-xs font-black text-amber-600 dark:text-amber-400 mt-0.5">$0 MXN / Cortesía</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-2xl flex items-center gap-3">
                  <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${avatarBg}`}>
                    <Lock className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-700 dark:text-slate-350">Licencia Segura</h5>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                      Cualquier cambio de suscripción futuro será notificado a través de tu administrador de operaciones.
                    </p>
                  </div>
                </div>
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
