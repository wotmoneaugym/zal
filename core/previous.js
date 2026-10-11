export const NO_PREVIOUS = "Нет прошлого результата";

                                                                                                                      

/** Same expression as `escapeRegExp` in Скрипт.md. */
export function escapeRegExp(value        )         {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Literal port of one iteration of `previousResult` in Скрипт.md: block regex, first «Результат:» line, trim. */
export function resultInText(text        , exerciseName        )                {
  const name = escapeRegExp(exerciseName);
  const block = new RegExp(`^\\*\\*\\d+\\. ${name}\\*\\*[^\\r\\n]*\\r?\\n([\\s\\S]*?)(?=^\\*\\*\\d+\\. |(?![\\s\\S]))`, "m");
  const section = text.match(block);
  const result = section?.[1].match(/^Результат:[ \t]*([^\r\n]+)$/m)?.[1]?.trim();
  return result ? result : null;
}

function freshness(candidate           )         {
  return candidate.source === "phone" ? Number.MAX_SAFE_INTEGER : candidate.mtimeMs;
}

/** design.md §7: strictly earlier dates, date desc, then mtime desc (phone = newest); first non-empty result wins. */
export function findPrevious(exerciseName        , beforeDate        , candidates             , initialResults                        )         {
  const ordered = candidates
    .filter((candidate) => candidate.date < beforeDate)
    .sort((a, b) => (a.date === b.date ? freshness(b) - freshness(a) : a.date < b.date ? 1 : -1));
  for (const candidate of ordered) {
    const result = resultInText(candidate.text, exerciseName);
    if (result !== null) return result;
  }
  const initial = Object.hasOwn(initialResults, exerciseName) ? initialResults[exerciseName] : undefined;
  return initial ?? NO_PREVIOUS;
}
