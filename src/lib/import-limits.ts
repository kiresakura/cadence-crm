/** Limits of one contact import, shared by the server checks and the upload screen. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

/** The limits as written in the interface and in error messages. */
export const IMPORT_SIZE_LIMIT = "2 MB";
export const IMPORT_ROW_LIMIT = `${MAX_IMPORT_ROWS.toLocaleString("en-US")} rows`;
