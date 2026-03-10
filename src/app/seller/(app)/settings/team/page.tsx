"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Card, { CardContent, CardHeader } from "@/components/ui2/Card";
import Button from "@/components/ui2/Button";
import Input from "@/components/ui2/Input";
import AppShell from "@/components/ui2/AppShell";
import Badge from "@/components/ui2/Badge";
import { fetchJson } from "@/lib/clientFetch";

interface TeamMember {
  id: string;
  userId: string;
  email: string;
  fullName: string | null;
  companyName: string | null;
  role: "ADMIN" | "MEMBER";
  status: string;
  verifiedAt: string | null;
}

interface PendingInvite {
  id: string;
  email: string;
  invitedBy: string;
  invitedByName: string;
  expiresAt: string;
  createdAt: string;
}

export default function SellerTeamSettingsPage() {
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadTeam();
  }, []);

  const loadTeam = async () => {
    try {
      const result = await fetchJson("/api/seller/settings/team", {
        method: "GET",
      });

      if (!result.ok) {
        console.error("[TEAM_LOAD_FAIL]", { 
          status: result.status, 
          text: result.text, 
          json: result.json 
        });
        const errorMessage = result.json?.message || result.json?.error || result.text || "Failed to load team";
        setError(errorMessage);
        return;
      }

      if (result.json?.ok) {
        setMembers(result.json.members || []);
        setPendingInvites(result.json.pendingInvites || []);
        setError(""); // Clear any previous errors
      } else {
        const errorMessage = result.json?.message || result.json?.error || result.text || "Failed to load team";
        setError(errorMessage);
      }
    } catch (err) {
      console.error("[TEAM_LOAD_FAIL]", { error: err });
      setError(err instanceof Error ? err.message : "Failed to load team");
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInviting(true);

    try {
      const result = await fetchJson("/api/seller/settings/team/invite", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, role: "MEMBER" }),
      });

      if (!result.ok) {
        const errorMessage = result.json?.message || result.json?.error || result.text || "Failed to send invite";
        setError(errorMessage);
        return;
      }

      setInviteEmail("");
      await loadTeam(); // Reload to show new invite
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!confirm("Are you sure you want to revoke this invite?")) {
      return;
    }

    try {
      const result = await fetchJson("/api/seller/settings/team/revoke", {
        method: "POST",
        body: JSON.stringify({ inviteId }),
      });

      if (!result.ok) {
        const errorMessage = result.json?.message || result.json?.error || result.text || "Failed to revoke invite";
        setError(errorMessage);
        return;
      }

      await loadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke invite");
    }
  };

  const isAdmin = members.some((m) => m.role === "ADMIN" && m.status === "ACTIVE");

  return (
    <AppShell role="seller" active="settings">
      <div className="flex flex-1 px-6 py-8">
        <div className="w-full max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
              Team Settings
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
              Manage team members and send invitations
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Send Invite Section (Admin only) */}
          {isAdmin && (
            <Card className="mb-6">
              <CardHeader>
                <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
                  Send Invitation
                </h2>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSendInvite} className="space-y-4">
                  <Input
                    label="Email Address"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    required
                    disabled={inviting}
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={inviting || !inviteEmail.trim()}
                  >
                    {inviting ? "Sending..." : "Send Invitation"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Team Members */}
          <Card className="mb-6">
            <CardHeader>
              <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
                Team Members
              </h2>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-zinc-600 dark:text-zinc-400 text-center py-4">Loading...</p>
              ) : members.length === 0 ? (
                <p className="text-zinc-600 dark:text-zinc-400 text-center py-4">No team members yet</p>
              ) : (
                <div className="space-y-3">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 border border-zinc-200 dark:border-zinc-800 rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-black dark:text-zinc-50">
                            {member.fullName || member.companyName || member.email}
                          </span>
                          <Badge variant="default">
                            {member.role}
                          </Badge>
                          <Badge variant={member.status === "ACTIVE" ? "success" : "default"}>
                            {member.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                          {member.email}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Invites */}
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
                Pending Invitations
              </h2>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-zinc-600 dark:text-zinc-400 text-center py-4">Loading...</p>
              ) : pendingInvites.length === 0 ? (
                <p className="text-zinc-600 dark:text-zinc-400 text-center py-4">No pending invitations</p>
              ) : (
                <div className="space-y-3">
                  {pendingInvites.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex items-center justify-between p-3 border border-zinc-200 dark:border-zinc-800 rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-black dark:text-zinc-50">
                          {invite.email}
                        </div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                          Invited by {invite.invitedByName} • Expires {new Date(invite.expiresAt).toLocaleDateString()}
                        </p>
                      </div>
                      {isAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRevokeInvite(invite.id)}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

