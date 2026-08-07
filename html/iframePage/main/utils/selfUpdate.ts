// Self-update helpers: download the release zip with progress, unzip it in
// memory, and write the files into the extension folder the user picks once
// (the handle is persisted in IndexedDB so subsequent updates are one-click).
//
// MV3 cannot modify its own source files directly, but for an unpacked dev
// extension the File System Access API lets us write into the folder the
// extension was loaded from; chrome.runtime.reload() then picks up the new
// files. All heavy lifting runs inside the extension iframe (a secure
// chrome-extension:// context) so the FS Access API is always available.

import { logger } from './logger';

const DB_NAME = 'ajax-tools-self-update';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'extensionDir';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// File System Access API is typed loosely (lib es2016 has no declarations for
// it). We cast through any to avoid pulling in extra type packages.
type AnyDirHandle = any;

export function isFsAccessSupported(): boolean {
  return typeof (window as any).showDirectoryPicker === 'function';
}

export async function getStoredDirHandle(): Promise<AnyDirHandle | null> {
  try {
    const handle = await idbGet<AnyDirHandle>(HANDLE_KEY);
    return handle || null;
  } catch {
    return null;
  }
}

export async function storeDirHandle(handle: AnyDirHandle): Promise<void> {
  await idbSet(HANDLE_KEY, handle);
}

export async function pickExtensionDir(): Promise<AnyDirHandle | null> {
  if (!isFsAccessSupported()) {
    throw new Error('File System Access API is unavailable. Use a recent Chrome.');
  }
  const handle = await (window as any).showDirectoryPicker({
    mode: 'readwrite',
    id: 'smart-chrome-tool-extension-dir',
  });
  if (!handle) return null;
  await storeDirHandle(handle);
  return handle;
}

export async function ensureDirPermission(handle: AnyDirHandle): Promise<boolean> {
  const query = await handle.queryPermission?.({ mode: 'readwrite' });
  if (query === 'granted') return true;
  const requested = await handle.requestPermission?.({ mode: 'readwrite' });
  return requested === 'granted';
}

// Verify the picked folder actually contains this extension's manifest, so a
// mistaken pick never scatters files into the wrong directory.
export async function verifyExtensionDir(handle: AnyDirHandle): Promise<boolean> {
  try {
    const fileHandle = await handle.getFileHandle('manifest.json');
    const file = await fileHandle.getFile();
    const text = await file.text();
    const manifest = JSON.parse(text);
    const name = String(manifest?.name || '');
    logger.log('[MockKit Update] verifyExtensionDir', { name, version: manifest?.version });
    // Accept the current name "smart-chrome-toolkit", the legacy "MockKit*"
    // names (covers "MockKit", "MockKit v0.0.1", etc. from older versions),
    // and the original "Ajax Interceptor Tools" so users who installed before
    // any rename can still pick their existing folder.
    return name === 'smart-chrome-toolkit' || name.startsWith('MockKit') || name === 'Ajax Interceptor Tools';
  } catch (e) {
    logger.log('[MockKit Update] verifyExtensionDir failed', e);
    return false;
  }
}

// Stream-download a URL, invoking onProgress with bytes received / total.
export async function downloadWithProgress(
  url: string,
  onProgress: (received: number, total: number) => void
): Promise<ArrayBuffer> {
  logger.log('[MockKit Update] downloadWithProgress start', url);
  const response = await fetch(url);
  logger.log('[MockKit Update] fetch response', { status: response.status, ok: response.ok, headers: Object.fromEntries(response.headers.entries()) });
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }
  const totalHeader = response.headers.get('content-length');
  const total = totalHeader ? Number(totalHeader) : 0;
  logger.log('[MockKit Update] content-length', total);

  const reader = response.body?.getReader();
  if (!reader) {
    logger.log('[MockKit Update] no reader, falling back to arrayBuffer');
    const buffer = await response.arrayBuffer();
    onProgress(buffer.byteLength, buffer.byteLength);
    return buffer;
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      onProgress(received, total);
    }
  }
  logger.log('[MockKit Update] download complete', { received, chunks: chunks.length });

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let position = 0;
  for (const chunk of chunks) {
    merged.set(chunk, position);
    position += chunk.length;
  }
  return merged.buffer;
}

// Inflate a raw deflate stream (ZIP method 8) using the platform
// DecompressionStream, which speaks 'deflate-raw'.
async function inflateRaw(input: Uint8Array): Promise<Uint8Array> {
  const stream = new (DecompressionStream as any)('deflate-raw');
  const writer = stream.writable.getWriter();
  // Copy the subarray so we never hand a shared backing buffer to the stream.
  writer.write(input.slice());
  writer.close();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

// Parse a ZIP archive by walking its central directory. Supports the two
// methods our build produces: stored (0) and deflate-raw (8).
export async function unzip(buffer: ArrayBuffer): Promise<ZipEntry[]> {
  logger.log('[MockKit Update] unzip start', { byteLength: buffer.byteLength });
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Locate the End of Central Directory record by scanning from the tail.
  let eocdOffset = -1;
  const minScan = Math.max(0, buffer.byteLength - 65557);
  for (let i = buffer.byteLength - 22; i >= minScan; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('ZIP: End of Central Directory record not found.');
  }

  const numEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  const entries: {
    name: string;
    method: number;
    compressedData: Uint8Array;
  }[] = [];

  let offset = centralDirOffset;
  for (let i = 0; i < numEntries; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('ZIP: bad central directory entry signature.');
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraFieldLength = view.getUint16(offset + 30, true);
    const fileCommentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(
      bytes.subarray(offset + 46, offset + 46 + fileNameLength)
    );

    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new Error('ZIP: bad local file header signature.');
    }
    const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraFieldLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
    const compressedData = bytes.subarray(dataStart, dataStart + compressedSize);

    entries.push({ name, method, compressedData });
    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  const result: ZipEntry[] = [];
  for (const entry of entries) {
    if (entry.name.endsWith('/')) continue; // directory placeholder
    let data: Uint8Array;
    if (entry.method === 0) {
      data = entry.compressedData;
    } else if (entry.method === 8) {
      data = await inflateRaw(entry.compressedData);
    } else {
      throw new Error(`ZIP: unsupported compression method ${entry.method} for ${entry.name}`);
    }
    result.push({ name: entry.name, data });
  }
  logger.log('[MockKit Update] unzip complete', { entries: result.length, names: result.map(f => f.name).slice(0, 10) });
  return result;
}

// Write every entry into the chosen folder, creating intermediate directories
// as needed. ZIP paths use forward slashes as separators.
export async function writeFilesToDir(
  root: AnyDirHandle,
  files: ZipEntry[],
  onFileWritten?: (name: string, index: number, total: number) => void
): Promise<void> {
  logger.log('[MockKit Update] writeFilesToDir start', { fileCount: files.length });
  const total = files.length;
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const segments = file.name.split('/').filter(Boolean);
    const fileName = segments.pop();
    if (!fileName) continue;

    let dir: AnyDirHandle = root;
    for (const segment of segments) {
      dir = await dir.getDirectoryHandle(segment, { create: true });
    }
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file.data);
    await writable.close();
    if (onFileWritten) onFileWritten(file.name, i + 1, total);
  }
}
