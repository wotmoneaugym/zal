// Screens of the phone app drawn from the controller's ViewModel: a note-like reading view.
// All text goes through textContent, never parsed as HTML; no inline styles (CSP style-src 'self').
// Re-rendering the same screen only updates values, so the field being typed in keeps focus and caret.
import { MAX_FIELD } from "../core/validate.js";
                                                             
                                                 

                               
                                                                                       
                                                                                        
                                 
                   
                                                    
                                                                              
 

                                                                               

                   
              
                         
                                        
                         
                       
                      
 

const mounted = new WeakMap                      ();

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
  return vm.workout === null ? "main:-" : `main:${vm.workout.id}:${vm.workout.exercises.length}`;
}

function el                                       (doc          , tag   , className        , text         )                           {
  const node = doc.createElement(tag);
  if (className !== "") node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
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
  const sheet = key === "install" ? installSheet(doc, view) : key === "key" ? keySheet(doc, view) : mainSheet(doc, vm, view);
  root.replaceChildren(sheet, view.status);
  return view;
}

function button(doc          , view         , className        , idle        , busy        )                    {
  const node = el(doc, "button", className, idle);
  node.setAttribute("type", "button");
  view.buttons.push({ button: node, idle, busy });
  return node;
}

function mainSheet(doc          , vm           , view         )              {
  const sheet = el(doc, "main", "sheet");
  const workout = vm.workout;
  if (workout === null) {
    sheet.append(el(doc, "p", "empty", "Сегодня тренировки ещё нет."));
  } else {
    sheet.append(el(doc, "h1", "note-title", `${workout.weekday} \u2014 ${workout.date}`));
    for (const exercise of workout.exercises) sheet.append(exerciseBlock(doc, exercise, view));
  }
  const actions = el(doc, "div", "actions");
  const newDay = button(doc, view, workout === null ? "button button-primary" : "button button-quiet", "Новый день", "Новый день…");
  newDay.addEventListener("click", () => {
    if (!view.handlers.busy) view.handlers.onNewDay();
  });
  actions.append(newDay, view.message);
  sheet.append(actions);
  return sheet;
}

function exerciseBlock(doc          , exercise                 , view         )              {
  const block = el(doc, "section", "exercise");
  const name = el(doc, "p", "exercise-name");
  name.append(el(doc, "strong", "", `${exercise.number}. ${exercise.name}`));
  const plan = el(doc, "p", "exercise-plan");
  plan.append("План: ", el(doc, "strong", "", exercise.plan), " | Отдых: ", el(doc, "strong", "", exercise.rest));
  const quote = el(doc, "blockquote", "callout");
  quote.append(el(doc, "p", "callout-title", "Прошлый раз"), el(doc, "p", "callout-body", exercise.previous));
  const field = el(doc, "label", "result");
  const input = el(doc, "input", "result-input");
  input.setAttribute("type", "text");
  input.setAttribute("enterkeyhint", "done");
  input.setAttribute("maxlength", String(MAX_FIELD));
  input.setAttribute("aria-label", `Результат: ${exercise.number}. ${exercise.name}`);
  input.value = exercise.result;
  input.addEventListener("input", () => view.handlers.onResultInput(exercise.number, input.value));
  input.addEventListener("keydown", (event) => {
    if ((event                 ).key !== "Enter") return;
    event.preventDefault();
    input.blur();
  });
  input.addEventListener("blur", () => view.handlers.onResultDone());
  field.append(el(doc, "span", "result-label", "Результат:"), input);
  block.append(name, plan, quote, field);
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
