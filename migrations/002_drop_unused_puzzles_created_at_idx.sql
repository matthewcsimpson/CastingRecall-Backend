-- puzzles_created_at_idx (on created_at DESC) was never used: every read query
-- orders by puzzle_id DESC, which the BIGINT primary key already indexes. Drop
-- the dead index. The created_at column itself is retained.
DROP INDEX IF EXISTS puzzles_created_at_idx;
