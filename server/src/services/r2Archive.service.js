import { getR2ObjectStream, headR2Object } from './r2.service.js';

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();

function crcUpdate(crc, buffer) {
  let value = crc;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return value >>> 0;
}

function dosDateTime(date = new Date()) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function safeEntryName(value, index, seen) {
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

function localHeader(name, time, date) {
  const filename = Buffer.from(name, 'utf8');
  const extra = Buffer.alloc(20);
  extra.writeUInt16LE(0x0001, 0);
  extra.writeUInt16LE(16, 2);
  extra.writeBigUInt64LE(0n, 4);
  extra.writeBigUInt64LE(0n, 12);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(45, 4);
  header.writeUInt16LE(0x0808, 6); // UTF-8 names and trailing data descriptor.
  header.writeUInt16LE(0, 8); // Store without recompression.
  header.writeUInt16LE(time, 10);
  header.writeUInt16LE(date, 12);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(0xffffffff, 18);
  header.writeUInt32LE(0xffffffff, 22);
  header.writeUInt16LE(filename.length, 26);
  header.writeUInt16LE(extra.length, 28);
  return Buffer.concat([header, filename, extra]);
}

function dataDescriptor(crc, size) {
  const descriptor = Buffer.alloc(24);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(crc >>> 0, 4);
  descriptor.writeBigUInt64LE(size, 8);
  descriptor.writeBigUInt64LE(size, 16);
  return descriptor;
}

function centralHeader(entry) {
  const filename = Buffer.from(entry.name, 'utf8');
  const extra = Buffer.alloc(28);
  extra.writeUInt16LE(0x0001, 0);
  extra.writeUInt16LE(24, 2);
  extra.writeBigUInt64LE(entry.size, 4);
  extra.writeBigUInt64LE(entry.size, 12);
  extra.writeBigUInt64LE(entry.offset, 20);
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(45, 4);
  header.writeUInt16LE(45, 6);
  header.writeUInt16LE(0x0808, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(entry.time, 12);
  header.writeUInt16LE(entry.date, 14);
  header.writeUInt32LE(entry.crc >>> 0, 16);
  header.writeUInt32LE(0xffffffff, 20);
  header.writeUInt32LE(0xffffffff, 24);
  header.writeUInt16LE(filename.length, 28);
  header.writeUInt16LE(extra.length, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(0xffffffff, 42);
  return Buffer.concat([header, filename, extra]);
}

function zip64End(count, directorySize, directoryOffset) {
  const record = Buffer.alloc(56);
  record.writeUInt32LE(0x06064b50, 0);
  record.writeBigUInt64LE(44n, 4);
  record.writeUInt16LE(45, 12);
  record.writeUInt16LE(45, 14);
  record.writeUInt32LE(0, 16);
  record.writeUInt32LE(0, 20);
  record.writeBigUInt64LE(BigInt(count), 24);
  record.writeBigUInt64LE(BigInt(count), 32);
  record.writeBigUInt64LE(directorySize, 40);
  record.writeBigUInt64LE(directoryOffset, 48);
  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50, 0);
  locator.writeUInt32LE(0, 4);
  locator.writeBigUInt64LE(directoryOffset + directorySize, 8);
  locator.writeUInt32LE(1, 16);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0xffff, 8);
  end.writeUInt16LE(0xffff, 10);
  end.writeUInt32LE(0xffffffff, 12);
  end.writeUInt32LE(0xffffffff, 16);
  return Buffer.concat([record, locator, end]);
}

async function write(res, buffer) {
  if (!res.write(buffer)) await new Promise((resolve, reject) => {
    res.once('drain', resolve);
    res.once('error', reject);
  });
}

export async function streamR2Zip(files, res, baseFilename = 'veylo-photographs') {
  const prepared = [];
  const usedNames = new Set();
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const head = await headR2Object(file.key);
    prepared.push({ key: file.key, name: safeEntryName(file.name, index, usedNames), bytes: head.bytes, lastModified: head.lastModified });
  }
  const safeFilename = `${String(baseFilename || 'veylo-photographs').replace(/[^a-z0-9_-]/gi, '-').slice(0, 80) || 'veylo-photographs'}.zip`;
  res.status(200);
  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  let offset = 0n;
  const entries = [];
  for (const file of prepared) {
    const stamp = dosDateTime(file.lastModified ? new Date(file.lastModified) : new Date());
    const entry = { ...file, time: stamp.time, date: stamp.date, offset, size: 0n, crc: 0xffffffff };
    const header = localHeader(entry.name, entry.time, entry.date);
    await write(res, header);
    offset += BigInt(header.length);
    const source = await getR2ObjectStream(entry.key);
    for await (const value of source.body) {
      const chunk = Buffer.from(value);
      entry.size += BigInt(chunk.length);
      entry.crc = crcUpdate(entry.crc, chunk);
      offset += BigInt(chunk.length);
      await write(res, chunk);
    }
    entry.crc = (entry.crc ^ 0xffffffff) >>> 0;
    await write(res, dataDescriptor(entry.crc, entry.size));
    offset += 24n;
    entries.push(entry);
  }
  const directoryOffset = offset;
  for (const entry of entries) {
    const header = centralHeader(entry);
    await write(res, header);
    offset += BigInt(header.length);
  }
  const directorySize = offset - directoryOffset;
  await write(res, zip64End(entries.length, directorySize, directoryOffset));
  res.end();
}
