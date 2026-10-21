import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// DESIGN.md §11.3：src/core 必須是純 TypeScript，才能做單元測試與無頭模擬。
const CORE_DIR = join(__dirname, '..', 'src', 'core');

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

const FORBIDDEN = [
  { name: 'Phaser', pattern: /from\s+['"]phaser['"]|import\(\s*['"]phaser['"]\s*\)/ },
  { name: 'game/ 目錄', pattern: /from\s+['"][./]*game\// },
  { name: 'window', pattern: /\bwindow\./ },
  { name: 'document', pattern: /\bdocument\./ },
  { name: 'localStorage', pattern: /\blocalStorage\b/ },
];

describe('架構規則', () => {
  const files = listTsFiles(CORE_DIR);

  it('src/core 至少有一個檔案', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f.slice(CORE_DIR.length + 1), f]))(
    '%s 不依賴 Phaser、DOM 或瀏覽器 API',
    (_name, file) => {
      const source = readFileSync(file, 'utf8');
      const violations = FORBIDDEN.filter((rule) => rule.pattern.test(source)).map((r) => r.name);
      expect(violations).toEqual([]);
    },
  );
});
