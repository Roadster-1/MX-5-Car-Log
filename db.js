/* =========================================================================
 * MX-5 차계부 — 클라이언트 사이드 데이터 계층 (IndexedDB)
 * 12개 전체 테이블 100% 무손실 백업/복구, 현실 수명 기준 및 중복 방지 지원
 * ========================================================================= */

const DB_NAME = "mx5_carlog";
const DB_VERSION = 1;

// 소모품 기본값 — 실제 사용자 설정 기준치와 동기화
const CONSUMABLES_DEFAULTS = [
  { item_name: "엔진 오일", spec: "메탈로센 5W-30 GT 4.5L",
    lifespan_months_short: 6,  lifespan_km_short: 6000,
    lifespan_months_long: 12,  lifespan_km_long: 13000,
    lifespan_circuit: 150, lifespan_gymkhana: 80 },
  { item_name: "브레이크액", spec: "Lista 어센트 브레이크 플루이드 Racing DOT-4 1L",
    lifespan_months_short: 12, lifespan_km_short: 30000,
    lifespan_months_long: 24,  lifespan_km_long: 30000,
    lifespan_circuit: 200, lifespan_gymkhana: 100 },
  { item_name: "수동 미션 오일", spec: "레드라인 MT-85 (75W-85) GL4 2L",
    lifespan_months_short: 36, lifespan_km_short: 40000,
    lifespan_months_long: 36,  lifespan_km_long: 60000,
    lifespan_circuit: 500, lifespan_gymkhana: 50 },
  { item_name: "디퍼런셜 오일", spec: "모듈 기어 300 75W-90 GL-5 0.6L",
    lifespan_months_short: 36, lifespan_km_short: 40000,
    lifespan_months_long: 36,  lifespan_km_long: 50000,
    lifespan_circuit: 200, lifespan_gymkhana: 50 },
  { item_name: "점화 플러그", spec: "NGK 루테늄 HX LKAR7AHX-S",
    lifespan_months_short: 0,  lifespan_km_short: 50000,
    lifespan_months_long: 0,   lifespan_km_long: 60000,
    lifespan_circuit: 200, lifespan_gymkhana: 400 },
  { item_name: "구동 벨트 세트", spec: "마즈다 오리지널 순정품",
    lifespan_months_short: 72, lifespan_km_short: 120000,
    lifespan_months_long: 72,  lifespan_km_long: 120000,
    lifespan_circuit: 0, lifespan_gymkhana: 0 },
  { item_name: "엔진 냉각수", spec: "Mazda Genuine FL22 6L 이상",
    lifespan_months_short: 72, lifespan_km_short: 120000,
    lifespan_months_long: 72,  lifespan_km_long: 120000,
    lifespan_circuit: 0, lifespan_gymkhana: 0 },
  { item_name: "서모스탯", spec: "마쯔다 순정품",
    lifespan_months_short: 72, lifespan_km_short: 120000,
    lifespan_months_long: 72,  lifespan_km_long: 120000,
    lifespan_circuit: 0, lifespan_gymkhana: 0 },
  { item_name: "에어컨 필터", spec: "포터2 사이즈 (149x143x15, 6개월 주기)",
    lifespan_months_short: 6,  lifespan_km_short: 0,
    lifespan_months_long: 6,   lifespan_km_long: 0,
    lifespan_circuit: 0, lifespan_gymkhana: 0 },
  { item_name: "엔진 마운트", spec: "마즈다 오리지널 순정품",
    lifespan_months_short: 0,  lifespan_km_short: 0,
    lifespan_months_long: 0,   lifespan_km_long: 0,
    lifespan_circuit: 0, lifespan_gymkhana: 0 },
  { item_name: "브레이크 패드", spec: "CC-RG",
    lifespan_months_short: 0,  lifespan_km_short: 0,
    lifespan_months_long: 0,   lifespan_km_long: 0,
    lifespan_circuit: 0, lifespan_gymkhana: 0 },
  { item_name: "와이퍼", spec: "98350 4F000(운전석) 98360 4F000(조수석)",
    lifespan_months_short: 0,  lifespan_km_short: 0,
    lifespan_months_long: 0,   lifespan_km_long: 0,
    lifespan_circuit: 0, lifespan_gymkhana: 0 },
];

const STORES = {
  fueling:           { keyPath: "id", autoIncrement: true },
  maintenance:       { keyPath: "id", autoIncrement: true },
  track_sessions:    { keyPath: "id", autoIncrement: true },
  drive_logs:        { keyPath: "id", autoIncrement: true },
  insurance:         { keyPath: "id", autoIncrement: true },
  odometer_updates:  { keyPath: "id", autoIncrement: true },
  vehicle_tax:       { keyPath: "id", autoIncrement: true },
  route_archive:     { keyPath: "id", autoIncrement: true },
  consumables:       { keyPath: "item_name" },
  consumables_config:{ keyPath: "item_name" },
  settings:          { keyPath: "key" },
  app_settings:      { keyPath: "key" },
};

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    let isNewDatabase = false;
    req.onupgradeneeded = (e) => {
      isNewDatabase = e.oldVersion === 0; // 브라우저에 이 DB가 아예 처음 생기는 순간인지 여부
      const db = e.target.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: def.keyPath, autoIncrement: !!def.autoIncrement });
        }
      }
    };
    req.onsuccess = async (e) => {
      const db = e.target.result;
      // 최초 설치 시 딱 한 번만 기본값을 채웁니다.
      // (초기화 후 재로딩되어도 여기서 다시 채워지지 않습니다 — isNewDatabase는 false)
      if (isNewDatabase) await seedDefaults(db);
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(db, storeName, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAll(storeName) {
  const db = await openDB();
  return reqToPromise(tx(db, storeName).getAll());
}

async function getOne(storeName, key) {
  const db = await openDB();
  return reqToPromise(tx(db, storeName).get(key));
}

async function addRecord(storeName, obj) {
  const db = await openDB();
  const store = tx(db, storeName, "readwrite");
  return reqToPromise(store.add(obj));
}

async function putRecord(storeName, obj) {
  const db = await openDB();
  const store = tx(db, storeName, "readwrite");
  return reqToPromise(store.put(obj));
}

async function deleteRecord(storeName, key) {
  const db = await openDB();
  const store = tx(db, storeName, "readwrite");
  return reqToPromise(store.delete(key));
}

async function clearStore(storeName) {
  const db = await openDB();
  const store = tx(db, storeName, "readwrite");
  return reqToPromise(store.clear());
}

async function seedDefaults(db) {
  const cfgStore = tx(db, "consumables_config", "readwrite");
  const existingCfg = await reqToPromise(cfgStore.getAll());
  if (existingCfg.length === 0) {
    for (const item of CONSUMABLES_DEFAULTS) {
      cfgStore.put({ ...item, is_custom: 0, sort_order: 0, purchase_url: "", detailed_memo: "" });
    }
  }
  const conStore = tx(db, "consumables", "readwrite");
  const existingCon = await reqToPromise(conStore.getAll());
  if (existingCon.length === 0) {
    for (const item of CONSUMABLES_DEFAULTS) {
      conStore.put({ item_name: item.item_name, last_replaced_date: null,
        last_replaced_odometer: 0, last_replaced_circuit_sessions: 0, last_replaced_gymkhana_runs: 0 });
    }
  }
  const setStore = tx(db, "settings", "readwrite");
  if (!(await reqToPromise(setStore.get("driving_env")))) {
    setStore.put({ key: "driving_env", value: "short" });
  }
  const appStore = tx(db, "app_settings", "readwrite");
  const appDefaults = {
    app_title: "Mazda MX-5 ND", accent_color: "#e85d04", alert_threshold: "80",
    vehicle_release_date: "2021-02-18", initial_odometer: "49500",
    sidebar_order: '["home","consumables","monthly","logs","routes"]',
    dark_mode: "dark",
    tune_powertrain: "에어필터 : K&N 외 순정 상태 유지",
    tune_suspension_chassis: "Coilover : Tein Flex Z 5k/3k (F 3단, R 5단)\nBRK : F/R OEM 1P + 패드 (F CC-RG, R MX72) + 로터 (Dixcel FP)",
    tune_exterior_wheels: "휠 : RAYS ZE40 7.5J*17 + 38, OEM 7J*17 +45\n타이어 : (215/45R17) NX SUR4G, KH WP72",
    tune_interior: "Cusco Spin Turn Knob",
  };
  for (const [k, v] of Object.entries(appDefaults)) {
    if (!(await reqToPromise(appStore.get(k)))) appStore.put({ key: k, value: v });
  }
}

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function getCurrentOdometer() {
  const tables = ["fueling", "maintenance", "track_sessions", "drive_logs", "odometer_updates"];
  let max = 0;
  for (const t of tables) {
    const rows = await getAll(t);
    for (const r of rows) if (r.odometer && r.odometer > max) max = r.odometer;
  }
  return max;
}

async function getDrivingEnv() {
  const row = await getOne("settings", "driving_env");
  return row ? row.value : "short";
}

async function setDrivingEnv(env) {
  if (!["short", "long"].includes(env)) throw new Error("잘못된 값");
  await putRecord("settings", { key: "driving_env", value: env });
  return env;
}

async function getVehicleReleaseDate() {
  const row = await getOne("app_settings", "vehicle_release_date");
  return row && row.value ? row.value : null;
}

async function getTotalCircuitSessions() {
  const rows = await getAll("track_sessions");
  return rows.filter(r => r.session_type === "서킷 세션").reduce((s, r) => s + (r.count || 0), 0);
}

async function getTotalGymkhanaRuns() {
  const rows = await getAll("track_sessions");
  return rows.filter(r => r.session_type === "짐카나 런").reduce((s, r) => s + (r.count || 0), 0);
}

async function getLastReplacementInfo(itemName) {
  const maintRows = (await getAll("maintenance"))
    .filter(r => r.item === itemName)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.id - a.id)));
  const maint = maintRows[0] || null;
  const con = await getOne("consumables", itemName);

  const maintDate = maint ? maint.date : null;
  const conDate = con && con.last_replaced_date ? con.last_replaced_date : null;

  if (maintDate && (conDate === null || maintDate >= conDate)) {
    const lastDate = maintDate;
    const lastOdo = maint.odometer || 0;
    const track = await getAll("track_sessions");
    const lastCircuit = track.filter(r => r.session_type === "서킷 세션" && r.date <= lastDate)
      .reduce((s, r) => s + (r.count || 0), 0);
    const lastGymkhana = track.filter(r => r.session_type === "짐카나 런" && r.date <= lastDate)
      .reduce((s, r) => s + (r.count || 0), 0);
    return { lastDate, lastOdo, lastCircuit, lastGymkhana };
  } else if (conDate) {
    return {
      lastDate: conDate,
      lastOdo: con.last_replaced_odometer || 0,
      lastCircuit: con.last_replaced_circuit_sessions || 0,
      lastGymkhana: con.last_replaced_gymkhana_runs || 0,
    };
  }
  return { lastDate: null, lastOdo: 0, lastCircuit: 0, lastGymkhana: 0 };
}

async function calculateWear(itemName, drivingEnv) {
  const cfg = await getOne("consumables_config", itemName);
  if (!cfg) return { wear: null, visual: false };

  const lm = (drivingEnv === "short" ? cfg.lifespan_months_short : cfg.lifespan_months_long) || 0;
  const lk = (drivingEnv === "short" ? cfg.lifespan_km_short : cfg.lifespan_km_long) || 0;
  const lc = cfg.lifespan_circuit || 0;
  const lg = cfg.lifespan_gymkhana || 0;

  if (![lm, lk, lc, lg].some(v => v > 0)) return { wear: null, visual: true };

  let { lastDate, lastOdo, lastCircuit, lastGymkhana } = await getLastReplacementInfo(itemName);

  if (lastDate === null) {
    const releaseDate = await getVehicleReleaseDate();
    if (releaseDate) {
      lastDate = releaseDate;
    } else {
      const fuelRows = await getAll("fueling");
      const odoRows = await getAll("odometer_updates");
      const dates = [...fuelRows, ...odoRows].map(r => r.date).filter(Boolean).sort();
      if (dates.length) lastDate = dates[0];
      else return { wear: null, visual: false };
    }
    lastOdo = 0; lastCircuit = 0; lastGymkhana = 0;
  }

  let lastDt;
  try { lastDt = parseDate(lastDate); if (isNaN(lastDt)) throw new Error(); }
  catch { return { wear: null, visual: false }; }

  const days = Math.max(0, (new Date() - lastDt) / 86400000);
  const currentOdo = await getCurrentOdometer();
  const dist = Math.max(0, currentOdo - lastOdo);
  const circ = Math.max(0, (await getTotalCircuitSessions()) - lastCircuit);
  const gym = Math.max(0, (await getTotalGymkhanaRuns()) - lastGymkhana);

  const um = lm > 0 ? 100.0 / lm : 0.0;
  const uk = lk > 0 ? 100.0 / (lk / 1000) : 0.0;
  const uc = lc > 0 ? 100.0 / lc : 0.0;
  const ug = lg > 0 ? 100.0 / lg : 0.0;

  const tw = (days / 30.4) * um;
  const dw = (dist / 1000.0) * uk;
  const trw = circ * uc + gym * ug;

  return { wear: Math.round((Math.max(tw, dw) + trw) * 10) / 10, visual: false };
}

async function getTotalCost() {
  const tables = ["fueling", "maintenance", "track_sessions", "drive_logs", "insurance", "vehicle_tax"];
  let total = 0;
  for (const t of tables) {
    const rows = await getAll(t);
    total += rows.reduce((s, r) => s + (r.cost || 0), 0);
  }
  return total;
}

async function getFuelEconomy() {
  const rows = (await getAll("fueling")).sort((a, b) => a.odometer - b.odometer);
  if (rows.length < 2) return null;
  const driven = rows[rows.length - 1].odometer - rows[0].odometer;
  const fuel = rows.slice(1).reduce((s, r) => s + r.fuel_volume, 0);
  if (fuel <= 0 || driven <= 0) return null;
  return Math.round((driven / fuel) * 100) / 100;
}

function trackDesc(r) {
  return r.session_type === "서킷 세션" ? `${r.session_type} ${r.count} Laps` : `${r.session_type} ${r.count}회`;
}

async function getHomeData() {
  const drivingEnv = await getDrivingEnv();
  const currentOdo = await getCurrentOdometer();
  const fuelEconomy = await getFuelEconomy();
  const totalCost = await getTotalCost();

  const logTables = ["fueling", "maintenance", "track_sessions", "drive_logs", "insurance", "odometer_updates"];
  let isFirstRun = true;
  for (const t of logTables) {
    if ((await getAll(t)).length > 0) { isFirstRun = false; break; }
  }

  let insuranceWarning = null;
  const insRows = (await getAll("insurance")).sort((a, b) => (a.expiration_date < b.expiration_date ? 1 : -1));
  if (insRows[0] && insRows[0].expiration_date) {
    const days = (parseDate(insRows[0].expiration_date) - new Date()) / 86400000;
    if (days <= 30) insuranceWarning = insRows[0].expiration_date;
  }

  const thresholdRow = await getOne("app_settings", "alert_threshold");
  const alertThreshold = thresholdRow ? parseFloat(thresholdRow.value) : 80.0;

  const initOdoRow = await getOne("app_settings", "initial_odometer");
  let initialOdo = null;
  if (initOdoRow && initOdoRow.value && initOdoRow.value.trim()) {
    const n = parseInt(initOdoRow.value, 10);
    if (!isNaN(n)) initialOdo = n;
  }
  const drivenSinceAcquisition = (initialOdo !== null && currentOdo > initialOdo) ? currentOdo - initialOdo : null;

  let drivenSinceInsurance = null;
  const insSorted = (await getAll("insurance")).sort((a, b) => (a.renewal_date < b.renewal_date ? 1 : (b.id - a.id)));
  const insRec = insSorted[0];
  if (insRec && insRec.renewal_date) {
    let odoAtInsurance = null;
    if (insRec.odometer !== undefined && insRec.odometer !== null) {
      odoAtInsurance = insRec.odometer;
    } else {
      const tablesForOdo = ["fueling", "maintenance", "track_sessions", "drive_logs", "odometer_updates"];
      for (const t of tablesForOdo) {
        const rows = (await getAll(t)).filter(r => r.odometer != null && r.date <= insRec.renewal_date);
        for (const r of rows) odoAtInsurance = odoAtInsurance === null ? r.odometer : Math.max(odoAtInsurance, r.odometer);
      }
    }
    if (odoAtInsurance !== null && currentOdo > odoAtInsurance) drivenSinceInsurance = currentOdo - odoAtInsurance;
  }

  const frows = (await getAll("fueling")).sort((a, b) => a.odometer - b.odometer || a.id - b.id);
  const fuelTrend = [];
  for (let i = 1; i < frows.length; i++) {
    const dKm = frows[i].odometer - frows[i - 1].odometer;
    const fuel = frows[i].fuel_volume;
    if (fuel > 0 && dKm > 0) fuelTrend.push({ label: frows[i].date, economy: Math.round((dKm / fuel) * 100) / 100 });
  }
  const fuelTrendFiltered = fuelTrend.slice(-6);

  const now = new Date();
  const monthlyExpenditure = [];
  for (let i = 5; i >= 0; i--) {
    const rawM = now.getMonth() + 1 - i;
    const year = now.getFullYear() + Math.floor((rawM - 1) / 12);
    const month = ((rawM - 1) % 12 + 12) % 12 + 1;
    const ms = `${year}-${String(month).padStart(2, "0")}`;
    let cost = 0;
    const specs = [["fueling", "date"], ["maintenance", "date"], ["track_sessions", "date"],
      ["drive_logs", "date"], ["insurance", "renewal_date"], ["vehicle_tax", "date"]];
    for (const [tbl, dcol] of specs) {
      const rows = await getAll(tbl);
      cost += rows.filter(r => (r[dcol] || "").startsWith(ms)).reduce((s, r) => s + (r.cost || 0), 0);
    }
    monthlyExpenditure.push({ month: ms, cost });
  }

  const configs = await getAll("consumables_config");
  const warnings = [];
  for (const cfg of configs) {
    const { wear } = await calculateWear(cfg.item_name, drivingEnv);
    if (wear !== null && wear >= alertThreshold) {
      warnings.push({ item: cfg.item_name, wear, critical: wear >= 100, warning: wear >= 90 && wear < 100, safe: wear >= alertThreshold && wear < 90 });
    }
  }
  warnings.sort((a, b) => b.wear - a.wear);

  const recent = [];
  const pushRows = (rows, mapFn) => rows.forEach(r => recent.push(mapFn(r)));
  pushRows(await getAll("fueling"), r => ({ date: r.date, type: "주유", desc: `${r.fuel_volume}L 주유`, cost: r.cost, created_at: r.created_at || "", row_id: r.id }));
  pushRows(await getAll("maintenance"), r => ({ date: r.date, type: "정비", desc: r.item, cost: r.cost, created_at: r.created_at || "", row_id: r.id }));
  pushRows(await getAll("track_sessions"), r => ({ date: r.date, type: "트랙", desc: trackDesc(r), cost: r.cost, created_at: r.created_at || "", row_id: r.id }));
  pushRows(await getAll("drive_logs"), r => ({ date: r.date, type: "주행", desc: r.memo || `${r.distance || ""}km 주행`, cost: r.cost, created_at: r.created_at || "", row_id: r.id }));
  pushRows(await getAll("insurance"), r => ({ date: r.renewal_date, type: "보험", desc: "자동차 보험 갱신", cost: r.cost, created_at: r.created_at || "", row_id: r.id }));
  pushRows(await getAll("vehicle_tax"), r => ({ date: r.date, type: "자동차세", desc: r.notes || "자동차세", cost: r.cost, created_at: r.created_at || "", row_id: r.id }));
  pushRows(await getAll("odometer_updates"), r => ({ date: r.date, type: "주행거리갱신", desc: `${r.odometer.toLocaleString()}km 갱신`, cost: 0, created_at: r.created_at || "", row_id: r.id }));
  recent.sort((a, b) => (a.date + (a.created_at || "0") + a.row_id) < (b.date + (b.created_at || "0") + b.row_id) ? 1 : -1);

  const costPerKm = (drivenSinceAcquisition && drivenSinceAcquisition > 0) ? Math.round(totalCost / drivenSinceAcquisition) : null;

  return {
    current_odometer: currentOdo, fuel_economy: fuelEconomy, total_cost: totalCost,
    driving_env: drivingEnv, warnings, recent_logs: recent.slice(0, 5),
    is_first_run: isFirstRun, insurance_warning: insuranceWarning,
    fuel_trend: fuelTrendFiltered, monthly_expenditure: monthlyExpenditure,
    alert_threshold: alertThreshold, driven_since_acquisition: drivenSinceAcquisition,
    driven_since_insurance: drivenSinceInsurance, cost_per_km: costPerKm,
  };
}

async function getConsumablesStatus() {
  const drivingEnv = await getDrivingEnv();
  const configs = (await getAll("consumables_config")).sort((a, b) => (a.sort_order - b.sort_order) || (a.item_name > b.item_name ? 1 : -1));
  const result = [];
  for (const cfg of configs) {
    const { wear, visual } = await calculateWear(cfg.item_name, drivingEnv);
    const { lastDate, lastOdo } = await getLastReplacementInfo(cfg.item_name);
    result.push({
      name: cfg.item_name, spec: cfg.spec, wear, visual_inspection: visual,
      last_replaced: lastDate ? { date: lastDate, odometer: lastOdo } : null,
      lifespan_months_short: cfg.lifespan_months_short, lifespan_km_short: cfg.lifespan_km_short,
      lifespan_months_long: cfg.lifespan_months_long, lifespan_km_long: cfg.lifespan_km_long,
      lifespan_circuit: cfg.lifespan_circuit, lifespan_gymkhana: cfg.lifespan_gymkhana,
      is_custom: cfg.is_custom, purchase_url: cfg.purchase_url || "", detailed_memo: cfg.detailed_memo || "",
    });
  }
  return { driving_env: drivingEnv, consumables: result };
}

async function addConsumable(data) {
  const name = (data.item_name || "").trim();
  if (!name) throw new Error("소모품 이름은 필수입니다.");
  if (await getOne("consumables_config", name)) throw new Error("이미 존재하는 소모품 이름입니다.");
  await putRecord("consumables_config", {
    item_name: name, spec: data.spec || "",
    lifespan_months_short: Number(data.lifespan_months_short) || 0,
    lifespan_km_short: Number(data.lifespan_km_short) || 0,
    lifespan_months_long: Number(data.lifespan_months_long) || 0,
    lifespan_km_long: Number(data.lifespan_km_long) || 0,
    lifespan_circuit: Number(data.lifespan_circuit) || 0,
    lifespan_gymkhana: Number(data.lifespan_gymkhana) || 0,
    is_custom: 1, sort_order: 0,
    purchase_url: data.purchase_url || "", detailed_memo: data.detailed_memo || "",
  });
  if (!(await getOne("consumables", name))) {
    await putRecord("consumables", { item_name: name, last_replaced_date: null, last_replaced_odometer: 0, last_replaced_circuit_sessions: 0, last_replaced_gymkhana_runs: 0 });
  }
}

async function editConsumable(data) {
  const name = (data.item_name || "").trim();
  if (!name) throw new Error("소모품 이름은 필수입니다.");
  const cfg = await getOne("consumables_config", name);
  if (!cfg) throw new Error("존재하지 않는 소모품입니다.");
  Object.assign(cfg, {
    spec: data.spec || "",
    lifespan_months_short: Number(data.lifespan_months_short) || 0,
    lifespan_km_short: Number(data.lifespan_km_short) || 0,
    lifespan_months_long: Number(data.lifespan_months_long) || 0,
    lifespan_km_long: Number(data.lifespan_km_long) || 0,
    lifespan_circuit: Number(data.lifespan_circuit) || 0,
    lifespan_gymkhana: Number(data.lifespan_gymkhana) || 0,
    purchase_url: data.purchase_url || "", detailed_memo: data.detailed_memo || "",
  });
  await putRecord("consumables_config", cfg);
}

async function deleteConsumable(name) {
  if (!(await getOne("consumables_config", name))) throw new Error("존재하지 않는 소모품입니다.");
  const maint = (await getAll("maintenance")).filter(r => r.item === name);
  for (const r of maint) await deleteRecord("maintenance", r.id);
  await deleteRecord("consumables", name);
  await deleteRecord("consumables_config", name);
}

async function resetConsumable(name) {
  if (!(await getOne("consumables_config", name))) throw new Error("잘못된 소모품 이름");
  const today = todayStr();
  const curOdo = await getCurrentOdometer();
  const totCircuit = await getTotalCircuitSessions();
  const totGym = await getTotalGymkhanaRuns();
  await putRecord("consumables", {
    item_name: name, last_replaced_date: today, last_replaced_odometer: curOdo,
    last_replaced_circuit_sessions: totCircuit, last_replaced_gymkhana_runs: totGym,
  });
  return { date: today, odometer: curOdo };
}

async function reorderConsumables(orderList) {
  for (const item of orderList) {
    const cfg = await getOne("consumables_config", item.item_name);
    if (cfg) { cfg.sort_order = Number(item.sort_order) || 0; await putRecord("consumables_config", cfg); }
  }
}

async function getConsumableHistory(itemName) {
  const drivingEnv = await getDrivingEnv();
  const cfg = await getOne("consumables_config", itemName);
  if (!cfg) throw new Error("소모품을 찾을 수 없습니다.");

  const lm = (drivingEnv === "short" ? cfg.lifespan_months_short : cfg.lifespan_months_long) || 0;
  const lk = (drivingEnv === "short" ? cfg.lifespan_km_short : cfg.lifespan_km_long) || 0;
  const lc = cfg.lifespan_circuit || 0;
  const lg = cfg.lifespan_gymkhana || 0;
  const hasLifespan = [lm, lk, lc, lg].some(v => v > 0);

  let events = (await getAll("maintenance")).filter(r => r.item === itemName)
    .sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : a.id - b.id))
    .map(r => ({ date: r.date, odometer: r.odometer || 0, kind: "정비" }));

  const con = await getOne("consumables", itemName);
  if (con && con.last_replaced_date) {
    const maintDates = new Set(events.map(e => e.date));
    if (!maintDates.has(con.last_replaced_date)) {
      events.push({ date: con.last_replaced_date, odometer: con.last_replaced_odometer || 0, kind: "수동 리셋" });
      events.sort((a, b) => (a.date > b.date ? 1 : -1));
    }
  }

  let releaseDate = await getVehicleReleaseDate();
  const track = await getAll("track_sessions");
  const history = [];
  let prevDate = releaseDate, prevOdo = 0;
  for (const ev of events) {
    let wearPct = null;
    if (hasLifespan && prevDate) {
      try {
        const days = Math.max(0, (parseDate(ev.date) - parseDate(prevDate)) / 86400000);
        const dist = Math.max(0, ev.odometer - prevOdo);
        const circNow = track.filter(r => r.session_type === "서킷 세션" && r.date <= ev.date).reduce((s, r) => s + (r.count || 0), 0);
        const circPrev = track.filter(r => r.session_type === "서킷 세션" && r.date <= prevDate).reduce((s, r) => s + (r.count || 0), 0);
        const gymNow = track.filter(r => r.session_type === "짐카나 런" && r.date <= ev.date).reduce((s, r) => s + (r.count || 0), 0);
        const gymPrev = track.filter(r => r.session_type === "짐카나 런" && r.date <= prevDate).reduce((s, r) => s + (r.count || 0), 0);
        const circ = Math.max(0, circNow - circPrev), gym = Math.max(0, gymNow - gymPrev);
        const um = lm > 0 ? 100 / lm : 0, uk = lk > 0 ? 100 / (lk / 1000) : 0;
        const uc = lc > 0 ? 100 / lc : 0, ug = lg > 0 ? 100 / lg : 0;
        const tw = (days / 30.4) * um, dw = (dist / 1000) * uk, trw = circ * uc + gym * ug;
        wearPct = Math.round((Math.max(tw, dw) + trw) * 10) / 10;
      } catch { /* skip */ }
    }
    history.push({ date: ev.date, odometer: ev.odometer, wear_at_replacement: wearPct, kind: ev.kind });
    prevDate = ev.date; prevOdo = ev.odometer;
  }
  return { item_name: itemName, history };
}

async function logFuel(data) {
  if (!data.date || !data.odometer || !data.fuel_volume) throw new Error("날짜, 주행거리, 주유량은 필수입니다.");
  await addRecord("fueling", { date: data.date, odometer: Number(data.odometer), fuel_volume: Number(data.fuel_volume), cost: Number(data.cost || 0), created_at: new Date().toISOString() });
}

async function logMaintenance(data) {
  if (!data.date || !data.item) throw new Error("날짜와 소모품 항목은 필수입니다.");
  let itemName = data.item;
  if (itemName === "기타") {
    const custom = (data.custom_item || "").trim();
    if (!custom) throw new Error("기타 선택 시 직접 입력란을 채워주세요.");
    itemName = custom;
  }
  await addRecord("maintenance", {
    date: data.date, odometer: data.odometer ? Number(data.odometer) : null, item: itemName,
    notes: data.notes || "", cost: Number(data.cost || 0),
    align_f_camber: data.align_f_camber || "", align_f_toe: data.align_f_toe || "",
    align_f_caster: data.align_f_caster || "", align_r_camber: data.align_r_camber || "", align_r_toe: data.align_r_toe || "",
    created_at: new Date().toISOString(),
  });
}

async function logTrack(data) {
  if (!data.date || !data.session_type || !data.count) throw new Error("날짜, 세션 유형, 횟수는 필수입니다.");
  await addRecord("track_sessions", {
    date: data.date, odometer: data.odometer ? Number(data.odometer) : null,
    session_type: data.session_type, count: Number(data.count), cost: Number(data.cost || 0),
    circuit_name: data.circuit_name || "", lap_time: data.lap_time || "", tire_pressure: data.tire_pressure || "",
    suspension_damping: data.suspension_damping || "", weather: data.weather || "", air_temp: data.air_temp || "",
    created_at: new Date().toISOString(),
  });
}

async function getTrackBestLaps() {
  const rows = (await getAll("track_sessions")).filter(r => r.session_type === "서킷 세션" && r.circuit_name && r.lap_time);
  const byCircuit = {};
  for (const r of rows) {
    if (!byCircuit[r.circuit_name] || r.lap_time < byCircuit[r.circuit_name].lap_time) byCircuit[r.circuit_name] = r;
  }
  return Object.values(byCircuit).sort((a, b) => a.circuit_name.localeCompare(b.circuit_name))
    .map(r => ({ circuit: r.circuit_name, best_lap: r.lap_time, weather: r.weather || "", air_temp: r.air_temp || "" }));
}

async function logDrive(data) {
  await addRecord("drive_logs", {
    date: data.date, odometer: data.odometer ? Number(data.odometer) : null,
    distance: data.distance ? Number(data.distance) : null, memo: data.memo || "",
    cost: Number(data.cost || 0), created_at: new Date().toISOString(),
  });
}

async function logInsurance(data) {
  if (!data.renewal_date || !data.expiration_date) throw new Error("갱신일과 만료일은 필수입니다.");
  await addRecord("insurance", {
    renewal_date: data.renewal_date, expiration_date: data.expiration_date,
    cost: Number(data.cost || 0), odometer: data.odometer ? Number(data.odometer) : null,
    created_at: new Date().toISOString(),
  });
}

async function logOdometer(data) {
  if (!data.date || !data.odometer) throw new Error("날짜와 주행거리는 필수입니다.");
  await addRecord("odometer_updates", { date: data.date, odometer: Number(data.odometer), created_at: new Date().toISOString() });
}

async function logVehicleTax(data) {
  if (!data.date || !data.cost) throw new Error("날짜와 세액은 필수입니다.");
  await addRecord("vehicle_tax", { date: data.date, cost: Number(data.cost || 0), notes: data.notes || "", created_at: new Date().toISOString() });
}

async function getAllLogs() {
  const logs = [];
  (await getAll("fueling")).forEach(r => logs.push({ table: "fueling", id: r.id, date: r.date, type: "주유", odometer: r.odometer, desc: `${r.fuel_volume}L 주유`, cost: r.cost }));
  (await getAll("maintenance")).forEach(r => logs.push({ table: "maintenance", id: r.id, date: r.date, type: "정비", odometer: r.odometer, desc: r.item, notes: r.notes || "", cost: r.cost, item: r.item, align_f_camber: r.align_f_camber || "", align_f_toe: r.align_f_toe || "", align_f_caster: r.align_f_caster || "", align_r_camber: r.align_r_camber || "", align_r_toe: r.align_r_toe || "" }));
  (await getAll("track_sessions")).forEach(r => logs.push({ table: "track_sessions", id: r.id, date: r.date, type: "트랙", odometer: r.odometer, desc: trackDesc(r), cost: r.cost }));
  (await getAll("drive_logs")).forEach(r => logs.push({ table: "drive_logs", id: r.id, date: r.date, type: "주행", odometer: r.odometer, desc: r.memo || `${r.distance || ""}km 주행`, cost: r.cost }));
  (await getAll("insurance")).forEach(r => logs.push({ table: "insurance", id: r.id, date: r.renewal_date, type: "보험", odometer: r.odometer ?? null, desc: `보험 갱신 (만료: ${r.expiration_date})`, cost: r.cost, renewal_date: r.renewal_date, expiration_date: r.expiration_date }));
  (await getAll("vehicle_tax")).forEach(r => logs.push({ table: "vehicle_tax", id: r.id, date: r.date, type: "자동차세", odometer: null, desc: r.notes || "자동차세", cost: r.cost }));
  (await getAll("odometer_updates")).forEach(r => logs.push({ table: "odometer_updates", id: r.id, date: r.date, type: "주행거리", odometer: r.odometer, desc: `${r.odometer.toLocaleString()}km 갱신`, cost: 0 }));
  logs.sort((a, b) => (a.date + String(a.id).padStart(10, "0")) < (b.date + String(b.id).padStart(10, "0")) ? 1 : -1);
  return logs;
}

const EDITABLE_COLS = {
  fueling: ["date", "odometer", "fuel_volume", "cost"],
  maintenance: ["date", "odometer", "item", "notes", "cost", "align_f_camber", "align_f_toe", "align_f_caster", "align_r_camber", "align_r_toe"],
  track_sessions: ["date", "odometer", "session_type", "count", "cost", "circuit_name", "lap_time", "tire_pressure", "suspension_damping", "weather", "air_temp"],
  drive_logs: ["date", "odometer", "distance", "memo", "cost"],
  insurance: ["renewal_date", "expiration_date", "cost", "odometer"],
  odometer_updates: ["date", "odometer"],
  vehicle_tax: ["date", "cost", "notes"],
};

async function deleteLog(table, id) {
  if (!EDITABLE_COLS[table]) throw new Error("잘못된 테이블");
  await deleteRecord(table, id);
}

async function editLog(table, id, fields) {
  if (!EDITABLE_COLS[table]) throw new Error("잘못된 테이블");
  const allowed = EDITABLE_COLS[table];
  const record = await getOne(table, id);
  if (!record) throw new Error("레코드를 찾을 수 없습니다.");
  let changed = false;
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { record[k] = v; changed = true; }
  }
  if (!changed) throw new Error("수정 가능한 필드가 없습니다.");
  await putRecord(table, record);
}

async function getMonthlyStats(month) {
  const monthSet = new Set();
  const specs = [["fueling", "date"], ["maintenance", "date"], ["track_sessions", "date"], ["drive_logs", "date"],
    ["insurance", "renewal_date"], ["vehicle_tax", "date"], ["odometer_updates", "date"]];
  for (const [tbl, dcol] of specs) {
    (await getAll(tbl)).forEach(r => { if (r[dcol]) monthSet.add(r[dcol].slice(0, 7)); });
  }
  const availableMonths = [...monthSet].sort().reverse();
  if (!month) {
    if (!availableMonths.length) return { available_months: [], current_month: "", stats: null };
    month = availableMonths[0];
  }

  let maxOdo = 0, minOdo = null;
  for (const [tbl, col] of [["fueling", "odometer"], ["maintenance", "odometer"], ["track_sessions", "odometer"], ["drive_logs", "odometer"], ["odometer_updates", "odometer"]]) {
    const rows = (await getAll(tbl)).filter(r => r.date && r.date.startsWith(month) && r[col] != null);
    for (const r of rows) { maxOdo = Math.max(maxOdo, r[col]); minOdo = minOdo === null ? r[col] : Math.min(minOdo, r[col]); }
  }
  const monthlyDistance = (minOdo !== null && maxOdo > minOdo) ? maxOdo - minOdo : 0;

  const frows = (await getAll("fueling")).filter(r => r.date && r.date.startsWith(month)).sort((a, b) => a.odometer - b.odometer);
  let monthlyEconomy = null;
  if (frows.length >= 2) {
    const dKm = frows[frows.length - 1].odometer - frows[0].odometer;
    const fuel = frows.slice(1).reduce((s, r) => s + r.fuel_volume, 0);
    if (fuel > 0 && dKm > 0) monthlyEconomy = Math.round((dKm / fuel) * 100) / 100;
  }

  const qsum = async (tbl, dcol) => (await getAll(tbl)).filter(r => r[dcol] && r[dcol].startsWith(month)).reduce((s, r) => s + (r.cost || 0), 0);
  const fuelCost = await qsum("fueling", "date"), maintCost = await qsum("maintenance", "date");
  const trackCost = await qsum("track_sessions", "date"), driveCost = await qsum("drive_logs", "date");
  const insCost = await qsum("insurance", "renewal_date"), taxCost = await qsum("vehicle_tax", "date");
  const totalCost = fuelCost + maintCost + trackCost + driveCost + insCost + taxCost;

  const monthlyLogs = [];
  const addLogs = (rows, mapFn) => rows.forEach(r => monthlyLogs.push(mapFn(r)));
  addLogs((await getAll("fueling")).filter(r => r.date.startsWith(month)), r => ({ type: "주유", date: r.date, odometer: r.odometer, desc: `${r.fuel_volume}L 주유`, cost: r.cost }));
  addLogs((await getAll("maintenance")).filter(r => r.date.startsWith(month)), r => ({ type: "정비", date: r.date, odometer: r.odometer, desc: r.item, notes: r.notes || "", cost: r.cost }));
  addLogs((await getAll("track_sessions")).filter(r => r.date.startsWith(month)), r => ({ type: "트랙", date: r.date, odometer: r.odometer, desc: trackDesc(r), cost: r.cost }));
  addLogs((await getAll("drive_logs")).filter(r => r.date.startsWith(month)), r => ({ type: "주행", date: r.date, odometer: r.odometer, desc: r.memo || `${r.distance || ""}km 주행`, cost: r.cost }));
  addLogs((await getAll("insurance")).filter(r => r.renewal_date.startsWith(month)), r => ({ type: "보험", date: r.renewal_date, odometer: null, desc: `보험 갱신 (만료: ${r.expiration_date})`, cost: r.cost }));
  addLogs((await getAll("vehicle_tax")).filter(r => r.date.startsWith(month)), r => ({ type: "자동차세", date: r.date, odometer: null, desc: r.notes || "자동차세", cost: r.cost }));
  monthlyLogs.sort((a, b) => (a.date > b.date ? 1 : -1));

  return {
    available_months: availableMonths, current_month: month,
    stats: { monthly_distance: monthlyDistance, monthly_economy: monthlyEconomy, monthly_fuel_cost: fuelCost, monthly_maint_cost: maintCost, monthly_total_cost: totalCost },
    monthly_logs: monthlyLogs,
  };
}

async function getAppSettings() {
  const rows = await getAll("app_settings");
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    app_title: map.app_title ?? "MX-5 ND", accent_color: map.accent_color ?? "#e85d04",
    alert_threshold: map.alert_threshold ?? "80", vehicle_release_date: map.vehicle_release_date ?? "",
    initial_odometer: map.initial_odometer ?? "",
    sidebar_order: map.sidebar_order ?? '["home","consumables","monthly","logs","routes"]',
    tune_powertrain: map.tune_powertrain ?? "", tune_suspension_chassis: map.tune_suspension_chassis ?? "",
    tune_exterior_wheels: map.tune_exterior_wheels ?? "", tune_interior: map.tune_interior ?? "",
    dark_mode: map.dark_mode ?? "dark",
    profile_photo_landscape: map.profile_photo_landscape ?? "",
    profile_photo_portrait: map.profile_photo_portrait ?? "",
  };
}

const APP_SETTINGS_EDITABLE = ["app_title", "accent_color", "alert_threshold", "vehicle_release_date",
  "initial_odometer", "sidebar_order", "tune_powertrain", "tune_suspension_chassis", "tune_exterior_wheels", "tune_interior", "dark_mode",
  "profile_photo_landscape", "profile_photo_portrait"];

async function setAppSettings(data) {
  for (const key of APP_SETTINGS_EDITABLE) {
    if (key in data) await putRecord("app_settings", { key, value: String(data[key]) });
  }
}

async function resetAll() {
  // 완전 초기화: 기록(로그)은 물론, 소모품 설정, 운행환경, 앱 설정까지
  // 전부 지웁니다. 차종을 바꾸는 경우처럼 운행환경·사용 제품·연료 등
  // 모든 게 달라지는 상황을 위한 "완전 백지 상태" 초기화입니다.
  // 자동으로 기본값을 다시 채워넣지 않으므로, 초기화 후에는 설정 화면과
  // 소모품 화면에서 새 차량 기준으로 직접 값을 입력해야 합니다.
  const tbls = [
    "fueling", "maintenance", "track_sessions", "drive_logs", "insurance",
    "odometer_updates", "vehicle_tax", "route_archive",
    "consumables", "consumables_config", "settings", "app_settings",
  ];
  for (const t of tbls) await clearStore(t);
}

async function getRoutes() {
  const rows = (await getAll("route_archive")).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return rows.map(r => ({ id: r.id, title: r.title, category: r.category || "", location_text: r.location_text || "", route_link: r.route_link || "", memo: r.memo || "", created_at: r.created_at || "" }));
}

async function addRoute(data) {
  const title = (data.title || "").trim();
  if (!title) throw new Error("장소명은 필수입니다.");
  await addRecord("route_archive", {
    title, category: data.category || "", location_text: data.location_text || "",
    route_link: data.route_link || "", memo: data.memo || "", created_at: new Date().toISOString(),
  });
}

async function deleteRoute(id) {
  if (!id) throw new Error("id가 필요합니다.");
  await deleteRecord("route_archive", id);
}

/* ---------- CSV 12개 테이블 전체 백업/복구 (무손실) ---------- */

const EXPORT_TABLES = [
  ["app_settings", ["key", "value"]],
  ["settings", ["key", "value"]],
  ["consumables_config", [
    "item_name", "spec", "lifespan_months_short", "lifespan_km_short",
    "lifespan_months_long", "lifespan_km_long", "lifespan_circuit",
    "lifespan_gymkhana", "is_custom", "sort_order", "purchase_url", "detailed_memo"
  ]],
  ["consumables", [
    "item_name", "last_replaced_date", "last_replaced_odometer",
    "last_replaced_circuit_sessions", "last_replaced_gymkhana_runs"
  ]],
  ["fueling", ["id", "date", "odometer", "fuel_volume", "cost", "created_at"]],
  ["maintenance", [
    "id", "date", "odometer", "item", "notes", "cost", "created_at",
    "align_f_camber", "align_f_toe", "align_f_caster", "align_r_camber", "align_r_toe"
  ]],
  ["track_sessions", [
    "id", "date", "odometer", "session_type", "count", "cost", "created_at",
    "circuit_name", "lap_time", "tire_pressure", "suspension_damping", "weather", "air_temp"
  ]],
  ["drive_logs", ["id", "date", "odometer", "distance", "memo", "cost", "created_at"]],
  ["insurance", ["id", "renewal_date", "expiration_date", "cost", "created_at", "odometer"]],
  ["vehicle_tax", ["id", "date", "cost", "notes", "created_at"]],
  ["odometer_updates", ["id", "date", "odometer", "created_at"]],
  ["route_archive", ["id", "title", "category", "location_text", "route_link", "memo", "created_at"]],
];

function csvEscape(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exportCSV() {
  let out = "";
  for (const [tbl, cols] of EXPORT_TABLES) {
    out += `=== ${tbl} ===\n`;
    out += cols.join(",") + "\n";
    const rows = await getAll(tbl);
    if (tbl === "consumables_config") {
      rows.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    } else if (tbl === "fueling" || tbl === "maintenance" || tbl === "track_sessions") {
      rows.sort((a, b) => (a.id || 0) - (b.id || 0));
    }
    for (const r of rows) out += cols.map(c => csvEscape(r[c])).join(",") + "\n";
    out += "\n";
  }
  const blob = new Blob(["\ufeff" + out], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mx5_carlog_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = ""; rows.push(row); row = [];
      } else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0].trim() === ""));
}

const IMPORT_TABLE_COLS = {
  app_settings: ["key", "value"],
  settings: ["key", "value"],
  consumables_config: [
    "item_name", "spec", "lifespan_months_short", "lifespan_km_short",
    "lifespan_months_long", "lifespan_km_long", "lifespan_circuit",
    "lifespan_gymkhana", "is_custom", "sort_order", "purchase_url", "detailed_memo"
  ],
  consumables: [
    "item_name", "last_replaced_date", "last_replaced_odometer",
    "last_replaced_circuit_sessions", "last_replaced_gymkhana_runs"
  ],
  fueling: ["date", "odometer", "fuel_volume", "cost", "created_at"],
  maintenance: [
    "date", "odometer", "item", "notes", "cost", "created_at",
    "align_f_camber", "align_f_toe", "align_f_caster", "align_r_camber", "align_r_toe"
  ],
  track_sessions: [
    "date", "odometer", "session_type", "count", "cost", "created_at",
    "circuit_name", "lap_time", "tire_pressure", "suspension_damping", "weather", "air_temp"
  ],
  drive_logs: ["date", "odometer", "distance", "memo", "cost", "created_at"],
  insurance: ["renewal_date", "expiration_date", "cost", "created_at", "odometer"],
  vehicle_tax: ["date", "cost", "notes", "created_at"],
  odometer_updates: ["date", "odometer", "created_at"],
  route_archive: ["title", "category", "location_text", "route_link", "memo", "created_at"],
};

async function importCSV(text) {
  text = text.replace(/^\ufeff/, "");
  const rows = parseCSV(text);
  let currentTable = null, header = [], inserted = 0, skipped = 0;

  for (const row of rows) {
    if (!row || !row.some(f => f.trim() !== "")) continue;

    if (row.length === 1 && row[0].startsWith("===") && row[0].endsWith("===")) {
      const tbl = row[0].replace(/=/g, "").trim();
      currentTable = IMPORT_TABLE_COLS[tbl] ? tbl : null;
      header = [];
      continue;
    }
    if (!currentTable) continue;
    if (!header.length) { header = row.map(h => h.trim()); continue; }

    if (row.length !== header.length) { skipped++; continue; }
    const record = Object.fromEntries(header.map((h, i) => [h, row[i]]));

    if (currentTable === "app_settings") {
      const key = (record.key || "").trim();
      if (key) {
        await putRecord("app_settings", { key, value: String(record.value ?? "") });
        inserted++;
      } else skipped++;
    } else if (currentTable === "settings") {
      const key = (record.key || "").trim();
      if (key) {
        await putRecord("settings", { key, value: String(record.value ?? "") });
        inserted++;
      } else skipped++;
    } else if (currentTable === "consumables_config") {
      const itemName = (record.item_name || "").trim();
      if (!itemName) { skipped++; continue; }
      await putRecord("consumables_config", {
        item_name: itemName,
        spec: record.spec || "",
        lifespan_months_short: parseFloat(record.lifespan_months_short) || 0,
        lifespan_km_short: parseFloat(record.lifespan_km_short) || 0,
        lifespan_months_long: parseFloat(record.lifespan_months_long) || 0,
        lifespan_km_long: parseFloat(record.lifespan_km_long) || 0,
        lifespan_circuit: parseFloat(record.lifespan_circuit) || 0,
        lifespan_gymkhana: parseFloat(record.lifespan_gymkhana) || 0,
        is_custom: parseInt(record.is_custom, 10) || 0,
        sort_order: parseInt(record.sort_order, 10) || 0,
        purchase_url: record.purchase_url || "",
        detailed_memo: record.detailed_memo || "",
      });
      if (!(await getOne("consumables", itemName))) {
        await putRecord("consumables", {
          item_name: itemName, last_replaced_date: null,
          last_replaced_odometer: 0, last_replaced_circuit_sessions: 0, last_replaced_gymkhana_runs: 0
        });
      }
      inserted++;
    } else if (currentTable === "consumables") {
      const itemName = (record.item_name || "").trim();
      if (!itemName) { skipped++; continue; }
      await putRecord("consumables", {
        item_name: itemName,
        last_replaced_date: record.last_replaced_date || null,
        last_replaced_odometer: parseInt(record.last_replaced_odometer, 10) || 0,
        last_replaced_circuit_sessions: parseInt(record.last_replaced_circuit_sessions, 10) || 0,
        last_replaced_gymkhana_runs: parseInt(record.last_replaced_gymkhana_runs, 10) || 0,
      });
      inserted++;
    } else {
      // 일반 로그 테이블 중복 체크
      const existing = await getAll(currentTable);
      const createdAt = (record.created_at || "").trim();
      let isDup = false;
      if (createdAt) {
        isDup = existing.some(e => e.created_at === createdAt);
      } else {
        if (currentTable === "fueling") isDup = existing.some(e => e.date === record.date && e.odometer === Number(record.odometer) && e.fuel_volume === Number(record.fuel_volume));
        else if (currentTable === "maintenance") isDup = existing.some(e => e.date === record.date && e.odometer === Number(record.odometer) && e.item === record.item);
        else if (currentTable === "track_sessions") isDup = existing.some(e => e.date === record.date && e.odometer === Number(record.odometer) && e.session_type === record.session_type);
        else if (currentTable === "insurance") isDup = existing.some(e => e.renewal_date === record.renewal_date && e.expiration_date === record.expiration_date);
        else if (currentTable === "vehicle_tax") isDup = existing.some(e => e.date === record.date && e.cost === Number(record.cost));
        else if (currentTable === "odometer_updates") isDup = existing.some(e => e.date === record.date && e.odometer === Number(record.odometer));
      }

      if (isDup) { skipped++; continue; }

      const wantedCols = IMPORT_TABLE_COLS[currentTable];
      const obj = {};
      for (const col of wantedCols) {
        let v = record[col] ?? null;
        if (v === "") v = null;
        if (["odometer", "cost", "count", "distance"].includes(col)) {
          v = (v === null || v === undefined) ? ((col === "odometer" && currentTable === "insurance") ? null : 0) : Number(v);
        } else if (col === "fuel_volume") {
          v = (v === null || v === undefined) ? 0 : parseFloat(v);
        } else {
          if (v === null || v === undefined) v = "";
        }
        obj[col] = v;
      }
      try { await addRecord(currentTable, obj); inserted++; }
      catch { skipped++; }
    }
  }
  return { message: `가져오기 완료: ${inserted}건 추가/동기화, ${skipped}건 중복 건너뜀` };
}

window.CarLogDB = {
  getHomeData, getConsumablesStatus, addConsumable, editConsumable, deleteConsumable, resetConsumable,
  reorderConsumables, getConsumableHistory, logFuel, logMaintenance, logTrack, getTrackBestLaps,
  logDrive, logInsurance, logOdometer, logVehicleTax, getAllLogs, deleteLog, editLog,
  getMonthlyStats, getAppSettings, setAppSettings, resetAll, getRoutes, addRoute, deleteRoute,
  exportCSV, importCSV, getDrivingEnv, setDrivingEnv, getCurrentOdometer,
};
