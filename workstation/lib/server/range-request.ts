export type ByteRange = {
  offset: number;
  length: number;
  start: number;
  end: number;
};

export type ParseByteRangeResult =
  | { type: "range"; range: ByteRange }
  | { type: "unsatisfiable" }
  | { type: "none" };

export function parseByteRange(
  rangeHeader: string | null | undefined,
  sizeBytes: number,
): ParseByteRangeResult {
  if (!rangeHeader) return { type: "none" };
  const trimmed = rangeHeader.trim();
  if (!trimmed.startsWith("bytes=")) return { type: "none" };

  const spec = trimmed.slice(6).trim();
  if (spec.includes(",")) return { type: "none" };

  const match = /^(\d*)-(\d*)$/.exec(spec);
  if (!match) return { type: "none" };

  const [, startStr, endStr] = match;
  if (!startStr && !endStr) return { type: "none" };

  let start: number;
  let end: number;

  if (!startStr) {
    const suffix = parseInt(endStr, 10);
    if (isNaN(suffix) || suffix <= 0) return { type: "unsatisfiable" };
    if (sizeBytes === 0) return { type: "unsatisfiable" };
    start = Math.max(0, sizeBytes - suffix);
    end = sizeBytes - 1;
  } else if (!endStr) {
    start = parseInt(startStr, 10);
    if (isNaN(start) || start < 0 || start >= sizeBytes) return { type: "unsatisfiable" };
    end = sizeBytes - 1;
  } else {
    start = parseInt(startStr, 10);
    end = parseInt(endStr, 10);
    if (isNaN(start) || isNaN(end) || start < 0 || start > end || start >= sizeBytes) {
      return { type: "unsatisfiable" };
    }
    if (end >= sizeBytes) {
      end = sizeBytes - 1;
    }
  }

  const length = end - start + 1;
  return {
    type: "range",
    range: {
      offset: start,
      length,
      start,
      end,
    },
  };
}
