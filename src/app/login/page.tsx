import { redirect } from "next/navigation";

/**
 * Login route - Redirects to the actual sign-in page
 * This provides a cleaner /login URL while maintaining the existing /auth/sign-in route
 */
export default function LoginPage() {
  redirect("/auth/sign-in");
}







