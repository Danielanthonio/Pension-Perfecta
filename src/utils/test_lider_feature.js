const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// 1. Load environment variables
const envPath = path.join(__dirname, "../../.env.local");
let supabaseUrl = "";
let supabaseKey = "";

if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf8");
  envConfig.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index === -1) return;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === "NEXT_PUBLIC_SUPABASE_URL") supabaseUrl = value;
    if (key === "NEXT_PUBLIC_SUPABASE_ANON_KEY") supabaseKey = value;
  });
}

console.log("====================================================");
console.log("🧪 INICIANDO VERIFICACIÓN: EMPRESAS MULTIALIADO & SUBROL LÍDER");
console.log("====================================================");
console.log("Base URL:", supabaseUrl || "NOT_FOUND");

const hasCredentials = supabaseUrl && supabaseKey;
const supabase = hasCredentials ? createClient(supabaseUrl, supabaseKey) : null;

// Mock database simulation for companies
const MOCK_EMPRESAS = [
  { id: "emp-1", nombre: "Apoyamax", created_by: "system-uuid", created_at: new Date().toISOString() },
  { id: "emp-2", nombre: "Pensium", created_by: "system-uuid", created_at: new Date().toISOString() },
];

const MOCK_PROFILES = [
  { id: "am-1", full_name: "AM Carlos", role: "account_manager", aliado_tipo: "aliado", account_manager_id: null, empresa_multialiado_id: null },
  { id: "am-2", full_name: "AM Sofia", role: "account_manager", aliado_tipo: "aliado", account_manager_id: null, empresa_multialiado_id: null },
  { id: "ally-1", full_name: "Asesor Pedro", role: "aliado", aliado_tipo: "aliado", account_manager_id: "am-1", empresa_multialiado_id: null },
  { id: "ally-2", full_name: "Asesor Maria", role: "aliado", aliado_tipo: "aliado", account_manager_id: "am-1", empresa_multialiado_id: null },
  { id: "lider-1", full_name: "Lider Yesenia", role: "aliado", aliado_tipo: "lider", lider_grupo: "Apoyamax", account_manager_id: "am-1", empresa_multialiado_id: "emp-1" },
];

const MOCK_LIDER_ALIADOS = [
  { id: "rel-1", lider_id: "lider-1", aliado_asignado_id: "ally-2", empresa_multialiado_id: "emp-1", grupo_nombre: "Apoyamax" }
];

// Backend validation mock for changing ally type with empresas_multialiado (RT-4 updated)
function validatePatchAllyType({ caller, targetAlly, inputTipo, inputEmpresaId, existingRelations, existingProfiles, existingEmpresas }) {
  if (caller.id === targetAlly.id) {
    return { valid: false, error: "El aliado no puede auto-designarse Líder" };
  }

  const isDirector = caller.role === "director" || caller.role === "admin";
  const isAM = caller.role === "account_manager";
  if (!isDirector && !isAM) {
    return { valid: false, error: "Solo Account Managers y Directores pueden cambiar tipo" };
  }

  if (isAM && targetAlly.account_manager_id !== caller.id) {
    return { valid: false, error: "No tienes permisos para modificar aliados fuera de tu gestión" };
  }

  if (inputTipo === "lider") {
    if (!inputEmpresaId) {
      return { valid: false, error: "Seleccionar una empresa es obligatorio para tipo 'lider'" };
    }
    const empresaExists = existingEmpresas.some(e => e.id === inputEmpresaId);
    if (!empresaExists) {
      return { valid: false, error: "La empresa seleccionada no existe" };
    }
  }

  if (targetAlly.aliado_tipo === "lider" && inputTipo === "aliado") {
    const hasAssigned = existingRelations.some(r => r.lider_id === targetAlly.id);
    if (hasAssigned) {
      return { valid: false, error: "No permitir cambiar de lider a aliado si tiene aliados asignados" };
    }
  }

  return { valid: true };
}

// Company creation validation mock
function validateCreateCompany({ caller, nombre, existingEmpresas }) {
  const isDirector = caller.role === "director" || caller.role === "admin";
  const isAM = caller.role === "account_manager";
  if (!isDirector && !isAM) {
    return { valid: false, error: "Solo Account Managers y Directores pueden crear empresas" };
  }

  if (!nombre || !nombre.trim()) {
    return { valid: false, error: "El nombre de la empresa es obligatorio" };
  }

  const duplicate = existingEmpresas.some(e => e.nombre.toLowerCase() === nombre.trim().toLowerCase());
  if (duplicate) {
    return { valid: false, error: "La empresa ya existe" };
  }

  return { valid: true };
}

// Company deletion validation mock
function validateDeleteCompany({ caller, empresaId, existingProfiles }) {
  const isDirector = caller.role === "director" || caller.role === "admin";
  const isAM = caller.role === "account_manager";
  if (!isDirector && !isAM) {
    return { valid: false, error: "Solo Account Managers y Directores pueden eliminar empresas" };
  }

  const hasLeaders = existingProfiles.some(p => p.aliado_tipo === "lider" && p.empresa_multialiado_id === empresaId);
  if (hasLeaders) {
    return { valid: false, error: "No se puede eliminar la empresa porque tiene líderes asignados" };
  }

  return { valid: true };
}

// Validation tests
function runValidationTests() {
  console.log("\n📋 1. PRUEBAS UNITARIAS DE VALIDACIÓN");
  
  // Test case 1: Promoting to leader without company ID
  const res1 = validatePatchAllyType({
    caller: { id: "am-1", role: "account_manager" },
    targetAlly: MOCK_PROFILES[2], // Pedro
    inputTipo: "lider",
    inputEmpresaId: null,
    existingRelations: MOCK_LIDER_ALIADOS,
    existingProfiles: MOCK_PROFILES,
    existingEmpresas: MOCK_EMPRESAS
  });
  console.log(res1.valid === false && res1.error.includes("obligatorio") ? "✅ C-01: Cambio a Líder sin empresa bloqueado" : "❌ C-01 Failed");

  // Test case 2: Promoting to leader with invalid company ID
  const res2 = validatePatchAllyType({
    caller: { id: "am-1", role: "account_manager" },
    targetAlly: MOCK_PROFILES[2], // Pedro
    inputTipo: "lider",
    inputEmpresaId: "invalid-uuid",
    existingRelations: MOCK_LIDER_ALIADOS,
    existingProfiles: MOCK_PROFILES,
    existingEmpresas: MOCK_EMPRESAS
  });
  console.log(res2.valid === false && res2.error.includes("no existe") ? "✅ C-02: Cambio a Líder con empresa inexistente bloqueado" : "❌ C-02 Failed");

  // Test case 3: Create company with duplicate name
  const res3 = validateCreateCompany({
    caller: { id: "am-1", role: "account_manager" },
    nombre: "Apoyamax",
    existingEmpresas: MOCK_EMPRESAS
  });
  console.log(res3.valid === false && res3.error.includes("ya existe") ? "✅ C-03: Creación de empresa duplicada bloqueada" : "❌ C-03 Failed");

  // Test case 4: Delete company with assigned leaders
  const res4 = validateDeleteCompany({
    caller: { id: "am-1", role: "account_manager" },
    empresaId: "emp-1", // Apoyamax (has lider-1 assigned)
    existingProfiles: MOCK_PROFILES
  });
  console.log(res4.valid === false && res4.error.includes("líderes asignados") ? "✅ C-04: Eliminación de empresa con líderes bloqueada" : "❌ C-04 Failed");

  // Test case 5: Delete company without assigned leaders
  const res5 = validateDeleteCompany({
    caller: { id: "am-1", role: "account_manager" },
    empresaId: "emp-2", // Pensium (no leaders assigned)
    existingProfiles: MOCK_PROFILES
  });
  console.log(res5.valid === true ? "✅ C-05: Eliminación de empresa libre aprobada" : "❌ C-05 Failed");
}

// 2. Integration / E2E mock client state flow
function runE2EFlowSimulation() {
  console.log("\n📋 2. SIMULACIÓN DE FLUJO E2E (MOCK FRONTEND STATE)");

  let stateEmpresas = [...MOCK_EMPRESAS];
  let stateProfiles = [...MOCK_PROFILES];
  let stateRelations = [...MOCK_LIDER_ALIADOS];

  // 1. Director creates a new company
  const newCompVal = validateCreateCompany({
    caller: { id: "dir-1", role: "director" },
    nombre: "Nueva Corp",
    existingEmpresas: stateEmpresas
  });

  if (newCompVal.valid) {
    stateEmpresas.push({ id: "emp-3", nombre: "Nueva Corp", created_by: "dir-1", created_at: new Date().toISOString() });
    console.log("✅ Flujo 1: Director creó con éxito la empresa 'Nueva Corp'");
  } else {
    console.log("❌ Flujo 1 Failed");
  }

  // 2. AM Carlos promotes Pedro to Líder of 'Nueva Corp'
  const allyToPromote = stateProfiles.find(p => p.id === "ally-1");
  const promoteValidation = validatePatchAllyType({
    caller: { id: "am-1", role: "account_manager" },
    targetAlly: allyToPromote,
    inputTipo: "lider",
    inputEmpresaId: "emp-3",
    existingRelations: stateRelations,
    existingProfiles: stateProfiles,
    existingEmpresas: stateEmpresas
  });

  if (promoteValidation.valid) {
    allyToPromote.aliado_tipo = "lider";
    allyToPromote.empresa_multialiado_id = "emp-3";
    allyToPromote.lider_grupo = "Nueva Corp";
    console.log("✅ Flujo 2: AM Carlos promovió con éxito a Asesor Pedro como Líder de 'Nueva Corp'");
  } else {
    console.log("❌ Flujo 2 Failed:", promoteValidation.error);
  }

  // 3. Try to delete 'Nueva Corp' -> should fail because Pedro is assigned
  const deleteVal = validateDeleteCompany({
    caller: { id: "dir-1", role: "director" },
    empresaId: "emp-3",
    existingProfiles: stateProfiles
  });
  console.log(deleteVal.valid === false && deleteVal.error.includes("líderes asignados") ? "✅ Flujo 3: El sistema impidió borrar 'Nueva Corp' porque Pedro está asignado" : "❌ Flujo 3 Failed");
}

// 3. Database Check
async function runDBCheck() {
  if (!supabase) {
    console.log("\n⚠️ 3. BASE DE DATOS: Omitida (no se detectó configuración en .env.local)");
    return;
  }
  
  console.log("\n📋 3. VERIFICACIÓN DE ESTRUCTURA SUPABASE (DB & RLS)");

  try {
    const { data: colCheck, error: colCheckError } = await supabase
      .from("profiles")
      .select("empresa_multialiado_id")
      .limit(1);

    if (colCheckError) {
      console.log("❌ Columna 'empresa_multialiado_id' no existe en profiles:", colCheckError.message);
    } else {
      console.log("✅ Columna 'empresa_multialiado_id' verificada en profiles");
    }

    const { data: empData, error: empError } = await supabase
      .from("empresas_multialiado")
      .select("*")
      .limit(1);

    if (empError) {
      console.log("❌ Tabla 'empresas_multialiado' no existe o tiene problemas de RLS:", empError.message);
    } else {
      console.log("✅ Tabla 'empresas_multialiado' verificada en la base de datos");
    }
  } catch (err) {
    console.error("Catch error querying database structure:", err);
  }
}

// Run all
runValidationTests();
runE2EFlowSimulation();
runDBCheck();
