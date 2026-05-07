import React from "react";
import { Package, Heart, Wallet, MapPin, Bell, Headphones, Settings, ChevronRight, LogOut, Home, Search, ShoppingCart, User } from "lucide-react";
import "./_group.css";

export function AccountScreen() {
  return (
    <div className="min-h-[100dvh] bg-[#F8F9FB] pb-20 font-sans">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#4d8a00] to-[#5FA800] pt-12 pb-6 px-6 rounded-b-[2rem] text-white">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center border-2 border-white/40 backdrop-blur-sm overflow-hidden text-2xl font-bold">
            AH
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Ali Hassan</h1>
            <p className="text-white/80 text-sm">+92 300 1234567</p>
          </div>
          <button className="text-xs font-medium bg-white/20 hover:bg-white/30 active:bg-white/40 px-3 py-1.5 rounded-full transition-colors border border-white/20">
            Edit Profile
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex justify-between px-6 -mt-4 mb-6 gap-3">
        <div className="flex-1 bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
          <span className="font-bold text-gray-900 text-lg">12</span>
          <span className="text-xs text-gray-500 font-medium">Orders</span>
        </div>
        <div className="flex-1 bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
          <span className="font-bold text-gray-900 text-lg">3</span>
          <span className="text-xs text-gray-500 font-medium">Wishlist</span>
        </div>
        <div className="flex-1 bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
          <span className="font-bold text-[#5FA800] text-lg">₨1,500</span>
          <span className="text-xs text-gray-500 font-medium">Wallet</span>
        </div>
      </div>

      <div className="px-6 space-y-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-2xl p-2 shadow-sm border border-gray-100">
          <ActionItem icon={<Package className="text-gray-400" />} title="My Orders" subtitle="3 Active" />
          <div className="h-px bg-gray-50 mx-4" />
          <ActionItem icon={<Heart className="text-gray-400" />} title="Wishlist" subtitle="12 items" />
          <div className="h-px bg-gray-50 mx-4" />
          <ActionItem icon={<Wallet className="text-[#5FA800]" />} title="Wallet & Loyalty" subtitle="₨1,500 balance" />
          <div className="h-px bg-gray-50 mx-4" />
          <ActionItem icon={<MapPin className="text-gray-400" />} title="Addresses" subtitle="2 saved" />
          <div className="h-px bg-gray-50 mx-4" />
          <ActionItem icon={<Bell className="text-gray-400" />} title="Notifications" />
          <div className="h-px bg-gray-50 mx-4" />
          <ActionItem icon={<Headphones className="text-gray-400" />} title="Help & Support" />
          <div className="h-px bg-gray-50 mx-4" />
          <ActionItem icon={<Settings className="text-gray-400" />} title="Settings" />
        </div>

        {/* Recent Orders */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-3 px-1">Recent Orders</h2>
          <div className="space-y-3">
            {/* Order Card 1 */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">#KDF-847291</p>
                  <p className="text-xs text-gray-500 mt-0.5">May 5, 2026</p>
                </div>
                <span className="bg-[#eef7e6] text-[#5FA800] text-xs font-semibold px-2.5 py-1 rounded-full">
                  Processing
                </span>
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-sm text-gray-600">3 items</p>
                  <p className="font-bold text-gray-900 mt-0.5">₨10,447</p>
                </div>
                <button className="text-[#5FA800] text-sm font-semibold border border-[#5FA800] px-4 py-1.5 rounded-lg active:bg-[#f2f8ec] transition-colors">
                  Details
                </button>
              </div>
            </div>

            {/* Order Card 2 */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">#KDF-847250</p>
                  <p className="text-xs text-gray-500 mt-0.5">Apr 28, 2026</p>
                </div>
                <span className="bg-gray-100 text-gray-600 text-xs font-semibold px-2.5 py-1 rounded-full">
                  Delivered
                </span>
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-sm text-gray-600">1 item</p>
                  <p className="font-bold text-gray-900 mt-0.5">₨2,150</p>
                </div>
                <button className="text-[#5FA800] text-sm font-semibold border border-[#5FA800] px-4 py-1.5 rounded-lg active:bg-[#f2f8ec] transition-colors">
                  Reorder
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Logout */}
        <button className="w-full flex items-center justify-center gap-2 border border-red-200 text-red-500 font-medium py-3.5 rounded-xl bg-white active:bg-red-50 transition-colors mb-6">
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </div>

      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex justify-between items-center px-6 py-3 safe-area-bottom z-10">
        <button className="flex flex-col items-center gap-1 text-gray-400 active:text-gray-600 transition-colors">
          <Home className="w-6 h-6" />
          <span className="text-[10px] font-medium">Home</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-gray-400 active:text-gray-600 transition-colors">
          <Search className="w-6 h-6" />
          <span className="text-[10px] font-medium">Search</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-gray-400 relative active:text-gray-600 transition-colors">
          <ShoppingCart className="w-6 h-6" />
          <span className="text-[10px] font-medium">Cart</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-[#5FA800]">
          <User className="w-6 h-6" />
          <span className="text-[10px] font-medium">Account</span>
        </button>
      </div>
    </div>
  );
}

function ActionItem({ icon, title, subtitle }: { icon: React.ReactNode, title: string, subtitle?: string }) {
  return (
    <button className="w-full flex items-center p-4 active:bg-gray-50 transition-colors rounded-xl group">
      <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center mr-3 group-active:bg-white transition-colors">
        {icon}
      </div>
      <div className="flex-1 text-left">
        <p className="text-gray-900 font-medium text-sm">{title}</p>
      </div>
      {subtitle && (
        <span className="text-xs text-gray-400 font-medium mr-3">{subtitle}</span>
      )}
      <ChevronRight className="w-5 h-5 text-gray-300" />
    </button>
  );
}
