// Entry point of the phone app: wires the controller to the DOM and browser events.
import { createController,                } from "./controller.js";
import { loadLocal, requestPersistence, saveLocal } from "./storage.js";
import { isStandalone, render } from "./view.js";

// Local checks only (node pwa/dev/serve.ts + node pwa/dev/mock-github.ts): on localhost the app talks to the
// mock GitHub and accepts ?standalone and ?now=<local date-time>. On github.io none of this applies, and the
// production CSP would block localhost anyway.
const DEV = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const MOCK_API = "http://localhost:8787";

function makeClock()             {
  const forced = DEV ? new URLSearchParams(location.search).get("now") : null;
  const base = forced === null ? Number.NaN : new Date(forced).getTime();
  if (Number.isNaN(base)) return () => new Date();
  const startedAt = Date.now();
  return () => new Date(base + (Date.now() - startedAt));
}

const now = makeClock();
const root = document.getElementById("app")               ;
const standalone = isStandalone(window, DEV);

const controller = createController({
  storage: {
    load: () => {
      const data = loadLocal();
      return DEV ? { ...data, apiBase: MOCK_API } : data;
    },
    save: saveLocal,
  },
  fetch: (input, init) => fetch(input, init),
  now,
  randomId: () => crypto.randomUUID(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (timer) => clearTimeout(timer          ),
});

let busy = false;
let painted = "";

function signature(vm           )         {
  return JSON.stringify([vm.screen, vm.status, vm.message, vm.workout?.id ?? null, vm.workout?.rev ?? null, vm.selectedHistoryFile, vm.history.map((note) => [note.file, note.mtimeMs]), busy]);
}

function paint()       {
  const vm = controller.state();
  render(root, vm, { standalone, busy, onSaveKey, onNewDay, onResultInput, onResultDone,
    onOpenHistory: () => { controller.openHistory(); paint(); },
    onOpenHistoryNote: (file) => { controller.openHistoryNote(file); paint(); },
    onBackHistory: () => { controller.backHistory(); paint(); },
  });
  painted = signature(vm);
}

function whileBusy(task                        )       {
  if (busy) return;
  busy = true;
  paint();
  void task().finally(() => {
    busy = false;
    paint();
  });
}

function onSaveKey(token        )       {
  whileBusy(() => controller.setToken(token));
}

function onNewDay()       {
  whileBusy(() => controller.newDay(now()));
}

function onResultInput(number        , text        )       {
  controller.setResult(number, text);
  paint();
}

function onResultDone()       {
  controller.onHidden(); // send now: Enter («Готово») or the field lost focus
  paint();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") controller.onVisible();
  else controller.onHidden();
  paint();
});
window.addEventListener("pageshow", () => {
  controller.onVisible();
  paint();
});
window.addEventListener("pagehide", () => controller.onHidden());
window.addEventListener("online", () => controller.onOnline());

// GitHub answers arrive asynchronously; repaint when what the screen shows has changed.
setInterval(() => {
  if (document.visibilityState === "visible" && signature(controller.state()) !== painted) paint();
}, 500);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => undefined);
}
void requestPersistence().catch(() => false);
paint();
