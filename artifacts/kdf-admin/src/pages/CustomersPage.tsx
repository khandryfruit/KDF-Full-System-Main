import { useState } from "react";
import {
  useListUsers,
  useUpdateUser,
  getListUsersQueryKey
} from "@workspace/api-client-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Edit, MessageCircle, ShoppingBag, TrendingUp, Eye, X, ChevronRight, Loader2, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const authHeaders = () => ({ Authorization: `Bearer ${ADMIN_TOKEN()}`, "Content-Type": "application/json" });

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  shipped: "bg-purple-100 text-purple-800",
  out_for_delivery: "bg-orange-100 text-orange-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

function CustomerProfileDrawer({ customer, onClose }: { customer: any; onClose: () => void }) {
  const { toast } = useToast();
  const [waMsg, setWaMsg] = useState("");
  const [sendingWa, setSendingWa] = useState(false);

  const { data: profile, isLoading } = useQuery<any>({
    queryKey: ["customer-profile", customer.id],
    queryFn: async () => {
      const r = await fetch(`/api/users/${customer.id}/profile`, { headers: authHeaders() });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 30000,
  });

  const sendWa = async () => {
    if (!waMsg.trim()) return;
    setSendingWa(true);
    try {
      const r = await fetch(`/api/users/${customer.id}/send-whatsapp`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ message: waMsg }),
      });
      const d = await r.json();
      if (d.success) {
        toast({ title: "Message sent!", description: d.message });
        setWaMsg("");
      } else {
        toast({ variant: "destructive", title: "Failed", description: d.message });
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not send message" });
    } finally {
      setSendingWa(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-lg bg-background h-full shadow-2xl overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-background z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
              {(customer.name ?? "?")[0].toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-base">{customer.name}</p>
              <p className="text-xs text-muted-foreground">{customer.phone}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-accent transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : profile ? (
          <div className="flex-1 p-6 space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Orders", value: profile.orderCount ?? 0, icon: ShoppingBag, color: "text-blue-600 bg-blue-50" },
                { label: "Total Spent", value: `Rs. ${Number(profile.totalSpent ?? 0).toLocaleString()}`, icon: TrendingUp, color: "text-green-600 bg-green-50" },
                { label: "Joined", value: profile.createdAt ? new Date(profile.createdAt).toLocaleDateString("en-PK", { month: "short", year: "numeric" }) : "-", icon: Eye, color: "text-purple-600 bg-purple-50" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="border border-border rounded-xl p-3 text-center">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-1.5 ${color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-bold text-sm mt-0.5 truncate">{value}</p>
                </div>
              ))}
            </div>

            {/* Customer info */}
            {(profile.email || profile.city) && (
              <div className="bg-muted/30 rounded-xl p-4 space-y-1.5 text-sm">
                {profile.email && <p><span className="text-muted-foreground">Email:</span> {profile.email}</p>}
                {profile.city && <p><span className="text-muted-foreground">City:</span> {profile.city}{profile.country ? `, ${profile.country}` : ""}</p>}
                {profile.address && <p><span className="text-muted-foreground">Address:</span> {profile.address}</p>}
              </div>
            )}

            {/* Send WhatsApp */}
            <div className="border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#25D366]">
                <MessageCircle className="w-4 h-4" /> Send WhatsApp Message
              </div>
              <Textarea
                value={waMsg}
                onChange={e => setWaMsg(e.target.value)}
                placeholder={`Hi {customer_name}, thanks for shopping with us!`}
                rows={3}
                className="text-sm resize-none"
              />
              <p className="text-[11px] text-muted-foreground">Use <code className="bg-muted px-1 rounded">{"{customer_name}"}</code> to personalise.</p>
              <Button
                onClick={sendWa}
                disabled={sendingWa || !waMsg.trim()}
                size="sm"
                className="gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white"
              >
                {sendingWa ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Send Message
              </Button>
            </div>

            {/* Order history */}
            <div>
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-muted-foreground" /> Order History
              </h3>
              {!profile.orders?.length ? (
                <p className="text-sm text-muted-foreground text-center py-6 bg-muted/20 rounded-xl">No orders found for this customer.</p>
              ) : (
                <div className="space-y-2">
                  {profile.orders.map((order: any) => (
                    <div key={order.id} className="border border-border rounded-xl p-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-semibold text-foreground">#{order.orderNumber}</span>
                          <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLOR[order.status] ?? "bg-gray-100 text-gray-700"}`}>
                            {order.status}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {new Date(order.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
                          {" · "}{(order.items as any[])?.length ?? 0} item{(order.items as any[])?.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-sm">Rs. {Number(order.total).toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{(order.paymentMethod ?? "cod").replace("_", " ")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Failed to load profile.</div>
        )}
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [profileCustomer, setProfileCustomer] = useState<any>(null);

  const { data: response, isLoading } = useListUsers({ page, limit: 10, search });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateMutation = useUpdateUser();

  const [formData, setFormData] = useState({
    name: "", phone: "", email: "", city: "", country: "", address: "", postalCode: "", role: "user" as any,
  });

  const handleOpenEdit = (customer: any) => {
    setFormData({
      name: customer.name || "", phone: customer.phone || "", email: customer.email || "",
      city: customer.city || "", country: customer.country || "", address: customer.address || "",
      postalCode: customer.postalCode || "", role: customer.role || "user",
    });
    setEditingCustomer(customer);
    setIsEditOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    updateMutation.mutate({ id: editingCustomer.id, data: formData }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setIsEditOpen(false);
        toast({ title: "Customer updated" });
      },
      onError: () => toast({ variant: "destructive", title: "Failed to update customer" }),
    });
  };

  return (
    <div className="space-y-6">
      {profileCustomer && (
        <CustomerProfileDrawer customer={profileCustomer} onClose={() => setProfileCustomer(null)} />
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
      </div>

      <div className="flex items-center relative w-full sm:w-96">
        <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
        <Input
          placeholder="Search by name, phone or email…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(5)].map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                </TableRow>
              ))
            ) : response?.items?.length ? (
              response.items.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <div className="font-medium">{customer.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Joined {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : "-"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{customer.phone}</div>
                    <div className="text-xs text-muted-foreground">{customer.email || "-"}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{customer.city ? `${customer.city}, ${customer.country}` : "-"}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={customer.role === "admin" ? "default" : "secondary"}>{customer.role}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setProfileCustomer(customer)} title="View Profile">
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(customer)} title="Edit">
                        <Edit className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No customers found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {response && response.total > 10 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronRight className="w-4 h-4 rotate-180" />
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {Math.ceil(response.total / 10)}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(response.total / 10)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit Customer</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={formData.role} onValueChange={(v: any) => setFormData({ ...formData, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                <Input value={formData.country} onChange={e => setFormData({ ...formData, country: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Address</Label>
                <Input value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : "Update Customer"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
