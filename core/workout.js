import { isoWeekdayOf } from "./dates.js";
                                                    
import { parseResult } from "./parse-result.js";
                                                
import { findPrevious,                } from "./previous.js";
import { renderNote } from "./render-note.js";

                                                                                                                               
                                                                                                                                               

export const ALREADY_EXISTS = "Заметка на сегодня уже есть";

                           
                                         
                                                 
                                                

/** «Новый день»: what Скрипт.md does for the given local date, without touching any file. */
export function newDay(input                                                                                                                             )                {
  const key = String(isoWeekdayOf(input.date));
  const day = Object.hasOwn(input.program.days, key) ? input.program.days[key] : undefined;
  if (!day) return { kind: "not-training-day", message: input.program.nonTrainingDayMessage };
  if (input.existingDates.has(input.date)) return { kind: "already-exists", message: ALREADY_EXISTS };
  const exercises                    = day.exercises.map((exercise, index) => ({
    number: index + 1,
    name: exercise.name,
    plan: exercise.plan,
    rest: exercise.rest,
    previous: findPrevious(exercise.name, input.date, input.candidates, input.program.initialResults),
    result: "",
  }));
  return { kind: "created", workout: { schema: 1, id: input.id, rev: 1, date: input.date, weekday: day.name, exercises, updatedAt: input.nowIso } };
}

export function noteFileName(w                                   )         {
  return `${w.weekday} \u2014 ${w.date}.md`;
}

/** Canonical Templater bytes: renderNote without layout (leading LF, «Результат: », LF after every block). */
export function renderWorkout(w         )         {
  const note               = {
    fileName: noteFileName(w),
    date: w.date,
    weekday: w.weekday,
    warnings: [],
    exercises: w.exercises.map((exercise) => {
      const plan = /^(\d+)×(\d+)$/u.exec(exercise.plan);
      return {
        number: exercise.number,
        name: exercise.name,
        plannedSets: plan ? Number(plan[1]) : null,
        plannedRepetitions: plan ? Number(plan[2]) : null,
        planRaw: exercise.plan,
        rest: exercise.rest,
        previousRaw: exercise.previous,
        resultRaw: exercise.result,
        result: parseResult(exercise.result),
      };
    }),
  };
  return renderNote(note);
}

/** Immutable update of one result; rev grows by one; the text is stored exactly as typed. */
export function withResult(w         , number        , result        , nowIso        )          {
  if (!w.exercises.some((exercise) => exercise.number === number)) throw new RangeError(`Нет упражнения №${number}`);
  return {
    ...w,
    rev: w.rev + 1,
    updatedAt: nowIso,
    exercises: w.exercises.map((exercise) => (exercise.number === number ? { ...exercise, result } : exercise)),
  };
}

/** A phone workout as a «Прошлый раз» candidate: the same text a note would have, newest at its date. */
export function workoutToCandidate(w         )            {
  return { date: w.date, mtimeMs: Number.MAX_SAFE_INTEGER, text: renderWorkout(w), source: "phone", fileName: noteFileName(w) };
}
