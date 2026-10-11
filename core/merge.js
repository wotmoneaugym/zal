import { parseNote,                   } from "./parse-note.js";
import { parseResult } from "./parse-result.js";
import { renderNote } from "./render-note.js";

                                                                                  

                          
                                                                
                                                  

                                         

const SIDE_ACCUSATIVE                       = {
  base: "прошлую запись pc-sync",
  phone: "версию телефона",
  current: "заметку в Обсидиане",
};

const SIDE_NOMINATIVE                       = {
  base: "прошлая запись pc-sync",
  phone: "версия телефона",
  current: "заметка в Обсидиане",
};

function parseSide(text        , fileName        , side      )                        {
  try {
    return parseNote(text, fileName);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `не удалось разобрать ${SIDE_ACCUSATIVE[side]}: ${message}`;
  }
}

function structureDifference(base              , other              , side      )                {
  const who = SIDE_NOMINATIVE[side];
  if (base.exercises.length !== other.exercises.length) {
    return `${who}: изменилось число упражнений (было ${base.exercises.length}, стало ${other.exercises.length})`;
  }
  for (let index = 0; index < base.exercises.length; index++) {
    const a = base.exercises[index];
    const b = other.exercises[index];
    if (a.number !== b.number) return `${who}: изменилась нумерация упражнений`;
    if (a.name !== b.name) return `${who}: изменилось название упражнения ${a.number}`;
    if (a.planRaw !== b.planRaw) return `${who}: изменился план упражнения ${a.number}`;
    if (a.rest !== b.rest) return `${who}: изменился отдых упражнения ${a.number}`;
    if (a.previousRaw !== b.previousRaw) return `${who}: изменился «Прошлый раз» упражнения ${a.number}`;
  }
  return null;
}

/**
 * Three-way merge of the "Результат:" lines.
 * base = what pc-sync last wrote, phone = rendered newer phone version, current = the file now.
 * Keeps the current file's layout; only resultRaw values are replaced.
 */
export function mergeResults(base        , phone        , current        , fileName        )               {
  const parsedBase = parseSide(base, fileName, "base");
  if (typeof parsedBase === "string") return { kind: "structure-changed", reason: parsedBase };
  const parsedPhone = parseSide(phone, fileName, "phone");
  if (typeof parsedPhone === "string") return { kind: "structure-changed", reason: parsedPhone };
  const parsedCurrent = parseSide(current, fileName, "current");
  if (typeof parsedCurrent === "string") return { kind: "structure-changed", reason: parsedCurrent };

  if (renderNote(parsedCurrent) !== current) {
    return { kind: "structure-changed", reason: `${SIDE_NOMINATIVE.current}: разметку нельзя сохранить без изменений` };
  }

  const difference = structureDifference(parsedBase, parsedPhone, "phone") ??
    structureDifference(parsedBase, parsedCurrent, "current");
  if (difference !== null) return { kind: "structure-changed", reason: difference };

  const conflicts                  = [];
  const exercises = parsedCurrent.exercises.map((exercise, index) => {
    const b = parsedBase.exercises[index].resultRaw;
    const p = parsedPhone.exercises[index].resultRaw;
    const c = exercise.resultRaw;
    if (p === b) return exercise;                                               // phone did not touch it
    if (c === b) return { ...exercise, resultRaw: p, result: parseResult(p) };  // only the phone changed it
    if (p === c) return exercise;                                               // both made the same change
    conflicts.push({ number: exercise.number, phone: p, obsidian: c });         // both changed it: Obsidian wins
    return exercise;
  });

  return { kind: "merged", text: renderNote({ ...parsedCurrent, exercises }), conflicts };
}
