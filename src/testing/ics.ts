/** One `BEGIN:VEVENT`…`END:VEVENT` block: each `NAME:value` line, by name. */
export interface IcsEvent {
  [name: string]: string;
}

/**
 * Reads iCalendar text as a test needs it: the unfolded content lines and the events.
 * Throws on a line feed without its carriage return, so LF-only output fails the test.
 */
export function parseIcs(text: string): { lines: string[]; events: IcsEvent[] } {
  if (/(^|[^\r])\n/.test(text)) throw new Error('The iCalendar text has a line feed without a carriage return');
  const unfolded = text.replace(/\r\n[ \t]/g, '');
  const lines = unfolded.split('\r\n');
  if (lines.at(-1) === '') lines.pop();
  const events: IcsEvent[] = [];
  let event: IcsEvent | undefined;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      event = {};
    } else if (line === 'END:VEVENT') {
      if (event !== undefined) events.push(event);
      event = undefined;
    } else if (event !== undefined) {
      const colon = line.indexOf(':');
      if (colon !== -1) event[line.slice(0, colon)] = line.slice(colon + 1);
    }
  }
  return { lines, events };
}
