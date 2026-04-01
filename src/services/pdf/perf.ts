// src/pdf/perf.ts
const nowMs = () => (global as any).performance?.now?.() ?? Date.now();

export function perfStart(tag: string) {
  const t0 = nowMs();
  const marks: {label: string; t: number}[] = [];

  const add = (label: string) => marks.push({label, t: nowMs()});

  const end = () => {
    const tEnd = nowMs();
    let last = t0;
    console.log(`[PDF PERF] ===== ${tag} =====`);
    for (const m of marks) {
      const seg = m.t - last;
      const total = m.t - t0;
      console.log(
        `[PDF PERF] ${m.label}: +${seg.toFixed(1)}ms (total ${total.toFixed(
          1,
        )}ms)`,
      );
      last = m.t;
    }
    console.log(
      `[PDF PERF] ===== ${tag} DONE: ${(tEnd - t0).toFixed(1)}ms =====`,
    );
  };

  return {add, end};
}
