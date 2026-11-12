/**
 * Public-interface tests for the paginated list endpoints of users, articles and stages.
 * Same mockEm + supertest + JWT pattern as lineas-produccion.routes.test.ts.
 */
import "reflect-metadata";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { MikroORM } from "@mikro-orm/postgresql";
import jwt from "jsonwebtoken";
import { initApp } from "../app.js";
import { UsuarioRol } from "../shared/types.js";
import { Usuario } from "../models/Usuario.js";
import { Articulo } from "../models/Articulo.js";
import { Etapa } from "../models/Etapa.js";

const JWT_SECRET = "test-secret-key-catalog-pagination";

const tokenFor = (rol: UsuarioRol) =>
  jwt.sign({ id: 1, nombreUsuario: "testuser", rol }, JWT_SECRET);

const mockEm = {
  find: vi.fn(),
  findOne: vi.fn(),
  findAndCount: vi.fn(),
  create: vi.fn(),
  flush: vi.fn(),
  count: vi.fn(),
  persist: vi.fn().mockReturnThis(),
  transactional: vi.fn(async (cb: (em: unknown) => unknown) => cb(mockEm)),
};

vi.mock("@mikro-orm/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@mikro-orm/core")>();
  return {
    ...original,
    RequestContext: {
      ...original.RequestContext,
      create: (_em: unknown, next: () => void) => next(),
      getEntityManager: () => mockEm,
    },
  };
});

let app: Express;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  app = await initApp({ em: {} } as unknown as MikroORM);
});

beforeEach(() => {
  vi.clearAllMocks();
  mockEm.findAndCount.mockResolvedValue([[], 0]);
});

const get = (path: string, rol: UsuarioRol = UsuarioRol.OPERARIO) =>
  request(app)
    .get(path)
    .set("Authorization", `Bearer ${tokenFor(rol)}`);

const lastCall = () => {
  const [entity, where, options] = mockEm.findAndCount.mock.calls[0];
  return { entity, where, options };
};

describe.each([
  {
    path: "/api/articulos",
    entity: Articulo,
    defaultSort: { codigo: "asc", id: "asc" },
  },
  {
    path: "/api/etapas",
    entity: Etapa,
    defaultSort: { nombre: "asc", id: "asc" },
  },
  {
    path: "/api/usuarios",
    entity: Usuario,
    defaultSort: { nombreApellido: "asc", id: "asc" },
  },
])("GET $path pagination", ({ path, entity, defaultSort }) => {
  it("returns the paged envelope with bounded defaults from the database", async () => {
    mockEm.findAndCount.mockResolvedValue([[{ id: 7 }], 41]);

    const res = await get(path);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { items: [{ id: 7 }], total: 41, page: 1, pageSize: 20 },
    });
    const { entity: usedEntity, where, options } = lastCall();
    expect(usedEntity).toBe(entity);
    expect(where).toMatchObject({ activo: true });
    expect(options).toMatchObject({
      limit: 20,
      offset: 0,
      orderBy: defaultSort,
    });
    expect(mockEm.find).not.toHaveBeenCalled();
  });

  it("lists inactive records through /inactive with the same contract", async () => {
    const res = await get(`${path}/inactive`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    expect(lastCall().where).toMatchObject({ activo: false });
  });

  it("applies page and pageSize as limit and offset", async () => {
    await get(`${path}?page=3&pageSize=10`);

    expect(lastCall().options).toMatchObject({ limit: 10, offset: 20 });
  });

  it("honours sortDirection and keeps the id tiebreaker", async () => {
    await get(`${path}?sortDirection=desc`);

    const [[field, direction]] = Object.entries(defaultSort);
    expect(lastCall().options.orderBy).toEqual({
      [field]: "desc",
      id: direction,
    });
  });

  it("searches every allowed field in the database when no searchField is given", async () => {
    await get(`${path}?q=pa`);

    const { $and } = lastCall().where;
    expect($and[0].$or.length).toBeGreaterThan(1);
  });

  it("escapes LIKE wildcards in the search text", async () => {
    await get(
      `${path}?q=${encodeURIComponent("50%_x")}&searchField=${path.endsWith("usuarios") ? "legajo" : "nombre"}`,
    );

    const [[, condition]] = Object.entries(lastCall().where.$and[0].$or[0]);
    expect(condition).toEqual({ $ilike: "%50\\%\\_x%" });
  });

  it.each([
    ["pageSize above the maximum", "pageSize=101"],
    ["a fractional page", "page=1.5"],
    ["a sort field outside the allowlist", "sortBy=pinHash"],
    ["a search field outside the allowlist", "searchField=pinHash"],
    ["an unsupported query key", "foo=bar"],
  ])("rejects %s with 400 and never queries", async (_label, query) => {
    const res = await get(`${path}?${query}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockEm.findAndCount).not.toHaveBeenCalled();
  });

  it("still requires authentication", async () => {
    const res = await request(app).get(path);

    expect(res.status).toBe(401);
  });

  it("keeps detail by id unchanged", async () => {
    mockEm.findOne.mockResolvedValue({ id: 5, activo: true });

    const res = await get(`${path}/5`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 5, activo: true });
  });
});

describe("GET /api/usuarios filters", () => {
  it("searches the role by matching enum values instead of casting the column", async () => {
    await get("/api/usuarios?q=jef&searchField=rol");

    expect(lastCall().where.$and[0].$or).toEqual([
      { rol: { $in: [UsuarioRol.JEFE] } },
    ]);
  });

  it("filters by a known sector", async () => {
    await get("/api/usuarios?sector=OF");

    expect(JSON.stringify(lastCall().where)).toContain('"sector":"OF"');
  });

  it('treats missing or unknown sector codes as "sin-sector"', async () => {
    await get("/api/usuarios?sector=sin-sector");

    const serialized = JSON.stringify(lastCall().where);
    expect(serialized).toContain('"$nin"');
    expect(serialized).toContain("null");
  });

  it("rejects an unknown sector filter", async () => {
    const res = await get("/api/usuarios?sector=inventado");

    expect(res.status).toBe(400);
  });
});

describe("out-of-scope lists keep their previous contract", () => {
  it("GET /api/balanzas still returns the full array", async () => {
    mockEm.find.mockResolvedValue([{ id: 1, activo: true }]);

    const res = await get("/api/balanzas", UsuarioRol.ADMINISTRADOR);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(mockEm.findAndCount).not.toHaveBeenCalled();
  });
});
