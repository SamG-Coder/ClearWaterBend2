  // SPDX-License-Identifier: Apache-2.0
  // Modified native-helper emission: typed return values plus status.
  const result = "BendResult_" + name;
  const failed = "{ " + result + " failed = {" + [0, ...dst.ws.map(() => 0)].join(",") + "}; return failed; }";
  fl.spins.push({ ...seg, lines: [
    "typedef struct " + result + " { u32 ok; "
      + seg.ret.ks.map((k, i) => lay_c(k) + " v" + i + ";").join(" ") + " } " + result + ";",
    `${seg.lines.length < SPIN_FAR ? "INLINE" : "FAR"} ${result} ${name}(Env e${
      seg.ks.map((k, i) => `, ${lay_c(k)} r${i}${arr_q(fl, k) ? `, u64 q${i}` : ""}`).join("")}) {`,
    "  u32 wpoll = 0;", ...seg.ks.flatMap((k, i) =>
      arr_q(fl, k) ? [`  Term h${i} = r${i};`] : []),
    ...dst.ws.map((v, j) => `  ${lay_c(seg.ret.ks[j])} ${v} = 0;`),
    ...seg_take(seg).map((l) => "  " + l),
    "  for (;;) { if (err_spun(e.mem, &wpoll)) { " + failed + " }",
    ...seg_text(seg.lines, 2).map(l => l.replaceAll("return 0;", failed)), "  break;", "  }",
    "  " + result + " result = {" + ["1", ...dst.ws].join(",") + "}; return result;", "}"] });
