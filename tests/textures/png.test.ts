import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, encodePng } from '../../bench/png';

describe('PNG writer', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes a decodable RGBA image', () => {
    const w = 3;
    const h = 2;
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 37) & 255;
    const png = encodePng(rgba, w, h);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    // Walk the chunks, check each CRC, and gather the image data.
    let pos = 8;
    const types: string[] = [];
    const idat: Buffer[] = [];
    while (pos < png.length) {
      const len = png.readUInt32BE(pos);
      const type = png.toString('ascii', pos + 4, pos + 8);
      const body = png.subarray(pos + 8, pos + 8 + len);
      expect(png.readUInt32BE(pos + 8 + len)).toBe(crc32(png.subarray(pos + 4, pos + 8 + len)));
      types.push(type);
      if (type === 'IHDR') {
        expect(body.readUInt32BE(0)).toBe(w);
        expect(body.readUInt32BE(4)).toBe(h);
        expect(body[8]).toBe(8);
        expect(body[9]).toBe(6);
      }
      if (type === 'IDAT') idat.push(body);
      pos += 12 + len;
    }
    expect(types).toEqual(['IHDR', 'IDAT', 'IEND']);

    const raw = inflateSync(Buffer.concat(idat));
    expect(raw.length).toBe((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) {
      expect(raw[y * (w * 4 + 1)]).toBe(0);
      expect([...raw.subarray(y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1))]).toEqual([...rgba.subarray(y * w * 4, (y + 1) * w * 4)]);
    }
  });

  it('rejects a buffer of the wrong size', () => {
    expect(() => encodePng(new Uint8Array(10), 2, 2)).toThrow();
  });
});
