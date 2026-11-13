import { describe, expect, it } from 'vitest';
import { snapModulePx } from '../src/ui/useViewport';

describe('Scanmodus', () => {
  it('Bildpunkte je Modul sind ganzzahlig in Gerätepixeln', () => {
    expect(snapModulePx(890, 65, 1)).toBe(13);
    expect(snapModulePx(890, 65, 2)).toBe(13.5);
    expect(snapModulePx(300, 185, 1)).toBe(1);
    expect(snapModulePx(10, 185, 1)).toBe(1);
  });
});
