import { runSql } from "@/lib/databricks";

export const runtime = "nodejs";

const reviewsTable = process.env.REVIEWS_TABLE ?? "workspace.demo.anime_reviews";

function tableNameLiteral(value: string) {
  return value.replace(/'/g, "''");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const versionParam = searchParams.get("version");

  if (!versionParam || !/^\d+$/.test(versionParam)) {
    return Response.json(
      { error: "version must be a non-negative integer." },
      { status: 400 }
    );
  }

  const version = Number(versionParam);

  const tableName = tableNameLiteral(reviewsTable);

  const rows = await runSql(`
    SELECT
      id,
      anime_title,
      rating,
      review_text,
      updated_at,
      deleted_at,
      _change_type,
      _commit_version,
      _commit_timestamp
    FROM table_changes('${tableName}', ${version})
    ORDER BY _commit_version, id
  `);

  return Response.json(rows);
}
