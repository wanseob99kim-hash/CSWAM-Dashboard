// Picks the newest Master Production Plan among the files in the MPP folder.

export type MppFileCandidate = {
  /** Path relative to the MPP folder, e.g. "2026/WK42 MPP 2026_R0.xlsx". */
  path: string;
  modifiedMs: number;
};

export type MppFileVersion = {
  year: number | null;
  week: number | null;
  revision: number | null;
};

const SPREADSHEET = /\.xlsx?$/i;
/** Excel writes "~$name.xlsx" lock files next to open workbooks. */
const LOCK_FILE = /(^|[\\/])~\$/;

/** Reads "WK42 MPP 2026_R0.xlsx" as week 42 of 2026, revision 0. Missing parts are null. */
export function mppFileVersion(path: string): MppFileVersion {
  const name = path.split(/[\\/]/).pop() ?? path;
  const week = /\bWK\s*(\d{1,2})/i.exec(name)?.[1];
  // Not \b: "2026_R0" has no word boundary between the year and the underscore.
  const year = /(?<!\d)(20\d{2})(?!\d)/.exec(name)?.[1] ?? /(?:^|[\\/])(20\d{2})[\\/]/.exec(path)?.[1];
  const revision = /[_\s-]R(\d+)\b/i.exec(name)?.[1];
  return {
    year: year ? Number(year) : null,
    week: week ? Number(week) : null,
    revision: revision ? Number(revision) : null,
  };
}

/**
 * Newest plan first by year, week, and revision from the file name; files whose
 * names do not say (or tie) fall back to the most recently modified.
 */
export function pickLatestMppFile(candidates: readonly MppFileCandidate[]): MppFileCandidate | null {
  const plans = candidates.filter((file) => SPREADSHEET.test(file.path) && !LOCK_FILE.test(file.path));
  const rank = (file: MppFileCandidate) => {
    const { year, week, revision } = mppFileVersion(file.path);
    return [year ?? -1, week ?? -1, revision ?? -1, file.modifiedMs];
  };
  return (
    [...plans].sort((left, right) => {
      const a = rank(left);
      const b = rank(right);
      for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return b[index] - a[index];
      return 0;
    })[0] ?? null
  );
}

export type MppWeekOption<T> = { year: number; week: number; file: T | null };

const isNewer = (left: MppFileVersion & { uploadedAt: string }, right: MppFileVersion & { uploadedAt: string }) =>
  (left.revision ?? -1) !== (right.revision ?? -1) ? (left.revision ?? -1) > (right.revision ?? -1) : left.uploadedAt > right.uploadedAt;

/**
 * One choice per plan week, newest first: every week of the newest plan's year
 * up to its week (weeks without an uploaded file have `file: null`), then the
 * uploaded weeks of earlier years. A week with several revisions keeps the
 * highest revision, then the latest upload.
 */
export function mppWeekOptions<T extends { fileName: string; uploadedAt: string }>(files: readonly T[]): MppWeekOption<T>[] {
  const byWeek = new Map<string, { year: number; week: number; file: T; version: MppFileVersion & { uploadedAt: string } }>();
  for (const file of files) {
    if (!SPREADSHEET.test(file.fileName) || LOCK_FILE.test(file.fileName)) continue;
    const version = { ...mppFileVersion(file.fileName), uploadedAt: file.uploadedAt };
    if (version.year === null || version.week === null) continue;
    const key = `${version.year}-${version.week}`;
    const current = byWeek.get(key);
    if (!current || isNewer(version, current.version)) byWeek.set(key, { year: version.year, week: version.week, file, version });
  }
  const uploaded = [...byWeek.values()].sort((left, right) => right.year - left.year || right.week - left.week);
  if (!uploaded.length) return [];
  const newest = uploaded[0];
  const options: MppWeekOption<T>[] = [];
  for (let week = newest.week; week >= 1; week -= 1) {
    options.push({ year: newest.year, week, file: byWeek.get(`${newest.year}-${week}`)?.file ?? null });
  }
  for (const item of uploaded) if (item.year < newest.year) options.push({ year: item.year, week: item.week, file: item.file });
  return options;
}
