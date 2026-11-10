import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ESLint } from 'eslint';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const eslint = new ESLint({ cwd });

test('accepts typed Node modules, legacy decorators, and imported test helpers', async () => {
  const source = `
    import { describe, it, expect } from 'vitest';
    function Entity(): ClassDecorator { return () => {}; }
    @Entity()
    class Sample { value: number = 1; }
    describe('sample', () => {
      it('works', () => {
        console.log(process.version, Buffer.from('test'));
        expect(new Sample().value).toBe(1);
      });
    });
  `;
  const [result] = await eslint.lintText(source, { filePath: 'src/example.test.ts' });
  assert.deepEqual(result.messages, []);
});

test('checks production code, tests, scripts, and root TypeScript configuration', async () => {
  for (const filePath of ['src/example.ts', 'src/example.test.ts', 'scripts/example.ts', 'vitest.config.ts']) {
    const [result] = await eslint.lintText('export const value: any = 1;', { filePath });
    assert.ok(result.messages.some(({ ruleId }) => ruleId === '@typescript-eslint/no-explicit-any'), filePath);
  }
});

test('detects unused variables and debugger statements', async () => {
  const [result] = await eslint.lintText('const unused = 1; debugger;', { filePath: 'src/example.ts' });
  assert.ok(result.messages.some(({ ruleId }) => ruleId === '@typescript-eslint/no-unused-vars'));
  assert.ok(result.messages.some(({ ruleId }) => ruleId === 'no-debugger'));
});

test('checks ESM configuration files with Node globals', async () => {
  const [result] = await eslint.lintText('export default process.version;', { filePath: 'example.config.js' });
  assert.deepEqual(result.messages, []);
});

test('ignores build output, coverage, and installed dependencies', async () => {
  for (const filePath of ['dist/example.js', 'coverage/example.js', 'node_modules/example/index.js']) {
    assert.equal(await eslint.isPathIgnored(filePath), true, filePath);
  }
});
