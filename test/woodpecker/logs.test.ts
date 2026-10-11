import { describe, expect, it } from 'vitest';
import {
  MAX_CHARS,
  MAX_LINE_CHARS,
  decodeLogEntries,
  selectLogLines,
  type LogLine,
} from '../../src/woodpecker/logs.js';
import type { WpLogEntry } from '../../src/woodpecker/types.js';

const entry = (line: number, text: string | null, type = 0): WpLogEntry => ({
  id: line,
  step_id: 9,
  time: line,
  line,
  data: text === null ? null : Buffer.from(text).toString('base64'),
  type,
});

const numbered = (count: number, text = (n: number) => `line ${n}`): LogLine[] =>
  Array.from({ length: count }, (_, i) => ({ number: i + 1, text: text(i + 1) }));

describe('decodeLogEntries', () => {
  it('decodes base64, sorts by line, keeps stdout and stderr only, and numbers from 1', () => {
    const lines = decodeLogEntries([
      entry(2, 'second\n', 1),
      entry(0, 'first\n'),
      entry(3, '0', 2),
      entry(4, '{"meta":1}', 3),
      entry(5, '50%', 4),
    ]);
    expect(lines).toEqual([
      { number: 1, text: 'first' },
      { number: 2, text: 'second' },
    ]);
  });

  it('splits an entry holding several lines and treats null data as an empty line', () => {
    expect(decodeLogEntries([entry(0, 'a\r\nb\n'), entry(1, null)])).toEqual([
      { number: 1, text: 'a' },
      { number: 2, text: 'b' },
      { number: 3, text: '' },
    ]);
  });
});

describe('selectLogLines', () => {
  it('returns the last `tail` lines with their numbers and says how many were left out', () => {
    const result = selectLogLines(numbered(300), { tail: 200 });
    expect(result.totalLines).toBe(300);
    expect(result.returnedLines).toBe(200);
    expect(result.omittedLines).toBe(100);
    expect(result.lines[0]).toBe('101: line 101');
    expect(result.lines.at(-1)).toBe('300: line 300');
    expect(result.note).toMatch(/last 200 of 300 matching lines/);
  });

  it('matches grep case-insensitively and keeps the original line numbers', () => {
    const lines: LogLine[] = [
      { number: 1, text: 'ok' },
      { number: 2, text: 'ERROR: boom' },
      { number: 3, text: 'fine' },
      { number: 4, text: 'error again' },
    ];
    const result = selectLogLines(lines, { tail: 200, grep: 'error' });
    expect(result.lines).toEqual(['2: ERROR: boom', '4: error again']);
    expect(result.matchedLines).toBe(2);
    expect(result.note).toBeUndefined();
  });

  it('applies range, then grep, then tail', () => {
    const lines = numbered(10, (n) => (n % 2 === 0 ? `even ${n}` : `odd ${n}`));
    const result = selectLogLines(lines, { fromLine: 3, toLine: 8, grep: 'even', tail: 2 });
    expect(result.lines).toEqual(['6: even 6', '8: even 8']);
  });

  it('rejects a range that runs backwards', () => {
    expect(() => selectLogLines(numbered(5), { tail: 10, fromLine: 4, toLine: 2 })).toThrow(
      'from_line (4) is after to_line (2)',
    );
  });

  it('caps the output at MAX_CHARS, keeping the end', () => {
    const result = selectLogLines(numbered(1000, () => 'x'.repeat(100)), { tail: 1000 });
    const size = result.lines.reduce((sum, l) => sum + l.length + 1, 0);
    expect(size).toBeLessThanOrEqual(MAX_CHARS);
    expect(result.lines.at(-1)).toMatch(/^1000: /);
    expect(result.note).toMatch(/capped at 50000 characters/);
  });

  it('truncates one enormous line instead of dropping it', () => {
    const result = selectLogLines([{ number: 1, text: 'y'.repeat(MAX_CHARS * 2) }], { tail: 200 });
    expect(result.returnedLines).toBe(1);
    expect(result.lines[0]?.length).toBeLessThanOrEqual(MAX_LINE_CHARS + 40);
    expect(result.lines[0]).toMatch(/\[line truncated\]$/);
  });

  it('returns an empty selection for a step with no output yet', () => {
    expect(selectLogLines([], { tail: 200 })).toEqual({
      totalLines: 0,
      matchedLines: 0,
      returnedLines: 0,
      omittedLines: 0,
      lines: [],
    });
  });
});
