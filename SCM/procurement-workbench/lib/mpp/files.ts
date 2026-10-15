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
