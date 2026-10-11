                                                    

/** Uses Templater's spacing by default; parsed notes retain their own layout. */
export function renderNote(note              )         {
  const eol = note.layout?.lineEnding ?? "\n";
  const text = note.exercises.map((exercise) => {
    const leading = exercise.layout?.leading ?? eol;
    const afterPlan = exercise.layout?.afterPlan ?? eol + eol;
    const resultSpace = exercise.layout?.resultSpace ?? " ";
    const afterResult = exercise.layout?.afterResult ?? eol;
    return `${leading}**${exercise.number}. ${exercise.name}**${eol}` +
      `План: **${exercise.planRaw ?? `${exercise.plannedSets}×${exercise.plannedRepetitions}`}** | Отдых: **${exercise.rest}**${afterPlan}` +
      `> [!quote] Прошлый раз${eol}> ${exercise.previousRaw}${eol}${eol}` +
      `Результат:${resultSpace}${exercise.resultRaw}${afterResult}`;
  }).join("");
  return (note.layout?.bom ? "\uFEFF" : "") + text + (note.layout?.trailing ?? "");
}
