import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Helmet } from "react-helmet-async";
import { User, Package, Wallet, Star, LogOut, ChevronRight, Clock, MapPin, Plus, Edit2, Trash2, Check, Lock, Eye, EyeOff, Shield, Loader2, Save, Pencil, X, Trash, Truck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useListOrders,
  useGetWalletBalance,
  useGetLoyaltyBalance,
  getGetMeQueryKey,
  getListOrdersQueryKey,
  getGetWalletBalanceQueryKey,
  getGetLoyaltyBalanceQueryKey,
  OrderStatus,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  shipped: "bg-purple-100 text-purple-800",
  out_for_delivery: "bg-orange-100 text-orange-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const CITIES = ["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta", "Sialkot", "Gujranwala", "Other"];
const ADDR_LABELS = ["Home", "Work", "Other"];
const emptyAddr = { label: "Home", name: "", phone: "", address: "", area: "", city: "", postalCode: "" };

interface Address {
  id: number; userId: number; label: string; name: string; phone: string;
  address: string; area?: string; city: string; postalCode?: string;
  country: string; isDefault: boolean; createdAt: string;
}

export default function AccountPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const { user, token, login, logout } = useAuth();
  const defaultTab = params.get("tab") || "profile";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  if (!user) { setLocation("/login"); return null; }

  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  // ─── Data queries ───
  const { data: profile, isLoading: profileLoading } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: ordersData, isLoading: ordersLoading } = useListOrders({ limit: 20 }, { query: { queryKey: getListOrdersQueryKey({ limit: 20 }) } });
  const { data: walletBalance, isLoading: walletLoading } = useGetWalletBalance({ query: { queryKey: getGetWalletBalanceQueryKey() } });
  const { data: loyaltyBalance, isLoading: loyaltyLoading } = useGetLoyaltyBalance({ query: { queryKey: getGetLoyaltyBalanceQueryKey() } });
  const { data: addresses = [], isLoading: addrLoading } = useQuery<Address[]>({
    queryKey: ["addresses"],
    queryFn: async () => {
      const res = await fetch("/api/addresses", { headers: authHeaders });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const orders = ordersData?.items ?? [];
  const displayUser = (profile as any) ?? user;

  // ─── Profile edit state ───
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: displayUser.name ?? "",
    email: displayUser.email ?? "",
    phone: displayUser.phone ?? "",
    city: displayUser.city ?? "",
    country: displayUser.country ?? "Pakistan",
    address: displayUser.address ?? "",
    postalCode: displayUser.postalCode ?? "",
    gender: (displayUser as any).gender ?? "",
    dateOfBirth: (displayUser as any).dateOfBirth ?? "",
  });
  const [savingProfile, setSavingProfile] = useState(false);

  const openEdit = () => {
    setProfileForm({
      name: displayUser.name ?? "",
      email: displayUser.email ?? "",
      phone: displayUser.phone ?? "",
      city: displayUser.city ?? "",
      country: displayUser.country ?? "Pakistan",
      address: displayUser.address ?? "",
      postalCode: displayUser.postalCode ?? "",
      gender: (displayUser as any).gender ?? "",
      dateOfBirth: (displayUser as any).dateOfBirth ?? "",
    });
    setEditingProfile(true);
  };

  const handleSaveProfile = async () => {
    if (!profileForm.name.trim()) { toast({ variant: "destructive", title: "Name is required" }); return; }
    setSavingProfile(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PUT", headers: authHeaders, body: JSON.stringify(profileForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      login(token!, { ...user, ...data });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setEditingProfile(false);
      toast({ title: "Profile updated successfully" });
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message });
    } finally {
      setSavingProfile(false);
    }
  };

  // ─── Password state ───
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [showPw, setShowPw] = useState({ curr: false, new: false, conf: false });
  const [savingPw, setSavingPw] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) { toast({ variant: "destructive", title: "Passwords do not match" }); return; }
    if (pwForm.newPassword.length < 6) { toast({ variant: "destructive", title: "Password must be at least 6 characters" }); return; }
    setSavingPw(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST", headers: authHeaders,
        body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast({ title: "Password changed successfully" });
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message });
    } finally {
      setSavingPw(false);
    }
  };

  // ─── Delete account state ───
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletingAcct, setDeletingAcct] = useState(false);

  const handleDeleteAccount = async () => {
    if (!deletePassword) { toast({ variant: "destructive", title: "Enter your password" }); return; }
    setDeletingAcct(true);
    try {
      const res = await fetch("/api/auth/account", {
        method: "DELETE", headers: authHeaders, body: JSON.stringify({ password: deletePassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      logout();
      setLocation("/");
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message });
    } finally {
      setDeletingAcct(false);
    }
  };

  // ─── Address state ───
  const [addrForm, setAddrForm] = useState({ ...emptyAddr });
  const [editAddrId, setEditAddrId] = useState<number | null>(null);
  const [showAddrForm, setShowAddrForm] = useState(false);

  const createAddr = useMutation({
    mutationFn: async (data: typeof emptyAddr) => {
      const res = await fetch("/api/addresses", { method: "POST", headers: authHeaders, body: JSON.stringify({ ...data, isDefault: addresses.length === 0 }) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["addresses"] }); closeAddrForm(); toast({ title: "Address added" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const updateAddr = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof emptyAddr }) => {
      const res = await fetch(`/api/addresses/${id}`, { method: "PUT", headers: authHeaders, body: JSON.stringify(data) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["addresses"] }); closeAddrForm(); toast({ title: "Address updated" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const deleteAddr = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/addresses/${id}`, { method: "DELETE", headers: authHeaders });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["addresses"] }); toast({ title: "Address removed" }); },
  });

  const defaultAddr = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/addresses/${id}/default`, { method: "PATCH", headers: authHeaders });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["addresses"] }),
  });

  const closeAddrForm = () => { setShowAddrForm(false); setEditAddrId(null); setAddrForm({ ...emptyAddr }); };
  const openEditAddr = (a: Address) => {
    setAddrForm({ label: a.label, name: a.name, phone: a.phone, address: a.address, area: a.area ?? "", city: a.city, postalCode: a.postalCode ?? "" });
    setEditAddrId(a.id); setShowAddrForm(true);
  };
  const handleAddrSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editAddrId !== null) updateAddr.mutate({ id: editAddrId, data: addrForm });
    else createAddr.mutate(addrForm);
  };

  const handleLogout = () => { logout(); setLocation("/"); };

  // Profile completion
  const pfFields = [displayUser.name, displayUser.email, displayUser.city, displayUser.address, (displayUser as any).gender];
  const pfFilled = pfFields.filter(Boolean).length;
  const completionPct = Math.round((pfFilled / pfFields.length) * 100);

  return (
    <>
      <Helmet>
        <title>My Account — KDF Plus</title>
        <link rel="canonical" href="/kdf-plus/account" />
      </Helmet>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {/* Profile Header */}
        <div className="bg-white border border-border rounded-2xl p-5 mb-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {(displayUser as any).profileImage
              ? <img src={(displayUser as any).profileImage} className="w-full h-full object-cover rounded-full" />
              : <span className="text-primary text-xl font-black">{displayUser.name.charAt(0).toUpperCase()}</span>}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate" data-testid="text-user-name">{displayUser.name}</h1>
            <p className="text-sm text-muted-foreground" data-testid="text-user-phone">{displayUser.phone}</p>
            {displayUser.email && <p className="text-xs text-muted-foreground">{displayUser.email}</p>}
            {completionPct < 100 && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${completionPct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground">{completionPct}% complete</span>
              </div>
            )}
          </div>
          <Button variant="ghost" size="sm" className="text-destructive flex-shrink-0" onClick={handleLogout} data-testid="button-logout">
            <LogOut className="w-4 h-4 mr-1.5" /> Logout
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
          <div className="bg-white border border-border rounded-xl p-4 text-center">
            <Package className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-black" data-testid="text-orders-count">{ordersData?.total ?? 0}</p>
            <p className="text-xs text-muted-foreground">Orders</p>
          </div>
          <div className="bg-white border border-border rounded-xl p-4 text-center">
            <Wallet className="w-5 h-5 text-secondary mx-auto mb-1" />
            {walletLoading ? <Skeleton className="h-7 w-16 mx-auto mb-1" /> : (
              <p className="text-xl font-black text-secondary" data-testid="text-wallet-balance">
                Rs. {walletBalance ? parseFloat(walletBalance.balance).toLocaleString() : "0"}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Wallet</p>
          </div>
          <div className="bg-white border border-border rounded-xl p-4 text-center col-span-2 sm:col-span-1">
            <Star className="w-5 h-5 text-yellow-500 mx-auto mb-1" />
            {loyaltyLoading ? <Skeleton className="h-7 w-16 mx-auto mb-1" /> : (
              <p className="text-xl font-black text-yellow-600" data-testid="text-loyalty-points">{loyaltyBalance?.points ?? 0}</p>
            )}
            <p className="text-xs text-muted-foreground">Loyalty Points</p>
          </div>
        </div>

        <Tabs defaultValue={defaultTab}>
          <TabsList className="mb-4 flex-wrap h-auto gap-1">
            <TabsTrigger value="profile" data-testid="tab-profile"><User className="w-4 h-4 mr-1.5" /> Profile</TabsTrigger>
            <TabsTrigger value="orders" data-testid="tab-orders"><Package className="w-4 h-4 mr-1.5" /> Orders</TabsTrigger>
            <TabsTrigger value="addresses" data-testid="tab-addresses"><MapPin className="w-4 h-4 mr-1.5" /> Addresses</TabsTrigger>
            <TabsTrigger value="wallet" data-testid="tab-wallet"><Wallet className="w-4 h-4 mr-1.5" /> Wallet</TabsTrigger>
            <TabsTrigger value="security" data-testid="tab-security"><Shield className="w-4 h-4 mr-1.5" /> Security</TabsTrigger>
          </TabsList>

          {/* ── Profile Tab ── */}
          <TabsContent value="profile">
            <div className="bg-white border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Personal Information</h2>
                {!editingProfile && (
                  <Button variant="outline" size="sm" onClick={openEdit} data-testid="button-edit-profile">
                    <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                  </Button>
                )}
              </div>

              {!editingProfile ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  {[
                    { label: "Full Name", value: displayUser.name },
                    { label: "Phone", value: displayUser.phone },
                    { label: "Email", value: displayUser.email || "—" },
                    { label: "Gender", value: (displayUser as any).gender || "—" },
                    { label: "Date of Birth", value: (displayUser as any).dateOfBirth || "—" },
                    { label: "City", value: displayUser.city || "—" },
                    { label: "Country", value: displayUser.country || "Pakistan" },
                    { label: "Address", value: displayUser.address || "—" },
                    { label: "Postal Code", value: displayUser.postalCode || "—" },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                      <p className="font-medium capitalize">{value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><Label className="text-xs">Full Name *</Label><Input value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))} data-testid="input-name" /></div>
                    <div><Label className="text-xs">Phone</Label><Input value={profileForm.phone} onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))} /></div>
                    <div><Label className="text-xs">Email</Label><Input type="email" value={profileForm.email} onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))} /></div>
                    <div>
                      <Label className="text-xs">Gender</Label>
                      <select value={profileForm.gender} onChange={e => setProfileForm(f => ({ ...f, gender: e.target.value }))}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
                        <option value="">Select gender</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div><Label className="text-xs">Date of Birth</Label><Input type="date" value={profileForm.dateOfBirth} onChange={e => setProfileForm(f => ({ ...f, dateOfBirth: e.target.value }))} /></div>
                    <div>
                      <Label className="text-xs">City</Label>
                      <select value={profileForm.city} onChange={e => setProfileForm(f => ({ ...f, city: e.target.value }))}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
                        <option value="">Select city</option>
                        {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div><Label className="text-xs">Street Address</Label><Input value={profileForm.address} onChange={e => setProfileForm(f => ({ ...f, address: e.target.value }))} /></div>
                    <div><Label className="text-xs">Postal Code</Label><Input value={profileForm.postalCode} onChange={e => setProfileForm(f => ({ ...f, postalCode: e.target.value }))} /></div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={() => setEditingProfile(false)} disabled={savingProfile}><X className="w-3.5 h-3.5 mr-1" />Cancel</Button>
                    <Button size="sm" onClick={handleSaveProfile} disabled={savingProfile} data-testid="button-save-profile">
                      {savingProfile ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                      Save Changes
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Orders Tab ── */}
          <TabsContent value="orders">
            <div className="space-y-3">
              {ordersLoading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />) :
               orders.length === 0 ? (
                <div className="bg-white border border-border rounded-2xl p-10 text-center">
                  <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <h3 className="font-semibold mb-1">No orders yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">Your order history will appear here.</p>
                  <Button onClick={() => setLocation("/products")} data-testid="button-start-shopping">Start Shopping</Button>
                </div>
              ) : (
                orders.map(order => (
                  <div key={order.id} className="bg-white border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all"
                    data-testid={`order-card-${order.id}`}>
                    <div
                      className="flex items-start justify-between gap-3 cursor-pointer"
                      onClick={() => setLocation(`/order/${order.id}`)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-sm">#{order.orderNumber}</p>
                          <Badge className={`${STATUS_COLORS[order.status]} text-xs py-0 px-1.5`}>{order.status.replace(/_/g, " ")}</Badge>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {new Date(order.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                        {order.items && <p className="text-xs text-muted-foreground mt-1">{order.items.length} item{order.items.length !== 1 ? "s" : ""}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sm">Rs. {parseFloat(order.total).toLocaleString()}</p>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                    {/* Tracking info row */}
                    {((order as any).trackingId || ["shipped", "out_for_delivery", "delivered"].includes(order.status)) && (
                      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Truck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#5FA800" }} />
                          {(order as any).trackingId ? (
                            <div className="min-w-0">
                              <p className="text-[10px] text-muted-foreground">Tracking ID</p>
                              <p className="text-xs font-mono font-bold truncate">{(order as any).trackingId}</p>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">Shipment in progress</p>
                          )}
                        </div>
                        <button
                          onClick={() => setLocation(`/track?q=${encodeURIComponent((order as any).trackingId ?? order.orderNumber)}`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition-opacity hover:opacity-80"
                          style={{ backgroundColor: "#5FA800", color: "white" }}
                          data-testid={`button-track-${order.id}`}
                        >
                          <Truck className="w-3 h-3" /> Track Now
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          {/* ── Addresses Tab ── */}
          <TabsContent value="addresses">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Saved Addresses</h2>
                <Button size="sm" variant="outline" onClick={() => { closeAddrForm(); setShowAddrForm(true); }} data-testid="button-add-address">
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Address
                </Button>
              </div>

              {addrLoading && <Skeleton className="h-28 rounded-xl" />}

              {!addrLoading && addresses.length === 0 && !showAddrForm && (
                <div className="bg-white border border-border rounded-2xl p-8 text-center">
                  <MapPin className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-medium mb-1">No saved addresses</p>
                  <p className="text-sm text-muted-foreground mb-4">Add a delivery address for faster checkout</p>
                  <Button size="sm" onClick={() => setShowAddrForm(true)}>Add First Address</Button>
                </div>
              )}

              {addresses.map(a => (
                <div key={a.id} className="bg-white border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center"><MapPin className="w-4 h-4 text-primary" /></div>
                      <span className="font-semibold text-sm">{a.label}</span>
                      {a.isDefault && <Badge variant="secondary" className="text-[10px] py-0 px-1.5">Default</Badge>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditAddr(a)}><Edit2 className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteAddr.mutate(a.id)} disabled={deleteAddr.isPending}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.phone}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.address}{a.area ? `, ${a.area}` : ""}, {a.city}</p>
                  {!a.isDefault && (
                    <button onClick={() => defaultAddr.mutate(a.id)} disabled={defaultAddr.isPending}
                      className="mt-2 flex items-center gap-1 text-xs text-primary font-medium hover:underline disabled:opacity-50">
                      <Check className="w-3 h-3" /> Set as default
                    </button>
                  )}
                </div>
              ))}

              {showAddrForm && (
                <div className="bg-white border-2 border-primary/20 rounded-xl p-4">
                  <h3 className="font-semibold mb-3">{editAddrId ? "Edit Address" : "New Address"}</h3>
                  <form onSubmit={handleAddrSubmit} className="space-y-3">
                    <div className="flex gap-1.5">
                      {ADDR_LABELS.map(l => (
                        <button type="button" key={l} onClick={() => setAddrForm(f => ({ ...f, label: l }))}
                          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all ${addrForm.label === l ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:border-primary"}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label className="text-xs">Full Name *</Label><Input required value={addrForm.name} onChange={e => setAddrForm(f => ({ ...f, name: e.target.value }))} /></div>
                      <div><Label className="text-xs">Phone *</Label><Input required value={addrForm.phone} onChange={e => setAddrForm(f => ({ ...f, phone: e.target.value }))} /></div>
                      <div className="col-span-2"><Label className="text-xs">Street Address *</Label><Input required value={addrForm.address} onChange={e => setAddrForm(f => ({ ...f, address: e.target.value }))} /></div>
                      <div><Label className="text-xs">Area / Locality</Label><Input value={addrForm.area} onChange={e => setAddrForm(f => ({ ...f, area: e.target.value }))} /></div>
                      <div>
                        <Label className="text-xs">City *</Label>
                        <select required value={addrForm.city} onChange={e => setAddrForm(f => ({ ...f, city: e.target.value }))}
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
                          <option value="">Select city</option>
                          {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div><Label className="text-xs">Postal Code</Label><Input value={addrForm.postalCode} onChange={e => setAddrForm(f => ({ ...f, postalCode: e.target.value }))} /></div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button type="button" variant="outline" size="sm" onClick={closeAddrForm}>Cancel</Button>
                      <Button type="submit" size="sm" disabled={createAddr.isPending || updateAddr.isPending}>
                        {(createAddr.isPending || updateAddr.isPending) && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                        {editAddrId ? "Save Changes" : "Add Address"}
                      </Button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Wallet Tab ── */}
          <TabsContent value="wallet">
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-primary to-primary/80 rounded-2xl p-6 text-white">
                <p className="text-white/70 text-sm mb-1">Available Balance</p>
                <p className="text-3xl font-black" data-testid="text-wallet-balance-detail">
                  Rs. {walletBalance ? parseFloat(walletBalance.balance).toLocaleString() : "0"}
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="bg-white/10 rounded-lg px-3 py-2 text-sm">
                    <Star className="w-3.5 h-3.5 inline mr-1" />{loyaltyBalance?.points ?? 0} loyalty points
                  </div>
                </div>
              </div>
              <div className="bg-white border border-border rounded-xl p-4">
                <p className="text-sm text-muted-foreground">Use your wallet balance at checkout to pay for orders instantly. Earn loyalty points with every purchase.</p>
              </div>
            </div>
          </TabsContent>

          {/* ── Security Tab ── */}
          <TabsContent value="security">
            <div className="space-y-4">
              {/* Change Password */}
              <div className="bg-white border border-border rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center"><Lock className="w-4 h-4 text-primary" /></div>
                  <h2 className="font-semibold">Change Password</h2>
                </div>
                <form onSubmit={handleChangePassword} className="space-y-3">
                  {([
                    { key: "curr" as const, label: "Current Password", field: "currentPassword" as const },
                    { key: "new" as const, label: "New Password", field: "newPassword" as const },
                    { key: "conf" as const, label: "Confirm New Password", field: "confirmPassword" as const },
                  ] as const).map(({ key, label, field }) => (
                    <div key={key}>
                      <Label className="text-xs">{label}</Label>
                      <div className="relative">
                        <Input type={showPw[key] ? "text" : "password"} value={pwForm[field]}
                          onChange={e => setPwForm(f => ({ ...f, [field]: e.target.value }))} className="pr-9" />
                        <button type="button" onClick={() => setShowPw(s => ({ ...s, [key]: !s[key] }))}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showPw[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                    <p className={pwForm.newPassword.length >= 6 ? "text-green-600" : ""}>• Minimum 6 characters</p>
                    <p className={pwForm.newPassword !== pwForm.confirmPassword || !pwForm.confirmPassword ? "" : "text-green-600"}>• Passwords must match</p>
                  </div>
                  <Button type="submit" disabled={savingPw} data-testid="button-change-password">
                    {savingPw ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Lock className="w-4 h-4 mr-1.5" />}
                    Change Password
                  </Button>
                </form>
              </div>

              {/* Delete Account */}
              <div className="bg-white border border-destructive/20 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center"><Trash className="w-4 h-4 text-destructive" /></div>
                  <h2 className="font-semibold text-destructive">Delete Account</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-3">Permanently delete your account and all associated data. This action cannot be undone.</p>
                {!showDelete ? (
                  <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)} data-testid="button-delete-account-show">
                    Delete My Account
                  </Button>
                ) : (
                  <div className="space-y-3 border border-destructive/30 rounded-xl p-3">
                    <p className="text-sm font-medium text-destructive">Enter your password to confirm deletion:</p>
                    <Input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)}
                      placeholder="Your current password" data-testid="input-delete-password" />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setShowDelete(false); setDeletePassword(""); }}>Cancel</Button>
                      <Button variant="destructive" size="sm" onClick={handleDeleteAccount} disabled={deletingAcct} data-testid="button-confirm-delete">
                        {deletingAcct ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                        Confirm Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
