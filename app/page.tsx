"use client";

import { useEffect, useState } from "react";

type Review = {
  id: string;
  anime_title: string;
  rating: string;
  review_text: string;
  updated_at: string;
};

type ChangeRecord = Review & {
  deleted_at: string | null;
  _change_type: string;
  _commit_version: string;
  _commit_timestamp: string;
};

const emptyForm = {
  anime_title: "",
  rating: "",
  review_text: ""
};

export default function Page() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [startVersion, setStartVersion] = useState("");
  const [changes, setChanges] = useState<ChangeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function request<T>(url: string, options?: RequestInit) {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(JSON.stringify(data));
    }

    return data as T;
  }

  async function loadReviews() {
    setLoading(true);
    setMessage("");

    try {
      const data = await request<Review[]>("/api/reviews");
      setReviews(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load reviews.");
    } finally {
      setLoading(false);
    }
  }

  async function createReview() {
    setLoading(true);
    setMessage("");

    try {
      await request("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      setForm(emptyForm);
      setMessage("Review added with an automatically generated ID.");
      await loadReviews();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to add review.");
    } finally {
      setLoading(false);
    }
  }

  async function updateReview(review: Review) {
    setLoading(true);
    setMessage("");

    try {
      await request("/api/reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(review)
      });
      setMessage(`Review ${review.id} updated.`);
      await loadReviews();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update review.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteReview(id: string) {
    setLoading(true);
    setMessage("");

    try {
      await request("/api/reviews", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      setMessage(`Review ${id} deleted.`);
      await loadReviews();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete review.");
    } finally {
      setLoading(false);
    }
  }

  async function loadChanges() {
    const trimmedVersion = startVersion.trim();
    const version = Number(trimmedVersion);

    if (!trimmedVersion || !Number.isInteger(version) || version < 0) {
      setMessage("Start commit version must be a non-negative integer.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const params = new URLSearchParams({ version: String(version) });
      const data = await request<ChangeRecord[]>(`/api/reviews/changes?${params}`);
      setChanges(data);
      setMessage(`Loaded ${data.length} change records from version ${version}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load CDF changes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReviews();
  }, []);

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Databricks Apps + Next.js</p>
        <h1>Anime Reviews CRUD</h1>
        <p className="lead">
          SQL Warehouse APIを使って、Unity Catalog Tableのレビューを作成・更新・論理削除します。
        </p>
      </section>

      <section className="panel">
        <h2>Create review</h2>
        <div className="form-grid">
          <label>
            Anime title
            <input
              value={form.anime_title}
              onChange={(event) => setForm({ ...form, anime_title: event.target.value })}
              placeholder="SPY x FAMILY"
            />
          </label>
          <label>
            Rating
            <input
              value={form.rating}
              onChange={(event) => setForm({ ...form, rating: event.target.value })}
              placeholder="4.2"
            />
          </label>
          <label>
            Review text
            <input
              value={form.review_text}
              onChange={(event) => setForm({ ...form, review_text: event.target.value })}
              placeholder="見やすい作品"
            />
          </label>
        </div>
        <button className="primary" disabled={loading} onClick={createReview}>
          Add review
        </button>
      </section>

      <section className="panel">
        <div className="section-header">
          <h2>Reviews</h2>
          <button disabled={loading} onClick={loadReviews}>
            Reload
          </button>
        </div>

        {message && <pre className="message">{message}</pre>}
        {loading && <p className="muted">Loading...</p>}

        <div className="review-list">
          {reviews.map((review) => (
            <article className="review-card" key={review.id}>
              <input className="id-input" title={review.id} value={review.id} readOnly />
              <input
                value={review.anime_title}
                onChange={(event) =>
                  setReviews((items) =>
                    items.map((item) =>
                      item.id === review.id ? { ...item, anime_title: event.target.value } : item
                    )
                  )
                }
              />
              <input
                value={review.rating}
                onChange={(event) =>
                  setReviews((items) =>
                    items.map((item) =>
                      item.id === review.id ? { ...item, rating: event.target.value } : item
                    )
                  )
                }
              />
              <input
                value={review.review_text}
                onChange={(event) =>
                  setReviews((items) =>
                    items.map((item) =>
                      item.id === review.id ? { ...item, review_text: event.target.value } : item
                    )
                  )
                }
              />
              <button disabled={loading} onClick={() => updateReview(review)}>
                Update
              </button>
              <button className="danger" disabled={loading} onClick={() => deleteReview(review.id)}>
                Delete
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <h2>Change Data Feed</h2>
            <p className="muted">
              Start commit versionを入力して、指定version以降の変更履歴を取得します。
            </p>
          </div>
          <button disabled={loading} onClick={loadChanges}>
            Load changes
          </button>
        </div>

        <div className="version-row">
          <label>
            Start commit version
            <input
              value={startVersion}
              onChange={(event) => setStartVersion(event.target.value)}
              placeholder="10"
            />
          </label>
        </div>

        <div className="change-list">
          {changes.map((change, index) => (
            <article className="change-card" key={`${change._commit_version}-${change.id}-${index}`}>
              <div>
                <span className="badge">{change._change_type}</span>
                <strong>version {change._commit_version}</strong>
              </div>
              <p>{change.anime_title}</p>
              <p className="muted">
                ID {change.id} / rating {change.rating} / committed {change._commit_timestamp}
              </p>
              <p className="muted">{change.review_text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
