import React from "react";
import { Check, ArrowRight, Home, ShoppingCart, User, Search } from "lucide-react";
import "./_group.css";

export function OrderSuccessScreen() {
  return (
    <div className="min-h-[100dvh] bg-[#F8F9FB] pb-16 flex flex-col font-sans">
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-[#eef7e6] to-[#F8F9FB]">
        <div className="w-24 h-24 rounded-full bg-[#5FA800] flex items-center justify-center mb-6 animate-in zoom-in duration-500 shadow-[0_0_30px_rgba(95,168,0,0.3)]">
          <Check className="w-12 h-12 text-white" strokeWidth={3} />
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Order Placed!</h1>
        <p className="text-gray-500 mb-8">Thank you, Ali!</p>
        
        <div className="bg-white w-full rounded-2xl p-5 shadow-sm border border-gray-100 mb-6">
          <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-50">
            <span className="text-gray-500 text-sm">Order Number</span>
            <span className="font-semibold text-gray-900">#KDF-847291</span>
          </div>
          
          <div className="flex justify-between items-center mb-4">
            <span className="text-gray-500 text-sm">Estimated Delivery</span>
            <span className="font-medium text-gray-900">May 7–9, 2026</span>
          </div>
          
          <div className="flex justify-between items-center mb-4">
            <span className="text-gray-500 text-sm">Order Summary</span>
            <span className="font-medium text-gray-900">3 items · ₨10,447</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-sm">Payment Method</span>
            <span className="font-medium text-gray-900">Cash on Delivery</span>
          </div>
        </div>
        
        <button className="flex items-center gap-2 text-[#5FA800] font-medium mb-8 active:opacity-70 transition-opacity">
          Track your order <ArrowRight className="w-4 h-4" />
        </button>
        
        <div className="w-full space-y-3 mt-auto">
          <button className="w-full bg-[#5FA800] text-white font-medium py-3.5 rounded-xl active:bg-[#4d8a00] transition-colors">
            Continue Shopping
          </button>
          <button className="w-full border-2 border-[#5FA800] text-[#5FA800] font-medium py-3.5 rounded-xl active:bg-[#f2f8ec] transition-colors">
            View Order Details
          </button>
        </div>
      </div>

      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex justify-between items-center px-6 py-3 safe-area-bottom">
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
