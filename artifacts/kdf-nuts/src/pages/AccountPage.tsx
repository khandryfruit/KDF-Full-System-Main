import React, { useState } from "react";
import { Package, Heart, Wallet, MapPin, Bell, Headphones, Settings, ChevronRight, LogOut, X, Edit3, Lock, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { useApp } from "../context/AppContext";
import { useWishlist } from "../context/WishlistContext";
import { useListOrders, useGetWalletBalance } from "@workspace/api-client-react";
import { BottomNav } from "../components/BottomNav";

export function AccountPage() {
  const [, setLocation] = useLocation();
  const { user, token, isAuthenticated, logout } = useApp();
  const { items: wishlistItems } = useWishlist();
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const { data: ordersData } = useListOrders({ limit: 5 }, { query: { enabled: isAuthenticated } as any });
  const { data: walletData } = useGetWalletBalance({ query: { enabled: isAuthenticated } as any });

  const orders = (ordersData as any)?.items ?? [];
  const totalOrders = (ordersData as any)?.total ?? 0;
  const walletBalance = walletData ? Number(walletData.balance) : 0;

  const handleLogout = () => {
    logout();
    setLocation('/login');
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) { setDeleteError('Enter your password to confirm'); return; }
    setDeletingAccount(true);
    setDeleteError('');
    try {
      const res = await fetch('/api/auth/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete account');
      logout();
      setLocation('/login');
    } catch (err: any) {
      setDeleteError(err.message);
    } finally {
      setDeletingAccount(false);
    }
  };

  const go = (route: string, requiresAuth = false) => {
    if (requiresAuth && !isAuthenticated) {
      setShowLoginPrompt(true);
      return;
    }
    setLocation(route);
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'processing': return 'bg-[#eef7e6] text-[#5FA800]';
      case 'delivered': return 'bg-gray-100 text-gray-600';
      case 'shipped': return 'bg-blue-50 text-blue-600';
      case 'cancelled': return 'bg-red-50 text-red-600';
      default: return 'bg-yellow-50 text-yellow-700';
    }
  };

  // Profile completion
  const fields = [user?.name, (user as any)?.email, (user as any)?.city, (user as any)?.address];
  const filled = fields.filter(Boolean).length;
  const completionPct = Math.round((filled / fields.length) * 100);

  return (
    <div className="w-full max-w-[430px] mx-auto min-h-[100dvh] bg-[#F8F9FB] pb-20 font-sans relative">

      {/* Login Prompt Modal */}
      {showLoginPrompt && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center px-4 pb-8">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowLoginPrompt(false)} />
          <div className="relative bg-white rounded-3xl p-6 w-full max-w-[400px] shadow-2xl">
            <button onClick={() => setShowLoginPrompt(false)} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100">
              <X className="w-4 h-4 text-gray-400" />
            </button>
            <div className="w-14 h-14 rounded-2xl bg-[#eef7e6] flex items-center justify-center mx-auto mb-4">
              <Package className="w-7 h-7 text-[#5FA800]" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 text-center mb-1">Login Required</h2>
            <p className="text-sm text-gray-500 text-center mb-6">Please login to access this section</p>
            <button onClick={() => { setShowLoginPrompt(false); setLocation('/login'); }}
              className="w-full py-3.5 rounded-xl bg-[#5FA800] text-white font-bold text-[15px] mb-2.5 active:bg-[#4d8a00] transition-colors">
              Login / Sign Up
            </button>
            <button onClick={() => setShowLoginPrompt(false)} className="w-full py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm active:bg-gray-50">
              Continue as Guest
            </button>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-white rounded-3xl p-6 w-full max-w-[360px] shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-7 h-7 text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 text-center mb-1">Delete Account?</h2>
            <p className="text-sm text-gray-500 text-center mb-4">This action is irreversible. Enter your password to confirm.</p>
            <input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)}
              placeholder="Your password" className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm mb-3 focus:outline-none focus:border-red-300" />
            {deleteError && <p className="text-red-500 text-xs mb-3">{deleteError}</p>}
            <button onClick={handleDeleteAccount} disabled={deletingAccount}
              className="w-full py-3 rounded-xl bg-red-500 text-white font-bold text-sm mb-2 active:bg-red-600 disabled:opacity-60">
              {deletingAccount ? 'Deleting…' : 'Delete My Account'}
            </button>
            <button onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteError(''); }}
              className="w-full py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-br from-[#4d8a00] to-[#5FA800] pt-12 pb-6 px-6 rounded-b-[2rem] text-white">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center border-2 border-white/40 backdrop-blur-sm overflow-hidden text-2xl font-bold">
            {(user as any)?.profileImage
              ? <img src={(user as any).profileImage} className="w-full h-full object-cover" />
              : (user?.name ? user.name.charAt(0).toUpperCase() : 'G')}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{user?.name || 'Guest User'}</h1>
            <p className="text-white/80 text-sm">{user?.phone || 'Not logged in'}</p>
            {(user as any)?.city && <p className="text-white/60 text-xs mt-0.5">{(user as any).city}</p>}
          </div>
          {isAuthenticated ? (
            <button onClick={() => setLocation('/edit-profile')}
              className="p-2 rounded-full bg-white/20 active:bg-white/40 border border-white/20 transition-colors">
              <Edit3 className="w-4 h-4 text-white" />
            </button>
          ) : (
            <button onClick={() => setLocation('/login')} className="text-xs font-medium bg-white/20 active:bg-white/40 px-3 py-1.5 rounded-full transition-colors border border-white/20">
              Login
            </button>
          )}
        </div>

        {/* Profile completion bar */}
        {isAuthenticated && completionPct < 100 && (
          <div className="mt-4 bg-white/10 rounded-xl p-3">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs text-white/80 font-medium">Profile Completion</span>
              <span className="text-xs text-white font-bold">{completionPct}%</span>
            </div>
            <div className="h-1.5 bg-white/20 rounded-full">
              <div className="h-full bg-white rounded-full transition-all" style={{ width: `${completionPct}%` }} />
            </div>
            <button onClick={() => setLocation('/edit-profile')} className="text-xs text-white/70 mt-1.5 underline">
              Complete your profile
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="flex justify-between px-6 -mt-4 mb-6 gap-3">
        <div onClick={() => go('/orders', true)} className="flex-1 bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center cursor-pointer active:bg-gray-50 transition-colors">
          <span className="font-bold text-gray-900 text-lg">{totalOrders}</span>
          <span className="text-xs text-gray-500 font-medium">Orders</span>
        </div>
        <div onClick={() => go('/wishlist')} className="flex-1 bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center cursor-pointer active:bg-gray-50 transition-colors">
          <span className="font-bold text-gray-900 text-lg">{wishlistItems.length}</span>
          <span className="text-xs text-gray-500 font-medium">Wishlist</span>
        </div>
        <div onClick={() => go('/wallet', true)} className="flex-1 bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center cursor-pointer active:bg-gray-50 transition-colors">
          <span className="font-bold text-[#5FA800] text-lg">₨{walletBalance.toLocaleString()}</span>
          <span className="text-xs text-gray-500 font-medium">Wallet</span>
        </div>
      </div>

      <div className="px-6 space-y-4">
        {/* Quick Actions */}
        <div className="bg-white rounded-2xl p-2 shadow-sm border border-gray-100">
          <ActionItem icon={<Package className="text-blue-500" />}   title="My Orders"       subtitle={`${totalOrders} total`}               onClick={() => go('/orders', true)} />
          <Sep />
          <ActionItem icon={<Heart className="text-red-400" />}      title="Wishlist"        subtitle={`${wishlistItems.length} items`}       onClick={() => go('/wishlist')} />
          <Sep />
          <ActionItem icon={<Wallet className="text-[#5FA800]" />}   title="Wallet & Loyalty" subtitle={`₨${walletBalance.toLocaleString()}`} onClick={() => go('/wallet', true)} />
          <Sep />
          <ActionItem icon={<MapPin className="text-[#F58300]" />}   title="Saved Addresses"                                                  onClick={() => go('/addresses', true)} />
          <Sep />
          <ActionItem icon={<Bell className="text-indigo-500" />}    title="Notifications"                                                    onClick={() => go('/notifications')} />
          <Sep />
          <ActionItem icon={<Headphones className="text-teal-500" />} title="Help & Support"                                                  onClick={() => go('/help')} />
        </div>

        {/* Account Settings */}
        {isAuthenticated && (
          <div className="bg-white rounded-2xl p-2 shadow-sm border border-gray-100">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-4 pt-2 pb-1">Account Settings</p>
            <ActionItem icon={<Edit3 className="text-[#5FA800]" />}    title="Edit Profile"      onClick={() => setLocation('/edit-profile')} />
            <Sep />
            <ActionItem icon={<Lock className="text-gray-500" />}      title="Change Password"   onClick={() => setLocation('/change-password')} />
            <Sep />
            <ActionItem icon={<Settings className="text-gray-400" />}  title="Addresses"         onClick={() => setLocation('/addresses')} />
            <Sep />
            <button onClick={() => setShowDeleteConfirm(true)} className="w-full flex items-center p-4 active:bg-red-50 transition-colors rounded-xl group">
              <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center mr-3"><Trash2 className="w-4 h-4 text-red-400" /></div>
              <div className="flex-1 text-left"><p className="text-red-500 font-medium text-sm">Delete Account</p></div>
              <ChevronRight className="w-5 h-5 text-red-200" />
            </button>
          </div>
        )}

        {/* Recent Orders */}
        {isAuthenticated && orders.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-3 px-1">Recent Orders</h2>
            <div className="space-y-3">
              {orders.map((order: any) => (
                <div key={order.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">#{order.orderNumber || `KDF-${String(order.id).padStart(6, '0')}`}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${getStatusStyle(order.status)}`}>{order.status}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="font-bold text-gray-900">₨{Number(order.total || 0).toLocaleString()}</p>
                    <button onClick={() => setLocation(`/order/${order.id}/tracking`)}
                      className="flex items-center gap-1.5 text-[#5FA800] text-sm font-semibold border border-[#5FA800]/40 bg-[#5FA800]/5 px-3 py-1.5 rounded-lg active:bg-[#eef7e6] transition-colors">
                      🚚 Track
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isAuthenticated && (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm border border-gray-100">
            <p className="text-gray-600 text-sm mb-4">Login to see your orders and manage your account</p>
            <button onClick={() => setLocation('/login')} className="bg-[#5FA800] text-white font-bold px-6 py-3 rounded-xl text-sm shadow-md">
              Login / Sign Up
            </button>
          </div>
        )}

        {isAuthenticated && (
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 border border-red-200 text-red-500 font-medium py-3.5 rounded-xl bg-white active:bg-red-50 transition-colors mb-6">
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

const Sep = () => <div className="h-px bg-gray-50 mx-4" />;

function ActionItem({ icon, title, subtitle, onClick }: { icon: React.ReactNode; title: string; subtitle?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center p-4 active:bg-gray-50 transition-colors rounded-xl group">
      <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center mr-3 group-active:bg-white transition-colors">{icon}</div>
      <div className="flex-1 text-left">
        <p className="text-gray-900 font-medium text-sm">{title}</p>
      </div>
      {subtitle && <span className="text-xs text-gray-400 font-medium mr-3">{subtitle}</span>}
      <ChevronRight className="w-5 h-5 text-gray-300" />
    </button>
  );
}
