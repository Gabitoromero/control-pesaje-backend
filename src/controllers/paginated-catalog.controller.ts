import type { RequestHandler } from "express";
import { RequestContext } from "@mikro-orm/core";
import type { EntityClass, FilterQuery } from "@mikro-orm/core";
import type { z } from "zod";
import {
  createPaginationQuerySchema,
  findPage,
  type PaginationQuery,
} from "../utils/pagination.js";

type Condition = Record<string, unknown>;
type CatalogQuery = PaginationQuery & Record<string, unknown>;

export interface PaginatedCatalogConfig<
  T extends { id: number; activo: boolean },
> {
  entityClass: EntityClass<T>;
  /** Public field names accepted by `searchField`; all of them are searched when it is omitted. */
  searchFields: readonly [string, ...string[]];
  /** Public field names accepted by `sortBy`; the first one is the default order. */
  sortFields: readonly [string, ...string[]];
  /** Overrides the default case-insensitive "contains" match for one field. */
  searchCondition?: (field: string, text: string) => Condition;
  /** Catalog-specific query keys, validated together with the pagination keys. */
  extraQuery?: z.ZodRawShape;
  /** Relations to load. They load in separate queries, after the root rows are limited. */
  populate?: readonly string[];
  /** Projects each row into the response item; rows are returned as they are when omitted. */
  mapItem?: (item: T) => unknown;
  /** Turns validated catalog-specific keys into a database predicate. */
  extraFilter?: (query: CatalogQuery) => Condition | undefined;
}

const escapeLike = (text: string) =>
  text.replace(/[\\%_]/g, (char) => `\\${char}`);

export const containsText = (field: string, text: string): Condition => ({
  [field]: { $ilike: `%${escapeLike(text)}%` },
});

/**
 * Builds the paginated `list` / `listInactive` handlers of one catalog.
 * Search, state and filters run in the database before the limit is applied.
 */
export function createPaginatedListHandlers<
  T extends { id: number; activo: boolean },
>(
  config: PaginatedCatalogConfig<T>,
): { list: RequestHandler; listInactive: RequestHandler } {
  const schema = createPaginationQuerySchema(
    { searchFields: config.searchFields, sortFields: config.sortFields },
    config.extraQuery,
  );
  const matchText = config.searchCondition ?? containsText;

  const buildHandler =
    (activo: boolean): RequestHandler =>
    async (req, res) => {
      const parsed = schema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            message: "Parámetros de paginación inválidos",
            details: parsed.error.issues,
          },
        });
        return;
      }
      const query = parsed.data as CatalogQuery;

      const filters: Condition[] = [];
      if (query.q) {
        const fields = query.searchField
          ? [query.searchField]
          : config.searchFields;
        filters.push({ $or: fields.map((field) => matchText(field, query.q)) });
      }
      const extra = config.extraFilter?.(query);
      if (extra) filters.push(extra);

      try {
        const em = RequestContext.getEntityManager();
        if (!em) throw new Error("No EntityManager in RequestContext");
        const where = (filters.length > 0
          ? { activo, $and: filters }
          : { activo }) as unknown as FilterQuery<T>;
        const orderBy = { [query.sortBy]: query.sortDirection } as never;
        const page = await findPage(
          em,
          config.entityClass,
          where,
          query,
          config.populate
            ? {
                orderBy,
                populate: config.populate as never,
                strategy: "select-in",
              }
            : { orderBy },
        );
        const items = config.mapItem
          ? page.items.map(config.mapItem)
          : page.items;
        res.json({ success: true, data: { ...page, items } });
      } catch (err) {
        console.error("[paginated list error]", err);
        res.status(500).json({
          success: false,
          error: { message: "Error interno del servidor" },
        });
      }
    };

  return { list: buildHandler(true), listInactive: buildHandler(false) };
}
