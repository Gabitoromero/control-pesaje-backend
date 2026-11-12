import type {
  EntityClass,
  EntityManager,
  FilterQuery,
  FindOptions,
  QueryOrderMap,
} from "@mikro-orm/core";
import { z } from "zod";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

const SORT_DIRECTION = { ASC: "asc", DESC: "desc" } as const;

export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface Page<T> extends PageRequest {
  items: T[];
  total: number;
}

interface PaginationFields {
  searchFields: readonly [string, ...string[]];
  sortFields: readonly [string, ...string[]];
}

// Reject coercions such as arrays, booleans, exponents and empty strings.
const positiveInteger = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform(Number),
  ])
  .pipe(z.number().int().positive());

/** Each catalog supplies its own public field allowlists, not SQL expressions. */
export function createPaginationQuerySchema(fields: PaginationFields) {
  return z
    .object({
      page: positiveInteger.default(1),
      pageSize: positiveInteger
        .pipe(z.number().max(MAX_PAGE_SIZE))
        .default(DEFAULT_PAGE_SIZE),
      q: z.string().trim().max(100).default(""),
      searchField: z.enum(fields.searchFields).optional(),
      sortBy: z.enum(fields.sortFields).default(fields.sortFields[0]),
      sortDirection: z.enum(SORT_DIRECTION).default(SORT_DIRECTION.ASC),
    })
    .strict()
    .refine(
      ({ page, pageSize }) => Number.isSafeInteger((page - 1) * pageSize),
      { message: "Página fuera de rango", path: ["page"] },
    );
}

export type PaginationQuery = z.infer<
  ReturnType<typeof createPaginationQuerySchema>
>;

type PageOptions<T, P extends string> = Omit<
  FindOptions<T, P>,
  "limit" | "offset" | "orderBy"
> & {
  orderBy: QueryOrderMap<T>;
};

/**
 * Opt-in database pagination. Existing CRUD lists are deliberately unchanged.
 * Callers validate query input and build the same filter for items and total.
 */
export async function findPage<
  T extends { id: number },
  P extends string = never,
>(
  em: EntityManager,
  entityClass: EntityClass<T>,
  where: FilterQuery<T>,
  query: PageRequest,
  options: PageOptions<T, P>,
): Promise<Page<T>> {
  const { page, pageSize } = query;
  const orderBy = { ...options.orderBy };
  if (!Object.hasOwn(orderBy, "id")) {
    Object.assign(orderBy, { id: SORT_DIRECTION.ASC });
  }
  const [items, total] = await em.findAndCount(entityClass, where, {
    ...options,
    limit: pageSize,
    offset: (page - 1) * pageSize,
    orderBy,
  });
  return { items, total, page, pageSize };
}
