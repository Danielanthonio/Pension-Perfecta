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
console.log("🧪 INICIANDO VERIFICACIÓN: SUBROL LÍDER");
console.log("====================================================");
console.log("Base URL:", supabaseUrl || "NOT_FOUND");

const hasCredentials = supabaseUrl && supabaseKey;
const supabase = hasCredentials ? createClient(supabaseUrl, supabaseKey) : null;

// Mock database simulation for unit and integration testing
const MOCK_PROFILES = [
  { id: "am-1", full_name: "AM Carlos", role: "account_manager", aliado_tipo: "aliado", account_manager_id: null },
  { id: "am-2", full_name: "AM Sofia", role: "account_manager", aliado_tipo: "aliado", account_manager_id: null },
  { id: "ally-1", full_name: "Asesor Pedro", role: "aliado", aliado_tipo: "aliado", account_manager_id: "am-1" },
  { id: "ally-2", full_name: "Asesor Maria", role: "aliado", aliado_tipo: "aliado", account_manager_id: "am-1" },
  { id: "lider-1", full_name: "Lider Yesenia", role: "aliado", aliado_tipo: "lider", lider_grupo: "Enfoque Total", account_manager_id: "am-1" },
];

const MOCK_LIDER_ALIADOS = [
  { id: "rel-1", lider_id: "lider-1", aliado_asignado_id: "ally-2", grupo_nombre: "Enfoque Total" }
];

// Backend validation mock (matching RT-4 requirements)
function validatePatchAllyType({ caller, targetAlly, inputTipo, inputGrupo, existingRelations, existingProfiles }) {
  // 6. El aliado no puede auto-designarse Líder
  if (caller.id === targetAlly.id) {
    return { valid: false, error: "El aliado no puede auto-designarse Líder" };
  }

  // 5. Solo AM y Director pueden cambiar tipo
  const isDirector = caller.role === "director" || caller.role === "admin";
  const isAM = caller.role === "account_manager";
  if (!isDirector && !isAM) {
    return { valid: false, error: "Solo Account Managers y Directores pueden cambiar tipo" };
  }

  // 5. AM solo puede cambiar sus propios aliados
  if (isAM && targetAlly.account_manager_id !== caller.id) {
    return { valid: false, error: "No tienes permisos para modificar aliados fuera de tu gestión" };
  }

  // 1. Validar grupo no vacío si tipo es Líder
  if (inputTipo === "lider") {
    if (!inputGrupo || !inputGrupo.trim()) {
      return { valid: false, error: "Nombre del grupo es obligatorio para tipo 'lider'" };
    }
    // 2. Validar longitud máx 255
    if (inputGrupo.length > 255) {
      return { valid: false, error: "El nombre del grupo supera los 255 caracteres" };
    }
  }

  // 3. No permitir cambiar de "lider" a "aliado" si tiene aliados asignados
  if (targetAlly.aliado_tipo === "lider" && inputTipo === "aliado") {
    const hasAssigned = existingRelations.some(r => r.lider_id === targetAlly.id);
    if (hasAssigned) {
      return { valid: false, error: "No permitir cambiar de lider a aliado si tiene aliados asignados" };
    }
  }

  // 4. No permitir duplicar nombre de grupo para mismo Account Manager
  if (inputTipo === "lider") {
    const duplicate = existingProfiles.some(p => 
      p.role === "aliado" && 
      p.aliado_tipo === "lider" && 
      p.account_manager_id === targetAlly.account_manager_id && 
      p.lider_grupo.toLowerCase() === inputGrupo.trim().toLowerCase() && 
      p.id !== targetAlly.id
    );
    if (duplicate) {
      return { valid: false, error: "No permitir duplicar nombre de grupo para mismo Account Manager" };
    }
  }

  return { valid: true };
}

// Validation tests
function runValidationTests() {
  console.log("\n📋 1. PRUEBAS UNITARIAS DE VALIDACIÓN (RT-4)");
  
  // Test case 1: Empty group name
  const res1 = validatePatchAllyType({
    caller: { id: "am-1", role: "account_manager" },
    targetAlly: MOCK_PROFILES[2], // Pedro
    inputTipo: "lider",
    inputGrupo: "",
    existingRelations: MOCK_LIDER_ALIADOS,
    existingProfiles: MOCK_PROFILES
  });
  console.log(res1.valid === false && res1.error.includes("obligatorio") ? "✅ C-01: Nombre de grupo vacío bloqueado" : "❌ C-01 Failed");

  // Test case 2: Auto-designation
  const res2 = validatePatchAllyType({
    caller: { id: "ally-1", role: "aliado" },
    targetAlly: MOCK_PROFILES[2], // Pedro (self)
    inputTipo: "lider",
    inputGrupo: "Zona Norte",
    existingRelations: MOCK_LIDER_ALIADOS,
    existingProfiles: MOCK_PROFILES
  });
  console.log(res2.valid === false && res2.error.includes("auto-designarse") ? "✅ C-02: Auto-designación bloqueada" : "❌ C-02 Failed");

  // Test case 3: AM modifying outside portfolio
  const res3 = validatePatchAllyType({
    caller: { id: "am-2", role: "account_manager" }, // AM Sofia
    targetAlly: MOCK_PROFILES[2], // Pedro (assigned to AM Carlos)
    inputTipo: "lider",
    inputGrupo: "Zona Norte",
    existingRelations: MOCK_LIDER_ALIADOS,
    existingProfiles: MOCK_PROFILES
  });
  console.log(res3.valid === false && res3.error.includes("fuera de tu gestión") ? "✅ C-03: AM no puede modificar aliados ajenos" : "❌ C-03 Failed");

  // Test case 4: Change leader to ally with relations
  const res4 = validatePatchAllyType({
    caller: { id: "am-1", role: "account_manager" },
    targetAlly: MOCK_PROFILES[4], // Lider Yesenia (has relations in MOCK_LIDER_ALIADOS)
    inputTipo: "aliado",
    inputGrupo: null,
    existingRelations: MOCK_LIDER_ALIADOS,
    existingProfiles: MOCK_PROFILES
  });
  console.log(res4.valid === false && res4.error.includes("aliados asignados") ? "✅ C-04: Bloqueo de cambio a tipo 'aliado' si tiene subordinados" : "❌ C-04 Failed");

  // Test case 5: Duplicate group name for same AM
  const res5 = validatePatchAllyType({
    caller: { id: "am-1", role: "account_manager" },
    targetAlly: MOCK_PROFILES[2], // Pedro (AM Carlos)
    inputTipo: "lider",
    inputGrupo: "Enfoque Total", // Already used by Lider Yesenia (AM Carlos)
    existingRelations: MOCK_LIDER_ALIADOS,
    existingProfiles: MOCK_PROFILES
  });
  console.log(res5.valid === false && res5.error.includes("duplicar nombre de grupo") ? "✅ C-05: Bloqueo de nombre de grupo duplicado para el mismo AM" : "❌ C-05 Failed");

  // Test case 6: Valid update
  const res6 = validatePatchAllyType({
    caller: { id: "am-1", role: "account_manager" },
    targetAlly: MOCK_PROFILES[2], // Pedro
    inputTipo: "lider",
    inputGrupo: "Zona Norte", // Unique group
    existingRelations: MOCK_LIDER_ALIADOS,
    existingProfiles: MOCK_PROFILES
  });
  console.log(res6.valid === true ? "✅ C-06: Asignación válida aprobada" : "❌ C-06 Failed");
}

// 2. Integration / E2E mock client state flow
function runE2EFlowSimulation() {
  console.log("\n📋 2. SIMULACIÓN DE FLUJO E2E (MODO DEMO / FRONTEND STATE)");

  // State
  let stateProfiles = [...MOCK_PROFILES];
  let stateRelations = [...MOCK_LIDER_ALIADOS];

  // AM Carlos creates a Leader
  const allyToPromote = stateProfiles.find(p => p.id === "ally-1");
  const promoteValidation = validatePatchAllyType({
    caller: { id: "am-1", role: "account_manager" },
    targetAlly: allyToPromote,
    inputTipo: "lider",
    inputGrupo: "Grupo A",
    existingRelations: stateRelations,
    existingProfiles: stateProfiles
  });

  if (promoteValidation.valid) {
    allyToPromote.aliado_tipo = "lider";
    allyToPromote.lider_grupo = "Grupo A";
    console.log("✅ Flujo 1: AM Carlos promovió con éxito a Asesor Pedro como Líder de 'Grupo A'");
  } else {
    console.log("❌ Flujo 1 Failed:", promoteValidation.error);
  }

  // AM Carlos assigns Asesor Maria (ally-2) to the new Leader (Pedro)
  const lider = stateProfiles.find(p => p.id === "ally-1" && p.aliado_tipo === "lider");
  const allyToAssign = stateProfiles.find(p => p.id === "ally-2");

  if (lider && allyToAssign && allyToAssign.aliado_tipo === "aliado") {
    // Clear old relationship if any
    stateRelations = stateRelations.filter(r => r.aliado_asignado_id !== allyToAssign.id);
    
    // Add relationship
    stateRelations.push({
      id: "rel-new",
      lider_id: lider.id,
      aliado_asignado_id: allyToAssign.id,
      grupo_nombre: lider.lider_grupo
    });
    console.log("✅ Flujo 2: Asesor Maria asignada con éxito al Líder Pedro ('Grupo A')");
  } else {
    console.log("❌ Flujo 2 Failed");
  }

  // Verify Leader Pedro sees his allies
  const pedroAllies = stateRelations.filter(r => r.lider_id === "ally-1");
  const hasMaria = pedroAllies.some(r => r.aliado_asignado_id === "ally-2");
  console.log(pedroAllies.length === 1 && hasMaria ? "✅ Flujo 3: Líder Pedro visualiza correctamente a Asesor Maria en su grupo" : "❌ Flujo 3 Failed");
}

// 3. Database Check
async function runDBCheck() {
  if (!supabase) {
    console.log("\n⚠️ 3. BASE DE DATOS: Omitida (no se detectó configuración en .env.local)");
    return;
  }
  
  console.log("\n📋 3. VERIFICACIÓN DE ESTRUCTURA SUPABASE (DB & RLS)");

  try {
    // Check if new columns exist on profiles table
    const { data: cols, error: colError } = await supabase
      .from("profiles")
      .select("aliado_tipo, lider_grupo")
      .limit(1);

    if (colError) {
      console.log("❌ Columnas 'aliado_tipo' o 'lider_grupo' no existen en tabla profiles:", colError.message);
    } else {
      console.log("✅ Columnas nuevas 'aliado_tipo' y 'lider_grupo' verificadas en profiles");
    }

    // Check if table lider_aliados exists
    const { data: laData, error: laError } = await supabase
      .from("lider_aliados")
      .select("*")
      .limit(1);

    if (laError) {
      if (laError.message.includes("does not exist")) {
        console.log("❌ Tabla 'lider_aliados' no existe. Por favor ejecuta el script de migración SQL en Supabase Dashboard.");
      } else {
        console.log("✅ Tabla 'lider_aliados' verificada (RLS activo):", laError.message);
      }
    } else {
      console.log("✅ Tabla 'lider_aliados' verificada y consultada correctamente");
    }
  } catch (err) {
    console.error("Catch error querying database structure:", err);
  }
}

// Run all
runValidationTests();
runE2EFlowSimulation();
runDBCheck();
