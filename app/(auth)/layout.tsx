export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="w-full max-w-sm px-4">{children}</div>
    </div>
  );
}
