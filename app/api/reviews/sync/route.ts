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

function versionFromBody(value: unknown) {
  const version = Number(value);

  if (!Number.isInteger(version) || version < 0) {
    return null;
  }

  return version;
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

export async function POST(request: Request) {
  const body = await request.json();
  const version = versionFromBody(body.version);

  if (version === null) {
    return Response.json(
      { error: "version must be a non-negative integer." },
      { status: 400 }
    );
  }

  const sourceTable = tableNameLiteral(reviewsTable);

  const stats = await runSql(`
    SELECT
      COUNT(*) AS change_count,
      MAX(_commit_version) AS max_commit_version
    FROM table_changes('${sourceTable}', ${version})
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
        FROM table_changes('${sourceTable}', ${version})
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
    maxCommitVersion,
    rdsRows
  });
}
