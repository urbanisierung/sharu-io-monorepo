import { MemoryBlockStore } from '@safu/sdk';
import { describe, expect, it } from 'vitest';
import { base64UrlToBytes, bytesToBase64Url } from './base64url.js';
import { decodeShareCode, readShareFromHash } from './share-code.js';
import { publishFile, publishSite } from './share-publisher.js';
import { fetchContent, fetchManifest, openShare } from './share-viewer.js';

const peer = { id: 'node', relayUrl: 'https://relay/' };
const ORIGIN = 'https://safu.app';

function pseudo(len: number, seed: number): Uint8Array {
  let x = seed | 1;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    x ^= x << 13;
    x ^= x >>> 7;
    x ^= x << 17;
    out[i] = (x >>> 24) & 0xff;
  }
  return out;
}

function streamOf(data: Uint8Array, window: number): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= data.length) {
        controller.close();
        return;
      }
      controller.enqueue(data.subarray(offset, offset + window));
      offset += window;
    },
  });
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let total = 0;
  for await (const part of stream as unknown as AsyncIterable<Uint8Array>) {
    parts.push(part);
    total += part.length;
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    joined.set(p, offset);
    offset += p.length;
  }
  return joined;
}

const fetchFrom = (store: MemoryBlockStore) => (addr: string) => store.get(addr);

describe('public share round-trip', () => {
  it('publishes a file and reopens it from the link, byte-for-byte', async () => {
    // Exercises the whole path: random-key ingest → seal manifest → fetch →
    // open → egress-verify. Multi-block ordering is covered by the crypto egress
    // tests; a single modest payload keeps the WASM ingest fast here.
    const data = pseudo(256 * 1024, 1);
    const store = new MemoryBlockStore();
    const result = await publishFile(
      {
        name: 'photo.jpg',
        contentType: 'image/jpeg',
        size: data.length,
        content: streamOf(data, 64 * 1024),
      },
      store,
      peer,
      ORIGIN,
    );

    // The link carries the share in its fragment and decodes back to the info.
    const code = readShareFromHash(new URL(result.link).hash);
    expect(code).toBeDefined();
    expect(decodeShareCode(code as string)).toEqual(result.info);

    // A viewer holding only the link + a store-backed fetch reopens the file.
    const fetchBlock = fetchFrom(store);
    const manifest = await fetchManifest(result.info, fetchBlock);
    expect(manifest.name).toBe('photo.jpg');
    expect(manifest.contentType).toBe('image/jpeg');
    expect(manifest.size).toBe(data.length);
    expect(manifest.blocks.length).toBeGreaterThanOrEqual(1);
    expect(result.pin).toEqual([result.info.root, ...manifest.blocks.map((b) => b.addr)]);

    const out = await drain(await fetchContent(result.info, manifest, fetchBlock));
    expect(out).toEqual(data);
  });

  it('fails to open the manifest under the wrong key', async () => {
    const data = pseudo(1000, 2);
    const store = new MemoryBlockStore();
    const result = await publishFile(
      {
        name: 'a.txt',
        contentType: 'text/plain',
        size: data.length,
        content: streamOf(data, 1000),
      },
      store,
      peer,
      ORIGIN,
    );
    const wrong = { ...result.info, key: bytesToBase64Url(new Uint8Array(32).fill(9)) };
    await expect(fetchManifest(wrong, fetchFrom(store))).rejects.toThrow();
  });

  it('errors when a referenced block is unavailable (revoked / unpinned)', async () => {
    const data = pseudo(1000, 3);
    const store = new MemoryBlockStore();
    const result = await publishFile(
      {
        name: 'a.txt',
        contentType: 'text/plain',
        size: data.length,
        content: streamOf(data, 1000),
      },
      store,
      peer,
      ORIGIN,
    );
    const manifest = await fetchManifest(result.info, fetchFrom(store));
    const empty = new MemoryBlockStore();
    await expect(
      drain(await fetchContent(result.info, manifest, fetchFrom(empty))),
    ).rejects.toThrow(/unavailable/);
  });

  it('keeps the share key out of the link path and query (fragment only)', async () => {
    const data = pseudo(500, 4);
    const store = new MemoryBlockStore();
    const result = await publishFile(
      { name: 'a.txt', contentType: 'text/plain', size: data.length, content: streamOf(data, 500) },
      store,
      peer,
      ORIGIN,
    );
    const url = new URL(result.link);
    expect(url.pathname).toBe('/s');
    expect(url.search).toBe('');
    expect(url.hash).toContain('share=');
    // The raw key bytes appear only after the '#'.
    expect(`${url.origin}${url.pathname}${url.search}`).not.toContain(result.info.key);
    expect(base64UrlToBytes(result.info.key).length).toBe(32);
  });
});

describe('public site round-trip', () => {
  const html = new TextEncoder().encode('<link rel="stylesheet" href="style.css">');
  const css = new TextEncoder().encode('body{color:red}');

  const publish = (store: MemoryBlockStore) =>
    publishSite(
      [
        {
          path: 'index.html',
          contentType: 'text/html',
          size: html.length,
          content: streamOf(html, 64),
        },
        {
          path: 'style.css',
          contentType: 'text/css',
          size: css.length,
          content: streamOf(css, 64),
        },
      ],
      'index.html',
      store,
      peer,
      ORIGIN,
    );

  it('publishes a multi-file site and reopens each file lazily under one key', async () => {
    const store = new MemoryBlockStore();
    const result = await publish(store);

    const opened = await openShare(result.info, fetchFrom(store));
    expect(opened.kind).toBe('site');
    if (opened.kind !== 'site') throw new Error('expected a site');
    expect(opened.index).toBe('index.html');
    expect(opened.id).toBe(result.info.root);

    // Each file is decrypted on demand, byte-for-byte, under the one share key.
    const index = await opened.getFile('index.html');
    expect(index?.bytes).toEqual(html);
    expect(index?.contentType).toBe('text/html');
    expect((await opened.getFile('style.css'))?.bytes).toEqual(css);
    expect(await opened.getFile('missing.html')).toBeUndefined();
    await opened.close();

    // Every block address (root first) is pinned for the site to resolve.
    expect(result.pin[0]).toBe(result.info.root);
    expect(result.pin.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects an index that is not one of the published files', async () => {
    await expect(
      publishSite(
        [{ path: 'a.html', contentType: 'text/html', size: 1, content: streamOf(html, 64) }],
        'index.html',
        new MemoryBlockStore(),
        peer,
        ORIGIN,
      ),
    ).rejects.toThrow(/index/);
  });
});
