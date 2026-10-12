// Screens of the phone app drawn from the controller's ViewModel: a dark, note-like reading view (artboard V3).
// All text goes through textContent, never parsed as HTML; no inline styles (CSP style-src 'self'); the clock
// icon is a CSS background, so no SVG is built here. Re-rendering the same screen only updates values, so the
// field being typed in keeps focus and caret.
import { parseNote,                   } from "../core/parse-note.js";
                                                     
import { MAX_FIELD } from "../core/validate.js";
                                                             
                                                 

                               
                                                                                       
                                                                                        
                                 
                   
                                                    
                                                                              
                        
                                        
                        
 

                                                                               

                   
              
                         
                                        
                         
                       
                      
 

const mounted = new WeakMap                      ();

const HISTORY_LABEL = "История тренировок";
const PREVIOUS_LABEL = "Прошлый раз";
const RESULT_LABEL = "Результат";
const EMPTY_RESULT = "—";
// «пн, 12 окт» next to the clock: the workout's own weekday and date, nothing derived from the phone's clock.
const WEEKDAY_SHORT                         = {
  "ПОНЕДЕЛЬНИК": "пн", "ВТОРНИК": "вт", "СРЕДА": "ср", "ЧЕТВЕРГ": "чт", "ПЯТНИЦА": "пт", "СУББОТА": "сб", "ВОСКРЕСЕНЬЕ": "вс",
};
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export function isStandalone(win        , dev         )          {
  if (win.matchMedia("(display-mode: standalone)").matches) return true;
  if ((win.navigator                                        ).standalone === true) return true;
  return dev && new URLSearchParams(win.location.search).has("standalone");
}

export function render(root             , vm           , handlers              )       {
  const key = screenKey(vm, handlers.standalone);
  let view = mounted.get(root);
  if (view === undefined || view.key !== key) {
    view = mount(root, vm, key, handlers);
    mounted.set(root, view);
  }
  update(view, root.ownerDocument, vm, handlers);
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

function mount(root             , vm           , key        , handlers              )          {
  const doc = root.ownerDocument;
  const view          = {
    key,
    handlers,
    inputs: new Map(),
    buttons: [],
    message: el(doc, "p", "message"),
    status: el(doc, "footer", "status"),
  };
  view.message.setAttribute("role", "status");
  view.status.setAttribute("aria-live", "polite");
  const sheet = key === "install" ? installSheet(doc, view) : key === "key" ? keySheet(doc, view) : vm.screen === "history" ? historySheet(doc, vm, view) : mainSheet(doc, vm, view);
  root.replaceChildren(sheet, view.status);
  return view;
}

function button(doc          , view         , className        , idle        , busy        )                    {
  const node = el(doc, "button", className, idle);
  node.setAttribute("type", "button");
  view.buttons.push({ button: node, idle, busy });
  return node;
}

// Header of the main and history screens: one control on the left, an optional muted text on the right.
function topbar(doc          , left             , right                    )              {
  const bar = el(doc, "header", "topbar");
  bar.append(left);
  if (right !== null) bar.append(right);
  return bar;
}

function mainSheet(doc          , vm           , view         )              {
  const workout = vm.workout;
  const sheet = el(doc, "main", workout === null ? "sheet sheet-empty" : "sheet");
  const clock = button(doc, view, "icon history-open", "", "");
  clock.setAttribute("aria-label", HISTORY_LABEL);
  clock.addEventListener("click", () => view.handlers.onOpenHistory());
  sheet.append(topbar(doc, clock, workout === null ? null : el(doc, "span", "topbar-date", shortDate(workout.weekday, workout.date))));
  const content = el(doc, "div", workout === null ? "empty-content" : "workout-content");
  if (workout !== null) {
    content.append(el(doc, "h1", "note-title", `${workout.weekday} — ${workout.date}`));
    for (const exercise of workout.exercises) content.append(exerciseBlock(doc, exercise, view));
  }
  const actions = el(doc, "div", "actions");
  const newDay = button(doc, view, workout === null ? "button button-primary" : "button button-quiet", "Новый день", "Новый день…");
  newDay.addEventListener("click", () => {
    if (!view.handlers.busy) view.handlers.onNewDay();
  });
  actions.append(newDay, view.message);
  content.append(actions);
  if (workout === null) content.append(el(doc, "p", "empty", "Сегодня тренировки ещё нет."));
  sheet.append(content);
  return sheet;
}

function historySheet(doc          , vm           , view         )              {
  const sheet = el(doc, "main", "sheet history-sheet");
  const back = button(doc, view, "button button-quiet history-back", "Назад", "Назад");
  back.addEventListener("click", () => view.handlers.onBackHistory());
  sheet.append(topbar(doc, back, null));
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
  view.status.textContent = vm.status;
  view.status.hidden = vm.status === "";
}
