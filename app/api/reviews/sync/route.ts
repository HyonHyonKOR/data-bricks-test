import { runSql } from "@/lib/databricks";

export const runtime = "nodejs";

const reviewsTable = process.env.REVIEWS_TABLE ?? "workspace.demo.anime_reviews";
const rdsReviewsTable =
  process.env.RDS_REVIEWS_TABLE ?? "workspace.demo.rds_anime_reviews_mock";
const syncStateTable = process.env.SYNC_STATE_TABLE ?? "workspace.demo.sync_state";
const syncName = "anime_reviews_to_rds";

function tableNameLiteral(value: string) {
  return value.replace(/'/g, "''");
}

function finiteNumber(value: unknown) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return null;
  }

  return numberValue;
}

async function loadLatestSourceVersion() {
  const historyRows = await runSql(`DESCRIBE HISTORY ${reviewsTable}`);
  const versions = historyRows
    .map((row) => finiteNumber(row.version))
    .filter((version) => version !== null);

  if (versions.length === 0) {
    throw new Error("Source table history is empty.");
  }

  return Math.max(...versions);
}

async function loadLastSyncedVersion() {
  const rows = await runSql(`
    SELECT last_commit_version
    FROM ${syncStateTable}
    WHERE sync_name = '${syncName}'
    LIMIT 1
  `);

  return finiteNumber(rows[0]?.last_commit_version);
}

async function loadRdsRows() {
  return runSql(`
    SELECT
      id,
      anime_title,
      rating,
      review_text,
      updated_at,
      deleted_at,
      synced_at
    FROM ${rdsReviewsTable}
    ORDER BY id
  `);
}

export async function GET() {
  const rdsRows = await loadRdsRows();

  return Response.json({ rdsRows });
}

export async function POST() {
  const lastSyncedVersion = await loadLastSyncedVersion();
  const latestSourceVersion = await loadLatestSourceVersion();
  const startVersion = lastSyncedVersion === null ? 0 : lastSyncedVersion + 1;
  const sourceTable = tableNameLiteral(reviewsTable);

  if (startVersion > latestSourceVersion) {
    const rdsRows = await loadRdsRows();

    return Response.json({
      ok: true,
      synced: false,
      changeCount: 0,
      lastSyncedVersion,
      startVersion,
      latestSourceVersion,
      maxCommitVersion: null,
      rdsRows
    });
  }

  const stats = await runSql(`
    SELECT
      COUNT(*) AS change_count,
      MAX(_commit_version) AS max_commit_version
    FROM table_changes('${sourceTable}', ${startVersion})
    WHERE _change_type IN ('insert', 'update_postimage')
  `);

  const changeCount = Number(stats[0]?.change_count ?? 0);
  const maxCommitVersion =
    stats[0]?.max_commit_version == null ? null : Number(stats[0].max_commit_version);

  if (changeCount === 0 || maxCommitVersion === null || Number.isNaN(maxCommitVersion)) {
    const rdsRows = await loadRdsRows();
    return Response.json({
      ok: true,
      synced: false,
      changeCount: 0,
      lastSyncedVersion,
      startVersion,
      latestSourceVersion,
      maxCommitVersion: null,
      rdsRows
    });
  }

  await runSql(`
    MERGE INTO ${rdsReviewsTable} AS target
    USING (
      SELECT
        id,
        anime_title,
        rating,
        review_text,
        updated_at,
        deleted_at
      FROM (
        SELECT
          id,
          anime_title,
          rating,
          review_text,
          updated_at,
          deleted_at,
          ROW_NUMBER() OVER (
            PARTITION BY id
            ORDER BY _commit_version DESC, _commit_timestamp DESC
          ) AS rn
        FROM table_changes('${sourceTable}', ${startVersion})
        WHERE _change_type IN ('insert', 'update_postimage')
      )
      WHERE rn = 1
    ) AS source
    ON target.id = source.id

    WHEN MATCHED THEN UPDATE SET
      target.anime_title = source.anime_title,
      target.rating = source.rating,
      target.review_text = source.review_text,
      target.updated_at = source.updated_at,
      target.deleted_at = source.deleted_at,
      target.synced_at = current_timestamp()

    WHEN NOT MATCHED THEN INSERT
      (id, anime_title, rating, review_text, updated_at, deleted_at, synced_at)
    VALUES
      (
        source.id,
        source.anime_title,
        source.rating,
        source.review_text,
        source.updated_at,
        source.deleted_at,
        current_timestamp()
      )
  `);

  await runSql(`
    MERGE INTO ${syncStateTable} AS target
    USING (
      SELECT
        '${syncName}' AS sync_name,
        CAST(${maxCommitVersion} AS BIGINT) AS last_commit_version,
        current_timestamp() AS updated_at
    ) AS source
    ON target.sync_name = source.sync_name

    WHEN MATCHED THEN UPDATE SET
      target.last_commit_version = source.last_commit_version,
      target.updated_at = source.updated_at

    WHEN NOT MATCHED THEN INSERT
      (sync_name, last_commit_version, updated_at)
    VALUES
      (source.sync_name, source.last_commit_version, source.updated_at)
  `);

  const rdsRows = await loadRdsRows();

  return Response.json({
    ok: true,
    synced: true,
    changeCount,
    lastSyncedVersion,
    startVersion,
    latestSourceVersion,
    maxCommitVersion,
    rdsRows
  });
}
