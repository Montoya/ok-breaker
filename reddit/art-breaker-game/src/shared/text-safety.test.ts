import { describe, expect, it } from 'vitest';
import { MAX_BOARD_NAME_LENGTH, boardNameIssue, passesTextSafety, unicodeLength } from './text-safety';

describe('board name safety', () => {
  it('accepts blank names and emoji', () => {
    expect(boardNameIssue('')).toBeNull();
    expect(boardNameIssue('🎨✨🧱')).toBeNull();
    expect(passesTextSafety('Pixel Party 🎨')).toBe(true);
  });

  it('requires at least three characters for a custom name', () => {
    expect(boardNameIssue('AB')).toBe('too-short');
    expect(boardNameIssue('ABC')).toBeNull();
  });

  it('limits names to 22 Unicode grapheme clusters', () => {
    expect(MAX_BOARD_NAME_LENGTH).toBe(22);
    expect(boardNameIssue('A'.repeat(22))).toBeNull();
    expect(boardNameIssue('A'.repeat(23))).toBe('too-long');
    expect(unicodeLength('👨‍👩‍👧‍👦')).toBe(1);
    expect(boardNameIssue('👨‍👩‍👧‍👦'.repeat(22))).toBeNull();
  });

  it('catches blocked content and simple obfuscation', () => {
    expect(boardNameIssue('sh1t')).toBe('offensive');
    expect(boardNameIssue('f u c k')).toBe('offensive');
  });
});
