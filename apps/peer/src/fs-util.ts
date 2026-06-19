/** Node's "file/dir does not exist" error, the one outcome our stores treat as
 *  "not found" rather than a failure (mirrors the OPFS stores' NotFoundError). */
export function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT'
  );
}
