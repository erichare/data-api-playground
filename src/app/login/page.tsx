import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { AUTH_COOKIE_NAME, isAuthEnabled, isAuthenticatedCookieValue } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (!isAuthEnabled()) {
    redirect("/");
  }

  const cookieStore = await cookies();
  const isAuthenticated = isAuthenticatedCookieValue(
    cookieStore.get(AUTH_COOKIE_NAME)?.value
  );

  if (isAuthenticated) {
    redirect("/");
  }

  const params = await searchParams;
  const nextPath =
    params.next && params.next.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/";

  return <LoginForm nextPath={nextPath} />;
}
