// Thin client for DoraHacks' public (undocumented) hub API.
// Only read-only, unauthenticated endpoints are used.

export const BASE_URL = process.env.DORAHACKS_BASE_URL ?? "https://dorahacks.io";
const API = `${BASE_URL}/api/v1/hub`;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class DoraHacksError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export interface Page<T> {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
}

export class DoraHacksClient {
  private idCache = new Map<string, number>();

  constructor(private fetchImpl: FetchLike = fetch, private timeoutMs = 20000) {}

  async get<T = any>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = new URL(`${API}/${path.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url.toString(), {
        headers: { accept: "application/json", "user-agent": "dorahacks-mcp/0.1" },
        signal: ctrl.signal,
      });
    } catch (e: any) {
      throw new DoraHacksError(`Request to DoraHacks failed: ${e?.message ?? e}`);
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 404) throw new DoraHacksError("Not found on DoraHacks. Check the hackathon slug or id.", 404);
    if (!res.ok) throw new DoraHacksError(`DoraHacks returned HTTP ${res.status} for ${url.pathname}`, res.status);
    return (await res.json()) as T;
  }

  listHackathons(opts: { page?: number; pageSize?: number; status?: string; search?: string }) {
    return this.get<Page<any>>("hackathons", {
      page: opts.page ?? 1,
      page_size: opts.pageSize ?? 24,
      status: opts.status,
      search: opts.search,
    });
  }

  /** Accepts a slug ("agents-onchain"), numeric id ("2246") or a dorahacks.io URL. */
  static parseRef(ref: string): string {
    const s = ref.trim();
    const m = s.match(/dorahacks\.io\/hackathon\/([^/?#]+)/i);
    return m ? decodeURIComponent(m[1]) : s.replace(/^\/+|\/+$/g, "");
  }

  async getHackathon(ref: string): Promise<any> {
    const key = DoraHacksClient.parseRef(ref);
    const h = await this.get<any>(`hackathons/${encodeURIComponent(key)}`);
    if (h?.id) {
      this.idCache.set(key, h.id);
      if (h.uname) this.idCache.set(h.uname, h.id);
    }
    return h;
  }

  /** Sub-endpoints require the numeric id; resolve slugs via the detail endpoint. */
  async resolveId(ref: string): Promise<number> {
    const key = DoraHacksClient.parseRef(ref);
    if (/^\d+$/.test(key)) return Number(key);
    const cached = this.idCache.get(key);
    if (cached) return cached;
    const h = await this.getHackathon(key);
    if (!h?.id) throw new DoraHacksError(`Could not resolve hackathon "${ref}"`);
    return h.id;
  }

  async sub(ref: string, sub: string, params: Record<string, string | number | undefined> = {}) {
    const id = await this.resolveId(ref);
    return this.get<any>(`hackathons/${id}/${sub}`, params);
  }
}
