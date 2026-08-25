import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { FEISHU_LIBRARY_CONTRACTS, assertIsolatedLibraryTables, normalizePersonalWorkspace, workspaceLinks } from './library-contracts.mjs';

describe('Feishu four-domain isolation contract', () => {
  it('assigns every domain its own schema, skill, agent target and environment key', () => {
    expect(Object.keys(FEISHU_LIBRARY_CONTRACTS)).toEqual(['books', 'movies', 'music', 'photos']);
    for (const key of ['schema', 'skillId', 'agentTarget', 'tableEnv', 'tableName', 'idPrefix'] as const) {
      expect(new Set(Object.values(FEISHU_LIBRARY_CONTRACTS).map((contract: any) => contract[key])).size).toBe(4);
    }
    expect(FEISHU_LIBRARY_CONTRACTS.movies).toMatchObject({
      schema: 'pocket.movies/v1', skillId: 'pocket.movies', agentTarget: 'movies-agent', tableEnv: 'FEISHU_BITABLE_MOVIES_TABLE_ID',
    });
  });

  it('hard-fails shared table IDs instead of falling back to the books table', () => {
    expect(() => assertIsolatedLibraryTables({ books: 'tbl-books', movies: 'tbl-books' })).toThrow('bitable_library_table_id_shared:books:movies');
    expect(() => assertIsolatedLibraryTables({ books: 'tbl-books' }, { requireAll: true })).toThrow('bitable_library_tables_incomplete');
  });

  it('builds a domain-specific URL for a browser-local personal workspace', () => {
    const workspace = normalizePersonalWorkspace({
      appToken: 'base-user', tables: { books: 'tbl-books', movies: 'tbl-movies', music: 'tbl-music', photos: 'tbl-photos' },
    });
    const links = workspaceLinks(workspace);
    expect(new Set(Object.values(links.domainUrls)).size).toBe(4);
    expect(links.domainUrls.movies).toBe('https://feishu.cn/base/base-user?table=tbl-movies');
  });

  it('keeps the coordination JSON aligned with the four server contracts', () => {
    const registry = JSON.parse(readFileSync(new URL('../../schemas/pocket-data-v1/adapter-registry.json', import.meta.url), 'utf8'));
    const adapters = Object.fromEntries(registry.adapters.map((adapter: any) => [adapter.domain, adapter]));

    expect(Object.keys(adapters)).toEqual(expect.arrayContaining(['books', 'movies', 'music', 'photos']));
    for (const [domain, contract] of Object.entries(FEISHU_LIBRARY_CONTRACTS) as Array<[string, any]>) {
      expect(adapters[domain]).toMatchObject({
        schema_name: contract.schema,
        skill_id: contract.skillId,
        agent_target: contract.agentTarget,
        feishu_table_env: contract.tableEnv,
      });
    }
  });

  it('keeps every Frost agent contract aligned with its own schema and Feishu table path', () => {
    for (const contract of Object.values(FEISHU_LIBRARY_CONTRACTS) as any[]) {
      const document = readFileSync(new URL(`../../frost-agent/agents/${contract.agentTarget}/contract.md`, import.meta.url), 'utf8');
      expect(document).toContain(contract.skillId);
      expect(document).toContain(contract.schema);
      expect(document).toContain(contract.tableEnv);
    }
  });
});
