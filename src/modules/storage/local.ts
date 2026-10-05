import { mkdir, stat, writeFile } from "fs/promises";
import path from "path";

function uploadRoot() {
  return path.resolve(process.cwd(), "data", "uploads");
}

export function localFilePath(storageKey: string) {
  const root = uploadRoot();
  const full = path.resolve(root, storageKey);
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid storage key");
  }
  return full;
}

export async function writeLocalFile(storageKey: string, bytes: Buffer) {
  const full = localFilePath(storageKey);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
}

export async function localFileSize(storageKey: string) {
  const file = await stat(localFilePath(storageKey));
  return file.size;
}
