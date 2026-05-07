import { useState, useEffect } from "react";
import { User, Lock, Eye, EyeOff, Save, Loader2, Camera, Shield, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  return fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  }).then(async r => {
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Request failed");
    return d;
  });
}

export default function AdminProfilePage() {
  const { toast } = useToast();

  const [profile, setProfile] = useState({ name: "", email: "", phone: "", profileImage: "", role: "" });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [showPw, setShowPw] = useState({ curr: false, new: false, conf: false });
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    apiFetch("/api/admin/profile")
      .then(d => setProfile({ name: d.name ?? "", email: d.email ?? "", phone: d.phone ?? "", profileImage: d.profileImage ?? "", role: d.role ?? "admin" }))
      .catch(e => toast({ variant: "destructive", title: e.message }))
      .finally(() => setLoadingProfile(false));
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.name.trim()) { toast({ variant: "destructive", title: "Name is required" }); return; }
    setSavingProfile(true);
    try {
      const updated = await apiFetch("/api/admin/profile", { method: "PUT", body: JSON.stringify(profile) });
      setProfile(p => ({ ...p, ...updated }));
      toast({ title: "Profile updated successfully" });
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) { toast({ variant: "destructive", title: "New passwords do not match" }); return; }
    if (pwForm.newPassword.length < 6) { toast({ variant: "destructive", title: "Password must be at least 6 characters" }); return; }
    setSavingPw(true);
    try {
      await apiFetch("/api/admin/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }),
      });
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast({ title: "Password changed successfully" });
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message });
    } finally {
      setSavingPw(false);
    }
  };

  if (loadingProfile) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-1">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Profile</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your admin account settings and security</p>
      </div>

      {/* Avatar card */}
      <div className="bg-white border border-border rounded-2xl p-6 flex items-center gap-5">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden shadow-sm">
            {profile.profileImage
              ? <img src={profile.profileImage} className="w-full h-full object-cover rounded-2xl" />
              : <span className="text-primary text-3xl font-black">{profile.name ? profile.name.charAt(0).toUpperCase() : "A"}</span>}
          </div>
          <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-md cursor-pointer hover:bg-primary/90 transition-colors">
            <Camera className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
        <div>
          <p className="text-xl font-bold">{profile.name || "Admin"}</p>
          <p className="text-sm text-muted-foreground">{profile.email || profile.phone}</p>
          <span className="mt-1.5 inline-block text-xs font-semibold bg-primary/10 text-primary px-2.5 py-0.5 rounded-full capitalize">{profile.role}</span>
        </div>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="mb-4">
          <TabsTrigger value="profile"><User className="w-4 h-4 mr-1.5" /> Profile Info</TabsTrigger>
          <TabsTrigger value="security"><Shield className="w-4 h-4 mr-1.5" /> Security</TabsTrigger>
        </TabsList>

        {/* ── Profile Tab ── */}
        <TabsContent value="profile">
          <div className="bg-white border border-border rounded-2xl p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2"><User className="w-4 h-4 text-primary" /> Personal Information</h2>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="admin-name">Full Name <span className="text-destructive">*</span></Label>
                  <Input id="admin-name" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                    placeholder="Admin name" data-testid="input-admin-name" />
                </div>
                <div>
                  <Label htmlFor="admin-phone">Phone Number</Label>
                  <Input id="admin-phone" value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+92 300 0000000" data-testid="input-admin-phone" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="admin-email">Email Address</Label>
                  <Input id="admin-email" type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
                    placeholder="admin@example.com" data-testid="input-admin-email" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="admin-avatar">Profile Image URL</Label>
                  <Input id="admin-avatar" value={profile.profileImage} onChange={e => setProfile(p => ({ ...p, profileImage: e.target.value }))}
                    placeholder="https://..." data-testid="input-admin-avatar" />
                  <p className="text-xs text-muted-foreground mt-1">Paste a direct image URL or use the upload button above</p>
                </div>
              </div>
              <div className="pt-2 border-t border-border">
                <Button type="submit" disabled={savingProfile} data-testid="button-save-admin-profile">
                  {savingProfile ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                  Save Profile
                </Button>
              </div>
            </form>
          </div>
        </TabsContent>

        {/* ── Security Tab ── */}
        <TabsContent value="security">
          <div className="bg-white border border-border rounded-2xl p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2"><KeyRound className="w-4 h-4 text-primary" /> Change Password</h2>
            <form onSubmit={handleChangePassword} className="space-y-4">
              {([
                { key: "curr" as const, label: "Current Password", field: "currentPassword" as const },
                { key: "new" as const, label: "New Password", field: "newPassword" as const },
                { key: "conf" as const, label: "Confirm New Password", field: "confirmPassword" as const },
              ] as const).map(({ key, label, field }) => (
                <div key={key}>
                  <Label>{label}</Label>
                  <div className="relative">
                    <Input type={showPw[key] ? "text" : "password"} value={pwForm[field]}
                      onChange={e => setPwForm(f => ({ ...f, [field]: e.target.value }))}
                      placeholder="••••••••" className="pr-9" />
                    <button type="button" onClick={() => setShowPw(s => ({ ...s, [key]: !s[key] }))}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPw[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ))}
              <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-xs text-muted-foreground">
                <p className="font-medium mb-1">Password requirements:</p>
                <p className={pwForm.newPassword.length >= 6 ? "text-green-600" : ""}>• Minimum 6 characters</p>
                <p className={/[A-Z]/.test(pwForm.newPassword) ? "text-green-600" : ""}>• At least one uppercase letter (recommended)</p>
                <p className={/[0-9]/.test(pwForm.newPassword) ? "text-green-600" : ""}>• At least one number (recommended)</p>
                <p className={pwForm.newPassword && pwForm.newPassword === pwForm.confirmPassword ? "text-green-600" : ""}>• Passwords match</p>
              </div>
              <div className="pt-2 border-t border-border">
                <Button type="submit" disabled={savingPw} data-testid="button-change-admin-password">
                  {savingPw ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Lock className="w-4 h-4 mr-1.5" />}
                  Change Password
                </Button>
              </div>
            </form>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
