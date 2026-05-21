import test from "node:test";
import assert from "node:assert/strict";
import { defaultProfile, defaultZones, generatePrescription, signPrescription } from "../src/domain";
import { createVrtBundle } from "../src/vrt";

test("exports a real VRT zip with shapefile bundle members", () => {
  const prescription = signPrescription(generatePrescription(defaultProfile(), defaultZones(), "test-prescription"), "Reviewed.");
  const bundle = createVrtBundle(prescription);

  assert.deepEqual(
    bundle.files.map((file) => file.split(".").pop()).sort(),
    ["dbf", "prj", "shp", "shx"]
  );
});

test("VRT zip has PK header", () => {
  const prescription = signPrescription(generatePrescription(defaultProfile(), defaultZones(), "test-prescription"), "Reviewed.");
  const bundle = createVrtBundle(prescription);

  assert.equal(Buffer.from(bundle.bytes.slice(0, 2)).toString("utf8"), "PK");
});

test("VRT DBF includes N_RATE_LBS field name", () => {
  const prescription = signPrescription(generatePrescription(defaultProfile(), defaultZones(), "test-prescription"), "Reviewed.");
  const bundle = createVrtBundle(prescription);

  assert.equal(Buffer.from(bundle.bytes).includes("N_RATE_LBS"), true);
});

test("VRT DBF N_RATE_LBS values match signed prescription recommendations", () => {
  const prescription = signPrescription(generatePrescription(defaultProfile(), defaultZones(), "test-prescription"), "Reviewed.");
  const bundle = createVrtBundle(prescription);
  const dbf = extractZipMember(bundle.bytes, ".dbf");
  const records = readDbfRecords(dbf);
  const expected = new Map(prescription.recommendations.map((rec) => [rec.zoneId, rec.nitrogenLbsPerAcre]));

  assert.equal(records.length, prescription.zones.length);
  for (const record of records) {
    assert.equal(record.N_RATE_LBS, expected.get(String(record.ZONE_ID)));
  }
});

test("draft prescriptions cannot be exported", () => {
  const prescription = generatePrescription(defaultProfile(), defaultZones(), "test-prescription");

  assert.throws(() => createVrtBundle(prescription), /signed/);
});

function extractZipMember(bytes: Uint8Array, suffix: string): Uint8Array {
  const buffer = Buffer.from(bytes);
  let offset = 0;

  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const dataOffset = offset + 30 + nameLength + extraLength;
    const name = buffer.toString("utf8", offset + 30, offset + 30 + nameLength);

    assert.equal(compressionMethod, 0, `${name} should be stored without compression in the test parser`);
    assert.equal(compressedSize, uncompressedSize, `${name} compressed size should match uncompressed size`);
    if (name.endsWith(suffix)) return buffer.subarray(dataOffset, dataOffset + uncompressedSize);

    offset = dataOffset + compressedSize;
  }

  throw new Error(`ZIP member ending ${suffix} not found.`);
}

function readDbfRecords(bytes: Uint8Array): Array<Record<string, string | number>> {
  const buffer = Buffer.from(bytes);
  assert.equal(buffer[0], 0x03);
  const recordCount = buffer.readUInt32LE(4);
  const headerLength = buffer.readUInt16LE(8);
  const recordLength = buffer.readUInt16LE(10);
  const fields: Array<{ name: string; type: string; length: number; offset: number }> = [];
  let fieldOffset = 1;

  for (let offset = 32; offset < headerLength - 1; offset += 32) {
    const nameEnd = buffer.indexOf(0, offset);
    const name = buffer.toString("ascii", offset, nameEnd === -1 || nameEnd > offset + 11 ? offset + 11 : nameEnd);
    const type = buffer.toString("ascii", offset + 11, offset + 12);
    const length = buffer[offset + 16];
    fields.push({ name, type, length, offset: fieldOffset });
    fieldOffset += length;
  }

  return Array.from({ length: recordCount }, (_, index) => {
    const recordOffset = headerLength + index * recordLength;
    assert.equal(buffer[recordOffset], 0x20);
    return Object.fromEntries(
      fields.map((field) => {
        const raw = buffer.toString("ascii", recordOffset + field.offset, recordOffset + field.offset + field.length).trim();
        return [field.name, field.type === "N" ? Number(raw) : raw];
      })
    );
  });
}
