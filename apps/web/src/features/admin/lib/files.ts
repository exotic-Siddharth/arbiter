const BOM = String.fromCharCode(0xfeff);

/** Reads a File as UTF-8 text (Blob.text where available, FileReader otherwise). */
export function readFileText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsText(file);
  });
}

/**
 * Test data as stored by the judge: a leading BOM is dropped and Windows line endings become
 * "\n" (the same normalisation the seed applies, R9), so files made on Windows judge alike.
 */
export function normalizeTestText(text: string): string {
  const withoutBom = text.startsWith(BOM) ? text.slice(1) : text;
  return withoutBom.replace(/\r\n?/g, '\n');
}
