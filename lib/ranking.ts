// Pure-TypeScript lexical ranking: TF-IDF vectors + cosine similarity.
// No dependencies, no network — fully deterministic so the demo and the unit
// tests are stable offline.

/** Lowercase and split into terms, preserving `+` and `#` so skills like
 * "c++" and "c#" survive. All other punctuation is a separator. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter(Boolean);
}

function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

/** Cosine similarity of `query` against each document, using TF-IDF weights
 * fit on the document corpus (smoothed, sklearn-style: idf = ln((1+N)/(1+df)) + 1).
 * Returns one score in [0, 1] per document, aligned with `docs`. */
export function rankByCosine(query: string, docs: string[]): number[] {
  const docTokens = docs.map(tokenize);

  // Document frequency across the corpus.
  const df = new Map<string, number>();
  for (const tokens of docTokens) {
    for (const term of new Set(tokens)) df.set(term, (df.get(term) ?? 0) + 1);
  }

  const n = docs.length;
  const idf = (term: string): number =>
    Math.log((1 + n) / (1 + (df.get(term) ?? 0))) + 1;

  const toVector = (tokens: string[]): Map<string, number> => {
    const vec = new Map<string, number>();
    for (const [term, freq] of termFreq(tokens)) vec.set(term, freq * idf(term));
    return vec;
  };

  const norm = (vec: Map<string, number>): number =>
    Math.sqrt([...vec.values()].reduce((sum, w) => sum + w * w, 0));

  const queryVec = toVector(tokenize(query));
  const queryNorm = norm(queryVec);

  return docTokens.map((tokens) => {
    const docVec = toVector(tokens);
    const docNorm = norm(docVec);
    if (queryNorm === 0 || docNorm === 0) return 0;

    let dot = 0;
    // Iterate the smaller vector for the dot product.
    const [small, large] =
      queryVec.size <= docVec.size ? [queryVec, docVec] : [docVec, queryVec];
    for (const [term, w] of small) dot += w * (large.get(term) ?? 0);

    return dot / (queryNorm * docNorm);
  });
}
