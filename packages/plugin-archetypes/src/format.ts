import type { ArchetypeEntry, FailureMode } from './schema.js';
import type { ArchetypeMatch, BuildProfile } from './classifier.js';

export function formatMatches(matches: ArchetypeMatch[]): string {
  if (matches.length === 0) {
    return 'No known archetype matched this build with meaningful confidence — that is a valid result, not a failure. This may be a hybrid, an off-meta build, or simply not one of the archetypes currently in the knowledge base.';
  }
  return matches
    .map((m, i) => {
      const lines = [`${i + 1}. **${m.name}** (\`${m.slug}\`) — confidence ${(m.confidence * 100).toFixed(0)}%`];
      if (m.matchedSignals.length) lines.push(`   Matched: ${m.matchedSignals.join('; ')}`);
      if (m.missingSignals.length) lines.push(`   Missing: ${m.missingSignals.join('; ')}`);
      return lines.join('\n');
    })
    .join('\n');
}

export function formatArchetypeEntry(entry: ArchetypeEntry): string {
  const lines: string[] = [];
  lines.push(`# ${entry.name} (\`${entry.slug}\`)`);
  lines.push('');
  lines.push(entry.summary);
  lines.push('');
  lines.push(`_Provenance: ${entry.provenance} · Patch validity: ${entry.patchValidity} · Last reviewed: ${entry.lastReviewedPatch}_`);
  lines.push('');

  lines.push('## Identity signature');
  for (const s of entry.identitySignature.signals) {
    lines.push(`- [${s.required ? 'required' : 'supporting'}, weight ${s.weight}] ${s.description}`);
  }
  lines.push('');

  lines.push('## Scaling vectors');
  entry.scalingVectors.forEach((v, i) => lines.push(`${i + 1}. **${v.mechanic}** — ${v.explanation}`));
  lines.push('');

  lines.push('## Dead stats');
  if (entry.deadStats.length === 0) {
    lines.push('(none called out for this archetype)');
  } else {
    entry.deadStats.forEach((d) => lines.push(`- **${d.stat}**: ${d.reason}`));
  }
  lines.push('');

  lines.push('## Defensive profile');
  lines.push('Layers:');
  entry.defensiveProfile.layers.forEach((l) => lines.push(`- ${l}`));
  lines.push('Characteristic weaknesses:');
  entry.defensiveProfile.characteristicWeaknesses.forEach((w) => lines.push(`- ${w}`));
  lines.push('');

  lines.push('## Failure modes');
  entry.failureModes.forEach((f, i) => {
    lines.push(`${i + 1}. **Symptom:** ${f.symptom}`);
    lines.push(`   **Diagnosis:** ${f.diagnosis}`);
    lines.push(`   **Fix:** ${f.fix}`);
  });

  return lines.join('\n');
}

function evaluateStatCheck(mode: FailureMode, stats: Record<string, number> | undefined): string {
  if (!mode.statCheck) return '(not stat-detectable — check manually)';
  const { stat, op, threshold } = mode.statCheck;
  if (!stats || !(stat in stats)) return `(cannot evaluate — ${stat} not present in current build stats)`;
  const value = stats[stat];
  const triggered =
    op === 'lt' ? value < threshold : op === 'lte' ? value <= threshold : op === 'gt' ? value > threshold : value >= threshold;
  return triggered
    ? `⚠️ FLAGGED — ${stat} is ${value} (${op} ${threshold})`
    : `OK — ${stat} is ${value} (does not meet ${op} ${threshold})`;
}

/** Detail block for the top classifier match: scaling vectors, dead stats, and the failure-mode checklist evaluated against the build's actual stats where possible. */
export function formatTopMatchDetail(entry: ArchetypeEntry, profile: BuildProfile): string {
  const lines: string[] = [];
  lines.push(`## Top match detail: ${entry.name}`);
  lines.push('');
  lines.push('### Scaling vectors (what actually moves damage/defense for this shell)');
  entry.scalingVectors.forEach((v, i) => lines.push(`${i + 1}. **${v.mechanic}** — ${v.explanation}`));
  lines.push('');
  lines.push('### Dead stats (investments that do nothing here)');
  entry.deadStats.forEach((d) => lines.push(`- **${d.stat}**: ${d.reason}`));
  lines.push('');
  lines.push('### Failure mode checklist (evaluated against this build where stat-detectable)');
  entry.failureModes.forEach((f, i) => {
    lines.push(`${i + 1}. ${f.symptom}`);
    lines.push(`   ${evaluateStatCheck(f, profile.stats)}`);
    lines.push(`   Diagnosis: ${f.diagnosis}`);
    lines.push(`   Fix: ${f.fix}`);
  });
  return lines.join('\n');
}
