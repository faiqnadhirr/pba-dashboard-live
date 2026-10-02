import "./globals.css";
export const metadata = {
  title: "PBA — Power Backup Analytic",
  description: "MBP deployment & BBS battery decision support — Telkomsel AREA1 (ENOM)",
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
