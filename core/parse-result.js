                            
                      
                        
 

                               
              
                    
                    
                         
                   
                     
 

/** Parses only explicit numbers. A missing weight stays null; doubtful reps stay in raw. */
export function parseResult(text        )               {
  const result               = { raw: text, sets: [], unit: null, comment: null, success: false, warnings: [] };
  let value = text.trim();
  if (!value) {
    result.warnings.push("Пустой результат");
    return result;
  }

  // Parentheses containing only a number inside a slash sequence denote that set's weight.
  const comments           = [];
  value = value.replace(/\((?!\d+\))[^()]*\)/gu, (match) => {
    comments.push(match.slice(1, -1).trim());
    return " ";
  }).replace(/\s+/gu, " ").trim();

  const core = /(?<reps>\d+(?:\(\d+\))?(?:\/\d+(?:\(\d+\))?){2,}|\d+\s*[xх×]\s*\d+)\s*(?:(?:[xх×]\s*)?(?<weight>\d+(?:[.,]\d+)?))?\s*(?<unit>lb)?/iu;
  const match = core.exec(value);
  if (!match?.groups) {
    result.comment = comments.length ? comments.join("; ") : null;
    result.warnings.push("Не удалось распознать подходы и повторы");
    return result;
  }

  const before = value.slice(0, match.index).trim();
  const after = value.slice(match.index + match[0].length).trim();
  if (before) comments.unshift(before);
  if (after) comments.push(after);
  result.comment = comments.length ? comments.join("; ") : null;
  if (before || after) result.warnings.push("Свободный текст рядом с числовым результатом");

  const repetitions = match.groups.reps;
  const sharedWeight = match.groups.weight ? Number(match.groups.weight.replace(",", ".")) : null;
  if (repetitions.includes("/")) {
    result.sets = repetitions.split("/").map((part) => {
      const pieces = /^(\d+)(?:\((\d+)\))?$/u.exec(part);
      return { repetitions: Number(pieces?.[1]), weight: pieces?.[2] ? Number(pieces[2]) : sharedWeight };
    });
  } else {
    const pieces = /^(\d+)\s*[xх×]\s*(\d+)$/iu.exec(repetitions);
    result.sets = Array.from({ length: Number(pieces?.[1]) }, () => ({ repetitions: Number(pieces?.[2]), weight: sharedWeight }));
  }
  result.unit = "lb"; // Project convention: unmarked weights are in pounds.
  if (sharedWeight === null) result.warnings.push("Вес не указан");
  if (result.sets.some((set) => !Number.isFinite(set.repetitions) || set.repetitions <= 0 || set.weight !== null && (!Number.isFinite(set.weight) || set.weight <= 0))) {
    result.warnings.push("Некорректное число подходов, повторов или веса");
    result.sets = [];
    return result;
  }
  const residue = `${before} ${after}`;
  if (/\d+\s*[xх×/]\s*\d+/iu.test(residue) || /^[a-z]$/iu.test(after) ||
      (/\d/u.test(residue) && !/^на цифре \d+$/u.test(after))) {
    result.warnings.push("Нераспознанный числовой фрагмент; результат оставлен только в raw");
    result.sets = [];
    return result;
  }
  result.success = true;
  return result;
}
