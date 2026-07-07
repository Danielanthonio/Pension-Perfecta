"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useApp, STAGES_LIST, SUB_STAGES_BY_STAGE, getProfileCompletion } from "@/utils/context/AppContext";
import {
  LayoutDashboard,
  Folder,
  Plus,
  Bell,
  LogOut,
  X,
  Check,
  CheckCircle,
  AlertTriangle,
  Info,
  Clock,
  Heart,
  Menu,
  SlidersHorizontal,
  RotateCcw,
  Calendar,
  Contact,
  Filter,
  ChevronDown,
  Sun,
  Moon,
  Users,
} from "lucide-react";
import React, { useState, useEffect, Suspense } from "react";
import UserSettingsModal from "@/components/UserSettingsModal";

function SidebarLinks({ onLinkClick, collapsed }: { onLinkClick: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useApp();
  const currentParamsString = searchParams.toString();
  const qs = currentParamsString ? `?${currentParamsString}` : "";

  const cleanPath = pathname.replace(/\/$/, "");
  const isLeader = user?.aliado_tipo === "lider";

  const items = [
    { href: `/dashboard${qs}`, active: cleanPath === "/dashboard", Icon: LayoutDashboard, label: "Dashboard" },
    { href: `/dashboard/clientes${qs}`, active: cleanPath === "/dashboard/clientes", Icon: Contact, label: "Mis Clientes" },
    ...(isLeader
      ? [{ href: `/dashboard/aliados${qs}`, active: cleanPath === "/dashboard/aliados", Icon: Users, label: "Mis Aliados" }]
      : []),
  ];

  return (
    <>
      {items.map(({ href, active, Icon, label }) => (
        <Link
          key={href}
          href={href}
          onClick={onLinkClick}
          title={label}
          className={`group flex items-center py-2 text-xs font-extrabold rounded-xl transition-all tracking-wide uppercase ${
            collapsed ? "px-2 md:justify-center md:px-2" : "px-2"
          } ${
            active
              ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/10"
              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
          }`}
        >
          <span className={`flex items-center justify-center h-8 w-8 rounded-lg shrink-0 transition-colors ${collapsed ? "md:mr-0 mr-3" : "mr-3"} ${
            active ? "bg-white/15" : "bg-slate-800/70 group-hover:bg-slate-700/70"
          }`}>
            <Icon className="h-4 w-4 stroke-[2.5]" />
          </span>
          <span className={collapsed ? "md:hidden" : ""}>{label}</span>
        </Link>
      ))}
    </>
  );
}

function SidebarFilters({ collapsed }: { collapsed?: boolean }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // Filter states
  const [localStartDate, setLocalStartDate] = useState("");
  const [localEndDate, setLocalEndDate] = useState("");
  const [localStageFilter, setLocalStageFilter] = useState("all");
  const [localSubStageFilter, setLocalSubStageFilter] = useState("all");

  // Sync filters from URL search params
  useEffect(() => {
    setLocalStartDate(searchParams.get("desde") || "");
    setLocalEndDate(searchParams.get("hasta") || "");
    setLocalStageFilter(searchParams.get("etapa") || "all");
    setLocalSubStageFilter(searchParams.get("subetapa") || "all");
  }, [searchParams]);

  const handleApplyFilters = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (localStartDate) params.set("desde", localStartDate);
    else params.delete("desde");

    if (localEndDate) params.set("hasta", localEndDate);
    else params.delete("hasta");

    if (localStageFilter !== "all") params.set("etapa", localStageFilter);
    else params.delete("etapa");

    if (localSubStageFilter !== "all") params.set("subetapa", localSubStageFilter);
    else params.delete("subetapa");

    router.push(`${pathname}?${params.toString()}`);
  };

  const handleClearFilters = () => {
    setLocalStartDate("");
    setLocalEndDate("");
    setLocalStageFilter("all");
    setLocalSubStageFilter("all");

    const params = new URLSearchParams(searchParams.toString());
    params.delete("desde");
    params.delete("hasta");
    params.delete("etapa");
    params.delete("subetapa");

    router.push(`${pathname}?${params.toString()}`);
  };

  const cleanPath = pathname.replace(/\/$/, "");
  const isDashboard = cleanPath === "/dashboard";
  const isClientes = cleanPath === "/dashboard/clientes";

  if (!isDashboard && !isClientes) return null;

  const subStagesList = localStageFilter !== "all" ? (SUB_STAGES_BY_STAGE[localStageFilter] || []) : [];

  return (
    <div className={`pt-8 border-t border-slate-800/55 mt-6 space-y-4 ${collapsed ? "md:hidden" : ""}`}>
      <div className="flex items-center gap-2 px-4">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 shrink-0">
          FILTRAR
        </span>
        <div className="h-px bg-slate-850 flex-1"></div>
      </div>

      {/* Rango de Fechas */}
      <div className="mx-3 p-3.5 space-y-3 rounded-2xl bg-slate-900/50 border border-slate-800/70 shadow-inner shadow-black/20">
        <div className="flex items-center gap-2 text-slate-300 text-xs font-bold">
          <span className="h-6 w-6 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center ring-1 ring-inset ring-emerald-500/20">
            <Calendar className="h-3.5 w-3.5" />
          </span>
          <span>Rango de fechas</span>
        </div>
        
        <div className="space-y-2.5">
          <div>
            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Desde</label>
            <input
              type="date"
              value={localStartDate}
              onChange={(e) => setLocalStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-200 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all"
            />
          </div>
          <div>
            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Hasta</label>
            <input
              type="date"
              value={localEndDate}
              onChange={(e) => setLocalEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-200 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all"
            />
          </div>
        </div>

        {/* Etapas Dropdowns */}
        <div className="space-y-2.5 pt-2">
          <div>
            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Etapa</label>
            <select
              value={localStageFilter}
              onChange={(e) => {
                setLocalStageFilter(e.target.value);
                setLocalSubStageFilter("all");
              }}
              className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-350 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all cursor-pointer"
            >
              <option value="all">Todas las Etapas</option>
              {STAGES_LIST.map((stage) => (
                <option key={stage.id} value={stage.id} className="bg-slate-900 text-slate-200">
                  {stage.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Subetapa</label>
            <select
              value={localSubStageFilter}
              onChange={(e) => setLocalSubStageFilter(e.target.value)}
              disabled={localStageFilter === "all"}
              className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-350 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <option value="all">Todas las Subetapas</option>
              {subStagesList.map((sub) => (
                <option key={sub} value={sub} className="bg-slate-900 text-slate-200">
                  {sub}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="space-y-2 pt-4">
          <button
            onClick={handleApplyFilters}
            className="w-full px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-650 text-white rounded-xl text-xs font-bold hover:from-emerald-500 hover:to-teal-500 hover:shadow-md transition-all active:scale-[0.98] transform flex items-center justify-center gap-2"
          >
            <Filter className="h-3.5 w-3.5" />
            Aplicar Filtros
          </button>
          <button
            onClick={handleClearFilters}
            className="w-full py-2 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Limpiar filtros
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    user,
    profiles,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    isDemoMode,
    isProvisionalSession,
    isLoading,
    logout,
  } = useApp();

  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("pensionflow_theme") || "light";
      setCurrentTheme(savedTheme as any);
      setIsCollapsed(localStorage.getItem("pensionflow_sidebar_collapsed") === "1");
    }
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("pensionflow_sidebar_collapsed", next ? "1" : "0");
      }
      return next;
    });
  };

  const toggleTheme = () => {
    const nextTheme = currentTheme === "light" ? "dark" : "light";
    setCurrentTheme(nextTheme);
    localStorage.setItem("pensionflow_theme", nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  // Protect client side routes
  useEffect(() => {
    if (mounted && !isLoading) {
      if (!user) {
        router.push("/login");
      } else if (user.role === "director" || user.role === "account_manager") {
        router.push("/admin");
      }
    }
  }, [user, mounted, isLoading, router]);

  if (!mounted || isLoading || !user || user.role === "director" || user.role === "account_manager") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-400">
            {isLoading ? "Cargando Plataforma..." : (user?.role === "director" || user?.role === "account_manager") ? "Redireccionando..." : "Cargando Portal..."}
          </span>
        </div>
      </div>
    );
  }

  const cleanPath = pathname.replace(/\/$/, "");
  const isDashboard = cleanPath === "/dashboard";
  const isClientes = cleanPath === "/dashboard/clientes";

  const unreadNotifsCount = notifications.filter((n) => !n.read).length;

  const handleRoleSwitch = () => {
    router.push("/admin");
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  // Get dynamic header titles
  const getHeaderTitle = () => {
    const cleanPath = pathname.replace(/\/$/, "");
    if (cleanPath === "/dashboard") {
      return {
        title: "Dashboard",
        subtitle: "Resumen general de tu embudo comercial (Sales Funnel).",
      };
    }
    if (cleanPath === "/dashboard/clientes") {
      return {
        title: "Mis Clientes",
        subtitle: "Gestiona tus prospectos, sus etapas finales y subetapas.",
      };
    }
    if (cleanPath === "/dashboard/aliados") {
      return {
        title: "Mis Aliados Asignados",
        subtitle: "Visualiza los asesores comerciales asignados bajo tu liderazgo.",
      };
    }
    if (cleanPath === "/dashboard/nuevo") {
      return {
        title: "Subir Prospecto",
        subtitle: "Registra un nuevo prospecto y adjunta su documentación.",
      };
    }
    return {
      title: "Panel Aliado",
      subtitle: "Portal de Pensiones de Pensión Perfecta.",
    };
  };

  const headerInfo = getHeaderTitle();

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-row selection:bg-blue-500 selection:text-white transition-colors duration-200">
      
      {/* Impersonation Bar Floating at the top of content */}
      {isDemoMode && (
        <div className="fixed top-0 left-0 right-0 h-10 bg-slate-900 border-b border-slate-800 text-slate-200 px-6 py-2 flex items-center justify-between text-xs font-semibold z-40 md:pl-[17rem]">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              💡 MODO EVALUACIÓN • Vista Comercial: <span className="text-emerald-400">{user.full_name} (Aliado)</span>
            </span>
          </div>
          <button
            onClick={handleRoleSwitch}
            className="px-3 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-1.5 active:scale-95 transform font-bold shadow-sm text-[10px]"
          >
            Switch to Director View ⚙️
          </button>
        </div>
      )}

      {/* Mobile Sidebar Backdrop Overlay */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/60 backdrop-blur-sm md:hidden"
        />
      )}

      {/* Left Sidebar Layout */}
      <aside
         className={`fixed inset-y-0 left-0 z-40 w-64 ${
          isCollapsed ? "md:w-[76px]" : "md:w-64"
        } bg-[#070b12] text-slate-300 flex flex-col border-r border-slate-800 transition-all duration-300 md:translate-x-0 md:static ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Sidebar Header / Logo */}
        <div className={`h-20 flex items-center border-b border-slate-800/80 gap-2.5 px-6 ${isCollapsed ? "md:justify-center md:px-0" : ""}`}>
          <Heart className="h-6 w-6 text-emerald-400 fill-emerald-400/20 shrink-0" strokeWidth={2.5} />
          <div className={isCollapsed ? "md:hidden" : ""}>
            <span className="text-lg font-black tracking-tight text-white bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
              Pensión Perfecta
            </span>
            <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-wider leading-none mt-0.5">
              Portal Aliados
            </span>
          </div>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto no-scrollbar">
          <Suspense fallback={<div className="h-24 px-4 py-3 text-[10px] text-slate-500">Cargando enlaces...</div>}>
            <SidebarLinks onLinkClick={() => setIsSidebarOpen(false)} collapsed={isCollapsed} />
          </Suspense>

          {/* Collapsible sidebar filter widgets wrapped in Suspense */}
          <Suspense fallback={<div className="px-4 py-3 text-[10px] text-slate-500">Cargando filtros...</div>}>
            <SidebarFilters collapsed={isCollapsed} />
          </Suspense>
        </nav>
      </aside>

      {/* Main Right Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className={`h-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 sm:px-10 flex items-center justify-between flex-shrink-0 z-20 transition-all ${isDemoMode ? "mt-10" : ""}`}>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <button
              onClick={toggleCollapse}
              className="hidden md:inline-flex p-2.5 -ml-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors active:scale-95"
              title={isCollapsed ? "Mostrar menú" : "Ocultar menú"}
              aria-label={isCollapsed ? "Mostrar menú" : "Ocultar menú"}
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="hidden sm:flex items-center gap-3">
              <span className="h-9 w-1 rounded-full bg-gradient-to-b from-emerald-400 to-teal-600" />
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-white leading-tight tracking-tight">
                  {headerInfo.title}
                </h2>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-none mt-1 font-medium">
                  {headerInfo.subtitle}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4.5">
            {/* Notification Bell */}
            <button
              onClick={() => setNotifDrawerOpen(true)}
              className="relative p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 rounded-xl transition-colors active:scale-95 transform"
            >
              <Bell className="h-4.5 w-4.5" />
              {unreadNotifsCount > 0 && (
                <span className="absolute top-[-2px] right-[-2px] h-4.5 min-w-[18px] px-1 rounded-full bg-emerald-500 text-white font-extrabold text-[9px] flex items-center justify-center animate-bounce border border-white dark:border-slate-900 shadow-sm">
                  {unreadNotifsCount}
                </span>
              )}
            </button>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 rounded-xl transition-colors active:scale-95 transform"
              title={currentTheme === "light" ? "Activar modo oscuro" : "Activar modo claro"}
            >
              {currentTheme === "light" ? (
                <Moon className="h-4.5 w-4.5" />
              ) : (
                <Sun className="h-4.5 w-4.5 text-amber-500" />
              )}
            </button>

            {/* Nudge: completar perfil (recordatorio persistente, no bloqueante) */}
            {user && !getProfileCompletion(user).verified && (
              <button
                onClick={() => setSettingsOpen(true)}
                className="hidden md:flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full border border-amber-300/50 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors active:scale-95"
                title="Completa tu perfil para verificarlo"
              >
                <svg className="h-5 w-5 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15" fill="none" strokeWidth="4" className="stroke-amber-200 dark:stroke-amber-900/60" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    strokeWidth="4"
                    strokeLinecap="round"
                    className="stroke-amber-500"
                    strokeDasharray={2 * Math.PI * 15}
                    strokeDashoffset={2 * Math.PI * 15 * (1 - getProfileCompletion(user).percent / 100)}
                  />
                </svg>
                <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap">
                  Completa tu perfil · {getProfileCompletion(user).percent}%
                </span>
              </button>
            )}

            {/* User Profile Widget */}
            {user && (
              <div
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-3.5 pl-4 border-l border-slate-200 dark:border-slate-800 select-none cursor-pointer hover:opacity-85 transition-opacity"
              >
                <div className="text-right hidden sm:block">
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    Aliado
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5 justify-end">
                    <span className="block text-xs font-black text-slate-800 dark:text-white leading-none">
                      {user.full_name}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full bg-emerald-500 flex items-center justify-center text-white text-sm font-black shadow-sm overflow-hidden">
                  {user.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar_url} alt={user.full_name} className="h-full w-full object-cover" />
                  ) : (
                    user.full_name.charAt(0)
                  )}
                </div>
              </div>
            )}

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="p-2.5 bg-slate-100 hover:bg-red-50/10 hover:text-red-400 text-slate-500 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-400 rounded-xl transition-all border border-slate-200/40 dark:border-slate-700/40 active:scale-95"
              title="Cerrar Sesión"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
          </div>
        </header>

        {/* Dynamic App Route Content */}
        <main className="flex-grow overflow-y-auto p-6 sm:p-10 bg-[#f8fafc] dark:bg-slate-900 transition-colors duration-200">
          <div className="max-w-[1700px] mx-auto w-full">
            {isProvisionalSession && (
              <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3 shadow-sm">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">
                    Modo Emergencia Local Activo (Sesión Provisional)
                  </h4>
                  <p className="text-[11px] text-slate-650 dark:text-slate-400 leading-normal">
                    Tu correo electrónico no está confirmado en Supabase. El sistema ha activado el almacenamiento local en este navegador para prevenir la pérdida de tus prospectos. **Pide al administrador desactivar "Confirm Email" en Supabase Auth** para habilitar la sincronización en la nube.
                  </p>
                </div>
              </div>
            )}
            {children}
          </div>
        </main>
      </div>

      {/* User Settings Modal */}
      <UserSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Notifications Right Drawer */}
      {notifDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            onClick={() => setNotifDrawerOpen(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
          />

          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col z-10 border-l border-slate-200 dark:border-slate-800 transform transition-transform duration-300">
            <div className="p-6 border-b border-slate-150 dark:border-slate-850 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-base font-bold text-slate-800 dark:text-white font-black font-black">Notificaciones</h3>
                {unreadNotifsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                    {unreadNotifsCount} nuevas
                  </span>
                )}
              </div>
              <button
                onClick={() => setNotifDrawerOpen(false)}
                className="p-1.5 bg-slate-200/50 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {unreadNotifsCount > 0 && (
              <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  onClick={markAllNotificationsRead}
                  className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1.5"
                >
                  <Check className="h-3.5 w-3.5" />
                  Marcar todas como leídas
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {notifications.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500">
                    <CheckCircle className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-700 dark:text-slate-350 font-black">Sin notificaciones</h4>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-[200px] mx-auto">
                      Te avisaremos por aquí cuando ocurran eventos importantes en tu pipeline.
                    </p>
                  </div>
                </div>
              ) : (
                notifications.map((notif) => {
                  return (
                    <div
                      key={notif.id}
                      onClick={() => markNotificationRead(notif.id)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex gap-3 relative ${
                        notif.read
                          ? "bg-slate-50/50 dark:bg-slate-950/20 border-slate-100 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-950/40"
                          : "bg-emerald-50/20 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/30 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20"
                      }`}
                    >
                      {!notif.read && (
                        <span className="absolute top-4 right-4 h-2.5 w-2.5 rounded-full bg-emerald-500 shadow shadow-emerald-500" />
                      )}

                      <div className="flex-shrink-0">
                        <div
                          className={`h-9 w-9 rounded-xl flex items-center justify-center ${
                            notif.type === "success"
                              ? "bg-emerald-55 dark:bg-emerald-950/30 text-emerald-500 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30"
                              : notif.type === "alert"
                                ? "bg-red-50 dark:bg-red-950/30 text-red-500 dark:text-red-400 border border-red-100 dark:border-red-900/30"
                                : notif.type === "warning"
                                  ? "bg-amber-50 dark:bg-amber-950/30 text-amber-500 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30"
                                  : "bg-teal-50 dark:bg-teal-950/30 text-teal-500 dark:text-teal-400 border border-teal-100 dark:border-teal-900/30"
                          }`}
                        >
                          {notif.type === "success" ? (
                            <CheckCircle className="h-4.5 w-4.5" />
                          ) : notif.type === "alert" ? (
                            <AlertTriangle className="h-4.5 w-4.5" />
                          ) : (
                            <Info className="h-4.5 w-4.5" />
                          )}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight">
                          {notif.title}
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-normal">
                          {notif.message}
                        </p>
                        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold mt-2 block flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                          {new Date(notif.created_at).toLocaleString("es-MX", {
                            hour: "2-digit",
                            minute: "2-digit",
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
