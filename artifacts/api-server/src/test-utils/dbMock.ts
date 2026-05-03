type Row = Record<string, unknown>;

export type ColRef = { __table: string; __col: string };
export type TableRef = { __name: string } & Record<string, ColRef>;

export type Predicate =
  | { __op: "eq"; col: string; val: unknown }
  | { __op: "and"; args: Predicate[] }
  | { __op: "or"; args: Predicate[] }
  | { __op: "inArray"; col: string; val: unknown[] }
  | { __op: "lt"; col: string; val: unknown }
  | { __op: "gt"; col: string; val: unknown }
  | { __op: "isNull"; col: string }
  | { __op: "isNotNull"; col: string }
  | undefined;

export type OrderRef = { __order: "asc" | "desc"; col: string };
export type SqlMarker = { __sql: true };

export function defineTable<T extends string>(
  name: string,
  columns: readonly T[],
): { __name: string } & Record<T, ColRef> {
  const t = { __name: name } as { __name: string } & Record<string, ColRef>;
  for (const c of columns) t[c] = { __table: name, __col: c };
  return t as { __name: string } & Record<T, ColRef>;
}

function evalPred(pred: Predicate, row: Row): boolean {
  if (!pred) return true;
  switch (pred.__op) {
    case "eq":
      return row[pred.col] === pred.val;
    case "and":
      return pred.args.every((p) => evalPred(p, row));
    case "or":
      return pred.args.some((p) => evalPred(p, row));
    case "inArray":
      return pred.val.includes(row[pred.col]);
    case "lt": {
      const a = row[pred.col] as number | Date;
      const b = pred.val as number | Date;
      return (a instanceof Date ? a.getTime() : (a as number)) <
        (b instanceof Date ? b.getTime() : (b as number));
    }
    case "gt": {
      const a = row[pred.col] as number | Date;
      const b = pred.val as number | Date;
      return (a instanceof Date ? a.getTime() : (a as number)) >
        (b instanceof Date ? b.getTime() : (b as number));
    }
    case "isNull":
      return row[pred.col] == null;
    case "isNotNull":
      return row[pred.col] != null;
    default:
      return true;
  }
}

export const drizzleMockFactory = async () => {
  const actual = await (
    await import("vitest")
  ).vi.importActual<Record<string, unknown>>("drizzle-orm");
  return {
    ...actual,
    eq: (col: ColRef, val: unknown) => ({ __op: "eq", col: col.__col, val }),
    and: (...args: Predicate[]) => ({ __op: "and", args: args.filter(Boolean) }),
    or: (...args: Predicate[]) => ({ __op: "or", args: args.filter(Boolean) }),
    inArray: (col: ColRef, val: unknown[]) => ({
      __op: "inArray",
      col: col.__col,
      val,
    }),
    lt: (col: ColRef, val: unknown) => ({ __op: "lt", col: col.__col, val }),
    gt: (col: ColRef, val: unknown) => ({ __op: "gt", col: col.__col, val }),
    isNull: (col: ColRef) => ({ __op: "isNull", col: col.__col }),
    isNotNull: (col: ColRef) => ({ __op: "isNotNull", col: col.__col }),
    asc: (col: ColRef) => ({ __order: "asc", col: col.__col }),
    desc: (col: ColRef) => ({ __order: "desc", col: col.__col }),
    sql: (() => {
      const fn = () => ({ __sql: true });
      // Tagged template form: sql`count(*)::int` -> { __sql: true }
      return new Proxy(fn, {
        apply: () => ({ __sql: true }),
      });
    })(),
  };
};

export interface DbStore {
  tables: Map<string, Row[]>;
  nextId: Map<string, number>;
}

export function createStore(): DbStore {
  return { tables: new Map(), nextId: new Map() };
}

function getRows(store: DbStore, name: string): Row[] {
  let r = store.tables.get(name);
  if (!r) {
    r = [];
    store.tables.set(name, r);
  }
  return r;
}

function nextId(store: DbStore, name: string): number {
  const cur = store.nextId.get(name) ?? 0;
  const next = cur + 1;
  store.nextId.set(name, next);
  return next;
}

function project(row: Row, cols?: Record<string, unknown>): Row {
  if (!cols) return { ...row };
  const out: Row = {};
  for (const [alias, ref] of Object.entries(cols)) {
    if (ref && typeof ref === "object" && "__col" in (ref as object)) {
      out[alias] = row[(ref as ColRef).__col];
    } else {
      out[alias] = row[alias];
    }
  }
  return out;
}

function isCountSelect(cols?: Record<string, unknown>): string | null {
  if (!cols) return null;
  for (const [alias, ref] of Object.entries(cols)) {
    if (ref && typeof ref === "object" && "__sql" in (ref as object)) {
      return alias;
    }
  }
  return null;
}

export function createDbMock(store: DbStore): unknown {
  return {
    select: (cols?: Record<string, unknown>) => ({
      from: (table: TableRef) => {
        const ctx: {
          predicate: Predicate;
          order?: OrderRef;
          limitN?: number;
        } = { predicate: undefined };
        const exec = (): Row[] => {
          const rows = getRows(store, table.__name);
          let filtered = rows.filter((r) => evalPred(ctx.predicate, r));
          if (ctx.order) {
            const { col, __order } = ctx.order;
            filtered = [...filtered].sort((a, b) => {
              const av = a[col] as number | Date;
              const bv = b[col] as number | Date;
              const an = av instanceof Date ? av.getTime() : (av as number);
              const bn = bv instanceof Date ? bv.getTime() : (bv as number);
              return __order === "asc" ? an - bn : bn - an;
            });
          }
          if (typeof ctx.limitN === "number") {
            filtered = filtered.slice(0, ctx.limitN);
          }
          const countAlias = isCountSelect(cols);
          if (countAlias) return [{ [countAlias]: filtered.length }];
          return filtered.map((r) => project(r, cols));
        };
        const chain: Record<string, unknown> = {};
        chain.where = (p: Predicate) => {
          ctx.predicate = p;
          return chain;
        };
        chain.orderBy = (o: OrderRef) => {
          ctx.order = o;
          return chain;
        };
        chain.limit = (n: number) => {
          ctx.limitN = n;
          return chain;
        };
        chain.groupBy = () => chain;
        chain.then = (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) => {
          try {
            return Promise.resolve(exec()).then(resolve, reject);
          } catch (err) {
            return reject ? reject(err) : Promise.reject(err);
          }
        };
        return chain;
      },
    }),
    insert: (table: TableRef) => ({
      values: (rowOrRows: Row | Row[]) => {
        const incoming = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
        const rows = getRows(store, table.__name);
        const inserted: Row[] = [];
        const apply = () => {
          for (const r of incoming) {
            const withId: Row = { ...r };
            if (withId.id === undefined) {
              withId.id = nextId(store, table.__name);
            }
            if (withId.createdAt === undefined) withId.createdAt = new Date();
            rows.push(withId);
            inserted.push(withId);
          }
        };
        const builder: Record<string, unknown> = {};
        builder.returning = async (_cols?: Record<string, unknown>) => {
          apply();
          return inserted.map((r) => ({ ...r }));
        };
        builder.onConflictDoNothing = async (opts?: {
          target?: ColRef[];
        }) => {
          const targetCols = opts?.target?.map((c) => c.__col) ?? [];
          for (const r of incoming) {
            const exists = targetCols.length
              ? rows.some((existing) =>
                  targetCols.every((c) => existing[c] === r[c]),
                )
              : false;
            if (!exists) {
              const withId: Row = { ...r };
              if (withId.id === undefined) {
                withId.id = nextId(store, table.__name);
              }
              if (withId.createdAt === undefined) withId.createdAt = new Date();
              rows.push(withId);
              inserted.push(withId);
            }
          }
          return inserted.map((r) => ({ ...r }));
        };
        builder.onConflictDoUpdate = async (opts: {
          target: ColRef[];
          set: Row;
        }) => {
          const targetCols = opts.target.map((c) => c.__col);
          for (const r of incoming) {
            const idx = rows.findIndex((existing) =>
              targetCols.every((c) => existing[c] === r[c]),
            );
            if (idx >= 0) {
              rows[idx] = { ...rows[idx], ...opts.set };
              inserted.push(rows[idx]);
            } else {
              const withId: Row = { ...r };
              if (withId.id === undefined) {
                withId.id = nextId(store, table.__name);
              }
              if (withId.createdAt === undefined) withId.createdAt = new Date();
              rows.push(withId);
              inserted.push(withId);
            }
          }
          return inserted.map((r) => ({ ...r }));
        };
        builder.then = (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) => {
          try {
            apply();
            return Promise.resolve(undefined).then(resolve, reject);
          } catch (err) {
            return reject ? reject(err) : Promise.reject(err);
          }
        };
        return builder;
      },
    }),
    update: (table: TableRef) => ({
      set: (values: Row) => ({
        where: async (predicate: Predicate) => {
          const rows = getRows(store, table.__name);
          for (let i = 0; i < rows.length; i++) {
            if (evalPred(predicate, rows[i])) {
              rows[i] = { ...rows[i], ...values };
            }
          }
        },
      }),
    }),
    delete: (table: TableRef) => {
      const ctx: { predicate: Predicate } = { predicate: undefined };
      const chain: Record<string, unknown> = {};
      chain.where = (p: Predicate) => {
        ctx.predicate = p;
        return chain;
      };
      chain.returning = async (_cols?: Record<string, unknown>) => {
        const rows = getRows(store, table.__name);
        const removed: Row[] = [];
        for (let i = rows.length - 1; i >= 0; i--) {
          if (evalPred(ctx.predicate, rows[i])) {
            removed.unshift(rows[i]);
            rows.splice(i, 1);
          }
        }
        return removed.map((r) => ({ ...r }));
      };
      chain.then = (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown,
      ) => {
        try {
          const rows = getRows(store, table.__name);
          for (let i = rows.length - 1; i >= 0; i--) {
            if (evalPred(ctx.predicate, rows[i])) rows.splice(i, 1);
          }
          return Promise.resolve(undefined).then(resolve, reject);
        } catch (err) {
          return reject ? reject(err) : Promise.reject(err);
        }
      };
      return chain;
    },
  };
}
