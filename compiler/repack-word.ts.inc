// SPDX-License-Identifier: Apache-2.0
// Recover an unchanged word from its 32 individual bit projections. Only local
// identifiers are accepted; any intervening assignment/address escape rejects
// the fold. This preserves all bits, including Float32 NaN payloads and -0.
function repack_word(fl: File, bits: string[]): string | null {
  if (bits.length !== 32 || bits.some(b => !/^\w+$/.test(b))) return null;
  let original: string | null = null;
  let earliest = fl.seg.lines.length;
  const mutation = (name: string): RegExp => new RegExp(
    "\\b" + name + "\\s*(?:(?:<<|>>|[+*/%&|^-])?=(?!=)|\\+\\+|--)"
    + "|(?:&|\\+\\+|--)\\s*" + name + "\\b");
  for (let bit = 0; bit < 32; bit++) {
    const pattern = new RegExp("^(?:u32|Term) " + bits[bit]
      + " = \\(\\((\\w+) >> " + bit + "\\) & 1\\);$");
    const at = fl.seg.lines.findLastIndex(line => pattern.test(line.trim()));
    if (at < 0) return null;
    const word = pattern.exec(fl.seg.lines[at].trim())![1];
    if (original !== null && original !== word) return null;
    original = word;
    earliest = Math.min(earliest, at);
    // Reject mutation or address escape of each projected bit too.
    const changed = mutation(bits[bit]);
    if (fl.seg.lines.slice(at + 1).some(line => changed.test(line))) return null;
  }
  const changed = mutation(original!);
  if (fl.seg.lines.slice(earliest).some(line => changed.test(line))) return null;
  return "((u64)(u32)(" + original + "))";
}

