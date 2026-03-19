"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { signOut } from "@/lib/auth/client";
import AuthGuard from "@/lib/authGuard";
import Header from "@/components/Header";

export default function ProfilePage() {
  const router = useRouter();
  const { user, status } = useAuth();

  const handleSignOut = async () => {
    const redirectPath = await signOut();
    router.replace(redirectPath);

  };

  // AuthGuard handles auth check, but we still need to check loading state
  if (status === "loading" || !user) {
    return null;
  }

  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col bg-white">
        <Header />

        <main className="flex flex-1 px-6 py-16 max-w-4xl mx-auto w-full">
        <div className="w-full">
          <h1 className="text-3xl font-semibold text-black mb-8">Profile</h1>

          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-6 mb-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-zinc-600">
                  Role
                </label>
                <p className="text-lg text-black mt-1 capitalize">
                  {user.role?.toLowerCase() || "unknown"}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-600">
                  Company Name
                </label>
                <p className="text-lg text-black mt-1">{user.companyName}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-600">
                  Full Name
                </label>
                <p className="text-lg text-black mt-1">{user.fullName}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-600">Email</label>
                <p className="text-lg text-black mt-1">{user.email}</p>
              </div>

              {user.phone && (
                <div>
                  <label className="text-sm font-medium text-zinc-600">
                    Phone
                  </label>
                  <p className="text-lg text-black mt-1">{user.phone}</p>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-zinc-600">
                  Member Since
                </label>
                <p className="text-lg text-black mt-1">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="px-6 py-3 border border-zinc-300 rounded-lg hover:bg-zinc-100 text-black font-medium"
          >
            Sign out
          </button>
        </div>
      </main>
    </div>
    </AuthGuard>
  );
}

