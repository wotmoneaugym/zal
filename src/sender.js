// Phone -> GitHub send queue (design §8–9). One request at a time; always sends the CURRENT version of a workout.
                                                     
import { validateWorkout } from "../core/validate.js";
import { GitHubError,                   } from "./github.js";

                                                                    
                                                                                                                                                                                                                                                                                    

const RETRY_DELAYS_MS = [1000, 3000, 10000];
// The detail of an "error" status when fetch itself failed; the controller treats it as "no network", not as a failure.
export const NO_NETWORK = "нет связи";
const EXTRA_PASSES = 2;

                                                     
                                                        

function remoteField(remote        , name              )          {
  const value = remote === null ? null : remote.value;
  return typeof value === "object" && value !== null ? (value                           )[name] : undefined;
}

function describe(error         )         {
  if (error instanceof GitHubError) return error.message;
  if (error instanceof TypeError) return NO_NETWORK; // fetch rejects with TypeError when offline
  return error instanceof Error ? error.message : String(error);
}

function isKeyProblem(error         )          {
  return error instanceof GitHubError && (error.status === 401 || error.status === 403 || error.status === 404);
}

// inbox/<date>.json belongs to the first workout of that date. Another workout of the same date
// (phone storage was wiped) goes to inbox/<date>--<id>.json, so nothing is lost (design §8).
async function locate(client              , w         )                                            {
  const main = `inbox/${w.date}.json`;
  const atMain = await client.getJson         (main);
  if (atMain === null || remoteField(atMain, "id") === w.id) return { path: main, remote: atMain };
  const own = `inbox/${w.date}--${w.id}.json`;
  return { path: own, remote: await client.getJson         (own) };
}

export function createSender(deps            )                                        {
  let running = false;
  let dirty = false;

  const sentRev = (id        )         => {
    const sent = deps.getLastSentRev();
    return Object.hasOwn(sent, id) ? sent[id] : 0;
  };

  const pending = ()            =>
    deps.getWorkouts()
      .filter((w) => w.rev > sentRev(w.id))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Sends the current version of one workout. Returns null when GitHub has it, or why it cannot be sent.
  async function sendOne(client              , id        )                         {
    for (let attempt = 0; ; attempt++) {
      const w = deps.getWorkouts().find((candidate) => candidate.id === id);
      if (w === undefined || w.rev <= sentRev(id)) return null;
      // Form and safety only; the PC checks the date window against its own clock.
      const check = validateWorkout(w, { today: w.date, minDate: w.date });
      if (!check.ok) return check.reason;
      const { path, remote } = await locate(client, w);
      const remoteRev = remoteField(remote, "rev");
      if (remote !== null && remoteField(remote, "id") === w.id && typeof remoteRev === "number" && remoteRev >= w.rev) {
        deps.markSent(w.id, w.rev); // e.g. the previous PUT was committed but its response was lost
        return null;
      }
      try {
        await client.putJson(path, w, remote === null ? null : remote.sha, `phone: ${path} rev ${w.rev}`);
        deps.markSent(w.id, w.rev);
        return null;
      } catch (error) {
        const conflict = error instanceof GitHubError && (error.status === 409 || error.status === 422);
        if (!conflict || attempt >= RETRY_DELAYS_MS.length) throw error;
        await deps.sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  async function pass()                       {
    const queue = pending();
    if (queue.length === 0) {
      deps.onStatus("sent");
      return "idle";
    }
    deps.onStatus("saved");
    const client = deps.client();
    if (client === null) {
      deps.onStatus("key-invalid", "нет ключа");
      return "stopped";
    }
    let problem                = null;
    for (const w of queue) {
      try {
        const reason = await sendOne(client, w.id);
        if (reason !== null && problem === null) problem = reason;
      } catch (error) {
        deps.onStatus(isKeyProblem(error) ? "key-invalid" : "error", describe(error));
        return "stopped";
      }
    }
    if (problem !== null) {
      deps.onStatus("error", problem);
      return "stopped";
    }
    if (pending().length > 0) return "more"; // edited while sending: go again with the current version
    deps.onStatus("sent");
    return "done";
  }

  async function run()                {
    try {
      let extra = 0;
      for (;;) {
        dirty = false;
        const outcome = await pass();
        if (outcome === "stopped") return; // a failure waits for the next kick()
        if (outcome === "idle") {
          if (dirty && pending().length > 0) continue;
          return;
        }
        if (dirty) continue;
        if (outcome === "more" && extra < EXTRA_PASSES) {
          extra++;
          continue;
        }
        return;
      }
    } catch (error) {
      try {
        deps.onStatus("error", describe(error));
      } catch {
        // The status callback itself failed; there is nobody left to tell.
      }
    } finally {
      running = false;
    }
  }

  return {
    kick()       {
      if (running) {
        dirty = true;
        return;
      }
      running = true;
      void run();
    },
    flushing()          {
      return running;
    },
  };
}
