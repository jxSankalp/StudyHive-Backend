type Row = Record<string, any>;
type Filter = (row: Row) => boolean;

class FakeQuery implements PromiseLike<{ data: any; error: any; count?: number }> {
  private filters: Filter[] = [];
  private action: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private values: Row | Row[] | null = null;
  constructor(private db: FakeSupabase, private table: string) {}
  select(_columns?: string) { return this; }
  insert(values: Row | Row[]) { this.action = "insert"; this.values = values; return this; }
  upsert(values: Row | Row[], _options?: unknown) { this.action = "upsert"; this.values = values; return this; }
  update(values: Row) { this.action = "update"; this.values = values; return this; }
  delete() { this.action = "delete"; return this; }
  eq(column: string, value: unknown) { this.filters.push((row) => row[column] === value); return this; }
  neq(column: string, value: unknown) { this.filters.push((row) => row[column] !== value); return this; }
  in(column: string, values: unknown[]) { this.filters.push((row) => values.includes(row[column])); return this; }
  is(column: string, value: unknown) { this.filters.push((row) => row[column] === value); return this; }
  or(_expression: string) { return this; }
  order(_column: string, _options?: unknown) { return this; }
  limit(_value: number) { return this; }
  async maybeSingle() { const result = await this.execute(); return { ...result, data: Array.isArray(result.data) ? result.data[0] ?? null : result.data }; }
  async single() { const result = await this.execute(); const data = Array.isArray(result.data) ? result.data[0] ?? null : result.data; return data ? { ...result, data } : { data: null, error: { code: "PGRST116", message: "No rows" } }; }
  then<TResult1 = { data: any; error: any; count?: number }, TResult2 = never>(onfulfilled?: ((value: { data: any; error: any; count?: number }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null) {
    return this.execute().then(onfulfilled, onrejected);
  }
  private matching() { return (this.db.tables[this.table] ?? []).filter((row) => this.filters.every((filter) => filter(row))); }
  private async execute() {
    const table = (this.db.tables[this.table] ??= []);
    if (this.action === "select") return { data: this.matching().map((row) => ({ ...row })), error: null };
    if (this.action === "insert") {
      const rows = (Array.isArray(this.values) ? this.values : [this.values]).filter(Boolean).map((row) => ({ id: row!.id ?? crypto.randomUUID(), ...row }));
      table.push(...rows); return { data: rows, error: null };
    }
    if (this.action === "upsert") {
      const rows = (Array.isArray(this.values) ? this.values : [this.values]).filter(Boolean) as Row[];
      for (const row of rows) {
        const existing = table.find((item) => (row.id && item.id === row.id) || (row.chat_id && row.user_id && item.chat_id === row.chat_id && item.user_id === row.user_id));
        if (existing) Object.assign(existing, row); else table.push({ id: row.id ?? crypto.randomUUID(), ...row });
      }
      return { data: rows, error: null };
    }
    const matched = this.matching();
    if (this.action === "update") { for (const row of matched) Object.assign(row, this.values); return { data: matched.map((row) => ({ ...row })), error: null }; }
    for (const row of matched) { const index = table.indexOf(row); if (index >= 0) table.splice(index, 1); }
    return { data: matched, error: null };
  }
}

export class FakeSupabase {
  tables: Record<string, Row[]> = {};
  tokenUsers = new Map<string, string>();
  auth = {
    getUser: async (token: string) => {
      const id = this.tokenUsers.get(token);
      return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { status: 401 } };
    },
  };
  from(table: string) { return new FakeQuery(this, table); }
  rpc = async () => ({ data: [], error: null });
  storage = { from: () => ({ remove: async () => ({ error: null }) }) };
  reset() { this.tables = {}; this.tokenUsers.clear(); }
  authenticate(userId: string) { const token = `token:${userId}`; this.tokenUsers.set(token, userId); return token; }
}

export const fakeSupabase = new FakeSupabase();
