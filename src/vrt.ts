import type { Prescription, SoilZone } from "./domain";

export type VrtBundle = {
  filename: string;
  bytes: Uint8Array;
  files: string[];
};

type Point = [number, number];

const textEncoder = new TextEncoder();

export function createVrtBundle(prescription: Prescription): VrtBundle {
  if (prescription.status === "draft") {
    throw new Error("Only a signed prescription can be exported as VRT.");
  }

  const records = prescription.zones.map((zone) => {
    const rec = prescription.recommendations.find((item) => item.zoneId === zone.zoneId);
    if (!rec) throw new Error(`No recommendation for ${zone.zoneId}.`);
    return {
      zoneId: zone.zoneId,
      nitrogenRate: Math.round(rec.nitrogenLbsPerAcre),
      polygon: parsePolygonWkt(zone)
    };
  });
  const stem = `${safeName(prescription.profile.farmName)}-${safeName(prescription.profile.fieldName)}-${prescription.profile.seasonYear}`;
  const files = new Map<string, Uint8Array>();
  const shape = createShapeFiles(records);

  files.set(`${stem}.shp`, shape.shp);
  files.set(`${stem}.shx`, shape.shx);
  files.set(`${stem}.dbf`, createDbf(records));
  files.set(`${stem}.prj`, textEncoder.encode('GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'));

  return {
    filename: `${stem}-john-deere-vrt.zip`,
    bytes: createZip(files),
    files: [...files.keys()]
  };
}

function parsePolygonWkt(zone: SoilZone): Point[] {
  const match = zone.polygonWkt.match(/POLYGON\s*\(\((.+)\)\)/i);
  if (!match) return fallbackPolygon(zone.zoneId);

  const points = match[1]
    .split(",")
    .map((pair) => pair.trim().split(/\s+/).map(Number) as Point)
    .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (points.length < 4) return fallbackPolygon(zone.zoneId);
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) points.push(first);
  return points;
}

function fallbackPolygon(zoneId: string): Point[] {
  const offset = Math.max(0, zoneId.charCodeAt(zoneId.length - 1) - 65) * 12;
  return [
    [offset, 0],
    [offset + 10, 0],
    [offset + 10, 10],
    [offset, 10],
    [offset, 0]
  ];
}

function createShapeFiles(records: Array<{ polygon: Point[] }>) {
  const boxes = records.map((record) => bounds(record.polygon));
  const globalBox = combineBounds(boxes);
  const shpRecords = records.map((record, index) => polygonRecord(index + 1, record.polygon));
  const shpLength = 100 + shpRecords.reduce((sum, record) => sum + record.length, 0);
  const shxLength = 100 + records.length * 8;

  const shp = new ByteWriter(shpLength);
  writeShapeHeader(shp, shpLength, globalBox);
  for (const record of shpRecords) shp.writeBytes(record);

  const shx = new ByteWriter(shxLength);
  writeShapeHeader(shx, shxLength, globalBox);
  let offsetWords = 50;
  for (const record of shpRecords) {
    const contentWords = (record.length - 8) / 2;
    shx.writeInt32BE(offsetWords);
    shx.writeInt32BE(contentWords);
    offsetWords += record.length / 2;
  }

  return { shp: shp.bytes(), shx: shx.bytes() };
}

function writeShapeHeader(writer: ByteWriter, byteLength: number, box: [number, number, number, number]) {
  writer.writeInt32BE(9994);
  for (let i = 0; i < 5; i += 1) writer.writeInt32BE(0);
  writer.writeInt32BE(byteLength / 2);
  writer.writeInt32LE(1000);
  writer.writeInt32LE(5);
  writer.writeFloat64LE(box[0]);
  writer.writeFloat64LE(box[1]);
  writer.writeFloat64LE(box[2]);
  writer.writeFloat64LE(box[3]);
  writer.writeFloat64LE(0);
  writer.writeFloat64LE(0);
  writer.writeFloat64LE(0);
  writer.writeFloat64LE(0);
}

function polygonRecord(recordNumber: number, points: Point[]) {
  const box = bounds(points);
  const contentLength = 4 + 32 + 4 + 4 + 4 + points.length * 16;
  const writer = new ByteWriter(8 + contentLength);
  writer.writeInt32BE(recordNumber);
  writer.writeInt32BE(contentLength / 2);
  writer.writeInt32LE(5);
  writer.writeFloat64LE(box[0]);
  writer.writeFloat64LE(box[1]);
  writer.writeFloat64LE(box[2]);
  writer.writeFloat64LE(box[3]);
  writer.writeInt32LE(1);
  writer.writeInt32LE(points.length);
  writer.writeInt32LE(0);
  for (const point of points) {
    writer.writeFloat64LE(point[0]);
    writer.writeFloat64LE(point[1]);
  }
  return writer.bytes();
}

function createDbf(records: Array<{ zoneId: string; nitrogenRate: number }>) {
  const fieldDescriptorsLength = 32 * 2 + 1;
  const headerLength = 32 + fieldDescriptorsLength;
  const recordLength = 1 + 10 + 10;
  const writer = new ByteWriter(headerLength + records.length * recordLength + 1);
  const now = new Date();

  writer.writeUint8(0x03);
  writer.writeUint8(now.getFullYear() - 1900);
  writer.writeUint8(now.getMonth() + 1);
  writer.writeUint8(now.getDate());
  writer.writeUint32LE(records.length);
  writer.writeUint16LE(headerLength);
  writer.writeUint16LE(recordLength);
  writer.writeBytes(new Uint8Array(20));
  writeField(writer, "ZONE_ID", "C", 10, 0);
  writeField(writer, "N_RATE_LBS", "N", 10, 0);
  writer.writeUint8(0x0d);

  for (const record of records) {
    writer.writeUint8(0x20);
    writer.writeAscii(record.zoneId.slice(0, 10).padEnd(10, " "));
    writer.writeAscii(String(record.nitrogenRate).padStart(10, " "));
  }
  writer.writeUint8(0x1a);
  return writer.bytes();
}

function writeField(writer: ByteWriter, name: string, type: string, length: number, decimals: number) {
  writer.writeAscii(name.padEnd(11, "\0").slice(0, 11));
  writer.writeAscii(type);
  writer.writeBytes(new Uint8Array(4));
  writer.writeUint8(length);
  writer.writeUint8(decimals);
  writer.writeBytes(new Uint8Array(14));
}

function createZip(files: Map<string, Uint8Array>) {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const [filename, data] of files.entries()) {
    const nameBytes = textEncoder.encode(filename);
    const crc = crc32(data);
    const local = new ByteWriter(30 + nameBytes.length);
    local.writeUint32LE(0x04034b50);
    local.writeUint16LE(20);
    local.writeUint16LE(0);
    local.writeUint16LE(0);
    local.writeUint16LE(0);
    local.writeUint16LE(0);
    local.writeUint32LE(crc);
    local.writeUint32LE(data.length);
    local.writeUint32LE(data.length);
    local.writeUint16LE(nameBytes.length);
    local.writeUint16LE(0);
    local.writeBytes(nameBytes);
    chunks.push(local.bytes(), data);

    const header = new ByteWriter(46 + nameBytes.length);
    header.writeUint32LE(0x02014b50);
    header.writeUint16LE(20);
    header.writeUint16LE(20);
    header.writeUint16LE(0);
    header.writeUint16LE(0);
    header.writeUint16LE(0);
    header.writeUint16LE(0);
    header.writeUint32LE(crc);
    header.writeUint32LE(data.length);
    header.writeUint32LE(data.length);
    header.writeUint16LE(nameBytes.length);
    header.writeUint16LE(0);
    header.writeUint16LE(0);
    header.writeUint16LE(0);
    header.writeUint16LE(0);
    header.writeUint32LE(0);
    header.writeUint32LE(offset);
    header.writeBytes(nameBytes);
    central.push(header.bytes());
    offset += local.bytes().length + data.length;
  }

  const centralLength = central.reduce((sum, item) => sum + item.length, 0);
  const end = new ByteWriter(22);
  end.writeUint32LE(0x06054b50);
  end.writeUint16LE(0);
  end.writeUint16LE(0);
  end.writeUint16LE(files.size);
  end.writeUint16LE(files.size);
  end.writeUint32LE(centralLength);
  end.writeUint32LE(offset);
  end.writeUint16LE(0);
  return concat([...chunks, ...central, end.bytes()]);
}

function bounds(points: Point[]): [number, number, number, number] {
  return [
    Math.min(...points.map((point) => point[0])),
    Math.min(...points.map((point) => point[1])),
    Math.max(...points.map((point) => point[0])),
    Math.max(...points.map((point) => point[1]))
  ];
}

function combineBounds(boxes: Array<[number, number, number, number]>): [number, number, number, number] {
  return [
    Math.min(...boxes.map((box) => box[0])),
    Math.min(...boxes.map((box) => box[1])),
    Math.max(...boxes.map((box) => box[2])),
    Math.max(...boxes.map((box) => box[3]))
  ];
}

function concat(chunks: Uint8Array[]) {
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function crc32(data: Uint8Array) {
  let crc = -1;
  for (const byte of data) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const crcTable = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

class ByteWriter {
  private view: DataView;
  private offset = 0;

  constructor(length: number) {
    this.view = new DataView(new ArrayBuffer(length));
  }

  bytes() {
    return new Uint8Array(this.view.buffer);
  }

  writeUint8(value: number) {
    this.view.setUint8(this.offset, value);
    this.offset += 1;
  }

  writeInt32BE(value: number) {
    this.view.setInt32(this.offset, value, false);
    this.offset += 4;
  }

  writeInt32LE(value: number) {
    this.view.setInt32(this.offset, value, true);
    this.offset += 4;
  }

  writeUint16LE(value: number) {
    this.view.setUint16(this.offset, value, true);
    this.offset += 2;
  }

  writeUint32LE(value: number) {
    this.view.setUint32(this.offset, value, true);
    this.offset += 4;
  }

  writeFloat64LE(value: number) {
    this.view.setFloat64(this.offset, value, true);
    this.offset += 8;
  }

  writeAscii(value: string) {
    for (let index = 0; index < value.length; index += 1) this.writeUint8(value.charCodeAt(index));
  }

  writeBytes(value: Uint8Array) {
    this.bytes().set(value, this.offset);
    this.offset += value.length;
  }
}

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "soilprove";
}
