import { randomUUID } from "crypto";
import { runSql } from "@/lib/databricks";

export const runtime = "nodejs";

const reviewsTable = process.env.REVIEWS_TABLE ?? "workspace.demo.anime_reviews";

export async function GET() {
  const rows = await runSql(`
    SELECT id, anime_title, rating, review_text, updated_at
    FROM ${reviewsTable}
    WHERE deleted_at IS NULL
    ORDER BY id
  `);

  return Response.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const id = randomUUID();

  await runSql(
    `
      INSERT INTO ${reviewsTable}
        (id, anime_title, rating, review_text, updated_at, deleted_at)
      VALUES
        (:id, :anime_title, CAST(:rating AS DOUBLE), :review_text, current_timestamp(), NULL)
    `,
    [
      { name: "id", value: id, type: "STRING" },
      { name: "anime_title", value: String(body.anime_title), type: "STRING" },
      { name: "rating", value: String(body.rating), type: "DOUBLE" },
      { name: "review_text", value: String(body.review_text), type: "STRING" }
    ]
  );

  return Response.json({ ok: true });
}

export async function PATCH(request: Request) {
  const body = await request.json();

  await runSql(
    `
      UPDATE ${reviewsTable}
      SET anime_title = :anime_title,
          rating = CAST(:rating AS DOUBLE),
          review_text = :review_text,
          updated_at = current_timestamp()
      WHERE id = :id
    `,
    [
      { name: "id", value: String(body.id), type: "STRING" },
      { name: "anime_title", value: String(body.anime_title), type: "STRING" },
      { name: "rating", value: String(body.rating), type: "DOUBLE" },
      { name: "review_text", value: String(body.review_text), type: "STRING" }
    ]
  );

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const body = await request.json();

  await runSql(
    `
      UPDATE ${reviewsTable}
      SET deleted_at = current_timestamp()
      WHERE id = :id
    `,
    [{ name: "id", value: String(body.id), type: "STRING" }]
  );

  return Response.json({ ok: true });
}
