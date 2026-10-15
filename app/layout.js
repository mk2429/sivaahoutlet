import "./globals.css";

export const metadata = {
  title: "Sivaah | Outlet Management",
  description: "Sivaah Outlet Management System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}