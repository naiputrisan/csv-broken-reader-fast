// v2: unquoted fields end at the nearer of the next comma and the next
// line feed, both found with indexOf (two short native scans, no regex).
// Carriage returns are the catch: a lone CR inside a field must be
// dropped with a stray_cr, and a CR just before the line feed is the
// CRLF ending. So each run first lists every CR position in the text
// once (one linear indexOf pass) and walks a cursor over that list as
// the read position advances; a field is then known to hold a stray CR
// exactly when the cursor's CR falls inside it. Everything else is the
// same bulk approach as v1: a field is one slice, a quoted field one
// closing-quote scan, and only spans that really hold a line break or
// an escape pay for a second pass.

const QUOTE = 34; // "
const COMMA_C = 44; // ,
const LF = 10; // \n
const CR = 13; // \r

const COMMA = 0;
const BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // Every CR position, in order, found with one linear pass.
  const crs = [];
  {
    let at = text.indexOf('\r');
    while (at !== -1) {
      crs.push(at);
      at = text.indexOf('\r', at + 1);
    }
  }
  let crCursor = 0;

  let recordLine = 1;
  let recordRow = null;

  let fVal = '';
  let fEnd = END;
  let fAdd = 0;

  function fail(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Read unquoted characters onto `start`, up to the next comma or line
  // break. A CR not followed by LF is dropped (stray_cr) and the field
  // goes on. Sets fVal / fEnd / fAdd.
  function readUnquoted(start) {
    let value = start;
    let added = 0;
    for (;;) {
      if (pos >= n) {
        fVal = value;
        fEnd = END;
        fAdd = added;
        return;
      }
      // Move the CR cursor up to the read position.
      while (crCursor < crs.length && crs[crCursor] < pos) crCursor += 1;
      const ci = text.indexOf(',', pos);
      const ni = text.indexOf('\n', pos);
      let end;
      let isBreak;
      if (ci === -1) {
        end = ni;
        isBreak = true;
      } else if (ni === -1) {
        end = ci;
        isBreak = false;
      } else if (ci < ni) {
        end = ci;
        isBreak = false;
      } else {
        end = ni;
        isBreak = true;
      }
      if (end === -1) {
        // No delimiter left: the rest of the text is the field. No line
        // feed is left either, so every CR left in it is a lone one.
        let from = pos;
        while (crCursor < crs.length) {
          const at = crs[crCursor];
          if (at > from) {
            const seg = text.slice(from, at);
            value = value === '' ? seg : value + seg;
            added += at - from;
          }
          fail('stray_cr');
          from = at + 1;
          crCursor += 1;
        }
        if (from < n) {
          const seg = text.slice(from, n);
          value = value === '' ? seg : value + seg;
          added += n - from;
        }
        pos = n;
        fVal = value;
        fEnd = END;
        fAdd = added;
        return;
      }
      // A CR right before the line feed is the CRLF ending, not a stray,
      // so stray CRs stop one short of it.
      const limit = isBreak && end > pos && text.charCodeAt(end - 1) === CR ? end - 1 : end;
      if (crCursor < crs.length && crs[crCursor] < limit) {
        // Stray CRs inside this field: walk them, dropping each one.
        let from = pos;
        while (crCursor < crs.length && crs[crCursor] < limit) {
          const at = crs[crCursor];
          if (at > from) {
            const seg = text.slice(from, at);
            value = value === '' ? seg : value + seg;
            added += at - from;
          }
          fail('stray_cr');
          from = at + 1;
          crCursor += 1;
        }
        if (limit > from) {
          const seg = text.slice(from, limit);
          value = value === '' ? seg : value + seg;
          added += limit - from;
        }
        pos = end + 1;
        line += isBreak ? 1 : 0;
        fVal = value;
        fEnd = isBreak ? BREAK : COMMA;
        fAdd = added;
        return;
      }
      // The common case: one slice, no stray CR.
      if (isBreak) {
        const stop = limit;
        if (stop > pos) {
          const seg = text.slice(pos, stop);
          value = value === '' ? seg : value + seg;
          added += stop - pos;
        }
        pos = end + 1;
        line += 1;
        fVal = value;
        fEnd = BREAK;
        fAdd = added;
        return;
      }
      if (end > pos) {
        const seg = text.slice(pos, end);
        value = value === '' ? seg : value + seg;
        added += end - pos;
      }
      pos = end + 1;
      fVal = value;
      fEnd = COMMA;
      fAdd = added;
      return;
    }
  }

  // Read a quoted field whose opening quote is at pos. Sets fVal / fEnd.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos = open + 1;
    let escaped = false;
    let q;
    for (;;) {
      q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        fail('unterminated_quote');
        readUnquoted('"');
        return;
      }
      if (text.charCodeAt(q + 1) === QUOTE) {
        escaped = true;
        pos = q + 2;
        continue;
      }
      break;
    }
    // The closing quote is at q; the span is (open + 1, q).
    let value = text.slice(open + 1, q);
    if (value.indexOf('\n') !== -1 || value.indexOf('\r') !== -1) {
      // The span holds line breaks: walk it once, counting them and
      // reading every CRLF or lone CR as LF, collapsing "" to ".
      let out = '';
      let breaks = 0;
      let i = 0;
      const len = value.length;
      while (i < len) {
        const c = value.charCodeAt(i);
        if (c === CR) {
          out += '\n';
          breaks += 1;
          i += value.charCodeAt(i + 1) === LF ? 2 : 1;
          continue;
        }
        if (c === LF) {
          out += '\n';
          breaks += 1;
          i += 1;
          continue;
        }
        if (c === QUOTE) {
          out += '"';
          i += 2;
          continue;
        }
        out += value[i];
        i += 1;
      }
      value = out;
      line += breaks;
    } else if (escaped) {
      value = value.split('""').join('"');
    }
    pos = q + 1;
    if (pos >= n) {
      fVal = value;
      fEnd = END;
      return;
    }
    const c = text.charCodeAt(pos);
    if (c === COMMA_C) {
      pos += 1;
      fVal = value;
      fEnd = COMMA;
      return;
    }
    if (c === LF) {
      pos += 1;
      line += 1;
      fVal = value;
      fEnd = BREAK;
      return;
    }
    if (c === CR && text.charCodeAt(pos + 1) === LF) {
      pos += 2;
      line += 1;
      fVal = value;
      fEnd = BREAK;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    readUnquoted(value);
    if (fAdd > 0) fail('quote_junk');
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === LF) {
        pos += 1;
        line += 1;
      } else if (c === CR && text.charCodeAt(pos + 1) === LF) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === QUOTE;
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fVal);
    } while (fEnd === COMMA);

    // A line that held only stray CRs is left with no characters: no
    // record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.slice(width) });
      fields.length = width;
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
