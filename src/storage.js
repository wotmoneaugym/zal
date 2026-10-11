// Phone storage: one JSON document in localStorage. Every access is guarded:
// Safari may throw on access (blocked data) and in setItem (quota).
                                                 
                                                     

                                                                                                                                                                                                               

export const STORAGE_KEY = "workout-tracker:v1";
export const CORRUPT_KEY = "workout-tracker:v1:corrupt";

                       
                                      
                                            
 

export function emptyLocal()            {
  return {
    token: null,
    owner: "",
    repo: "workout-data",
    apiBase: "https://api.github.com",
    workouts: [],
    state: null,
    stateFetchedAt: null,
    lastSentRev: {},
  };
}

function storage()                     {
  try {
    const candidate = (globalThis                                         ).localStorage;
    return candidate ?? null;
  } catch {
    return null; // SecurityError: storage is blocked
  }
}

function isRecord(value         )                                   {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWorkoutLike(value         )                   {
  return isRecord(value) && value.schema === 1 && typeof value.id === "string" && value.id !== "" &&
    Number.isInteger(value.rev) && typeof value.date === "string" && typeof value.weekday === "string" &&
    Array.isArray(value.exercises) && typeof value.updatedAt === "string";
}

// Cleans what was read; `lossy` says that something stored had to be dropped.
function sanitize(raw         )                                      {
  const data = emptyLocal();
  if (!isRecord(raw)) return { data, lossy: true };
  let lossy = false;
  if (typeof raw.token === "string" && raw.token !== "") data.token = raw.token;
  else if (raw.token !== undefined && raw.token !== null) lossy = true;
  if (typeof raw.owner === "string") data.owner = raw.owner;
  else if (raw.owner !== undefined) lossy = true;
  if (typeof raw.repo === "string" && raw.repo !== "") data.repo = raw.repo;
  else if (raw.repo !== undefined) lossy = true;
  if (typeof raw.apiBase === "string" && raw.apiBase !== "") data.apiBase = raw.apiBase;
  else if (raw.apiBase !== undefined) lossy = true;
  if (Array.isArray(raw.workouts)) {
    data.workouts = raw.workouts.filter(isWorkoutLike);
    lossy = data.workouts.length !== raw.workouts.length;
  } else if (raw.workouts !== undefined) {
    lossy = true;
  }
  if (isRecord(raw.state) && raw.state.schema === 1) data.state = raw.state                    ;
  else if (raw.state !== undefined && raw.state !== null) lossy = true;
  if (typeof raw.stateFetchedAt === "string") data.stateFetchedAt = raw.stateFetchedAt;
  else if (raw.stateFetchedAt !== undefined && raw.stateFetchedAt !== null) lossy = true;
  if (isRecord(raw.lastSentRev)) {
    // fromEntries creates own data properties, so ids like "__proto__" stay plain keys.
    data.lastSentRev = Object.fromEntries(
      Object.entries(raw.lastSentRev).filter(([, rev]) => typeof rev === "number" && Number.isInteger(rev) && rev >= 0),
    )                          ;
    if (Object.keys(data.lastSentRev).length !== Object.keys(raw.lastSentRev).length) lossy = true;
  } else if (raw.lastSentRev !== undefined) {
    lossy = true;
  }
  return { data, lossy };
}

export function loadLocal()            {
  const store = storage();
  if (store === null) return emptyLocal();
  let text               ;
  try {
    text = store.getItem(STORAGE_KEY);
  } catch {
    return emptyLocal();
  }
  if (text === null) return emptyLocal();
  let parsed          = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  const { data, lossy } = sanitize(parsed);
  if (lossy) {
    try {
      store.setItem(CORRUPT_KEY, text); // keep the raw text so nothing is lost for good
    } catch {
      // Storage is full or blocked: the raw text still sits under STORAGE_KEY until the next save.
    }
  }
  return data;
}

export function saveLocal(d           )          {
  const store = storage();
  if (store === null) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export async function requestPersistence()                   {
  try {
    const manager = (globalThis     
                                                                                                         
     ).navigator?.storage;
    if (manager === undefined || typeof manager.persist !== "function") return false;
    if (typeof manager.persisted === "function" && (await manager.persisted()) === true) return true;
    return (await manager.persist()) === true;
  } catch {
    return false;
  }
}
