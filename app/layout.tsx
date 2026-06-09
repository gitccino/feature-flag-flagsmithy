import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Code_Pro } from "next/font/google";
import "./globals.css";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
const sourceCodePro = Source_Code_Pro({
  variable: "--font-source-code-pro",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flagsmithy",
  description: "Feature Flags Platform",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} ${sourceCodePro.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground min-h-full">
        {/* <header className="bt bg-background sticky top-0 z-10 mx-auto flex w-full max-w-6xl items-center border-b-0 px-2 py-1 backdrop-blur-md">
          <div className="flex flex-1 items-center">
            <div>
              <Button variant="link" asChild>
                <Link href="/">Dashboard</Link>
              </Button>
              <Button variant="link" asChild>
                <Link href="/segments">Segments</Link>
              </Button>
            </div>
          </div>
        </header> */}
        <main>{children}</main>
      </body>
    </html>
  );
}
