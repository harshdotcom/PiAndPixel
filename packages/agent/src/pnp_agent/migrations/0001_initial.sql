-- Car stage: revisions, exports, the durable job queue and per-attempt history.

CREATE TABLE revisions (
    project     TEXT NOT NULL,
    id          TEXT NOT NULL,              -- sha256 of the snapshot's file manifest
    created_at  TEXT NOT NULL,              -- ISO 8601 UTC
    file_count  INTEGER NOT NULL,
    total_bytes INTEGER NOT NULL,
    PRIMARY KEY (project, id)
);

CREATE TABLE exports (
    id              TEXT PRIMARY KEY,       -- uuid4 hex
    project         TEXT NOT NULL,
    composition     TEXT NOT NULL,
    format          TEXT NOT NULL,
    quality         TEXT NOT NULL,
    revision_id     TEXT NOT NULL,
    idempotency_key TEXT,                   -- NULL when the client sent none
    request_hash    TEXT NOT NULL,          -- sha256 of the canonical request body
    created_at      TEXT NOT NULL,
    UNIQUE (project, idempotency_key)
);

CREATE TABLE jobs (
    id              TEXT PRIMARY KEY,       -- uuid4 hex
    project         TEXT NOT NULL,
    kind            TEXT NOT NULL CHECK (kind IN ('render', 'composite')),
    status          TEXT NOT NULL CHECK (status IN (
                        'queued', 'blocked', 'running', 'completed',
                        'failed', 'timed_out', 'cancelled', 'interrupted')),
    priority        INTEGER NOT NULL,       -- lower runs first; FIFO (rowid) within a priority
    revision_id     TEXT,                   -- NULL only for jobs imported from job.json
    export_id       TEXT REFERENCES exports (id),
    request         TEXT NOT NULL,          -- JSON
    created_at      TEXT NOT NULL,
    started_at      TEXT,                   -- start of the latest attempt
    finished_at     TEXT,
    lease_until     REAL,                   -- unix time; set only while running
    attempt         INTEGER NOT NULL DEFAULT 0,  -- latest attempt number, 0 = never ran
    error           TEXT,
    error_code      TEXT,
    artifact_id     TEXT,
    animations_done INTEGER NOT NULL DEFAULT 0,
    progress_pct    REAL                    -- composite only (measured from ffmpeg out_time)
);
CREATE INDEX jobs_by_status ON jobs (status, priority);
CREATE INDEX jobs_by_project ON jobs (project, created_at);
CREATE INDEX jobs_by_export ON jobs (export_id);

CREATE TABLE job_deps (
    job_id     TEXT NOT NULL REFERENCES jobs (id),
    depends_on TEXT NOT NULL REFERENCES jobs (id),
    PRIMARY KEY (job_id, depends_on)
);
CREATE INDEX job_deps_reverse ON job_deps (depends_on);

CREATE TABLE job_attempts (
    job_id      TEXT NOT NULL REFERENCES jobs (id),
    n           INTEGER NOT NULL,           -- 1, 2, ...
    status      TEXT NOT NULL,              -- running, then the job's terminal status
    started_at  TEXT NOT NULL,
    finished_at TEXT,
    exit_code   INTEGER,
    error       TEXT,
    log_path    TEXT NOT NULL,              -- absolute path of this attempt's log file
    PRIMARY KEY (job_id, n)
);
