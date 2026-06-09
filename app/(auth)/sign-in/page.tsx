import Link from 'next/link';

export default function SignInPage() {
  return (
    <div className='space-y-6'>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link
            href="/sign-up"
            className="ml-2 text-primary underline underline-offset-4"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
