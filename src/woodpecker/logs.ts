import type { WpLogEntry } from './types.js';

export const DEFAULT_TAIL = 200;
export const MAX_LINES = 1000;
export const MAX_CHARS = 50_000;
export const MAX_LINE_CHARS = 2000;

/** stdout and stderr. Exit-code (2), metadata (3) and progress (4) entries aren't log text. */
const TEXT_TYPES: ReadonlySet<number> = new Set([0, 1]);

export interface LogLine {
  number: number;
  text: string;
}

export interface LogQuery {
  tail: number;
  grep?: string;
  fromLine?: number;
  toLine?: number;
}

export interface LogSelection {
  totalLines: number;
  matchedLines: number;
  returnedLines: number;
  omittedLines: number;
  note?: string;
  lines: string[];
}

export function decodeLogEntries(entries: WpLogEntry[]): LogLine[] {
  const texts = [...entries]
    .filter((e) => TEXT_TYPES.has(e.type))
    .sort((a, b) => a.line - b.line)
    .flatMap((e) =>
      Buffer.from(e.data ?? '', 'base64')
        .toString('utf8')
        .replace(/\r?\n$/, '')
        .split(/\r?\n/),
    );
  return texts.map((text, index) => ({ number: index + 1, text }));
}

function format(line: LogLine): string {
  const text =
    line.text.length > MAX_LINE_CHARS ? `${line.text.slice(0, MAX_LINE_CHARS)} [line truncated]` : line.text;
  return `${line.number}: ${text}`;
}

export function selectLogLines(lines: LogLine[], query: LogQuery): LogSelection {
  const { fromLine, toLine } = query;
  if (fromLine !== undefined && toLine !== undefined && fromLine > toLine) {
    throw new Error(`from_line (${fromLine}) is after to_line (${toLine})`);
  }

  // Order matters and is documented: range, then grep, then tail, then caps.
  const from = fromLine ?? 1;
  const to = toLine ?? Number.POSITIVE_INFINITY;
  const needle = query.grep?.toLowerCase();
  const matched = lines.filter(
    (l) => l.number >= from && l.number <= to && (needle === undefined || l.text.toLowerCase().includes(needle)),
  );

  const tail = Math.min(Math.max(query.tail, 1), MAX_LINES);
  const formatted = matched.slice(-tail).map(format);

  let size = formatted.reduce((sum, l) => sum + l.length + 1, 0);
  let start = 0;
  while (start < formatted.length && size > MAX_CHARS) {
    size -= (formatted[start]?.length ?? 0) + 1;
    start += 1;
  }
  const kept = formatted.slice(start);

  const notes: string[] = [];
  if (kept.length < matched.length) {
    notes.push(
      `Showing the last ${kept.length} of ${matched.length} matching lines; ask for an earlier part with from_line/to_line.`,
    );
  }
  if (start > 0) notes.push(`Output capped at ${MAX_CHARS} characters.`);

  return {
    totalLines: lines.length,
    matchedLines: matched.length,
    returnedLines: kept.length,
    omittedLines: lines.length - kept.length,
    ...(notes.length > 0 ? { note: notes.join(' ') } : {}),
    lines: kept,
  };
}
