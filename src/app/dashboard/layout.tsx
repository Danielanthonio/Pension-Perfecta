"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useApp, STAGES_LIST, SUB_STAGES_BY_STAGE } from "@/utils/context/AppContext";
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
} from "lucide-react";
import React, { useState, useEffect, Suspense } from "react";
import UserSettingsModal from "@/components/UserSettingsModal";

function SidebarLinks({ onLinkClick }: { onLinkClick: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentParamsString = searchParams.toString();

  const cleanPath = pathname.replace(/\/$/, "");
  const isDashboard = cleanPath === "/dashboard";
  const isClientes = cleanPath === "/dashboard/clientes";

  const dashboardHref = currentParamsString ? `/dashboard?${currentParamsString}` : "/dashboard";
  const clientesHref = currentParamsString ? `/dashboard/clientes?${currentParamsString}` : "/dashboard/clientes";

  return (
    <>
      <Link
        href={dashboardHref}
        onClick={onLinkClick}
        className={`flex items-center px-4 py-3 text-xs font-extrabold rounded-xl transition-all tracking-wide uppercase group ${
          isDashboard
            ? "bg-gradient-to-r from-indigo-650 to-blue-600 text-white shadow-md shadow-indigo-500/10"
            : "text-slate-400 hover:text-white hover:bg-slate-800/50"
        }`}
      >
        <LayoutDashboard className="mr-3 h-4.5 w-4.5 stroke-[2.5]" />
        Dashboard
      </Link>

      <Link
        href={clientesHref}
        onClick={onLinkClick}
        className={`flex items-center px-4 py-3 text-xs font-extrabold rounded-xl transition-all tracking-wide uppercase group ${
          isClientes
            ? "bg-gradient-to-r from-indigo-650 to-blue-600 text-white shadow-md shadow-indigo-500/10"
            : "text-slate-400 hover:text-white hover:bg-slate-800/50"
        }`}
      >
        <Contact className="mr-3 h-4.5 w-4.5 stroke-[2.5]" />
        Mis Clientes (Listado)
      </Link>
    </>
  );
}

function SidebarFilters() {
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

  const isDashboard = pathname === "/dashboard";
  const isClientes = pathname === "/dashboard/clientes";

  if (!isDashboard && !isClientes) return null;

  const subStagesList = localStageFilter !== "all" ? (SUB_STAGES_BY_STAGE[localStageFilter] || []) : [];

  return (
    <div className="pt-8 border-t border-slate-800/55 mt-6 space-y-4">
      <div className="flex items-center gap-2 px-4">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 shrink-0">
          FILTRAR
        </span>
        <div className="h-px bg-slate-850 flex-1"></div>
      </div>

      {/* Rango de Fechas */}
      <div className="px-4 space-y-3">
        <div className="flex items-center gap-2 text-slate-400 text-xs font-bold">
          <Calendar className="h-3.5 w-3.5 text-indigo-400" />
          <span>Rango de fechas</span>
        </div>
        
        <div className="space-y-2.5">
          <div>
            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Desde</label>
            <input
              type="date"
              value={localStartDate}
              onChange={(e) => setLocalStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-505/30 transition-all"
            />
          </div>
        </div>

        {/* Etapas Dropdowns */}
        <div className="space-y-2.5 pt-2">
          <div>
            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Hasta</label>
            <select
              value={localStageFilter}
              onChange={(e) => {
                setLocalStageFilter(e.target.value);
                setLocalSubStageFilter("all");
              }}
              className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-350 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-505/30 transition-all cursor-pointer"
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
            <label className="block text-[9px] font-bold text-slate-505 uppercase mb-1">Subetapa</label>
            <select
              value={localSubStageFilter}
              onChange={(e) => setLocalSubStageFilter(e.target.value)}
              disabled={localStageFilter === "all"}
              className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-350 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
            className="w-full px-4 py-2.5 bg-gradient-to-r from-violet-650 to-indigo-600 text-white rounded-xl text-xs font-bold hover:from-violet-550 hover:to-indigo-500 hover:shadow-md transition-all active:scale-[0.98] transform flex items-center justify-center gap-2"
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
    logout,
  } = useApp();

  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Protect client side routes
  useEffect(() => {
    if (mounted) {
      if (!user) {
        router.push("/login");
      } else if (user.role === "director" || user.role === "account_manager") {
        router.push("/admin");
      }
    }
  }, [user, mounted, router]);

  if (!mounted || !user || user.role === "director" || user.role === "account_manager") {
    return (
      <div className="min-h-screen bg-slate-955 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-400">
            {(user?.role === "director" || user?.role === "account_manager") ? "Redireccionando..." : "Cargando Portal..."}
          </span>
        </div>
      </div>
    );
  }

  const isDashboard = pathname === "/dashboard";
  const isClientes = pathname === "/dashboard/clientes";

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
        <div className="fixed top-0 left-0 right-0 h-10 bg-slate-900 border-b border-slate-800 text-slate-200 px-6 py-2 flex items-center justify-between text-xs font-semibold z-45 md:pl-[17rem]">
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
         className={`fixed inset-y-0 left-0 z-35 w-64 bg-[#0f172a] text-slate-300 flex flex-col border-r border-slate-800 transition-transform duration-300 md:translate-x-0 md:static ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Sidebar Header / Logo */}
        <div className="h-20 flex items-center px-6 border-b border-slate-800/80 gap-2.5">
          <Heart className="h-6 w-6 text-emerald-400 fill-emerald-400/20" strokeWidth={2.5} />
          <div>
            <span className="text-lg font-black tracking-tight text-white bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
              Pensión Perfecta
            </span>
            <span className="block text-[9px] text-slate-505 font-bold uppercase tracking-wider leading-none mt-0.5">
              Portal Aliados
            </span>
          </div>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto no-scrollbar">
          <Suspense fallback={<div className="h-24 px-4 py-3 text-[10px] text-slate-500">Cargando enlaces...</div>}>
            <SidebarLinks onLinkClick={() => setIsSidebarOpen(false)} />
          </Suspense>

          {/* Collapsible sidebar filter widgets wrapped in Suspense */}
          <Suspense fallback={<div className="px-4 py-3 text-[10px] text-slate-550">Cargando filtros...</div>}>
            <SidebarFilters />
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
            
            <div className="hidden sm:block">
              <h2 className="text-lg font-black text-slate-800 dark:text-white leading-tight">
                {headerInfo.title}
              </h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-none mt-1 font-medium">
                {headerInfo.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4.5">
            {/* Notification Bell */}
            <button
              onClick={() => setNotifDrawerOpen(true)}
              className="relative p-2.5 bg-slate-105 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 rounded-xl transition-colors active:scale-95 transform"
            >
              <Bell className="h-4.5 w-4.5" />
              {unreadNotifsCount > 0 && (
                <span className="absolute top-[-2px] right-[-2px] h-4.5 min-w-[18px] px-1 rounded-full bg-emerald-500 text-white font-extrabold text-[9px] flex items-center justify-center animate-bounce border border-white dark:border-slate-900 shadow-sm">
                  {unreadNotifsCount}
                </span>
              )}
            </button>

            {/* User Profile Widget */}
            {user && (
              <div
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-3.5 pl-4 border-l border-slate-200 dark:border-slate-800 select-none cursor-pointer hover:opacity-85 transition-opacity"
              >
                <div className="text-right hidden sm:block">
                  <span className="block text-xs font-black text-slate-805 dark:text-white leading-none">
                    {user.full_name}
                  </span>
                  <span className="inline-block text-[8px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1 mt-1.5 leading-none uppercase tracking-widest">
                    Aliado B2B
                  </span>
                </div>
                <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 border border-emerald-450/20 flex items-center justify-center text-white text-sm font-black shadow-sm">
                  {user.full_name.charAt(0)}
                </div>
              </div>
            )}

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="p-2.5 bg-slate-100 hover:bg-red-50/10 hover:text-red-400 text-slate-505 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-400 rounded-xl transition-all border border-slate-200/40 dark:border-slate-700/40 active:scale-95"
              title="Cerrar Sesión"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
          </div>
        </header>

        {/* Dynamic App Route Content */}
        <main className="flex-grow overflow-y-auto p-6 sm:p-10 bg-[#f8fafc] dark:bg-slate-900 transition-colors duration-200">
          <div className="max-w-[1700px] mx-auto w-full">
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
                className="p-1.5 bg-slate-205/50 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors"
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
                  <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-405 dark:text-slate-500">
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
                          ? "bg-slate-50/50 dark:bg-slate-950/20 border-slate-105 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-955/40"
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
                                ? "bg-red-50 dark:bg-red-955/30 text-red-500 dark:text-red-400 border border-red-100 dark:border-red-900/30"
                                : notif.type === "warning"
                                  ? "bg-amber-50 dark:bg-amber-955/30 text-amber-500 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30"
                                  : "bg-teal-50 dark:bg-teal-955/30 text-teal-500 dark:text-teal-400 border border-teal-100 dark:border-teal-900/30"
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
                        <p className="text-[11px] text-slate-505 dark:text-slate-400 mt-1 leading-normal">
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
