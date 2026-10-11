// Reads the training program from the Templater script Скрипт.md WITHOUT executing it.
// Only plain JavaScript literals are understood; anything else is a ProgramParseError.
// Browser-safe: no node:* imports, no regular-expression lookbehind.
import { WEEKDAY_RU } from "./dates.js";

                                                                             
                                                                                // name = dayNames value, e.g. "ПОНЕДЕЛЬНИК"
                          
                                                                                        
                                         
                                                                                                                            
 

export class ProgramParseError extends Error {
  constructor(message        ) {
    super(message);
    this.name = "ProgramParseError";
  }
}

                                                  
                                                  

const LINE_BREAK = /[\n\r\u2028\u2029]/u;
// Everything LINE_BREAK does not match. Deliberately without the "u" flag: the mask replaces one UTF-16 unit with one
// space, so an emoji (two units) keeps its width and positions in the masked text equal positions in the original.
const NOT_LINE_BREAK = new RegExp("[^" + LINE_BREAK.source.slice(1, -1) + "]", "g");
const SPACE = /\s/u;
const DIGIT = /[0-9]/u;
const IDENTIFIER = /[\p{ID_Start}$_][\p{ID_Continue}$\u200C\u200D]*/uy;
const INTEGER_KEY = /(?:0|[1-9][0-9]*)(?![\p{ID_Continue}$.])/uy;
const STATEMENT_START = /[\p{ID_Start}$_}]/u;
const HEX2 = /^[0-9A-Fa-f]{2}$/u;
const HEX4 = /^[0-9A-Fa-f]{4}$/u;
const HEX_ANY = /^[0-9A-Fa-f]+$/u;
const NOT_NAME_CHAR = "(?:^|[^\\p{ID_Continue}$])";
const NON_TRAINING_BRANCH = new RegExp(NOT_NAME_CHAR + "if\\s*\\(\\s*!\\s*plans\\s*\\[\\s*weekday\\s*\\]\\s*\\)\\s*\\{", "gu");
const TR_APPEND = /tR(?![\p{ID_Continue}$])\s*\+=/uy;
const ISO_DAY_KEY = /^[1-7]$/u;
const MAX_DEPTH = 64;
const ISO_WEEKDAY_CALL = /today\s*\.\s*isoWeekday\s*\(\s*\)/uy;
const DECLARED_BEFORE = /(?:^|[^\p{ID_Continue}$])const\s+$/u;
const PROGRAM_NAMES = ["dayNames", "plans", "initialResults", "weekday"];
const MUTATING_METHODS = "push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin";
// name[...] and name.prop chains after an identifier (brackets may not nest)
const ACCESSORS = "(?:\\s*(?:\\[[^\\[\\]\\n\\r]*\\]|\\.\\s*[\\p{ID_Start}$_][\\p{ID_Continue}$]*))*";
// assignment operators (but not == / === / =>), ++/--, and mutating method calls
const WRITE_AFTER_NAME = "\\s*(?:[-+*/%&|^]=|\\*\\*=|<<=|>>>?=|&&=|\\|\\|=|\\?\\?=|=(?![=>])|\\+\\+|--|\\.\\s*(?:" + MUTATING_METHODS + ")\\s*\\()";
const NAME_CHAR = /[\p{ID_Continue}$]/u;
// sticky patterns, tried only where indexOf found a candidate: "<name>[...].prop = …" and "delete/++/--/Object.assign( <name>"
const WRITE_AT_NAME = new Map(PROGRAM_NAMES.map((name)                   => [name, new RegExp(name + "(?![\\p{ID_Continue}$])" + ACCESSORS + WRITE_AFTER_NAME, "uy")]));
const WRITE_KEYWORDS = ["delete", "++", "--", "Object"];
const WRITE_AT_KEYWORD = new RegExp("(?:delete\\s+|\\+\\+\\s*|--\\s*|Object\\s*\\.\\s*assign\\s*\\(\\s*)(" + PROGRAM_NAMES.join("|") + ")(?![\\p{ID_Continue}$])", "uy");

function position(text        , at        )         {
  const before = text.slice(0, at);
  const line = before.split("\n").length;
  const column = at - (before.lastIndexOf("\n") + 1) + 1;
  return `строка ${line}, столбец ${column}`;
}

/** A cursor over the script text that reads one JavaScript literal at a time. */
class Reader {
           text        ;
  pos        ;
  depth = 0; // current nesting of arrays/objects being read

  constructor(text        , pos        ) {
    this.text = text;
    this.pos = pos;
  }

  fail(message        , at         = this.pos)        {
    throw new ProgramParseError(`Скрипт.md, ${position(this.text, at)}: ${message}`);
  }

  peek()         {
    return this.text[this.pos] ?? "";
  }

  describe()         {
    if (this.pos >= this.text.length) return "конец текста";
    return `«${this.text.slice(this.pos, this.pos + 20).split(/[\r\n]/u)[0]}»`;
  }

  /** Skips spaces, line breaks and comments. Returns true if at least one line break was skipped. */
  skipTrivia()          {
    let lineBreak = false;
    while (this.pos < this.text.length) {
      const ch = this.text[this.pos];
      if (LINE_BREAK.test(ch)) {
        lineBreak = true;
        this.pos++;
      } else if (SPACE.test(ch)) {
        this.pos++;
      } else if (this.text.startsWith("//", this.pos)) {
        while (this.pos < this.text.length && !LINE_BREAK.test(this.text[this.pos])) this.pos++;
      } else if (this.text.startsWith("/*", this.pos)) {
        const end = this.text.indexOf("*/", this.pos + 2);
        if (end === -1) this.fail("незакрытый комментарий /*");
        if (LINE_BREAK.test(this.text.slice(this.pos, end))) lineBreak = true;
        this.pos = end + 2;
      } else {
        break;
      }
    }
    return lineBreak;
  }

  parseValue()          {
    this.skipTrivia();
    const ch = this.peek();
    if (ch === '"' || ch === "'") return this.readString();
    if (ch === "`") return this.readTemplate();
    if (ch === "[" || ch === "{") {
      if (this.depth >= MAX_DEPTH) this.fail(`слишком глубокая вложенность (больше ${MAX_DEPTH} уровней)`);
      this.depth++;
      const value = ch === "[" ? this.readArray() : this.readObject();
      this.depth--;
      return value;
    }
    return this.fail(`ожидалось значение (строка, массив или объект), найдено ${this.describe()}`);
  }

  readArray()            {
    this.pos++; // [
    const items            = [];
    for (;;) {
      this.skipTrivia();
      if (this.peek() === "]") {
        this.pos++;
        return items;
      }
      if (this.peek() === ",") this.fail("пропуск элемента в массиве не поддерживается");
      items.push(this.parseValue());
      this.skipTrivia();
      if (this.peek() === ",") {
        this.pos++;
        continue;
      }
      if (this.peek() === "]") {
        this.pos++;
        return items;
      }
      this.fail(`ожидалась «,» или «]», найдено ${this.describe()}`);
    }
  }

  readObject()                {
    this.pos++; // {
    const result                = {};
    for (;;) {
      this.skipTrivia();
      if (this.peek() === "}") {
        this.pos++;
        return result;
      }
      const keyAt = this.pos;
      const key = this.readKey();
      if (key === "__proto__") this.fail("ключ __proto__ не поддерживается", keyAt);
      this.skipTrivia();
      if (this.peek() !== ":") this.fail(`ожидалось «:» после ключа «${key}», найдено ${this.describe()}`);
      this.pos++;
      result[key] = this.parseValue(); // a repeated key overwrites the earlier value, as in JavaScript
      this.skipTrivia();
      if (this.peek() === ",") {
        this.pos++;
        continue;
      }
      if (this.peek() === "}") {
        this.pos++;
        return result;
      }
      this.fail(`ожидалась «,» или «}», найдено ${this.describe()}`);
    }
  }

  readKey()         {
    const ch = this.peek();
    if (ch === '"' || ch === "'") return this.readString();
    INTEGER_KEY.lastIndex = this.pos;
    const integer = INTEGER_KEY.exec(this.text);
    if (integer) {
      this.pos += integer[0].length;
      return String(Number(integer[0])); // JavaScript turns the number key 1 into the property "1"
    }
    IDENTIFIER.lastIndex = this.pos;
    const word = IDENTIFIER.exec(this.text);
    if (word) {
      this.pos += word[0].length;
      return word[0];
    }
    return this.fail(`ожидался ключ объекта (строка, целое число или имя), найдено ${this.describe()}`);
  }

  readString()         {
    const start = this.pos;
    const quote = this.text[this.pos];
    this.pos++;
    let value = "";
    for (;;) {
      if (this.pos >= this.text.length) this.fail("незакрытая строка", start);
      const ch = this.text[this.pos];
      if (ch === quote) {
        this.pos++;
        return value;
      }
      if (ch === "\n" || ch === "\r") this.fail("перевод строки внутри строки (не закрыта кавычка?)", start);
      if (ch === "\\") {
        value += this.readEscape();
        continue;
      }
      value += ch;
      this.pos++;
    }
  }

  readTemplate()         {
    const start = this.pos;
    this.pos++; // opening backtick
    let value = "";
    for (;;) {
      if (this.pos >= this.text.length) this.fail("незакрытый шаблон `…`", start);
      const ch = this.text[this.pos];
      if (ch === "`") {
        this.pos++;
        return value;
      }
      if (ch === "$" && this.text[this.pos + 1] === "{") this.fail("подстановки ${…} в шаблоне не поддерживаются");
      if (ch === "\\") {
        value += this.readEscape();
        continue;
      }
      if (ch === "\r") { // template literals turn CR and CRLF into LF
        this.pos += this.text[this.pos + 1] === "\n" ? 2 : 1;
        value += "\n";
        continue;
      }
      value += ch;
      this.pos++;
    }
  }

  /** Reads one escape sequence that starts at the backslash under the cursor and returns its value. */
  readEscape()         {
    const at = this.pos;
    const ch = this.text[this.pos + 1];
    if (ch === undefined) return this.fail("незакрытая строка", at);
    this.pos += 2;
    switch (ch) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      case "b": return "\b";
      case "f": return "\f";
      case "v": return "\v";
      case "\r":
        if (this.text[this.pos] === "\n") this.pos++;
        return ""; // line continuation
      case "\n":
      case "\u2028":
      case "\u2029":
        return ""; // line continuation
      case "x": {
        const hex = this.text.slice(this.pos, this.pos + 2);
        if (!HEX2.test(hex)) this.fail("неверная последовательность \\x", at);
        this.pos += 2;
        return String.fromCharCode(Number.parseInt(hex, 16));
      }
      case "u": {
        if (this.text[this.pos] === "{") {
          const close = this.text.indexOf("}", this.pos + 1);
          const hex = close === -1 ? "" : this.text.slice(this.pos + 1, close);
          if (!HEX_ANY.test(hex) || Number.parseInt(hex, 16) > 0x10ffff) this.fail("неверная последовательность \\u{…}", at);
          this.pos = close + 1;
          return String.fromCodePoint(Number.parseInt(hex, 16));
        }
        const hex = this.text.slice(this.pos, this.pos + 4);
        if (!HEX4.test(hex)) this.fail("неверная последовательность \\u", at);
        this.pos += 4;
        return String.fromCharCode(Number.parseInt(hex, 16));
      }
      default:
        if (ch === "0" && !DIGIT.test(this.text[this.pos] ?? "")) return "\0";
        if (DIGIT.test(ch)) this.fail("восьмеричные последовательности (\\1, \\01 …) не поддерживаются", at);
        return ch; // any other escaped character stands for itself, as in JavaScript
    }
  }

  /** True when only ";", the end of the text, or a line break followed by a new statement comes next. */
  atStatementEnd()          {
    const lineBreak = this.skipTrivia();
    if (this.pos >= this.text.length || this.peek() === ";") return true;
    return lineBreak && STATEMENT_START.test(this.peek());
  }

  /** After a declaration's literal only ";" or a line break followed by a new statement may come. */
  expectStatementEnd(what        )       {
    if (this.atStatementEnd()) return;
    this.fail(`после значения ${what} ожидалась «;» — значение должно быть простым литералом, без выражений`);
  }
}

/**
 * Replaces the contents of comments and of string/template literals with spaces so that declarations and
 * writes can be searched for in code only. Line breaks are kept, so every position maps 1:1 onto the original text.
 * Never throws: a broken script must still end up as a ProgramParseError from the reader, not as another error.
 */
function maskCommentsAndStrings(text        )         {
  const parts           = [];
  let pos = 0;
  let codeStart = 0; // start of the code run not yet copied to `parts`
  const blank = (end        )       => {
    end = Math.min(end, text.length);
    parts.push(text.slice(codeStart, pos), text.slice(pos, end).replace(NOT_LINE_BREAK, " "));
    pos = end;
    codeStart = end;
  };
  while (pos < text.length) {
    const ch = text[pos];
    if (ch === "/" && text[pos + 1] === "/") {
      let end = pos;
      while (end < text.length && !LINE_BREAK.test(text[end])) end++;
      blank(end);
    } else if (ch === "/" && text[pos + 1] === "*") {
      const close = text.indexOf("*/", pos + 2);
      blank(close === -1 ? text.length : close + 2);
    } else if (ch === '"' || ch === "'" || ch === "`") {
      let end = pos + 1;
      while (end < text.length && text[end] !== ch) {
        if (text[end] === "\\") {
          end += text[end + 1] === "\r" && text[end + 2] === "\n" ? 3 : 2; // escape or line continuation
          continue;
        }
        if (ch !== "`" && (text[end] === "\n" || text[end] === "\r")) break; // unterminated string ends at the line
        end++;
      }
      pos++; // the opening quote stays as code
      blank(end); // the contents become spaces
      if (pos < text.length && text[pos] === ch) pos++; // the closing quote stays as code
    } else {
      pos++;
    }
  }
  parts.push(text.slice(codeStart));
  const masked = parts.join("");
  if (masked.length !== text.length) throw new ProgramParseError("Скрипт.md: внутренняя ошибка чтения — маска комментариев и строк изменила длину текста");
  return masked;
}

/** Position right after "const <name> =" in `masked`; the declaration must occur exactly once and must be const. */
function findDeclaration(masked        , name        )         {
  const pattern = new RegExp(NOT_NAME_CHAR + "(const|let|var)\\s+" + name + "(?![\\p{ID_Continue}$])\\s*=(?!=)", "gu");
  const hits = [...masked.matchAll(pattern)];
  if (hits.length === 0) throw new ProgramParseError(`Скрипт.md: не найдено объявление «const ${name} = …»`);
  if (hits.length > 1) throw new ProgramParseError(`Скрипт.md: объявление ${name} встречается ${hits.length} раза — непонятно, какое из них действует`);
  const hit = hits[0];
  const keywordAt = (hit.index ?? 0) + hit[0].indexOf(hit[1]);
  if (hit[1] !== "const") {
    throw new ProgramParseError(`Скрипт.md, ${position(masked, keywordAt)}: объявление ${name} должно быть const — ${hit[1]} позволяет изменить значение позже`);
  }
  return (hit.index ?? 0) + hit[0].length;
}

function readDeclaration(text        , masked        , name        )                {
  const reader = new Reader(text, findDeclaration(masked, name));
  const value = reader.parseValue();
  reader.expectStatementEnd(name);
  if (typeof value !== "object" || Array.isArray(value)) throw new ProgramParseError(`Скрипт.md: ${name} должен быть объектом { … }`);
  return value;
}

/** Drops leading blank lines and Markdown headings ("# Тренировка"), then trims. */
function withoutHeading(text        )         {
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  while (lines.length > 0 && (lines[0].trim() === "" || /^#{1,6}(?:[ \t]|$)/u.test(lines[0]))) lines.shift();
  return lines.join("\n").trim();
}

function readNonTrainingMessage(text        )         {
  const hits = [...text.matchAll(NON_TRAINING_BRANCH)];
  if (hits.length !== 1) {
    throw new ProgramParseError(hits.length === 0
      ? "Скрипт.md: не найдена ветка «if (!plans[weekday]) { … }» с сообщением для нетренировочного дня"
      : `Скрипт.md: ветка «if (!plans[weekday])» встречается ${hits.length} раза`);
  }
  const hit = hits[0];
  const reader = new Reader(text, (hit.index ?? 0) + hit[0].length);
  reader.skipTrivia();
  TR_APPEND.lastIndex = reader.pos;
  const append = TR_APPEND.exec(text);
  if (!append) return reader.fail("в ветке нетренировочного дня ожидалось «tR += \"…\"»");
  reader.pos += append[0].length;
  const valueAt = reader.pos;
  const value = reader.parseValue();
  if (typeof value !== "string") return reader.fail("в ветке нетренировочного дня tR должен получать строку", valueAt);
  reader.skipTrivia();
  if (reader.peek() === ";") {
    reader.pos++;
    reader.skipTrivia();
  }
  if (reader.peek() !== "}") reader.fail("в ветке нетренировочного дня ожидалась одна строка «tR += \"…\";» — другой код не поддерживается");
  const message = withoutHeading(value);
  if (message === "") throw new ProgramParseError("Скрипт.md: сообщение для нетренировочного дня пустое");
  return message;
}

/** The script must compute the weekday exactly as `const weekday = today.isoWeekday();` — anything else shifts the days. */
function checkWeekday(text        , masked        )       {
  const reader = new Reader(text, findDeclaration(masked, "weekday"));
  reader.skipTrivia();
  ISO_WEEKDAY_CALL.lastIndex = reader.pos;
  const call = ISO_WEEKDAY_CALL.exec(masked);
  if (call) {
    reader.pos += call[0].length;
    if (reader.atStatementEnd()) return;
  }
  reader.fail(`ожидалось ровно «const weekday = today.isoWeekday();», найдено ${reader.describe()} — иначе день недели не совпадёт с ключами plans`);
}

/** Any assignment, ++/--, delete, mutating method call or Object.assign on the program's names after their declarations. */
function rejectWrites(text        , masked        )       {
  // true when `at` starts a word: not preceded by an identifier character or by "." (obj.plans is another property)
  const startsWord = (at        )          => at === 0 || (!NAME_CHAR.test(masked[at - 1]) && masked[at - 1] !== ".");
  const failWrite = (name        , at        )        => {
    const reader = new Reader(text, at);
    return reader.fail(`запись в ${name} (${reader.describe()}) не поддерживается — программа задаётся только литералом в «const ${name} = …»`);
  };
  for (const [name, pattern] of WRITE_AT_NAME) {
    for (let at = masked.indexOf(name); at !== -1; at = masked.indexOf(name, at + 1)) {
      if (!startsWord(at)) continue;
      pattern.lastIndex = at;
      if (!pattern.test(masked)) continue;
      if (DECLARED_BEFORE.test(masked.slice(0, at))) continue; // the declaration itself
      failWrite(name, at);
    }
  }
  for (const keyword of WRITE_KEYWORDS) {
    for (let at = masked.indexOf(keyword); at !== -1; at = masked.indexOf(keyword, at + 1)) {
      if (!startsWord(at)) continue;
      WRITE_AT_KEYWORD.lastIndex = at;
      const hit = WRITE_AT_KEYWORD.exec(masked);
      if (hit) failWrite(hit[1], at);
    }
  }
}

function toDay(key        , value         , dayName                     )             {
  if (!Array.isArray(value)) throw new ProgramParseError(`Скрипт.md: plans[${key}] должен быть массивом упражнений [ … ]`);
  if (typeof dayName !== "string") throw new ProgramParseError(`Скрипт.md: у дня ${key} из plans нет названия в dayNames`);
  const exercises = value.map((entry, index) => {
    if (!Array.isArray(entry) || entry.length !== 3 || entry.some((part) => typeof part !== "string")) {
      throw new ProgramParseError(`Скрипт.md: plans[${key}][${index}] должен быть массивом из трёх строк [название, план, отдых]`);
    }
    const [name, plan, rest] = entry            ;
    return { name, plan, rest };
  });
  return { name: dayName, exercises };
}

export function readProgram(scriptText        )          {
  if (typeof scriptText !== "string" || scriptText.trim() === "") throw new ProgramParseError("Скрипт.md пуст или не прочитан");
  const masked = maskCommentsAndStrings(scriptText);
  const dayNames = readDeclaration(scriptText, masked, "dayNames");
  const plans = readDeclaration(scriptText, masked, "plans");
  const initial = readDeclaration(scriptText, masked, "initialResults");
  checkWeekday(scriptText, masked);
  rejectWrites(scriptText, masked);
  const nonTrainingDayMessage = readNonTrainingMessage(scriptText);
  const days                             = {};
  for (const [key, value] of Object.entries(plans)) {
    if (ISO_DAY_KEY.test(key)) days[key] = toDay(key, value, dayNames[key]); // other keys never match isoWeekday()
  }
  const initialResults                         = {};
  for (const [name, value] of Object.entries(initial)) {
    if (typeof value !== "string") throw new ProgramParseError(`Скрипт.md: initialResults["${name}"] должен быть строкой`);
    initialResults[name] = value;
  }
  const program          = { days, initialResults, nonTrainingDayMessage };
  checkProgram(program);
  return program;
}

// ---- checks: the app must be able to reproduce what the script would write ----

const TEMPLATER_OPEN = "\u003C%";
const TEMPLATER_CLOSE = "%\u003E";
const MAX_PROGRAM_FIELD = 300;
const CONTROL = /[\u0000-\u001F\u007F\u2028\u2029]/u;

function checkText(value        , where        , insideMarkup         )       {
  if (CONTROL.test(value)) throw new ProgramParseError(`Скрипт.md: ${where} содержит перевод строки или управляющий символ`);
  if (value.includes(TEMPLATER_OPEN) || value.includes(TEMPLATER_CLOSE)) {
    throw new ProgramParseError(`Скрипт.md: ${where} содержит последовательность Templater`);
  }
  if (value.length > MAX_PROGRAM_FIELD) throw new ProgramParseError(`Скрипт.md: ${where} длиннее ${MAX_PROGRAM_FIELD} символов`);
  if (insideMarkup && (value.includes("**") || value.includes("|"))) {
    throw new ProgramParseError(`Скрипт.md: ${where} содержит «**» или «|» — такую заметку нельзя будет разобрать`);
  }
}

function checkProgram(program         )       {
  const keys = Object.keys(program.days);
  if (keys.length === 0) throw new ProgramParseError("Скрипт.md: в plans нет ни одного дня с ключом от 1 до 7");
  for (const key of keys) {
    const day = program.days[key];
    const expected = WEEKDAY_RU[Number(key) % 7];
    if (day.name !== expected) {
      throw new ProgramParseError(`Скрипт.md: dayNames[${key}] = «${day.name}», а день ${key} — это ${expected}; имя заметки не совпало бы с датой`);
    }
    if (day.exercises.length === 0) throw new ProgramParseError(`Скрипт.md: в plans[${key}] нет упражнений`);
    day.exercises.forEach((exercise, index) => {
      const where = `plans[${key}][${index}]`;
      if (exercise.name.trim() === "") throw new ProgramParseError(`Скрипт.md: ${where}: пустое название упражнения`);
      checkText(exercise.name, `${where}, название`, true);
      checkText(exercise.plan, `${where}, план`, true);
      checkText(exercise.rest, `${where}, отдых`, true);
    });
  }
  for (const [name, value] of Object.entries(program.initialResults)) checkText(value, `initialResults["${name}"]`, false);
}
