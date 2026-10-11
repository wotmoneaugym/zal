// GitHub Contents API client for the phone. fetch is injected so tests run against a fake.
export class GitHubError extends Error {
  status        ;
  constructor(status        , message        ) {
    super(message);
    this.status = status;
    this.name = "GitHubError";
  }
}

                               
                               
                                                                      
                                                                                              
                                                                  
 

const JSON_ACCEPT = "application/vnd.github+json";
const RAW_ACCEPT = "application/vnd.github.raw+json";
const API_VERSION = "2022-11-28";
const COMMITTER = { name: "workout-tracker", email: "workout-tracker@users.noreply.github.com" };
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// UTF-8 bytes -> base64, without btoa on strings (that breaks Cyrillic).
export function utf8ToBase64(s        )         {
  const bytes = new TextEncoder().encode(s);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const rest = bytes.length - i;
    const n = (bytes[i] << 16) | ((rest > 1 ? bytes[i + 1] : 0) << 8) | (rest > 2 ? bytes[i + 2] : 0);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    out += rest > 1 ? ALPHABET[(n >> 6) & 63] : "=";
    out += rest > 2 ? ALPHABET[n & 63] : "=";
  }
  return out;
}

// base64 (GitHub wraps it with line breaks) -> bytes -> strict UTF-8 decoding.
export function base64ToUtf8(b64        )         {
  const clean = b64.replace(/[\r\n\t ]/gu, "");
  if (clean.length % 4 !== 0 || !/^[A-Za-z0-9+\/]*={0,2}$/u.test(clean)) throw new Error("GitHub прислал не base64");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  const bytes = new Uint8Array((clean.length / 4) * 3 - padding);
  let at = 0;
  for (let i = 0; i < clean.length; i += 4) {
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const c = clean[i + k];
      n = (n << 6) | (c === "=" ? 0 : ALPHABET.indexOf(c));
    }
    if (at < bytes.length) bytes[at++] = (n >> 16) & 255;
    if (at < bytes.length) bytes[at++] = (n >> 8) & 255;
    if (at < bytes.length) bytes[at++] = n & 255;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function isRateLimited(res          )          {
  if (res.status === 429) return true;
  return res.status === 403 && (res.headers.get("x-ratelimit-remaining") === "0" || res.headers.get("retry-after") !== null);
}

// Builds the error for a non-2xx answer. Never includes the token.
async function failure(res          , what        )                       {
  let detail = "";
  try {
    const body = (await res.json())                         ;
    if (typeof body.message === "string") detail = body.message.replace(/\s+/gu, " ").trim().slice(0, 200);
  } catch {
    // The body is not JSON; the status code is enough.
  }
  const status = isRateLimited(res) ? 429 : res.status;
  const reason = status === 429 ? "лимит запросов GitHub" : detail;
  return new GitHubError(status, `GitHub ${status}: ${what}${reason ? ` — ${reason}` : ""}`);
}

export function createGitHubClient(opts                                                                                      )               {
  // Called as a plain function: Safari throws "Illegal invocation" for window.fetch with a foreign `this`.
  const fetchFn = opts.fetch;
  const repoUrl = `${opts.apiBase.replace(/\/+$/u, "")}/repos/${encodeURIComponent(opts.owner)}/${encodeURIComponent(opts.repo)}`;
  const contentsUrl = (path        )         => `${repoUrl}/contents/${path.split("/").map((part) => encodeURIComponent(part)).join("/")}`;

  const call = (method               , url        , accept        , body          )                    => {
    const headers                         = { Accept: accept, Authorization: `Bearer ${opts.token}`, "X-GitHub-Api-Version": API_VERSION };
    const init              = { method, headers, cache: "no-store" };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    return fetchFn(url, init);
  };

  return {
    async checkAccess()                {
      const res = await call("GET", repoUrl, JSON_ACCEPT);
      if (!res.ok) throw await failure(res, `доступ к ${opts.owner}/${opts.repo}`);
      const body = (await res.json())                                        ;
      if (body.permissions?.push === false) {
        throw new GitHubError(403, `GitHub 403: ключ без права записи в ${opts.owner}/${opts.repo}`);
      }
    },

    async getJson   (path        )                                            {
      const url = contentsUrl(path);
      const res = await call("GET", url, JSON_ACCEPT);
      if (res.status === 404) return null;
      if (!res.ok) throw await failure(res, `чтение ${path}`);
      const meta = (await res.json())                                                                            ;
      if (Array.isArray(meta) || meta.type !== "file" || typeof meta.sha !== "string") throw new Error(`GitHub: ${path} — не файл`);
      const sha = meta.sha;
      let text        ;
      if (meta.encoding === "base64" && typeof meta.content === "string") {
        text = base64ToUtf8(meta.content);
      } else {
        // Files over 1 MB come with encoding "none": fetch the raw bytes.
        const raw = await call("GET", url, RAW_ACCEPT);
        if (raw.status === 404) return null;
        if (!raw.ok) throw await failure(raw, `чтение ${path}`);
        text = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(await raw.arrayBuffer()));
      }
      return { value: JSON.parse(text)     , sha };
    },

    async putJson(path        , value         , sha               , message        )                  {
      const body                          = { message, content: utf8ToBase64(`${JSON.stringify(value, null, 2)}\n`), committer: COMMITTER };
      if (sha !== null) body.sha = sha;
      const res = await call("PUT", contentsUrl(path), JSON_ACCEPT, body);
      if (!res.ok) throw await failure(res, `запись ${path}`);
      const answer = (await res.json())                                   ;
      const newSha = answer.content?.sha;
      if (typeof newSha !== "string") throw new Error(`GitHub: в ответе на запись ${path} нет sha`);
      return newSha;
    },

    async listDir(path        )                                           {
      const res = await call("GET", contentsUrl(path), JSON_ACCEPT);
      if (res.status === 404) return [];
      if (!res.ok) throw await failure(res, `список ${path}`);
      const body = (await res.json())           ;
      if (!Array.isArray(body)) throw new Error(`GitHub: ${path} — не папка`);
      const files                                  = [];
      for (const entry of body                                                       ) {
        if (entry.type === "file" && typeof entry.name === "string" && typeof entry.sha === "string") files.push({ name: entry.name, sha: entry.sha });
      }
      return files;
    },
  };
}
