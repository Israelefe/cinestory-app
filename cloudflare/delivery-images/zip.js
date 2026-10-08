import { Buffer } from 'node:buffer';
import { mediaError, requireMediaKey } from './media-protocol.js';

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let value = n;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[n] = value >>> 0;
}

export function safeEntryName(value, index, seen) {
  const leaf = String(value || 'photograph').replace(/^.*[\\/]/, '').replace(/[\u0000-\u001f<>:"|?*]/g, '_').replace(/[. ]+$/g, '').slice(0, 160) || `photograph-${index + 1}.jpg`;
  let name = leaf;
  let suffix = 2;
  while (seen.has(name.toLowerCase())) {
    const dot = leaf.lastIndexOf('.');
    name = dot > 0 ? `${leaf.slice(0, dot)}-${suffix}${leaf.slice(dot)}` : `${leaf}-${suffix}`;
    suffix += 1;
  }
  seen.add(name.toLowerCase());
  return name;
}

function stamp(value) {
  const date = new Date(value || Date.now());
  return { time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2), date: ((Math.min(2107, Math.max(1980, date.getFullYear())) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate() };
}

function localHeader(entry) {
  const filename = Buffer.from(entry.name, 'utf8');
  const extra = Buffer.alloc(20);
  extra.writeUInt16LE(1); extra.writeUInt16LE(16, 2);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50); header.writeUInt16LE(45, 4); header.writeUInt16LE(0x0808, 6);
  header.writeUInt16LE(entry.time, 10); header.writeUInt16LE(entry.date, 12);
  header.writeUInt32LE(0xffffffff, 18); header.writeUInt32LE(0xffffffff, 22);
  header.writeUInt16LE(filename.length, 26); header.writeUInt16LE(extra.length, 28);
  return Buffer.concat([header, filename, extra]);
}

function descriptor(entry) {
  const value = Buffer.alloc(24);
  value.writeUInt32LE(0x08074b50); value.writeUInt32LE(entry.crc >>> 0, 4);
  value.writeBigUInt64LE(entry.size, 8); value.writeBigUInt64LE(entry.size, 16);
  return value;
}

function centralHeader(entry) {
  const filename = Buffer.from(entry.name, 'utf8');
  const extra = Buffer.alloc(28);
  extra.writeUInt16LE(1); extra.writeUInt16LE(24, 2);
  extra.writeBigUInt64LE(entry.size, 4); extra.writeBigUInt64LE(entry.size, 12); extra.writeBigUInt64LE(entry.offset, 20);
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50); header.writeUInt16LE(45, 4); header.writeUInt16LE(45, 6); header.writeUInt16LE(0x0808, 8);
  header.writeUInt16LE(entry.time, 12); header.writeUInt16LE(entry.date, 14); header.writeUInt32LE(entry.crc >>> 0, 16);
  header.writeUInt32LE(0xffffffff, 20); header.writeUInt32LE(0xffffffff, 24);
  header.writeUInt16LE(filename.length, 28); header.writeUInt16LE(extra.length, 30); header.writeUInt32LE(0xffffffff, 42);
  return Buffer.concat([header, filename, extra]);
}

function endRecord(count, size, offset) {
  const record = Buffer.alloc(56);
  record.writeUInt32LE(0x06064b50); record.writeBigUInt64LE(44n, 4); record.writeUInt16LE(45, 12); record.writeUInt16LE(45, 14);
  record.writeBigUInt64LE(BigInt(count), 24); record.writeBigUInt64LE(BigInt(count), 32); record.writeBigUInt64LE(size, 40); record.writeBigUInt64LE(offset, 48);
  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50); locator.writeBigUInt64LE(offset + size, 8); locator.writeUInt32LE(1, 16);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(0xffff, 8); end.writeUInt16LE(0xffff, 10); end.writeUInt32LE(0xffffffff, 12); end.writeUInt32LE(0xffffffff, 16);
  return Buffer.concat([record, locator, end]);
}

export async function prepareZipFiles(bucket, files) {
  if (!Array.isArray(files) || !files.length || files.length > 1000) throw mediaError('Choose between 1 and 1,000 photographs.', 400, 'ARCHIVE_FILES_INVALID');
  const ownerPrefix = String(files[0]?.key || '').split('/').slice(0, 3).join('/') + '/';
  if (!ownerPrefix.startsWith('veylo/users/')) throw mediaError('This gallery download is not available.', 403, 'ARCHIVE_SCOPE_INVALID');
  const prepared = [];
  const seen = new Set();
  for (let offset = 0; offset < files.length; offset += 5) {
    const rows = await Promise.all(files.slice(offset, offset + 5).map(async (file, index) => {
      requireMediaKey(file?.key);
      if (!file.key.startsWith(ownerPrefix)) throw mediaError('This gallery contains a photograph outside the approved account.', 403, 'ARCHIVE_SCOPE_INVALID');
      const head = await bucket.head(file.key);
      if (!head || !head.size) throw mediaError('A photograph in this gallery is no longer available.', 404, 'MEDIA_NOT_FOUND');
      return { key: file.key, originalName: file.name, index: offset + index, bytes: head.size, etag: head.etag, lastModified: head.uploaded?.toISOString() };
    }));
    for (const row of rows) {
      const { originalName, index, ...metadata } = row;
      prepared.push({ ...metadata, name: safeEntryName(originalName, index, seen) });
    }
  }
  return prepared;
}

export function zipContentLength(files) {
  return files.reduce((size, file) => size + BigInt(file.bytes) + 30n + 20n + 24n + 46n + 28n + BigInt(Buffer.byteLength(file.name)) * 2n, 98n);
}

export function zipStream(bucket, files) {
  async function* chunks() {
    let offset = 0n;
    const entries = [];
    for (const file of files) {
      const object = await bucket.get(file.key);
      if (!object || object.etag !== file.etag || object.size !== file.bytes) throw mediaError('A photograph changed while the download was being prepared. Return to the gallery and retry.', 409, 'MEDIA_CHANGED');
      const entry = { ...file, ...stamp(file.lastModified), offset, size: 0n, crc: 0xffffffff };
      const header = localHeader(entry);
      yield header;
      offset += BigInt(header.length);
      for await (const chunk of object.body) {
        entry.size += BigInt(chunk.byteLength);
        for (const byte of chunk) entry.crc = crcTable[(entry.crc ^ byte) & 0xff] ^ (entry.crc >>> 8);
        offset += BigInt(chunk.byteLength);
        yield chunk;
      }
      if (entry.size !== BigInt(file.bytes)) throw mediaError('A photograph could not be downloaded completely.', 502, 'MEDIA_INCOMPLETE');
      entry.crc = (entry.crc ^ 0xffffffff) >>> 0;
      yield descriptor(entry);
      offset += 24n;
      entries.push(entry);
    }
    const directoryOffset = offset;
    for (const entry of entries) { const header = centralHeader(entry); yield header; offset += BigInt(header.length); }
    yield endRecord(entries.length, offset - directoryOffset, directoryOffset);
  }
  const iterator = chunks();
  return new ReadableStream({
    async pull(controller) {
      try { const next = await iterator.next(); if (next.done) controller.close(); else controller.enqueue(next.value); }
      catch (error) { controller.error(error); await iterator.return(); }
    },
    async cancel() { await iterator.return(); }
  }, { highWaterMark: 1 });
}
