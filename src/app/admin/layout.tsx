"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useApp, STAGES_LIST, SUB_STAGES_BY_STAGE } from "@/utils/context/AppContext";
import {
  FolderKanban,
  Users,
  Bell,
  LogOut,
  X,
  Check,
  CheckCircle,
  AlertTriangle,
  Info,
  Clock,
  ArrowRightLeft,
  UserPlus,
  Heart,
  Menu,
  SlidersHorizontal,
  RotateCcw,
  Calendar,
  Contact,
  Filter,
  LayoutDashboard,
  ChevronDown,
  Sun,
  Moon,
} from "lucide-react";
import React, { useState, useEffect, Suspense } from "react";
import UserSettingsModal from "@/components/UserSettingsModal";

function SidebarLinks({ onLinkClick }: { onLinkClick: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useApp();
  const currentParamsString = searchParams.toString();

  const cleanPath = pathname.replace(/\/$/, "");
  const isAdminRoot = cleanPath === "/admin";
  const isClientes = cleanPath === "/admin/clientes";
  const isAliados = cleanPath === "/admin/aliados";
  const isUsuarios = cleanPath === "/admin/usuarios";
  const isAMs = cleanPath === "/admin/account-managers";
  const isAsignacion = cleanPath === "/admin/asignacion";

  const isAM = user?.role === "account_manager";
  const themeColor = "bg-gradient-to-r from-emerald-600 to-teal-650";

  const adminHref = currentParamsString ? `/admin?${currentParamsString}` : "/admin";
  const clientesHref = currentParamsString ? `/admin/clientes?${currentParamsString}` : "/admin/clientes";
  const aliadosHref = currentParamsString ? `/admin/aliados?${currentParamsString}` : "/admin/aliados";
  const asignacionHref = currentParamsString ? `/admin/asignacion?${currentParamsString}` : "/admin/asignacion";
  const accountManagersHref = currentParamsString ? `/admin/account-managers?${currentParamsString}` : "/admin/account-managers";
  const usuariosHref = currentParamsString ? `/admin/usuarios?${currentParamsString}` : "/admin/usuarios";

  return (
    <>
      <Link
        href={adminHref}
        onClick={onLinkClick}
        className={`flex items-center px-4 py-3 text-xs font-extrabold rounded-xl transition-all tracking-wide uppercase group ${
          isAdminRoot
            ? `${themeColor} text-white shadow-md`
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
            ? `${themeColor} text-white shadow-md`
            : "text-slate-400 hover:text-white hover:bg-slate-800/50"
        }`}
      >
        <Contact className="mr-3 h-4.5 w-4.5 stroke-[2.5]" />
        Gestión Clientes
      </Link>

      <Link
        href={aliadosHref}
        onClick={onLinkClick}
        className={`flex items-center px-4 py-3 text-xs font-extrabold rounded-xl transition-all tracking-wide uppercase group ${
          isAliados
            ? `${themeColor} text-white shadow-md`
            : "text-slate-400 hover:text-white hover:bg-slate-800/50"
        }`}
      >
        <Users className="mr-3 h-4.5 w-4.5 stroke-[2.5]" />
        Gestión Aliados
      </Link>

      {!isAM && (
        <Link
          href={asignacionHref}
          onClick={onLinkClick}
          className={`flex items-center px-4 py-3 text-xs font-extrabold rounded-xl transition-all tracking-wide uppercase group ${
            isAsignacion
              ? `${themeColor} text-white shadow-md`
              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
          }`}
        >
          <ArrowRightLeft className="mr-3 h-4.5 w-4.5 stroke-[2.5]" />
          Asignación Aliados
        </Link>
      )}

      {!isAM && (
        <Link
          href={accountManagersHref}
          onClick={onLinkClick}
          className={`flex items-center px-4 py-3 text-xs font-extrabold rounded-xl transition-all tracking-wide uppercase group ${
            isAMs
              ? `${themeColor} text-white shadow-md`
              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
          }`}
        >
          <Users className="mr-3 h-4.5 w-4.5 stroke-[2.5]" />
          Gestión AMs
        </Link>
      )}

      <Link
        href={usuariosHref}
        onClick={onLinkClick}
        className={`flex items-center px-4 py-3 text-xs font-extrabold rounded-xl transition-all tracking-wide uppercase group ${
          isUsuarios
            ? `${themeColor} text-white shadow-md`
            : "text-slate-405 hover:text-white hover:bg-slate-800/50"
        }`}
      >
        <UserPlus className="mr-3 h-4.5 w-4.5 stroke-[2.5]" />
        Gestión Usuarios
      </Link>
    </>
  );
}

function SidebarFilters() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { profiles, user } = useApp();

  // Local states for sidebar filters
  const [localStartDate, setLocalStartDate] = useState("");
  const [localEndDate, setLocalEndDate] = useState("");
  const [localStageFilter, setLocalStageFilter] = useState("all");
  const [localSubStageFilter, setLocalSubStageFilter] = useState("all");
  const [localAllyFilter, setLocalAllyFilter] = useState("all");

  // Sync filters from URL query parameters
  useEffect(() => {
    setLocalStartDate(searchParams.get("desde") || "");
    setLocalEndDate(searchParams.get("hasta") || "");
    setLocalStageFilter(searchParams.get("etapa") || "all");
    setLocalSubStageFilter(searchParams.get("subetapa") || "all");
    setLocalAllyFilter(searchParams.get("aliado") || "all");
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

    if (localAllyFilter !== "all") params.set("aliado", localAllyFilter);
    else params.delete("aliado");

    router.push(`${pathname}?${params.toString()}`);
  };

  const handleClearFilters = () => {
    setLocalStartDate("");
    setLocalEndDate("");
    setLocalStageFilter("all");
    setLocalSubStageFilter("all");
    setLocalAllyFilter("all");

    const params = new URLSearchParams(searchParams.toString());
    params.delete("desde");
    params.delete("hasta");
    params.delete("etapa");
    params.delete("subetapa");
    params.delete("aliado");

    router.push(`${pathname}?${params.toString()}`);
  };

  const cleanPath = pathname.replace(/\/$/, "");
  const isAdminRoot = cleanPath === "/admin";
  const isClientes = cleanPath === "/admin/clientes";
  if (!isAdminRoot && !isClientes) return null;

  const isAM = user?.role === "account_manager";
  const subStagesList = localStageFilter !== "all" ? (SUB_STAGES_BY_STAGE[localStageFilter] || []) : [];
  const uniqueAllies = profiles.filter((p) => {
    if (p.role !== "aliado" || !p.is_active) return false;
    if (user?.role === "account_manager") {
      return p.account_manager_id === user.id;
    }
    return true;
  });

  return (
    <div className="pt-8 border-t border-slate-800/55 mt-6 space-y-4">
      <div className="flex items-center gap-2 px-4">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 shrink-0">
          FILTRAR
        </span>
        <div className="h-px bg-slate-850 flex-1"></div>
      </div>

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
              className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all"
            />
          </div>
          <div>
            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Hasta</label>
            <input
              type="date"
              value={localEndDate}
              onChange={(e) => setLocalEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all"
            />
          </div>
        </div>

        {isClientes && (
          <div className="space-y-2.5 pt-2">
            <div>
              <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Etapa</label>
              <select
                value={localStageFilter}
                onChange={(e) => {
                  setLocalStageFilter(e.target.value);
                  setLocalSubStageFilter("all");
                }}
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-350 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all cursor-pointer"
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
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-355 outline-none focus:border-indigo-505 focus:ring-1 focus:ring-indigo-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <option value="all">Todas las Subetapas</option>
                {subStagesList.map((sub) => (
                  <option key={sub} value={sub} className="bg-slate-900 text-slate-200">
                    {sub}
                  </option>
                ))}
              </select>
            </div>

            {/* Allied Dropdown filter */}
            <div>
              <label className="block text-[9px] font-bold text-slate-505 uppercase mb-1">Aliado Comercial</label>
              <select
                value={localAllyFilter}
                onChange={(e) => setLocalAllyFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-355 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all cursor-pointer"
              >
                <option value="all">Todos los Aliados</option>
                {uniqueAllies.map((ally) => (
                  <option key={ally.id} value={ally.full_name} className="bg-slate-900 text-slate-200">
                    {ally.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="space-y-2 pt-4">
          <button
            onClick={handleApplyFilters}
            className="w-full px-4 py-2.5 text-white rounded-xl text-xs font-bold hover:shadow-md transition-all active:scale-[0.98] transform flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500"
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

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    user,
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
  const [currentTheme, setCurrentTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("pensionflow_theme") || "light";
      setCurrentTheme(savedTheme as any);
    }
  }, []);

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
    if (mounted) {
      if (!user) {
        router.push("/login");
      } else if (user.role === "aliado") {
        router.push("/dashboard");
      }
    }
  }, [user, mounted, router]);

  if (!mounted || !user || user.role === "aliado") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-400">
            {user?.role === "aliado" ? "Redireccionando..." : "Cargando Consola Director..."}
          </span>
        </div>
      </div>
    );
  }

  const cleanPath = pathname.replace(/\/$/, "");
  const isAdminRoot = cleanPath === "/admin";
  const isAliados = cleanPath === "/admin/aliados";
  const isUsuarios = cleanPath === "/admin/usuarios";
  const isAMs = cleanPath === "/admin/account-managers";
  const isAsignacion = cleanPath === "/admin/asignacion";

  const unreadNotifsCount = notifications.filter((n) => !n.read).length;

  const handleRoleSwitch = () => {
    router.push("/dashboard");
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const isAM = user.role === "account_manager";
  const themeColor = "bg-gradient-to-r from-emerald-600 to-teal-650";
  const selectionColor = "selection:bg-emerald-500";

  // Dynamic header titles based on path
  const getHeaderTitle = () => {
    const cleanPath = pathname.replace(/\/$/, "");
    if (cleanPath === "/admin") {
      return {
        title: isAM ? "Gestión Pipeline" : "Gestión Director",
        subtitle: "Supervisa y audita las etapas operativas de los expedientes comerciales.",
      };
    }
    if (cleanPath === "/admin/clientes") {
      return {
        title: "Gestión de Clientes",
        subtitle: "Visualiza, audita y gestiona el pipeline de expedientes comerciales y prospectos.",
      };
    }
    if (cleanPath === "/admin/aliados") {
      return {
        title: "Gestión de Aliados",
        subtitle: "Administra los códigos de invitación y audita el rendimiento de tus socios comerciales.",
      };
    }
    if (cleanPath === "/admin/asignacion") {
      return {
        title: "Asignación de Aliados",
        subtitle: "Asigna tus asesores comerciales a los gestores de cuentas correspondientes.",
      };
    }
    if (cleanPath === "/admin/account-managers") {
      return {
        title: "Gestión Account Managers",
        subtitle: "Crea y administra los perfiles de los coordinadores de cuentas de la plataforma.",
      };
    }
    if (cleanPath === "/admin/usuarios") {
      return {
        title: "Gestión de Usuarios",
        subtitle: "Administra credenciales, perfiles y estados de acceso en la plataforma.",
      };
    }
    return {
      title: "Consola de Control",
      subtitle: "Portal Operativo de Pensión Perfecta.",
    };
  };

  const headerInfo = getHeaderTitle();

  return (
    <div className={`min-h-screen bg-[#f8fafc] dark:bg-slate-950 flex flex-row ${selectionColor} transition-colors duration-200`}>
      
      {/* Impersonation Floating Bar at the top of content */}
      {isDemoMode && (
        <div className="fixed top-0 left-0 right-0 h-10 bg-slate-900 border-b border-slate-800 text-slate-200 px-6 py-2 flex items-center justify-between text-xs font-semibold z-40 md:pl-[17rem]">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 rounded-full animate-pulse bg-teal-500" />
            <span>
              💡 MODO EVALUACIÓN • Vista {isAM ? "Account Manager" : "Dirección"}: <span className="text-teal-400">{user.full_name} ({isAM ? "Account Manager" : "Director de Operaciones"})</span>
            </span>
          </div>
          <button
            onClick={handleRoleSwitch}
            className="px-3 py-0.5 text-white rounded-lg transition-colors flex items-center gap-1.5 active:scale-95 transform font-bold shadow-sm text-[10px] bg-teal-600 hover:bg-teal-700"
          >
            Switch to Ally View 💼
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
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#070b12] text-slate-300 flex flex-col border-r border-slate-800 transition-transform duration-300 md:translate-x-0 md:static ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Sidebar Header / Logo */}
        <div className="h-20 flex items-center px-6 border-b border-slate-800/80 gap-2.5">
          <Heart className="h-6 w-6 text-emerald-400 fill-emerald-450/20" strokeWidth={2.5} />
          <div>
            <span className="text-lg font-black tracking-tight text-white bg-gradient-to-r bg-clip-text text-transparent from-emerald-400 to-teal-300">
              Pensión Perfecta
            </span>
            <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-wider leading-none mt-0.5">
              Consola Operativa
            </span>
          </div>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto no-scrollbar">
          <Suspense fallback={<div className="h-48 px-4 py-3 text-[10px] text-slate-500">Cargando enlaces...</div>}>
            <SidebarLinks onLinkClick={() => setIsSidebarOpen(false)} />
          </Suspense>

          {/* Sidebar Filters wrapped in Suspense */}
          <Suspense fallback={<div className="px-4 py-3 text-[10px] text-slate-500">Cargando filtros...</div>}>
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
              className="p-2 -ml-2 text-slate-505 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            
            <div className="hidden sm:block">
              <h2 className="text-lg font-black text-slate-800 dark:text-white leading-tight font-black">
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
              className="relative p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 rounded-xl transition-colors active:scale-95 transform"
            >
              <Bell className="h-4.5 w-4.5" />
              {unreadNotifsCount > 0 && (
                <span className="absolute top-[-2px] right-[-2px] h-4.5 min-w-[18px] px-1 rounded-full text-white font-extrabold text-[9px] flex items-center justify-center animate-bounce border border-white dark:border-slate-900 shadow-sm bg-emerald-500">
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

            {/* User Profile Widget */}
            {user && (
              <div
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-3.5 pl-4 border-l border-slate-200 dark:border-slate-800 select-none cursor-pointer hover:opacity-85 transition-opacity"
              >
                <div className="text-right hidden sm:block">
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    {isAM ? "Account Manager" : "Director"}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5 justify-end">
                    <span className="block text-xs font-black text-slate-855 dark:text-white leading-none">
                      {user.full_name}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 dark:text-slate-505" />
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full border flex items-center justify-center text-white text-sm font-black shadow-sm bg-emerald-55 border-emerald-400/20">
                  {user.full_name.charAt(0)}
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
        <main className="flex-grow overflow-y-auto p-6 sm:p-10 bg-[#f8fafc] dark:bg-slate-950 transition-colors duration-200">
          <div className="max-w-[1700px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>

      {/* User Settings Modal */}
      <UserSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Notifications Drawer */}
      {notifDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            onClick={() => setNotifDrawerOpen(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
          />

          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col z-10 border-l border-slate-200 dark:border-slate-800 transform transition-transform duration-300">
            <div className="p-6 border-b border-slate-150 dark:border-slate-850 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-emerald-500" />
                <h3 className="text-base font-bold text-slate-800 dark:text-white font-black">Notificaciones</h3>
                {unreadNotifsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-505/10 text-emerald-500">
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
              <div className="px-6 py-3 border-b border-slate-180 dark:border-slate-850 flex justify-end">
                <button
                  onClick={markAllNotificationsRead}
                  className="text-xs font-bold flex items-center gap-1.5 text-emerald-500 hover:text-emerald-600"
                >
                  <Check className="h-3.5 w-3.5" />
                  Marcar todas como leídas
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {notifications.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                    <CheckCircle className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 font-black font-black">Sin notificaciones</h4>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-[200px] mx-auto">
                      Te avisaremos por aquí cuando ocurran eventos importantes en tu pipeline operativo.
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
                          ? "bg-slate-50/50 dark:bg-slate-900/30 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-805"
                          : "bg-emerald-50/20 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/30 hover:bg-emerald-50/40"
                      }`}
                    >
                      {!notif.read && (
                        <span className="absolute top-4 right-4 h-2.5 w-2.5 rounded-full shadow bg-emerald-500 shadow-emerald-500" />
                      )}

                      <div className="flex-shrink-0">
                        <div
                          className={`h-9 w-9 rounded-xl flex items-center justify-center ${
                            notif.type === "success"
                              ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 border border-emerald-100 dark:border-emerald-900/50"
                              : notif.type === "alert"
                                ? "bg-red-50 dark:bg-red-955/20 text-red-500 border border-red-105 dark:border-red-900/50"
                                : notif.type === "warning"
                                  ? "bg-amber-50 dark:bg-amber-955/20 text-amber-555 border border-amber-100 dark:border-amber-900/50"
                                  : isAM
                                    ? "bg-blue-50 dark:bg-blue-955/20 text-blue-500 border border-blue-100 dark:border-blue-900/50"
                                    : "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 border border-emerald-100 dark:border-emerald-900/50"
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
                          <Clock className="h-3 w-3 text-slate-350 dark:text-slate-600" />
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
