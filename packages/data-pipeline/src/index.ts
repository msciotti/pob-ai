#!/usr/bin/env node
/**
 * poe-data-pipeline CLI
 *
 * Crawls r/PathOfExileBuilds via Arctic Shift and produces a JSONL training
 * dataset of (PoB build → community diagnosis) pairs.
 *
 * Usage:
 *   poe-data-pipeline [options]
 *
 * Options:
 *   --output <path>            Output JSONL file (default: ./dataset.jsonl)
 *   --max-posts <n>            Stop after N qualifying posts (default: 500)
 *   --min-comment-score <n>   Only keep comments with score >= this (default: 2)
 *   --before <unix_ts>         Start pagination from this unix timestamp
 *   --subreddit <name>         Subreddit to crawl (default: PathOfExileBuilds)
 *   --resume                   Read last source_id from output file and continue
 *   --dry-run                  Skip build loading; only write post metadata
 */

import { createReadStream, existsSync } from 'fs';
import { createInterface } from 'readline';
import { fetchPosts, fetchComments } from './arctic-shift.js';
import { hasPobLink, extractPobSource } from './build-extractor.js';
import { BuildProcessor } from './build-processor.js';
import { DatasetWriter } from './dataset-writer.js';
import type { DatasetRecord } from './types.js';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  output: string;
  maxPosts: number;
  minCommentScore: number;
  before: number | undefined;
  subreddit: string;
  resume: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    output: './dataset.jsonl',
    maxPosts: 500,
    minCommentScore: 2,
    before: undefined,
    subreddit: 'PathOfExileBuilds',
    resume: false,
    dryRun: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case '--output':
        args.output = argv[++i] ?? args.output;
        break;
      case '--max-posts': {
        const n = parseInt(argv[++i] ?? '', 10);
        if (!isNaN(n)) args.maxPosts = n;
        break;
      }
      case '--min-comment-score': {
        const n = parseInt(argv[++i] ?? '', 10);
        if (!isNaN(n)) args.minCommentScore = n;
        break;
      }
      case '--before': {
        const n = parseInt(argv[++i] ?? '', 10);
        if (!isNaN(n)) args.before = n;
        break;
      }
      case '--subreddit':
        args.subreddit = argv[++i] ?? args.subreddit;
        break;
      case '--resume':
        args.resume = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      default:
        process.stderr.write(`[warn] Unknown flag: ${flag}\n`);
    }
  }

  return args;
}

// ---------------------------------------------------------------------------
// Resume: read the last timestamp from an existing output file
// ---------------------------------------------------------------------------

/**
 * Reads the last line of a JSONL file and extracts the created_utc-equivalent
 * timestamp from the source_id field. Returns undefined if file is empty/missing.
 *
 * Since we cannot store created_utc directly in source_id we scan the file and
 * use the post ID (the numeric part) to find a matching timestamp by re-paging
 * from a known large value — but that's complex. Instead, we embed the timestamp
 * as a separate field in the JSONL record. We read it from `collected_at`.
 *
 * Actually the simplest approach: we add a `post_created_utc` field to our
 * written records so --resume can pick up where we left off. But the spec
 * DatasetRecord interface doesn't include it, so we write/read it as a
 * temporary side-channel field without changing the type contract.
 *
 * In practice we use the `collected_at` ISO string as a proxy, but that's wall
 * time not post time. The cleanest approach: read post IDs from the last line
 * and look up the timestamp from Arctic Shift. Too slow — instead we keep the
 * before-cursor in a separate sidecar file: `<output>.cursor`.
 */
async function readCursorFile(outputPath: string): Promise<number | undefined> {
  const cursorPath = outputPath + '.cursor';
  if (!existsSync(cursorPath)) return undefined;
  try {
    const { readFileSync } = await import('fs');
    const val = readFileSync(cursorPath, 'utf8').trim();
    const n = parseInt(val, 10);
    return isNaN(n) ? undefined : n;
  } catch {
    return undefined;
  }
}

async function writeCursorFile(outputPath: string, timestamp: number): Promise<void> {
  const { writeFileSync } = await import('fs');
  writeFileSync(outputPath + '.cursor', String(timestamp), 'utf8');
}

/**
 * Count lines already written to the output file so we can report true totals
 * and correctly offset maxPosts when resuming.
 */
async function countExistingLines(outputPath: string): Promise<number> {
  if (!existsSync(outputPath)) return 0;
  return new Promise((resolve) => {
    let count = 0;
    const rl = createInterface({ input: createReadStream(outputPath), crlfDelay: Infinity });
    rl.on('line', (line) => { if (line.trim()) count++; });
    rl.on('close', () => resolve(count));
    rl.on('error', () => resolve(count));
  });
}

// ---------------------------------------------------------------------------
// Flair filter — only pull help/build-advice posts
// ---------------------------------------------------------------------------

const RELEVANT_FLAIRS = new Set([
  'Help Needed',
  'Build',
  'Build Help',       // alternate flair names seen in the wild
  'Builds',
  'help',
]);

function isRelevantFlair(flair: string | null): boolean {
  if (!flair) return false;
  return RELEVANT_FLAIRS.has(flair.trim());
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.dryRun) {
    process.stderr.write('[dry-run] Build loading disabled — only post metadata will be written\n');
  }

  // Resolve starting cursor
  let before: number | undefined = args.before;
  let existingCount = 0;

  if (args.resume) {
    const cursor = await readCursorFile(args.output);
    if (cursor !== undefined) {
      before = cursor;
      process.stderr.write(`[resume] Continuing from cursor timestamp ${cursor}\n`);
    }
    existingCount = await countExistingLines(args.output);
    process.stderr.write(`[resume] ${existingCount} records already in output file\n`);
  }

  // Initialize subsystems
  const writer = new DatasetWriter(args.output);

  const processor = new BuildProcessor();
  if (!args.dryRun) {
    process.stderr.write('[init] Starting PoB runtime (this takes ~15 seconds)...\n');
    await processor.initialize();
    process.stderr.write('[init] PoB runtime ready\n');
  }

  // Counters
  let postsProcessed = 0;
  let buildsLoaded = 0;
  let buildErrors = 0;
  let skipNoPob = 0;
  let skipNoComments = 0;
  let skipFlair = 0;

  const log = (msg: string) => process.stderr.write(msg + '\n');

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (postsProcessed >= args.maxPosts) break;

      const posts = await fetchPosts({
        subreddit: args.subreddit,
        before,
        limit: 100,
      });

      if (posts.length === 0) {
        log('[done] No more posts returned — reached end of subreddit history');
        break;
      }

      for (const post of posts) {
        if (postsProcessed >= args.maxPosts) break;

        // Flair filter
        if (!isRelevantFlair(post.link_flair_text)) {
          skipFlair++;
          continue;
        }

        // PoB link filter
        if (!hasPobLink(post.selftext)) {
          skipNoPob++;
          log(`[SKIP] no pob link — "${post.title}"`);
          continue;
        }

        const pobSource = extractPobSource(post.selftext);
        if (!pobSource) {
          // hasPobLink matched but extractPobSource found nothing (shouldn't normally happen)
          skipNoPob++;
          log(`[SKIP] no pob link (extract failed) — "${post.title}"`);
          continue;
        }

        // Fetch and filter comments
        let comments;
        try {
          comments = await fetchComments(post.id);
        } catch (err) {
          log(`[warn] Failed to fetch comments for ${post.id}: ${(err as Error).message}`);
          continue;
        }

        const qualifyingComments = comments.filter(
          (c) =>
            c.score >= args.minCommentScore &&
            c.body !== '[deleted]' &&
            c.body !== '[removed]' &&
            c.body.trim().length > 0
        );

        if (qualifyingComments.length === 0) {
          skipNoComments++;
          log(`[SKIP] no comments — "${post.title}"`);
          continue;
        }

        // Process build (unless dry-run)
        let buildSummary: object | null = null;
        let buildLoadError: string | null = null;

        if (!args.dryRun) {
          const result = await processor.process(pobSource);
          buildSummary = result.summary;
          buildLoadError = result.error;
          if (result.error) {
            buildErrors++;
            log(`[build-error] ${post.id}: ${result.error}`);
          } else {
            buildsLoaded++;
          }
        }

        // Sort comments: top-level first, then by score descending
        const topComments = qualifyingComments
          .sort((a, b) => {
            const aTop = a.parent_id.startsWith('t3_') ? 1 : 0;
            const bTop = b.parent_id.startsWith('t3_') ? 1 : 0;
            if (bTop !== aTop) return bTop - aTop;
            return b.score - a.score;
          })
          .slice(0, 20) // cap at 20 to keep records manageable
          .map((c) => ({
            author: c.author,
            score: c.score,
            body: c.body,
            is_top_level: c.parent_id.startsWith('t3_'),
          }));

        const record: DatasetRecord = {
          source_id: `reddit:${post.id}`,
          collected_at: new Date().toISOString(),
          post_title: post.title,
          complaint_text: post.selftext,
          pob_source: pobSource,
          build_summary: buildSummary,
          build_load_error: buildLoadError,
          top_comments: topComments,
        };

        writer.write(record);
        postsProcessed++;

        log(
          `[${postsProcessed}/${args.maxPosts} processed | ${buildsLoaded} loaded | ${buildErrors} errors] latest: "${post.title}"`
        );
      }

      // Advance pagination cursor to oldest post in this page
      const oldestTs = Math.min(...posts.map((p) => p.created_utc));
      before = oldestTs;

      // Persist cursor so --resume works even after an interrupt
      await writeCursorFile(args.output, oldestTs);
    }
  } finally {
    if (!args.dryRun) {
      await processor.destroy();
    }
  }

  log('');
  log('=== Pipeline complete ===');
  log(`Posts written:        ${postsProcessed}`);
  log(`Builds loaded:        ${buildsLoaded}`);
  log(`Build errors:         ${buildErrors}`);
  log(`Skipped (no pob):     ${skipNoPob}`);
  log(`Skipped (no comment): ${skipNoComments}`);
  log(`Skipped (flair):      ${skipFlair}`);
  log(`Output file:          ${args.output}`);
}

main().catch((err) => {
  process.stderr.write(`[fatal] ${(err as Error).message}\n${(err as Error).stack ?? ''}\n`);
  process.exit(1);
});
