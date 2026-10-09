import type { Column } from "drizzle-orm";
import { toSnakeCase } from "drizzle-orm/casing";

/** Database column name; columns declared without an explicit name are snake_cased by the `casing` option. */
export function sqlColumnName(column: Pick<Column, "name" | "keyAsName">): string {
  return column.keyAsName ? toSnakeCase(column.name) : column.name;
}
