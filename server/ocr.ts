import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseSoilReportText } from "../src/ocr";

export function hasLocalOcrTools() {
  return Boolean(findExecutable("pdftoppm") && findExecutable("tesseract"));
}

export function ocrSoilPdf(bytes: Buffer) {
  const pdftoppm = findExecutable("pdftoppm");
  const tesseract = findExecutable("tesseract");
  if (!pdftoppm || !tesseract) throw new Error("Local scanned-PDF OCR requires pdftoppm and tesseract.");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "soilprove-ocr-"));
  try {
    const pdfPath = path.join(dir, "soil-report.pdf");
    const prefix = path.join(dir, "page");
    fs.writeFileSync(pdfPath, bytes);
    execFileSync(pdftoppm, ["-png", "-r", "220", pdfPath, prefix], { stdio: "ignore" });
    const images = fs
      .readdirSync(dir)
      .filter((name) => /^page-\d+\.png$/.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (images.length === 0) throw new Error("No PDF pages were rendered for OCR.");
    const text = images
      .map((image) => execFileSync(tesseract, [path.join(dir, image), "stdout", "--psm", "6"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))
      .join("\n");
    const result = parseSoilReportText(text, "pdf");
    return { ...result, warnings: [...result.warnings, `Scanned PDF OCR processed ${images.length} page(s) with local Tesseract.`] };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function findExecutable(name: string) {
  try {
    return execFileSync("which", [name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}
