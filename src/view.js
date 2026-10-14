// Screens of the phone app drawn from the controller's ViewModel: a dark, note-like reading view (artboard V3).
// All text goes through textContent, never parsed as HTML; no inline styles (CSP style-src 'self'); the clock and
// back-arrow icons are CSS backgrounds, so no SVG is built here. Re-rendering the same screen only updates values, so
// the field being typed in keeps focus and caret.
// Motion (Emil Kowalski's rules): only when the screen changes, never on a re-render while typing and never on a
// keyboard action. A deeper screen (main → history → note) slides in from the right, going back from the left and
// faster; closing the workout with the back arrow slides the home screen in from the left, «Новый день» bringing the
// same workout back slides it in from the right; the exercises of a newly created workout and the history rows
// (opened from the main screen) rise in a short cascade; a changed status line crossfades. transform/opacity/filter
// only, through element.animate() (CSP-safe, interruptible, skipped when the browser lacks it); reduced motion keeps
// only short opacity fades.
import { parseNote,                   } from "../core/parse-note.js";
                                                     
import { MAX_FIELD } from "../core/validate.js";
                                                             
                                                 

                               
                                                                                       
                                                                                        
                                 
                   
                                                    
                                                                              
                        
                                        
                        
                                                                                                  
 

                                                                               

                   
              
                                                                                                               
                           
                                                                                                          
                         
                                        
                         
                       
                                                                                                           
                                                                                      
                     
                                                                                              
 

const mounted = new WeakMap                      ();

const HISTORY_LABEL = "История тренировок";
const CLOSE_LABEL = "Закрыть тренировку";
const BACK_LABEL = "Назад";
const PREVIOUS_LABEL = "Прошлый раз";
const RESULT_LABEL = "Результат";
const EMPTY_RESULT = "—";
// «пн, 12 окт» next to the clock: the workout's own weekday and date, nothing derived from the phone's clock.
const WEEKDAY_SHORT                         = {
  "ПОНЕДЕЛЬНИК": "пн", "ВТОРНИК": "вт", "СРЕДА": "ср", "ЧЕТВЕРГ": "чт", "ПЯТНИЦА": "пт", "СУББОТА": "сб", "ВОСКРЕСЕНЬЕ": "вс",
};
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const ENTER_MS = 220;      // deeper screen
const BACK_MS = 160;       // going back: exits are faster than entrances
const RISE_MS = 260;
const RISE_STEP_MS = 35;
const RISE_MAX_STEPS = 7;
const STATUS_MS = 200;
const REDUCED_FADE_MS = 150;

export function isStandalone(win        , dev         )          {
  if (win.matchMedia("(display-mode: standalone)").matches) return true;
  if ((win.navigator                                        ).standalone === true) return true;
  return dev && new URLSearchParams(win.location.search).has("standalone");
}

export function render(root             , vm           , handlers              )       {
  const doc = root.ownerDocument;
  const key = screenKey(vm, handlers.standalone);
  const previous = mounted.get(root);
  let view = previous;
  if (view === undefined || view.key !== key) {
    view = mount(root, vm, key, handlers, previous);
    mounted.set(root, view);
    if (previous !== undefined) enter(view, previous, reducedMotion(doc));
  }
  update(view, doc, vm, handlers);
}

function reducedMotion(doc          )          {
  try {
    return doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

// Motion is decoration: a browser without the Web Animations API (or one that rejects the options) just shows the screen.
function animate(node             , keyframes            , options                          )       {
  try {
    node.animate?.(keyframes, options);
  } catch {
    // no animation, same screen
  }
}

function screenDepth(vm           , key        )                {
  if (key === "key" || key === "install") return null;
  if (vm.screen === "history") return vm.selectedHistoryFile === null ? 1 : 2;
  return 0;
}

// Runs once per new screen, never on a re-render of the same one.
function enter(view         , previous         , reduced         )       {
  const onMain = view.depth === 0 && previous.depth === 0;
  // Back arrow: the workout is gone from the main screen. «Новый день» brought the same workout back (not created).
  const closed = onMain && previous.workoutId !== null && view.workoutId === null;
  const reopened = onMain && previous.workoutId === null && view.workoutId !== null && view.reopened;
  const otherDepth = view.depth !== null && previous.depth !== null && view.depth !== previous.depth;
  if (otherDepth || closed || reopened) {
    const deeper = reopened || (otherDepth && (view.depth ?? 0) > (previous.depth ?? 0));
    if (reduced) {
      animate(view.sheet, [{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED_FADE_MS, easing: "ease", fill: "backwards" });
    } else {
      animate(view.sheet, [{ opacity: 0, transform: deeper ? "translateX(12px)" : "translateX(-12px)" }, { opacity: 1, transform: "translateX(0)" }], {
        duration: deeper ? ENTER_MS : BACK_MS, easing: EASE_OUT, fill: "backwards",
      });
    }
  }
  if (reduced) return;
  // «Новый день» has just created a workout (rare), or the history list was opened from the main screen.
  const newWorkout = onMain && !reopened && view.workoutId !== null && view.workoutId !== previous.workoutId;
  const openedList = view.depth === 1 && previous.depth === 0;
  if (!newWorkout && !openedList) return;
  view.items.forEach((item, index) => {
    animate(item, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], {
      duration: RISE_MS, delay: Math.min(index, RISE_MAX_STEPS) * RISE_STEP_MS, easing: EASE_OUT, fill: "backwards",
    });
  });
}

function screenKey(vm           , standalone         )         {
  if (vm.screen === "key") return standalone ? "key" : "install";
  if (vm.screen === "history") return `history:${vm.selectedHistoryFile ?? "list"}:${vm.history.map((note) => `${note.file}:${note.mtimeMs}`).join("|")}`;
  return vm.workout === null ? "main:-" : `main:${vm.workout.id}:${vm.workout.exercises.length}`;
}

function el                                       (doc          , tag   , className        , text         )                           {
  const node = doc.createElement(tag);
  if (className !== "") node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function shortDate(weekday        , date        )         {
  const parts = date.split("-");
  const month = parts.length === 3 ? MONTHS_SHORT[Number(parts[1]) - 1] : undefined;
  const day = Number(parts[2]);
  if (month === undefined || !Number.isInteger(day) || day < 1) return date;
  return Object.hasOwn(WEEKDAY_SHORT, weekday) ? `${WEEKDAY_SHORT[weekday]}, ${day} ${month}` : `${day} ${month}`;
}

function noteTitle(file        )         {
  return file.replace(/\.md$/u, "");
}

function mount(root             , vm           , key        , handlers              , previous                     )          {
  const doc = root.ownerDocument;
  const view          = {
    key,
    depth: screenDepth(vm, key),
    workoutId: vm.screen === "main" ? (vm.workout?.id ?? null) : null,
    reopened: vm.screen === "main" && vm.workout !== null && vm.reopened,
    handlers,
    inputs: new Map(),
    buttons: [],
    message: el(doc, "p", "message"),
    status: previous?.status ?? el(doc, "footer", "status"),
    statusText: previous?.statusText ?? null,
    sheet: root,
    items: [],
  };
  view.message.setAttribute("role", "status");
  view.status.setAttribute("aria-live", "polite");
  view.sheet = key === "install" ? installSheet(doc, view) : key === "key" ? keySheet(doc, view) : vm.screen === "history" ? historySheet(doc, vm, view) : mainSheet(doc, vm, view);
  root.replaceChildren(view.sheet, view.status);
  return view;
}

function button(doc          , view         , className        , idle        , busy        )                    {
  const node = el(doc, "button", className, idle);
  node.setAttribute("type", "button");
  view.buttons.push({ button: node, idle, busy });
  return node;
}

// Header of the main and history screens: the back arrow on the left (when there is somewhere to go back), the
// workout's date in the middle, the clock on the right (CSS keeps a lone clock on the right edge).
function topbar(doc          , ...items                           )              {
  const bar = el(doc, "header", "topbar");
  for (const item of items) if (item !== null) bar.append(item);
  return bar;
}

// 44×44 icon button with a 24 px chevron drawn by CSS; the label is for assistive tech only.
function backArrow(doc          , view         , className        , label        , action            )                    {
  const arrow = button(doc, view, `icon back ${className}`, "", "");
  arrow.setAttribute("aria-label", label);
  arrow.addEventListener("click", action);
  return arrow;
}

function mainSheet(doc          , vm           , view         )              {
  const workout = vm.workout;
  const sheet = el(doc, "main", workout === null ? "sheet sheet-empty" : "sheet");
  const clock = button(doc, view, "icon history-open", "", "");
  clock.setAttribute("aria-label", HISTORY_LABEL);
  clock.addEventListener("click", () => view.handlers.onOpenHistory());
  const close = workout === null ? null : backArrow(doc, view, "workout-close", CLOSE_LABEL, () => view.handlers.onCloseWorkout());
  const date = workout === null ? null : el(doc, "span", "topbar-date", shortDate(workout.weekday, workout.date));
  sheet.append(topbar(doc, close, date, clock));
  const content = el(doc, "div", workout === null ? "empty-content" : "workout-content");
  if (workout !== null) {
    content.append(el(doc, "h1", "note-title", `${workout.weekday} — ${workout.date}`));
    for (const exercise of workout.exercises) {
      const block = exerciseBlock(doc, exercise, view);
      view.items.push(block);
      content.append(block);
    }
  }
  const actions = el(doc, "div", "actions");
  // «Новый день» only on the home screen; an open workout is left with the back arrow.
  if (workout === null) {
    const newDay = button(doc, view, "button button-primary", "Новый день", "Новый день…");
    newDay.addEventListener("click", () => {
      if (!view.handlers.busy) view.handlers.onNewDay();
    });
    actions.append(newDay);
  }
  actions.append(view.message);
  content.append(actions);
  if (workout === null) content.append(el(doc, "p", "empty", "Сегодня тренировки ещё нет."));
  sheet.append(content);
  return sheet;
}

function historySheet(doc          , vm           , view         )              {
  const sheet = el(doc, "main", "sheet history-sheet");
  sheet.append(topbar(doc, backArrow(doc, view, "history-back", BACK_LABEL, () => view.handlers.onBackHistory())));
  const selected = vm.history.find((note) => note.file === vm.selectedHistoryFile);
  if (selected !== undefined) {
    sheet.append(noteView(doc, selected));
    return sheet;
  }
  const content = el(doc, "div", "history-content");
  content.append(el(doc, "h1", "note-title", HISTORY_LABEL));
  if (vm.history.length === 0) {
    content.append(el(doc, "p", "empty", "Пока нет прошлых тренировок."));
  } else {
    const list = el(doc, "div", "history-list");
    for (const note of vm.history) {
      const item = button(doc, view, "button history-item", noteTitle(note.file), noteTitle(note.file));
      item.addEventListener("click", () => view.handlers.onOpenHistoryNote(note.file));
      view.items.push(item);
      list.append(item);
    }
    content.append(list);
  }
  sheet.append(content);
  return sheet;
}

// parseNote knows the exact Templater layout; a note it cannot read (an old hand-written one) is shown as plain text.
function parsed(note           )                      {
  // A NUL run followed by text makes parseNote's trailing-NUL regex quadratic: show such notes (and huge ones) as text.
  if (typeof note.text !== "string" || note.text.length > 20000 || /\0[^\0]/u.test(note.text)) return null;
  try {
    return parseNote(note.text, note.file.slice(note.file.lastIndexOf("/") + 1));
  } catch {
    return null;
  }
}

// A past note rendered like the main screen, read-only: result as text, no plan/rest line.
function noteView(doc          , note           )              {
  const content = el(doc, "div", "workout-content history-note");
  content.append(el(doc, "h1", "note-title", noteTitle(note.file)));
  const training = parsed(note);
  if (training === null) {
    content.append(el(doc, "pre", "history-text", note.text));
    return content;
  }
  for (const exercise of training.exercises) {
    const block = el(doc, "section", "exercise");
    const result = el(doc, "p", "result-text");
    result.append(el(doc, "span", "result-text-label", RESULT_LABEL), exercise.resultRaw.trim() === "" ? EMPTY_RESULT : exercise.resultRaw);
    block.append(exerciseName(doc, exercise.number, exercise.name), previousQuote(doc, exercise.previousRaw), result);
    content.append(block);
  }
  return content;
}

function exerciseName(doc          , number        , name        )              {
  return el(doc, "h2", "exercise-name", `${number}. ${name}`);
}

function previousQuote(doc          , previous        )              {
  const quote = el(doc, "blockquote", "callout");
  quote.append(el(doc, "span", "callout-title", PREVIOUS_LABEL), el(doc, "span", "callout-body", previous));
  return quote;
}

function exerciseBlock(doc          , exercise                 , view         )              {
  const block = el(doc, "section", "exercise");
  const field = el(doc, "label", "result");
  const input = el(doc, "input", "result-input");
  input.setAttribute("type", "text");
  input.setAttribute("enterkeyhint", "done");
  input.setAttribute("maxlength", String(MAX_FIELD));
  input.setAttribute("placeholder", RESULT_LABEL);
  input.setAttribute("aria-label", `${RESULT_LABEL}: ${exercise.number}. ${exercise.name}`);
  input.value = exercise.result;
  input.addEventListener("input", () => view.handlers.onResultInput(exercise.number, input.value));
  input.addEventListener("keydown", (event) => {
    if ((event                 ).key !== "Enter") return;
    event.preventDefault();
    input.blur();
  });
  input.addEventListener("blur", () => view.handlers.onResultDone());
  field.append(el(doc, "span", "result-label", RESULT_LABEL), input);
  block.append(exerciseName(doc, exercise.number, exercise.name), previousQuote(doc, exercise.previous), field);
  view.inputs.set(exercise.number, input);
  return block;
}

function keySheet(doc          , view         )              {
  const sheet = el(doc, "main", "sheet");
  sheet.append(el(doc, "h1", "note-title", "Ключ GitHub"));
  sheet.append(el(doc, "p", "lead", "Вставьте ключ телефона: fine-grained token с доступом только к репозиторию workout-data (Contents: Read and write). Ключ хранится только в этом телефоне."));
  const field = el(doc, "label", "field");
  const input = el(doc, "input", "key-input");
  const attributes = [["type", "password"], ["autocomplete", "off"], ["autocapitalize", "none"], ["autocorrect", "off"], ["spellcheck", "false"], ["enterkeyhint", "go"]];
  for (const [name, value] of attributes) input.setAttribute(name, value);
  field.append(el(doc, "span", "field-label", "Ключ"), input);
  const save = button(doc, view, "button button-primary", "Сохранить ключ", "Проверяю ключ…");
  const submit = ()       => {
    if (!view.handlers.busy) view.handlers.onSaveKey(input.value);
  };
  save.addEventListener("click", submit);
  input.addEventListener("keydown", (event) => {
    if ((event                 ).key !== "Enter") return;
    event.preventDefault();
    submit();
  });
  sheet.append(field, save, view.message);
  return sheet;
}

function installSheet(doc          , view         )              {
  const sheet = el(doc, "main", "sheet");
  sheet.append(el(doc, "h1", "note-title", "Установите приложение"));
  sheet.append(el(doc, "p", "lead", "Ключ GitHub вводится только в приложении, открытом с экрана «Домой». Так ключ не попадёт в обычный Safari."));
  const steps = el(doc, "ol", "steps");
  for (const text of [
    "Нажмите «Поделиться» внизу экрана Safari.",
    "Выберите «На экран „Домой“» и нажмите «Добавить».",
    "Откройте «Трекер» с экрана «Домой» — там можно вставить ключ.",
  ]) {
    steps.append(el(doc, "li", "", text));
  }
  sheet.append(steps, view.message);
  return sheet;
}

function update(view         , doc          , vm           , handlers              )       {
  view.handlers = handlers;
  if (vm.screen === "main" && vm.workout !== null) {
    for (const exercise of vm.workout.exercises) {
      const input = view.inputs.get(exercise.number);
      if (input !== undefined && doc.activeElement !== input && input.value !== exercise.result) input.value = exercise.result;
    }
  }
  for (const entry of view.buttons) {
    entry.button.disabled = handlers.busy;
    entry.button.textContent = handlers.busy ? entry.busy : entry.idle;
  }
  view.message.textContent = vm.message ?? "";
  view.message.hidden = vm.message === null || vm.message === "";
  if (view.statusText !== vm.status) {
    // Only problems reach the status line (routine states are ""), so every visible change is worth a soft crossfade.
    const changed = view.statusText !== null && vm.status !== "";
    view.statusText = vm.status;
    view.status.textContent = vm.status;
    view.status.hidden = vm.status === "";
    if (changed) crossfadeStatus(view.status, reducedMotion(doc));
  }
  view.status.hidden = vm.status === "";
}

// The new status text settles in from a soft, slightly blurred state instead of swapping abruptly; first paint is still.
function crossfadeStatus(status             , reduced         )       {
  if (reduced) animate(status, [{ opacity: 0.4 }, { opacity: 1 }], { duration: REDUCED_FADE_MS, easing: "ease" });
  else animate(status, [{ opacity: 0.4, filter: "blur(2px)" }, { opacity: 1, filter: "blur(0)" }], { duration: STATUS_MS, easing: "ease" });
}
