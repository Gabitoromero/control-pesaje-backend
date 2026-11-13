import { describe, expect, it, vi } from "vitest";
import type { EntityManager } from "@mikro-orm/core";
import { createPaginationQuerySchema, findPage } from "./pagination.js";

const schema = createPaginationQuerySchema({
  searchFields: ["nombre", "descripcion"],
  sortFields: ["nombre", "id"],
});

class CatalogEntry {
  id!: number;
  nombre!: string;
  activo!: boolean;
}

describe("catalog pagination query", () => {
  it("defaults to a bounded first page and an allowlisted order", () => {
    expect(schema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      q: "",
      sortBy: "nombre",
      sortDirection: "asc",
    });
    expect(
      schema.parse({
        page: "2",
        pageSize: "100",
        q: "  helado  ",
        searchField: "descripcion",
      }),
    ).toMatchObject({
      page: 2,
      pageSize: 100,
      q: "helado",
      searchField: "descripcion",
    });
  });

  it.each([
    { page: "0" },
    { page: "-1" },
    { page: "1.5" },
    { page: "" },
    { page: "1e2" },
    { page: true },
    { page: ["2"] },
    { page: null },
    { page: "9007199254740992" },
    { page: Number.MAX_SAFE_INTEGER, pageSize: 100 },
    { pageSize: "0" },
    { pageSize: "101" },
    { pageSize: "2.5" },
    { q: "x".repeat(101) },
    { q: ["helado"] },
    { searchField: "password" },
    { sortBy: "password" },
    { sortDirection: "invalid" },
    { orderBy: "nombre; DROP TABLE articulo" },
  ])("rejects invalid or unallowlisted inputs: %j", (query) => {
    expect(schema.safeParse(query).success).toBe(false);
  });
});

describe("findPage", () => {
  it("passes identical filters to the database count and bounded query, with an ID tiebreaker", async () => {
    const items = [{ id: 42, nombre: "Helado", activo: true }];
    const findAndCount = vi.fn().mockResolvedValue([items, 41]);
    const em = { findAndCount } as unknown as EntityManager;
    const where = { activo: true, nombre: { $ilike: "%helado%" } };
    const page = await findPage(
      em,
      CatalogEntry,
      where,
      { page: 3, pageSize: 20 },
      {
        orderBy: { nombre: "asc" },
      },
    );

    expect(findAndCount).toHaveBeenCalledExactlyOnceWith(CatalogEntry, where, {
      limit: 20,
      offset: 40,
      orderBy: { nombre: "asc", id: "asc" },
    });
    expect(page).toEqual({ items, total: 41, page: 3, pageSize: 20 });
  });

  it("keeps inactive filters, descending ID order, and accurate empty-page totals", async () => {
    const findAndCount = vi.fn().mockResolvedValue([[], 5]);
    const em = { findAndCount } as unknown as EntityManager;
    const page = await findPage(
      em,
      CatalogEntry,
      { activo: false },
      { page: 2, pageSize: 20 },
      {
        orderBy: { id: "desc" },
      },
    );

    expect(findAndCount).toHaveBeenCalledExactlyOnceWith(
      CatalogEntry,
      { activo: false },
      {
        limit: 20,
        offset: 20,
        orderBy: { id: "desc" },
      },
    );
    expect(page).toEqual({ items: [], total: 5, page: 2, pageSize: 20 });
  });
});
