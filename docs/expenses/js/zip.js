/* A minimal ZIP writer.

   Receipt scans go out as their own file so accounting can open the photos
   next to the workbook, and a zip is the only container every machine can
   open without installing anything. There is no zip writer in a browser and
   nothing bundled here provides one, so this builds the format by hand.

   Everything is stored, never deflated: the payload is JPEGs, which are
   already compressed — deflating them again costs time and saves nothing. */
(function () {
  'use strict';

  const TABLE = (function () {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  }());

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* DOS date and time. Everything gets one fixed stamp: the real capture time
     is not the file's business, and a fixed stamp keeps exports repeatable. */
  const DOS_TIME = 0;
  const DOS_DATE = 0x21;   // 1 January 1980, the epoch of the DOS field

  function Zip() {
    this.files = [];
  }

  /* `bytes` must be a Uint8Array. Names may contain "/" to make folders. */
  Zip.prototype.add = function (name, bytes) {
    this.files.push({ name: name, bytes: bytes, crc: crc32(bytes) });
  };

  Zip.prototype.build = function () {
    const encoder = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;

    for (const f of this.files) {
      const nameBytes = encoder.encode(f.name);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);   // local file header
      local.setUint16(4, 20, true);           // version needed
      local.setUint16(6, 0x0800, true);       // UTF-8 names
      local.setUint16(8, 0, true);            // stored, not deflated
      local.setUint16(10, DOS_TIME, true);
      local.setUint16(12, DOS_DATE, true);
      local.setUint32(14, f.crc, true);
      local.setUint32(18, f.bytes.length, true);
      local.setUint32(22, f.bytes.length, true);
      local.setUint16(26, nameBytes.length, true);
      local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), nameBytes, f.bytes);

      const dir = new DataView(new ArrayBuffer(46));
      dir.setUint32(0, 0x02014b50, true);     // central directory header
      dir.setUint16(4, 20, true);             // version made by
      dir.setUint16(6, 20, true);             // version needed
      dir.setUint16(8, 0x0800, true);
      dir.setUint16(10, 0, true);
      dir.setUint16(12, DOS_TIME, true);
      dir.setUint16(14, DOS_DATE, true);
      dir.setUint32(16, f.crc, true);
      dir.setUint32(20, f.bytes.length, true);
      dir.setUint32(24, f.bytes.length, true);
      dir.setUint16(28, nameBytes.length, true);
      dir.setUint32(42, offset, true);        // where its local header sits
      central.push(new Uint8Array(dir.buffer), nameBytes);

      offset += 30 + nameBytes.length + f.bytes.length;
    }

    let centralSize = 0;
    for (const c of central) centralSize += c.length;

    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);       // end of central directory
    end.setUint16(8, this.files.length, true);
    end.setUint16(10, this.files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]),
                    { type: 'application/zip' });
  };

  window.Zip = Zip;
}());
