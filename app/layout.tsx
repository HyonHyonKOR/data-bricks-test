import "./globals.css";

export const metadata = {
  title: "Databricks Anime Reviews CRUD",
  description: "Next.js CRUD app running on Databricks Apps"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
