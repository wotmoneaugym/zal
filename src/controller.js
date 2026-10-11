// Logic of the phone app without the DOM: key, «Новый день», results, sending, status line, recovery.
// Browser module: no node:* imports. The screen (view.ts) only draws state() and forwards events.
import { addDays, localDateString } from "../core/dates.js";
import { candidatesFor, deliveryLabel, existingDates,            } from "../core/state.js";
import { validateField, validateWorkout } from "../core/validate.js";
import { newDay as planNewDay, withResult,                                  } from "../core/workout.js";
import { createGitHubClient, GitHubError,                   } from "./github.js";
import { createSender } from "./sender.js";
                                              

                             
                     
                                                                 
                                                                                                                                                                    
                                                                                      
                                                                                                                                     
                                                        
 

                                                                                                                      

const SAVED = "сохранено в телефоне";
const SENT = "отправлено";
const IN_OBSIDIAN = "в Обсидиане";
const KEY_BROKEN = "ключ не работает — тренировки только в телефоне";
const CONFLICT = "конфликт: на эту дату уже есть заметка";
const NO_PROGRAM = "нет программы — откройте приложение со связью";
const NOT_APPLIED = "Не применено с телефона: ";
const KEY_REJECTED = "GitHub не принял ключ. Нужен fine-grained ключ с доступом только к репозиторию workout-data: Contents — Read and write.";
const KEY_OFFLINE = "Нет связи с GitHub. Подключитесь к интернету и сохраните ключ ещё раз.";
const KEY_UNREADABLE = "Ключ не работает: в нём невидимый или недопустимый символ. Скопируйте ключ и вставьте его ещё раз.";
const STORAGE_FAILED = "не удалось сохранить в телефоне — данные только в памяти";
const DEFAULT_REPO = "workout-data";
const API_VERSION = "2022-11-28";
const SEND_DELAY_MS = 2500; // after the last edit (design §9: 2–3 s)
const SYNC_DELAY_MS = 1000; // after opening, returning to the app or the network coming back (design §9: ~1 s)
const NEW_DAY_REFRESH_MS = 3000; // «Новый день» waits at most this long for state.json and inbox/
const PC_QUIET_MS = 7 * 60 * 60 * 1000; // a running pc-sync refreshes lastSuccessAt at least every 6 h
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const INBOX_FILE = /^(\d{4}-\d{2}-\d{2})(?:--([A-Za-z0-9-]{1,64}))?\.json$/u;
// A pasted key after whitespace is stripped: a zero-width space or a bidi mark passes \s, and the browser's fetch
// would then throw a TypeError on the Authorization header (Task 17 review).
const PRINTABLE_ASCII = /^[\x21-\x7E]+$/u;

                                                                                     

function pad2(value        )         {
  return String(value).padStart(2, "0");
}

// «12 окт 18:40» in the phone's local time.
function pcTime(iso        )         {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function looksLikeState(value         )                 {
  if (typeof value !== "object" || value === null) return false;
  const s = value                           ;
  return s.schema === 1 && "program" in s && Array.isArray(s.notes) && typeof s.delivery === "object" && s.delivery !== null && typeof s.lastSuccessAt === "string";
}

function refusedKey(error         )          {
  return error instanceof GitHubError && (error.status === 401 || error.status === 403 || error.status === 404);
}

// storage.ts checks only the top level of a stored workout (Task 17); core/state.ts and the screen need every exercise complete.
function looksLikeWorkout(w         )          {
  return typeof w.id === "string" && Number.isInteger(w.rev) && typeof w.date === "string" && typeof w.weekday === "string" &&
    Array.isArray(w.exercises) && w.exercises.every((e) =>
      typeof e === "object" && e !== null && typeof e.number === "number" && typeof e.name === "string" && typeof e.plan === "string" &&
      typeof e.rest === "string" && typeof e.previous === "string" && typeof e.result === "string");
}

// "<date>.json" (the first workout of that date) before "<date>--<id>.json".
function inboxOrder(a        , b        )         {
  const x = a.replace(/\.json$/u, "");
  const y = b.replace(/\.json$/u, "");
  return x < y ? -1 : x > y ? 1 : 0;
}

export function createController(deps                                                                                                                                                                                                                            )             {
  const data = deps.storage.load();
  if (data.repo === "") data.repo = DEFAULT_REPO;
  if (!looksLikeState(data.state)) data.state = null; // storage keeps state by schema only (Task 17): a malformed copy counts as never fetched
  let storageFailed = false; // the last save failed (quota, private mode): data lives in memory only
  let keyRejected = false; // GitHub refused the stored key; in memory only, rechecked after every restart
  let message                = null;
  let sendTimer          = null;
  let syncTimer          = null;
  let refreshing                       = null;

  const persist = ()       => {
    storageFailed = !deps.storage.save(data);
  };
  const today = ()         => localDateString(deps.now());
  const sentRev = (id        )         => (Object.hasOwn(data.lastSentRev, id) ? data.lastSentRev[id] : 0);
  const sound = ()            => data.workouts.filter(looksLikeWorkout); // malformed stored workouts are kept but never shown or sent

  function client()                      {
    if (data.token === null || data.owner === "" || keyRejected) return null;
    return createGitHubClient({ token: data.token, owner: data.owner, repo: data.repo, apiBase: data.apiBase, fetch: deps.fetch });
  }

  const sender = createSender({
    client,
    getWorkouts: sound,
    getLastSentRev: () => data.lastSentRev,
    markSent: (id        , rev        ) => {
      data.lastSentRev[id] = Math.max(sentRev(id), rev);
      persist();
    },
    onStatus: (status) => {
      // With a client in hand "key-invalid" means GitHub refused the key; without one it only means "no key yet".
      if (status === "key-invalid" && client() !== null) keyRejected = true;
    },
    sleep: (ms        ) => new Promise      ((resolve) => {
      deps.setTimer(resolve, ms);
    }),
  });

  // The workout on screen: the latest one dated today or yesterday (a workout past midnight stays visible).
  function current()                 {
    const from = addDays(today(), -1);
    let best                 = null;
    for (const w of sound()) {
      if (w.date >= from && (best === null || w.date > best.date)) best = w;
    }
    return best;
  }

  function statusFor(w                )         {
    if (storageFailed) return STORAGE_FAILED;
    if (keyRejected) return KEY_BROKEN;
    const state = data.state;
    if (w === null) return state !== null && state.program !== null ? "" : NO_PROGRAM;
    if (deliveryLabel(state, w) !== null) return IN_OBSIDIAN;
    const sent = sentRev(w.id);
    const delivery = state !== null && Object.hasOwn(state.delivery, w.id) ? state.delivery[w.id] : null;
    if (delivery !== null && delivery.rev >= sent) {
      if (delivery.status === "conflict") return CONFLICT;
      if (delivery.status === "rejected" || delivery.status === "held") return `ПК не принял: ${delivery.reason ?? delivery.status}`;
    }
    if (sent < w.rev) return SAVED;
    if (state !== null && deps.now().getTime() - Date.parse(state.lastSuccessAt) > PC_QUIET_MS) {
      return `ПК обновлял данные: ${pcTime(state.lastSuccessAt)}`;
    }
    return SENT;
  }

  // design §10: the phone and Obsidian changed the same result differently; the note kept Obsidian's value and
  // pc-sync wrote the phone's value into delivery.reason of a "merged" delivery (Task 13). Shown while that
  // verdict covers the version on screen; a newer phone edit (higher rev) makes it disappear.
  function droppedPhoneValues(w                )                {
    const state = data.state;
    if (w === null || state === null || deliveryLabel(state, w) === null || !Object.hasOwn(state.delivery, w.id)) return null;
    const delivery = state.delivery[w.id];
    if (delivery.status !== "merged" || delivery.reason === undefined || delivery.reason.trim() === "") return null;
    return `${NOT_APPLIED}${delivery.reason}`;
  }

  async function whoAmI(token        )               {
    const fetchFn = deps.fetch; // plain call: Safari rejects window.fetch with a foreign `this`
    let response          ;
    try {
      response = await fetchFn(`${data.apiBase.replace(/\/+$/u, "")}/user`, {
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": API_VERSION },
        cache: "no-store",
      });
    } catch {
      return { kind: "offline" };
    }
    if (response.status === 401 || response.status === 403) return { kind: "invalid" };
    if (!response.ok) return { kind: "offline" };
    const body          = await response.json().catch(() => null);
    const login = typeof body === "object" && body !== null ? (body                       ).login : undefined;
    return typeof login === "string" && /^[A-Za-z0-9-]{1,39}$/u.test(login) ? { kind: "ok", login } : { kind: "offline" };
  }

  async function setToken(raw        )                                        {
    const token = raw.replace(/\s+/gu, "");
    if (token === "") {
      message = KEY_REJECTED;
      return "invalid";
    }
    if (!PRINTABLE_ASCII.test(token)) {
      message = KEY_UNREADABLE;
      return "invalid";
    }
    let owner = data.owner;
    if (owner === "") {
      const who = await whoAmI(token);
      if (who.kind !== "ok") {
        message = who.kind === "invalid" ? KEY_REJECTED : KEY_OFFLINE;
        return who.kind;
      }
      owner = who.login;
    }
    try {
      await createGitHubClient({ token, owner, repo: data.repo, apiBase: data.apiBase, fetch: deps.fetch }).checkAccess();
    } catch (error) {
      if (refusedKey(error)) {
        message = KEY_REJECTED;
        return "invalid";
      }
      message = KEY_OFFLINE;
      return "offline";
    }
    data.token = token;
    data.owner = owner;
    keyRejected = false;
    message = null;
    persist();
    sender.kick();
    void refresh();
    return "ok";
  }

  async function recoverInbox(gh              )                {
    const now = today();
    const recent = addDays(now, -1);
    const noteDates = new Set((data.state?.notes ?? []).map((note) => note.date));
    const names = (await gh.listDir("inbox")).map((entry) => entry.name).sort(inboxOrder);
    for (const name of names) {
      const match = INBOX_FILE.exec(name);
      if (match === null) continue;
      const date = match[1];
      const idInName = match[2];
      if (data.workouts.some((w) => w.date === date)) continue;
      if (idInName !== undefined && data.workouts.some((w) => w.id === idInName)) continue;
      if (date < recent && noteDates.has(date)) continue; // an old date that already has its note
      const remote = await gh.getJson         (`inbox/${name}`);
      if (remote === null || !validateWorkout(remote.value, { today: now, minDate: "" }).ok) continue;
      const w = remote.value           ;
      if (w.date !== date || data.workouts.some((x) => x.id === w.id || x.date === w.date)) continue;
      if (date < recent && deliveryLabel(data.state, w) !== null) continue; // the note covers it
      data.workouts.push(w);
      data.lastSentRev[w.id] = Math.max(sentRev(w.id), w.rev); // it is in GitHub already: never sent again
      persist();
    }
  }

  async function doRefresh()                {
    const gh = client();
    if (gh === null) return;
    try {
      const remote = await gh.getJson         ("state.json");
      if (remote !== null && looksLikeState(remote.value)) {
        data.state = remote.value;
        data.stateFetchedAt = deps.now().toISOString();
        persist();
      }
      await recoverInbox(gh);
    } catch (error) {
      if (error instanceof GitHubError && (error.status === 401 || error.status === 403)) keyRejected = true;
      // No network or GitHub trouble: keep working from the phone's own copy.
    }
  }

  function refresh()                {
    if (refreshing === null) {
      refreshing = doRefresh().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  function withTimeout(task               , ms        )                {
    return new Promise      ((resolve) => {
      const timer = deps.setTimer(resolve, ms);
      const finish = ()       => {
        deps.clearTimer(timer);
        resolve();
      };
      task.then(finish, finish);
    });
  }

  function scheduleSend()       {
    if (sendTimer !== null) deps.clearTimer(sendTimer);
    sendTimer = deps.setTimer(() => {
      sendTimer = null;
      sender.kick();
    }, SEND_DELAY_MS);
  }

  function sendNow()       {
    if (sendTimer !== null) {
      deps.clearTimer(sendTimer);
      sendTimer = null;
    }
    sender.kick();
  }

  function syncSoon()       {
    if (syncTimer !== null) deps.clearTimer(syncTimer);
    syncTimer = deps.setTimer(() => {
      syncTimer = null;
      sender.kick();
      void refresh();
    }, SYNC_DELAY_MS);
  }

  async function newDay(now      )                                                                   {
    await withTimeout(refresh(), NEW_DAY_REFRESH_MS);
    const program = data.state?.program ?? null;
    if (program === null) {
      message = NO_PROGRAM;
      return { kind: "no-program", message: NO_PROGRAM };
    }
    const outcome = planNewDay({
      program,
      date: localDateString(now),
      existingDates: existingDates(data.state, sound()),
      candidates: candidatesFor(data.state, sound()),
      id: deps.randomId(),
      nowIso: now.toISOString(),
    });
    if (outcome.kind === "created") {
      data.workouts.push(outcome.workout);
      message = null;
      persist();
      scheduleSend();
    } else {
      message = outcome.message;
    }
    return outcome;
  }

  function setResult(number        , text        )       {
    const w = current();
    if (w === null) return;
    const exercise = w.exercises.find((e) => e.number === number);
    if (exercise === undefined || exercise.result === text) return;
    const check = validateField(text, `Результат ${number}`);
    if (!check.ok) {
      message = `Не сохранено: ${check.reason}`;
      return;
    }
    const next = withResult(w, number, text, deps.now().toISOString());
    data.workouts = data.workouts.map((x) => (x.id === next.id ? next : x));
    message = null;
    persist();
    scheduleSend();
  }

  return {
    state()            {
      const w = current();
      const screen = data.token === null || keyRejected ? "key" : "main";
      // A message about the user's own action wins; otherwise the main screen tells which phone values were not applied.
      return { screen, workout: w, status: statusFor(w), message: message ?? (screen === "main" ? droppedPhoneValues(w) : null) };
    },
    setToken,
    refresh,
    newDay,
    setResult,
    onVisible: syncSoon,
    onOnline: syncSoon,
    onHidden: sendNow,
  };
}
