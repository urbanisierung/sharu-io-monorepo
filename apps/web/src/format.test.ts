import { describe, expect, it } from 'vitest';
import { fileKind, formatBytes, formatDate } from './format.js';

describe('formatBytes', () => {
  it('keeps small values in bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('scales into binary units with one decimal under ten', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(15 * 1024)).toBe('15 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.0 GB');
  });
});

describe('formatDate', () => {
  it('renders a stable UTC date regardless of locale', () => {
    expect(formatDate(Date.UTC(2024, 0, 5))).toBe('Jan 5, 2024');
    expect(formatDate(Date.UTC(2026, 11, 31))).toBe('Dec 31, 2026');
  });
});

describe('fileKind', () => {
  it('classifies by extension, falling back to a generic file', () => {
    expect(fileKind('photo.JPG')).toBe('image');
    expect(fileKind('clip.mp4')).toBe('video');
    expect(fileKind('notes.md')).toBe('document');
    expect(fileKind('archive.tar')).toBe('archive');
    expect(fileKind('main.rs')).toBe('code');
    expect(fileKind('noext')).toBe('file');
    expect(fileKind('trailingdot.')).toBe('file');
  });
});
