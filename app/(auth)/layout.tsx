import { Suspense } from "react";

// function AuthFormFallback() {
//   return (
//     <div className="space-y-6">
//       <div className="space-y-2">
//         <div className="bg-muted h-9 w-48 animate-pulse rounded-md" />
//         <div className="bg-muted h-4 w-64 animate-pulse rounded-md" />
//       </div>
//       <div className="space-y-4">
//         <div className="bg-muted h-10 animate-pulse rounded-md" />
//         <div className="bg-muted h-10 animate-pulse rounded-md" />
//         <div className="bg-muted h-10 animate-pulse rounded-md" />
//         <div className="bg-muted h-12 animate-pulse rounded-md" />
//       </div>
//     </div>
//   );
// }

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="w-full max-w-sm px-4">
        {/* <Suspense fallback={<AuthFormFallback />}>{children}</Suspense> */}
        <Suspense>{children}</Suspense>
      </div>
    </div>
  );
}

/**
 * Search params (?callbackURL=/segments) exist only in the browser URL.
 * During SSR/Static render Next.js doesn't know them yet.
 */
