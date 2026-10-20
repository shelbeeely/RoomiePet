// Which chore someone meant, from what they said or typed ("I did the
// dishes", "watered the plant"): used by Siri and Apple Shortcuts.

const STOP = new Set(["i", "did", "do", "done", "the", "a", "an", "my", "our", "just", "have", "has", "finished", "to", "it", "up", "of", "and"]);

function words(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => w.replace(/(ing|ed|es|s)$/u, "") || w);
}

/**
 * The best match among `chores`, or null with the close candidates when it
 * is unclear. A word counts if it starts the same as a word of the title
 * ("water" ~ "watered"); a chore that is yours wins a tie.
 */
export function matchChore(said, chores, memberId) {
  const asked = words(said);
  if (!asked.length) return { chore: null, candidates: [] };
  const scored = chores
    .map((c) => {
      const title = words(c.title);
      const hits = asked.filter((a) => title.some((t) => t.startsWith(a) || a.startsWith(t))).length;
      const mine = c.assignment !== "anyone" && c.assigneeId === memberId ? 0.5 : 0;
      return { c, score: hits ? hits / Math.max(asked.length, 1) + hits / (title.length + 1) + mine : 0 };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return { chore: null, candidates: [] };
  if (scored.length > 1 && scored[0].score - scored[1].score < 0.2) {
    return { chore: null, candidates: scored.filter((s) => scored[0].score - s.score < 0.2).map((s) => s.c) };
  }
  return { chore: scored[0].c, candidates: [] };
}
