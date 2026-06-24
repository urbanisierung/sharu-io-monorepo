import { describe, expect, it } from 'vitest';
import {
  parseAnyManifest,
  parseManifest,
  parseSiteManifest,
  type ShareManifest,
  type SiteManifest,
  serializeManifest,
} from './share.js';

const manifest: ShareManifest = {
  v: 1,
  name: 'index.html',
  contentType: 'text/html',
  size: 42,
  blocks: [
    { addr: 'cipher-a', hash: 'plain-a', nonce: 'nonce-a' },
    { addr: 'cipher-b', hash: 'plain-b', nonce: 'nonce-b' },
  ],
};

describe('share manifest codec', () => {
  it('round-trips a manifest through serialize/parse', () => {
    expect(parseManifest(serializeManifest(manifest))).toEqual(manifest);
  });

  const reject = (value: unknown, match: RegExp) =>
    expect(() => parseManifest(new TextEncoder().encode(JSON.stringify(value)))).toThrow(match);

  it('rejects an unsupported version', () => {
    reject({ ...manifest, v: 2 }, /unsupported version/);
  });

  it('rejects a non-object', () => {
    reject(null, /not an object/);
  });

  it('rejects a negative or non-integer size', () => {
    reject({ ...manifest, size: -1 }, /invalid size/);
    reject({ ...manifest, size: 1.5 }, /invalid size/);
  });

  it('rejects blocks that are not an array', () => {
    reject({ ...manifest, blocks: {} }, /blocks must be an array/);
  });

  it('rejects a block ref missing a field', () => {
    reject({ ...manifest, blocks: [{ addr: 'a', hash: 'b' }] }, /invalid block nonce/);
    reject({ ...manifest, blocks: [{ addr: '', hash: 'b', nonce: 'n' }] }, /invalid block addr/);
  });
});

const site: SiteManifest = {
  v: 2,
  index: 'index.html',
  files: {
    'index.html': {
      contentType: 'text/html',
      size: 10,
      blocks: [{ addr: 'cipher-a', hash: 'plain-a', nonce: 'nonce-a' }],
    },
    'style.css': {
      contentType: 'text/css',
      size: 5,
      blocks: [{ addr: 'cipher-b', hash: 'plain-b', nonce: 'nonce-b' }],
    },
  },
};

describe('site manifest codec', () => {
  it('round-trips a multi-file site through serialize/parse', () => {
    expect(parseSiteManifest(serializeManifest(site))).toEqual(site);
  });

  it('dispatches on version through parseAnyManifest', () => {
    expect(parseAnyManifest(serializeManifest(site))).toEqual(site);
    expect(parseAnyManifest(serializeManifest(manifest))).toEqual(manifest);
  });

  it('keeps parseManifest strict to v:1 (a site is not a file)', () => {
    expect(() => parseManifest(serializeManifest(site))).toThrow(/unsupported version/);
  });

  const reject = (value: unknown, match: RegExp) =>
    expect(() => parseSiteManifest(new TextEncoder().encode(JSON.stringify(value)))).toThrow(match);

  it('rejects a missing or empty index', () => {
    reject({ ...site, index: '' }, /invalid index/);
  });

  it('rejects an index that is not among the files', () => {
    reject({ ...site, index: 'missing.html' }, /index not among files/);
  });

  it('rejects a file entry with a malformed block', () => {
    reject(
      { ...site, files: { 'index.html': { contentType: 'text/html', size: 1, blocks: [{}] } } },
      /invalid block addr/,
    );
  });
});
