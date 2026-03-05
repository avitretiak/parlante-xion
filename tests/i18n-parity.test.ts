import { describe, expect, test } from 'bun:test';
import en from '../src/languages/en';
import esUY from '../src/languages/es-UY';

type LanguageObject = Record<string, unknown>;

function collectKeyPaths(obj: LanguageObject, prefix = ''): string[] {
  const paths: string[] = [];
  for (const key of Object.keys(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      paths.push(...collectKeyPaths(value as LanguageObject, fullPath));
    } else {
      paths.push(fullPath);
    }
  }
  return paths;
}

describe('i18n key parity', () => {
  const enKeys = collectKeyPaths(en as unknown as LanguageObject);
  const esKeys = collectKeyPaths(esUY as unknown as LanguageObject);

  test('en and es-UY have the same top-level keys', () => {
    const enTopLevel = Object.keys(en).sort();
    const esTopLevel = Object.keys(esUY).sort();
    expect(esTopLevel).toEqual(enTopLevel);
  });

  test('es-UY has all keys present in en', () => {
    const missingInEs = enKeys.filter((k) => !esKeys.includes(k));
    expect(missingInEs).toEqual([]);
  });

  test('en has all keys present in es-UY', () => {
    const missingInEn = esKeys.filter((k) => !enKeys.includes(k));
    expect(missingInEn).toEqual([]);
  });

  test('both languages have the same total number of keys', () => {
    expect(esKeys.length).toBe(enKeys.length);
  });

  test('function-typed keys match between en and es-UY', () => {
    for (const keyPath of enKeys) {
      const enValue = getNestedValue(en as unknown as LanguageObject, keyPath);
      const esValue = getNestedValue(esUY as unknown as LanguageObject, keyPath);

      if (typeof enValue === 'function') {
        expect(typeof esValue).toBe('function');
      }
      if (typeof esValue === 'function') {
        expect(typeof enValue).toBe('function');
      }
    }
  });
});

function getNestedValue(obj: LanguageObject, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as LanguageObject)[part];
  }
  return current;
}
