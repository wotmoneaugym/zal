import { parseResult,                   } from "./parse-result.js";
import { WEEKDAY_RU } from "./dates.js";

                           
                 
               
                             
                                    
                  
               
                      
                    
                       
                                                                                            
 

                               
                   
               
                  
                        
                                                                         
                     
 

const block = /(?<leading>(?:\r?\n)+|^)\*\*(?<number>\d+)\. (?<name>[^\r\n]*?)\*\*(?:\r?\n)План: \*\*(?<plan>[^\r\n]*?)\*\* \| Отдых: \*\*(?<rest>[^\r\n]*?)\*\*(?<afterPlan>[ \t]*(?:\r?\n){1,2})> \[!quote\] Прошлый раз(?:\r?\n)> (?<previous>[^\r\n]*)(?:\r?\n){2}Результат:(?<resultSpace>[ \t]*)(?<result>[^\r\n]*)(?<afterResult>\r?\n|$)/gu;
const fileNamePattern = new RegExp(`^(${WEEKDAY_RU.join("|")}) \u2014 (\\d{4}-\\d{2}-\\d{2})\\.md$`, "u");

export function parseNote(markdown        , fileName        )               {
  const matchName = fileNamePattern.exec(fileName);
  if (!matchName) throw new Error(`Неверное имя файла: ${fileName}`);
  const [, weekday, date] = matchName;
  const warnings           = [];
  const calendarDate = new Date(`${date}T00:00:00Z`);
  const actualWeekday = WEEKDAY_RU[calendarDate.getUTCDay()];
  if (Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== date || actualWeekday !== weekday) {
    warnings.push("Дата и день недели в имени файла не совпадают с календарём");
  }
  const bom = markdown.startsWith("\uFEFF");
  const body = bom ? markdown.slice(1) : markdown;
  const cleanBody = body.replace(/\0+$/u, "");
  const trailing = body.slice(cleanBody.length);
  if (trailing) warnings.push(`${trailing.length} нулевых байтов после текста`);
  const endings = [...body.matchAll(/\r?\n/gu)].map((match) => match[0]);
  const lineEnding = endings[0] === "\r\n" ? "\r\n" : "\n";
  if (endings.some((ending) => ending !== lineEnding)) warnings.push("Смешанные переводы строк");
  const exercises             = [];
  let cursor = 0;
  for (const match of cleanBody.matchAll(block)) {
    if (match.index !== cursor) throw new Error(`Неизвестная разметка около символа ${cursor}`);
    const groups = match.groups ;
    const plan = /^(\d+)×(\d+)$/u.exec(groups.plan);
    if (!plan) warnings.push(`Нестандартный план упражнения ${groups.number}: ${groups.plan}`);
    exercises.push({
      number: Number(groups.number), name: groups.name,
      plannedSets: plan ? Number(plan[1]) : null, plannedRepetitions: plan ? Number(plan[2]) : null,
      planRaw: groups.plan, rest: groups.rest,
      previousRaw: groups.previous, resultRaw: groups.result, result: parseResult(groups.result),
      layout: { leading: groups.leading, afterPlan: groups.afterPlan,
        resultSpace: groups.resultSpace, afterResult: groups.afterResult },
    });
    cursor = match.index + match[0].length;
  }
  if (cursor !== cleanBody.length || exercises.length === 0) throw new Error(`Неизвестная разметка около символа ${cursor}`);
  if (exercises.some((exercise, index) => exercise.number !== index + 1)) warnings.push("Нестандартная нумерация упражнений");
  return { fileName, date, weekday, exercises, layout: { lineEnding, bom, trailing }, warnings };
}
