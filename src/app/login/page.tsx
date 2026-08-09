"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp, UserRole } from "@/utils/context/AppContext";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowRight, 
  Lock, 
  Mail, 
  ShieldAlert, 
  Sparkles, 
  Heart, 
  User, 
  Phone, 
  CheckCircle2, 
  ArrowLeft, 
  Inbox, 
  Key 
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

type ViewState = "ROLE_SELECTION" | "LOGIN" | "REGISTER" | "CONFIRMATION_PENDING" | "FORGOT_PASSWORD";

// Etiqueta visible de cada rol. En un solo sitio para que añadir un rol no
// obligue a cazar ternarios por toda la pantalla.
const ROLE_LABEL: Record<UserRole, string> = {
  aliado: "Aliado Comercial",
  account_manager: "Account Manager",
  director: "Director",
  closer: "Closer",
  finanzas: "Finanzas",
};

export default function LoginPage() {
  const router = useRouter();
  const { login, registerAliado, isDemoMode, initializeDirector, profiles, isLoading, sendPasswordReset } = useApp();
  
  // State Machine for SPA
  const [viewState, setViewState] = useState<ViewState>("ROLE_SELECTION");
  const [selectedRole, setSelectedRole] = useState<UserRole>("aliado");

  // Login Form States
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Forgot Password State
  const [forgotEmail, setForgotEmail] = useState("");

  // Register Form States
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regCode, setRegCode] = useState("");
  const [regCountryCode, setRegCountryCode] = useState("+52");

  // System Initialization States (for initial setup of the first Director)
  const [initName, setInitName] = useState("Eduardo Director");
  const [initEmail, setInitEmail] = useState("eduardo@pensionflow.com");
  const [initPhone, setInitPhone] = useState("");
  const [initPassword, setInitPassword] = useState("PensionPerfecta2026!");
  const [initCountryCode, setInitCountryCode] = useState("+52");

  // Read URL query parameter securely on client mount without triggering de-suspensation
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const stateParam = params.get("state");
      if (stateParam === "register") {
        setSelectedRole("aliado");
        setViewState("REGISTER");
      }
    }
  }, []);

  // Animations
  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
  };

  const formVariants = {
    hidden: { opacity: 0, x: 20 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: "easeOut" } },
    exit: { opacity: 0, x: -20, transition: { duration: 0.2, ease: "easeIn" } },
  };

  // Initialization Handler (First Director setup)
  const handleInitialize = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = initPhone.replace(/\D/g, "");
    if (!initName || !initEmail || !cleanPhone || !initPassword) {
      setErrorMsg("Todos los campos son obligatorios para inicializar.");
      return;
    }

    if (cleanPhone.length !== 10) {
      setErrorMsg("El número de teléfono móvil debe contener exactamente 10 dígitos.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    const fullPhoneNumber = `${initCountryCode} ${cleanPhone}`;

    try {
      await initializeDirector(initName, initEmail, fullPhoneNumber, initPassword);
      setSuccessMsg("¡Director de operaciones inicializado exitosamente! Redirigiendo...");
      setTimeout(() => {
        router.push("/admin");
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Error al inicializar el Director en Supabase.");
    } finally {
      setLoading(false);
    }
  };

  // Login Handler
  const handleFormLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !passwordInput) {
      setErrorMsg("Ingresa tu correo electrónico y contraseña.");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const realRole = await login(emailInput, selectedRole, passwordInput);
      setSuccessMsg("¡Acceso concedido! Redirigiendo a tu panel...");
      setTimeout(() => {
        // El portal de /dashboard es solo del aliado; todo lo demás (dirección,
        // account manager, closer y finanzas) vive bajo /admin, cada uno con su
        // menú. Finanzas va directo a su módulo: /admin es el Dashboard del
        // pipeline, que no le toca, y el guardia del layout lo rebotaría igual —
        // esto solo le ahorra ver el parpadeo del "Redireccionando…".
        if (realRole === "aliado") {
          router.push("/dashboard");
        } else if (realRole === "finanzas") {
          router.push("/admin/finanzas");
        } else {
          router.push("/admin");
        }
      }, 1000);
    } catch (err: any) {
      console.error("Login error:", err);
      const errMsg = err.message || "";
      if (errMsg.includes("PENDING_CONFIRMATION")) {
        setViewState("CONFIRMATION_PENDING");
      } else if (errMsg.includes("Acceso Inválido")) {
        setErrorMsg("Acceso Inválido: Tu cuenta no tiene permisos para ingresar como " + ROLE_LABEL[selectedRole] + ".");
      } else {
        setErrorMsg("Credenciales incorrectas o correo no confirmado. Verifica tus datos.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Registration Handler
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = regPhone.replace(/\D/g, "");
    
    if (!regName || !regEmail || !regPassword || !regCode || !cleanPhone) {
      setErrorMsg("Todos los campos son obligatorios.");
      return;
    }

    if (cleanPhone.length !== 10) {
      setErrorMsg("El número de móvil debe contener exactamente 10 dígitos.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    const fullPhone = `${regCountryCode} ${cleanPhone}`;

    try {
      await registerAliado(regName, regEmail.trim(), fullPhone, regPassword, regCode.trim().toUpperCase());
      setViewState("CONFIRMATION_PENDING");
    } catch (err: any) {
      console.error("Registration error:", err);
      setErrorMsg(err.message || "Error al completar el registro. Verifica el código de invitación.");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setErrorMsg("");
    setSuccessMsg("");
    setViewState("LOGIN");
  };

  const navigateBack = () => {
    setErrorMsg("");
    setSuccessMsg("");
    setViewState("ROLE_SELECTION");
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) {
      setErrorMsg("Por favor, ingresa tu correo electrónico.");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      await sendPasswordReset(forgotEmail.trim());
      setSuccessMsg("Si el correo existe, te hemos enviado un enlace para recuperar tu contraseña.");
      setForgotEmail(""); // clear
    } catch (err: any) {
      console.error("Forgot password error:", err);
      setErrorMsg("Ocurrió un error al intentar enviar el correo. Por favor intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-teal-950 to-teal-900 flex items-center justify-center py-12 px-6 relative overflow-hidden select-none">
      {/* Dynamic Ambient Background Glows */}
      <div className="absolute top-[-20%] left-[-15%] w-[60%] h-[60%] rounded-full bg-emerald-500/10 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-15%] w-[60%] h-[60%] rounded-full bg-teal-500/10 blur-[150px] pointer-events-none" />

      <motion.div 
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        className="max-w-md w-full bg-white/[0.02] backdrop-blur-2xl border border-white/5 p-8 md:p-10 rounded-3xl shadow-2xl relative z-10 flex flex-col min-h-[460px] justify-between transition-all"
      >
        {/* Brand Header */}
        <div className="text-center mb-6 flex flex-col items-center">
          <motion.div
            whileHover={{ scale: 1.05, rotate: 5 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Heart className="h-12 w-12 text-emerald-400 fill-emerald-400/20 mb-3 cursor-pointer" strokeWidth={1.5} />
          </motion.div>
          <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
            Pensión Perfecta
          </h2>
          <p className="mt-1 text-[10px] text-slate-400 font-bold tracking-widest uppercase">
            Portal Operativo Ley 73
          </p>
        </div>

        {/* Global Errors and Success Messages */}
        {errorMsg && (
          <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-xl text-xs font-semibold flex items-start gap-2.5 leading-relaxed">
            <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3.5 rounded-xl text-xs font-semibold flex items-start gap-2.5 leading-relaxed">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* SPA Content Router */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 my-auto">
            <div className="w-10 h-10 rounded-full border-4 border-emerald-500/20 border-t-emerald-400 animate-spin mb-4" />
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Cargando Plataforma...</p>
          </div>
        ) : (
          /* PREMIUM STATE MACHINE VIEWS */
          <AnimatePresence mode="wait">
            {viewState === "ROLE_SELECTION" && (
              /* VIEW 1: ROLE SELECTION (PANTALLA INICIAL) */
              <motion.div
                key="role_selection"
                variants={formVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="flex flex-col flex-1 justify-center py-4 space-y-5"
              >
                <div className="text-center mb-2">
                  <p className="text-xs text-slate-300 font-semibold max-w-xs mx-auto">
                    Selecciona tu perfil de acceso para ingresar a la plataforma de gestión previsional.
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  <motion.button
                    onClick={() => handleRoleSelect("aliado")}
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full flex items-center justify-between px-6 py-4.5 bg-gradient-to-r from-white/[0.03] to-white/[0.01] hover:from-emerald-500/[0.06] hover:to-emerald-500/[0.02] border border-white/5 hover:border-emerald-500/20 text-white rounded-2xl transition-all duration-300 group/btn shadow-lg"
                  >
                    <div className="text-left">
                      <span className="block font-bold text-base text-slate-100 group-hover/btn:text-emerald-400 transition-colors">Entrar como Aliado</span>
                      <span className="block text-[11px] text-slate-400 mt-1">Asesor comercial, prospectos y comisiones</span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white/5 group-hover/btn:bg-emerald-500/10 flex items-center justify-center transition-colors">
                      <ArrowRight className="h-4 w-4 text-emerald-400 group-hover/btn:translate-x-0.5 transition-transform" />
                    </div>
                  </motion.button>

                  <motion.button
                    onClick={() => handleRoleSelect("account_manager")}
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full flex items-center justify-between px-6 py-4.5 bg-gradient-to-r from-white/[0.03] to-white/[0.01] hover:from-blue-500/[0.06] hover:to-blue-500/[0.02] border border-white/5 hover:border-blue-500/20 text-white rounded-2xl transition-all duration-300 group/btn shadow-lg"
                  >
                    <div className="text-left">
                      <span className="block font-bold text-base text-slate-100 group-hover/btn:text-blue-400 transition-colors">Entrar como Account Manager</span>
                      <span className="block text-[11px] text-slate-400 mt-1">Supervisión de aliados asignados y prospectos</span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white/5 group-hover/btn:bg-blue-500/10 flex items-center justify-center transition-colors">
                      <ArrowRight className="h-4 w-4 text-blue-400 group-hover/btn:translate-x-0.5 transition-transform" />
                    </div>
                  </motion.button>

                  <motion.button
                    onClick={() => handleRoleSelect("director")}
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full flex items-center justify-between px-6 py-4.5 bg-gradient-to-r from-white/[0.03] to-white/[0.01] hover:from-teal-500/[0.06] hover:to-teal-500/[0.02] border border-white/5 hover:border-teal-500/20 text-white rounded-2xl transition-all duration-300 group/btn shadow-lg"
                  >
                    <div className="text-left">
                      <span className="block font-bold text-base text-slate-100 group-hover/btn:text-teal-400 transition-colors">Entrar como Director</span>
                      <span className="block text-[11px] text-slate-400 mt-1">Operaciones, simulación Ley 73 e invitaciones</span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white/5 group-hover/btn:bg-teal-500/10 flex items-center justify-center transition-colors">
                      <ArrowRight className="h-4 w-4 text-teal-400 group-hover/btn:translate-x-0.5 transition-transform" />
                    </div>
                  </motion.button>

                  <motion.button
                    onClick={() => handleRoleSelect("closer")}
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full flex items-center justify-between px-6 py-4.5 bg-gradient-to-r from-white/[0.03] to-white/[0.01] hover:from-indigo-500/[0.06] hover:to-indigo-500/[0.02] border border-white/5 hover:border-indigo-500/20 text-white rounded-2xl transition-all duration-300 group/btn shadow-lg"
                  >
                    <div className="text-left">
                      <span className="block font-bold text-base text-slate-100 group-hover/btn:text-indigo-400 transition-colors">Entrar como Closer</span>
                      <span className="block text-[11px] text-slate-400 mt-1">Captación de aliados y métricas de tu cartera</span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white/5 group-hover/btn:bg-indigo-500/10 flex items-center justify-center transition-colors">
                      <ArrowRight className="h-4 w-4 text-indigo-400 group-hover/btn:translate-x-0.5 transition-transform" />
                    </div>
                  </motion.button>

                  <motion.button
                    onClick={() => handleRoleSelect("finanzas")}
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full flex items-center justify-between px-6 py-4.5 bg-gradient-to-r from-white/[0.03] to-white/[0.01] hover:from-amber-500/[0.06] hover:to-amber-500/[0.02] border border-white/5 hover:border-amber-500/20 text-white rounded-2xl transition-all duration-300 group/btn shadow-lg"
                  >
                    <div className="text-left">
                      <span className="block font-bold text-base text-slate-100 group-hover/btn:text-amber-400 transition-colors">Entrar como Finanzas</span>
                      <span className="block text-[11px] text-slate-400 mt-1">Comisiones, cortes y pagos del equipo</span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white/5 group-hover/btn:bg-amber-500/10 flex items-center justify-center transition-colors">
                      <ArrowRight className="h-4 w-4 text-amber-400 group-hover/btn:translate-x-0.5 transition-transform" />
                    </div>
                  </motion.button>
                </div>

                {isDemoMode && (
                  <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3.5 mt-2">
                    <p className="text-[10px] text-emerald-400/90 leading-relaxed font-semibold text-center uppercase tracking-wider flex items-center justify-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" />
                      Entorno de Demostración Local Activado
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {viewState === "LOGIN" && (
              /* VIEW 2: DYNAMIC LOGIN FORM */
              <motion.div
                key="login_form"
                variants={formVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="flex flex-col flex-1 justify-center"
              >
                <div className="flex items-center gap-2 mb-4">
                  <button 
                    onClick={navigateBack} 
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div>
                    <h3 className="text-lg font-bold text-white uppercase tracking-wider">
                      Acceso: {ROLE_LABEL[selectedRole]}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-semibold tracking-wide">
                      Por favor, ingresa tus credenciales
                    </p>
                  </div>
                </div>

                <form onSubmit={handleFormLogin} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Correo Electrónico
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Mail className="h-4 w-4" />
                      </span>
                      <input
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="ej: roberto@asesores.com"
                        required
                        disabled={loading}
                        className="w-full pl-10 pr-4 py-3 bg-white/5 hover:bg-white/[0.07] border border-white/5 focus:border-emerald-500 focus:bg-white/[0.08] outline-none text-white rounded-xl text-sm transition-all focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Contraseña
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Lock className="h-4 w-4" />
                      </span>
                      <input
                        type="password"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        placeholder="••••••••"
                        required
                        disabled={loading}
                        className="w-full pl-10 pr-4 py-3 bg-white/5 hover:bg-white/[0.07] border border-white/5 focus:border-emerald-500 focus:bg-white/[0.08] outline-none text-white rounded-xl text-sm transition-all focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold rounded-xl transition-all shadow-md shadow-emerald-500/10 flex items-center justify-center gap-2 text-sm"
                  >
                    {loading ? "Iniciando sesión..." : "Iniciar Sesión"}
                  </button>
                </form>

                <div className="mt-4 text-center">
                  <button
                    onClick={() => {
                      setErrorMsg("");
                      setSuccessMsg("");
                      setViewState("FORGOT_PASSWORD");
                    }}
                    className="text-xs text-slate-400 hover:text-emerald-400 font-medium transition-colors"
                  >
                    ¿Olvidaste tu contraseña? Recupérala aquí
                  </button>
                </div>

                {selectedRole === "aliado" && (
                  <div className="mt-5 text-center">
                    <p className="text-xs text-slate-400">
                      ¿No estás registrado?{" "}
                      <button
                        onClick={() => {
                          setErrorMsg("");
                          setSuccessMsg("");
                          setViewState("REGISTER");
                        }}
                        className="text-emerald-400 hover:text-emerald-300 font-bold underline transition-colors"
                      >
                        Regístrate
                      </button>
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {viewState === "REGISTER" && (
              /* VIEW 3: DYNAMIC ALLY REGISTRATION FORM */
              <motion.div
                key="register_form"
                variants={formVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="flex flex-col flex-1 justify-center"
              >
                <div className="flex items-center gap-2 mb-4">
                  <button 
                    onClick={() => {
                      setErrorMsg("");
                      setViewState("LOGIN");
                    }} 
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div>
                    <h3 className="text-lg font-bold text-white uppercase tracking-wider">
                      Registro de Aliado
                    </h3>
                    <p className="text-[10px] text-slate-400 font-semibold tracking-wide">
                      Únete con tu código de invitación
                    </p>
                  </div>
                </div>

                <form onSubmit={handleRegister} className="space-y-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Nombre Completo
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <User className="h-4 w-4" />
                      </span>
                      <input
                        type="text"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        placeholder="Ej. Roberto Asesor"
                        required
                        disabled={loading}
                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 hover:bg-white/[0.07] border border-white/5 focus:border-emerald-500 focus:bg-white/[0.08] outline-none text-white rounded-xl text-sm transition-all focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-1">
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Lada
                      </label>
                      <div className="relative h-[42px]">
                        <select
                          value={regCountryCode}
                          onChange={(e) => setRegCountryCode(e.target.value)}
                          disabled={loading}
                          className="w-full h-full pl-2 pr-6 bg-white/5 hover:bg-white/[0.07] border border-white/5 focus:border-emerald-500 focus:bg-white/[0.08] outline-none text-white rounded-xl text-xs font-semibold cursor-pointer appearance-none animate-none"
                        >
                          {COUNTRIES.map((c) => (
                            <option key={c.code} value={c.code} className="bg-slate-900 text-white text-xs">
                              {c.flag} {c.code}
                            </option>
                          ))}
                        </select>
                        <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-slate-400">
                          <span className="text-[9px]">▼</span>
                        </div>
                      </div>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Móvil (10 dígs)
                      </label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                          <Phone className="h-4 w-4" />
                        </span>
                        <input
                          type="tel"
                          value={regPhone}
                          onChange={(e) => setRegPhone(e.target.value.replace(/\D/g, ""))}
                          placeholder="5512345678"
                          required
                          disabled={loading}
                          className="w-full pl-10 pr-4 py-2.5 bg-white/5 hover:bg-white/[0.07] border border-white/5 focus:border-emerald-500 focus:bg-white/[0.08] outline-none text-white rounded-xl text-sm transition-all focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Código de Invitación
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Key className="h-4 w-4" />
                      </span>
                      <input
                        type="text"
                        value={regCode}
                        onChange={(e) => setRegCode(e.target.value)}
                        placeholder="AL-2026-XXXX"
                        required
                        disabled={loading}
                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 hover:bg-white/[0.07] border border-white/5 focus:border-emerald-500 focus:bg-white/[0.08] outline-none text-white rounded-xl text-sm transition-all focus:ring-1 focus:ring-emerald-500 font-mono tracking-widest uppercase text-emerald-300"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Correo Electrónico
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Mail className="h-4 w-4" />
                      </span>
                      <input
                        type="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="ej: aliado@correo.com"
                        required
                        disabled={loading}
                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 hover:bg-white/[0.07] border border-white/5 focus:border-emerald-500 focus:bg-white/[0.08] outline-none text-white rounded-xl text-sm transition-all focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Contraseña
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Lock className="h-4 w-4" />
                      </span>
                      <input
                        type="password"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        disabled={loading}
                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 hover:bg-white/[0.07] border border-white/5 focus:border-emerald-500 focus:bg-white/[0.08] outline-none text-white rounded-xl text-sm transition-all focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-3 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold rounded-xl transition-all shadow-md shadow-emerald-500/10 flex items-center justify-center gap-2 text-sm"
                  >
                    {loading ? "Creando cuenta..." : "Completar Registro"}
                  </button>
                </form>
              </motion.div>
            )}

            {viewState === "CONFIRMATION_PENDING" && (
              /* VIEW 4: PENDING EMAIL CONFIRMATION SCREEN */
              <motion.div
                key="confirmation_pending"
                variants={formVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="flex flex-col flex-1 justify-center text-center py-6"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4 animate-bounce">
                  <Inbox className="h-8 w-8 text-emerald-400" />
                </div>

                <h3 className="text-xl font-bold text-white mb-2 uppercase tracking-wide">
                  Confirmación Enviada ✉️
                </h3>
                <p className="text-xs text-slate-300 mb-6 leading-relaxed max-w-sm mx-auto">
                  Hemos enviado un correo de validación a tu dirección registrada. Por políticas de seguridad estrictas, <strong>debes confirmar tu bandeja de entrada</strong> antes de poder iniciar sesión en el portal.
                </p>

                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 mb-6 text-left text-[11px] leading-relaxed text-slate-400">
                  <span className="block font-bold text-white uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                    ¿Qué sigue?
                  </span>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>Revisa tu bandeja de entrada y la carpeta de <strong>SPAM o Correo No Deseado</strong>.</li>
                    <li>Haz clic en el enlace de confirmación oficial de Supabase.</li>
                    <li>Una vez confirmado, regresa aquí e inicia sesión normalmente.</li>
                  </ol>
                </div>

                <motion.button
                  onClick={() => {
                    setErrorMsg("");
                    setSuccessMsg("");
                    setViewState("ROLE_SELECTION");
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold rounded-xl transition-all shadow-md text-xs uppercase tracking-widest"
                >
                  Entendido, volver al inicio
                </motion.button>
              </motion.div>
            )}

            {viewState === "FORGOT_PASSWORD" && (
              /* VIEW 5: FORGOT PASSWORD */
              <motion.div
                key="forgot_password"
                variants={formVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="flex flex-col flex-1"
              >
                <div className="flex items-center gap-3 mb-6">
                  <button
                    onClick={() => setViewState("LOGIN")}
                    className="p-1.5 rounded-full hover:bg-white/5 transition-colors text-slate-400 hover:text-white"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div>
                    <h3 className="text-xl font-bold text-white tracking-tight">Recuperar Acceso</h3>
                    <p className="text-xs text-emerald-400 font-semibold tracking-wider uppercase mt-1">Restablece tu contraseña</p>
                  </div>
                </div>

                {errorMsg && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-5 bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                    <p>{errorMsg}</p>
                  </motion.div>
                )}
                {successMsg && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl text-xs font-semibold flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                      <span>{successMsg}</span>
                    </div>
                  </motion.div>
                )}

                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Correo Electrónico
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Mail className="h-4 w-4" />
                      </span>
                      <input
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="tu@correo.com"
                        required
                        disabled={loading}
                        className="w-full pl-10 pr-4 py-3 bg-white/5 hover:bg-white/[0.07] border border-white/5 focus:border-emerald-500 focus:bg-white/[0.08] outline-none text-white rounded-xl text-sm transition-all focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold rounded-xl transition-all shadow-md shadow-emerald-500/10 flex items-center justify-center gap-2 text-sm"
                  >
                    {loading ? "Enviando enlace..." : "Enviar enlace de recuperación"}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        )}

      </motion.div>
    </div>
  );
}
