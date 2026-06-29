# Databricks Next.js CRUD App

Databricks Apps 上で Next.js を実行し、SQL Warehouse API 経由で
`workspace.demo.anime_reviews` テーブルを CRUD する検証用アプリです。

## 1. 先に Databricks SQL Editor でテーブルを作成

```sql
CREATE SCHEMA IF NOT EXISTS demo;

CREATE OR REPLACE TABLE demo.anime_reviews (
  id INT,
  anime_title STRING,
  rating DOUBLE,
  review_text STRING,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);

INSERT INTO demo.anime_reviews VALUES
  (1, '葬送のフリーレン', 4.5, '静かだけど深い作品', current_timestamp(), NULL),
  (2, '呪術廻戦', 4.0, '戦闘シーンが強い', current_timestamp(), NULL);
```

既存テーブルに `deleted_at` だけ追加する場合:

```sql
ALTER TABLE demo.anime_reviews ADD COLUMN deleted_at TIMESTAMP;
```

## 2. Databricks App resources

作成済み App の App resources で、以下の key 名になっていることを確認します。

| Resource | key | Permission |
| --- | --- | --- |
| SQL warehouse | `sql-warehouse` | Can use |
| Unity Catalog table | `table` | Select / Modify |

このプロジェクトの `app.yaml` は上記 key を前提にしています。
key 名が違う場合は、`app.yaml` の `valueFrom` を Databricks Apps 側の key 名に合わせてください。

## 3. GitHub に push

```bash
git init
git add .
git commit -m "Initial Databricks Next.js CRUD app"
git branch -M main
git remote add origin https://github.com/<your-account>/<your-repo>.git
git push -u origin main
```

## 4. Databricks Apps で Deploy

1. Databricks Apps で対象 App を開く
2. `Deploy` をクリック
3. Source として GitHub repository を選択
4. Branch は `main`
5. Source path は repository root の場合は空欄
6. Deploy

## 5. このアプリの動き

```text
Browser
→ Next.js page
→ Next.js API Route
→ Databricks SQL Statement Execution API
→ SQL Warehouse
→ Unity Catalog Table
```

App 内では Personal Access Token を使いません。
Databricks Apps が提供する `DATABRICKS_HOST`、`DATABRICKS_CLIENT_ID`、
`DATABRICKS_CLIENT_SECRET` と App resource の `WAREHOUSE_ID` / `REVIEWS_TABLE`
を使って SQL を実行します。
