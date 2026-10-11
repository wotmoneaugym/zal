import { addDays, isValidDateString, weekdayNameOf } from "./dates.js";
import { parseNote } from "./parse-note.js";
import { renderNote } from "./render-note.js";

export const TEMPLATER_OPEN = "\u003C%";
export const TEMPLATER_CLOSE = "%\u003E";
export const MAX_FIELD = 300;
export const MAX_EXERCISES = 20;

                                                                      

function fail(reason        )             {
  return { ok: false, reason };
}

/** C0 controls, DEL, C1 controls (incl. U+0085 NEL), LINE and PARAGRAPH SEPARATOR. */
const FORBIDDEN_CHAR = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/u;
/** The same set without LF: what a whole note may not contain. */
const FORBIDDEN_IN_NOTE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u2028\u2029]/u;
/** With the u flag a well-formed surrogate pair is one code point and does not match; a lone half does. */
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

/** One text field of a workout: a single line that cannot break the note or start Templater. */
export function validateField(value         , field        )             {
  if (typeof value !== "string") return fail(`${field}: должно быть строкой`);
  if (value.length > MAX_FIELD) return fail(`${field}: длиннее ${MAX_FIELD} символов`);
  if (FORBIDDEN_CHAR.test(value)) return fail(`${field}: перевод строки или управляющий символ`);
  if (LONE_SURROGATE.test(value)) return fail(`${field}: недопустимый символ (одиночный суррогат UTF-16)`);
  if (value.includes(TEMPLATER_OPEN) || value.includes(TEMPLATER_CLOSE)) return fail(`${field}: последовательность Templater`);
  const trimmed = value.trimStart();
  if (trimmed.startsWith("> ") || trimmed.startsWith("Результат:")) return fail(`${field}: не может начинаться с «> » или «Результат:»`);
  return { ok: true };
}

function isRecord(value         )                                   {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** design.md §11: shape and safety of an incoming workout, not agreement with the current program. */
export function validateWorkout(w         , opts                                    )             {
  if (!isRecord(w)) return fail("тренировка: ожидается объект");
  if (w.schema !== 1) return fail("schema: ожидается 1");
  if (typeof w.id !== "string" || !/^[A-Za-z0-9-]{1,64}$/u.test(w.id)) return fail("id: от 1 до 64 символов A-Z, a-z, 0-9, «-»");
  if (typeof w.rev !== "number" || !Number.isSafeInteger(w.rev) || w.rev < 1) {
    return fail(`rev: ожидается целое число от 1 до ${Number.MAX_SAFE_INTEGER}`);
  }
  if (typeof w.date !== "string" || !isValidDateString(w.date)) return fail("date: ожидается настоящая дата ГГГГ-ММ-ДД");
  if (w.date < opts.minDate) return fail(`date: раньше ${opts.minDate}`);
  const maxDate = addDays(opts.today, 1);
  if (w.date > maxDate) return fail(`date: позже ${maxDate}`);
  const weekday = weekdayNameOf(w.date);
  if (w.weekday !== weekday) return fail(`weekday: для ${w.date} должно быть ${weekday}`);
  const updatedAt = validateField(w.updatedAt, "updatedAt");
  if (!updatedAt.ok) return updatedAt;
  if (!Array.isArray(w.exercises) || w.exercises.length < 1 || w.exercises.length > MAX_EXERCISES) {
    return fail(`exercises: от 1 до ${MAX_EXERCISES} упражнений`);
  }
  for (let index = 0; index < w.exercises.length; index++) {
    const exercise          = w.exercises[index];
    const label = `упражнение ${index + 1}`;
    if (!isRecord(exercise)) return fail(`${label}: ожидается объект`);
    if (exercise.number !== index + 1) return fail(`${label}: number должен быть ${index + 1}`);
    for (const key of ["name", "plan", "rest", "previous", "result"]) {
      const checked = validateField(exercise[key], `${label}, ${key}`);
      if (!checked.ok) return checked;
    }
    for (const key of ["name", "plan", "rest"]) {
      const value = exercise[key]          ;
      if (value.includes("**") || value.includes("|")) return fail(`${label}, ${key}: нельзя «**» и «|»`);
    }
  }
  return { ok: true };
}

/** Last check before any write into the vault (design.md §10): characters, then structure, then the file name, then an exact round trip. */
export function noteGuard(text        , fileName        )             {
  if (text.includes(TEMPLATER_OPEN) || text.includes(TEMPLATER_CLOSE)) return fail("в тексте заметки последовательность Templater");
  if (FORBIDDEN_IN_NOTE.test(text)) return fail("текст: управляющий символ (кроме перевода строки)");
  if (LONE_SURROGATE.test(text)) return fail("текст: недопустимый символ (одиночный суррогат UTF-16)");
  let rendered        ;
  let date        ;
  let weekday        ;
  try {
    const note = parseNote(text, fileName);
    ({ date, weekday } = note);
    rendered = renderNote(note);
  } catch (error) {
    return fail(`заметка не разбирается: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isValidDateString(date)) return fail(`файл: в имени не настоящая дата ${date}`);
  const expected = weekdayNameOf(date);
  if (weekday !== expected) return fail(`файл: для ${date} в имени должно быть ${expected}`);
  if (rendered !== text) return fail("повторная генерация заметки даёт другой текст");
  return { ok: true };
}
