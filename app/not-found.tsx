import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2">
      <h2 className="text-4xl font-bold">Not Found</h2>
      <p>Could not find requested resource</p>
      <Button size="xl" className="mt-2" asChild>
        <Link href="/">Return Home</Link>
      </Button>
    </div>
  );
}
