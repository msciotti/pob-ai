export interface RawPost {
  id: string;
  title: string;
  selftext: string;
  score: number;
  link_flair_text: string | null;
  num_comments: number;
  created_utc: number;
  author: string;
}

export interface RawComment {
  id: string;
  body: string;
  score: number;
  author: string;
  parent_id: string;    // t3_xxx = top-level, t1_xxx = reply
  link_id: string;
  created_utc: number;
}

export interface DatasetRecord {
  source_id: string;           // e.g. "reddit:1v7nl8m"
  collected_at: string;        // ISO timestamp
  post_title: string;
  complaint_text: string;      // selftext of the post
  pob_source: string;          // the raw pobb.in/pastebin URL found
  build_summary: object | null; // null if build failed to load
  build_load_error: string | null;
  top_comments: Array<{
    author: string;
    score: number;
    body: string;
    is_top_level: boolean;
  }>;
}
