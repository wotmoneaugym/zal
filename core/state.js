                                                
                                               
import { workoutToCandidate,              } from "./workout.js";

                                                                                         // file = path relative to the training notes folder, "/" separators

                                                                                     

                                                                                                             

                        
            
                          
                              
                                                       
                                                         
                     
                        
                           
 

export function emptyState(nowIso        )        {
  return {
    schema: 1,
    program: null,
    programError: null,
    notes: [],
    delivery: {},
    warnings: [],
    lastSuccessAt: nowIso,
    lastError: null,
  };
}

function definedKeys(value                         )           {
  return Object.keys(value).filter((key) => value[key] !== undefined).sort();
}

// Equality of JSON-like values: object key order is ignored, array order matters,
// a property holding undefined equals a missing property (as after JSON.stringify).
function jsonEqual(a         , b         )          {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => jsonEqual(item, b[index]));
  }
  const left = a                           ;
  const right = b                           ;
  const leftKeys = definedKeys(left);
  const rightKeys = definedKeys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => key === rightKeys[index] && jsonEqual(left[key], right[key]));
}

export function stateContentEquals(a       , b       )          {
  return jsonEqual({ ...a, lastSuccessAt: undefined }, { ...b, lastSuccessAt: undefined });
}

// The PC has applied this version (or a newer one) of the workout to the note.
function isDelivered(state              , w         )          {
  if (state === null || !Object.hasOwn(state.delivery, w.id)) return false;
  const delivery = state.delivery[w.id];
  return delivery.rev >= w.rev && (delivery.status === "written" || delivery.status === "merged");
}

export function candidatesFor(state              , local                    )              {
  const notes = (state?.notes ?? []).map((note)            => ({
    source: "note",
    date: note.date,
    mtimeMs: note.mtimeMs,
    text: note.text,
    fileName: note.file,
  }));
  const phone = local.filter((w) => !isDelivered(state, w)).map((w) => workoutToCandidate(w));
  return [...notes, ...phone];
}

export function existingDates(state              , local                    )              {
  return new Set([...(state?.notes ?? []).map((note) => note.date), ...local.map((w) => w.date)]);
}

export function deliveryLabel(state              , w         )                       {
  return isDelivered(state, w) ? "в Обсидиане" : null;
}
