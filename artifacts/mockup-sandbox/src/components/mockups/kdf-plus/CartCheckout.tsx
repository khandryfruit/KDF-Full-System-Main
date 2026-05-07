import React, { useState } from 'react';
import { ChevronLeft, Trash2, X, Tag, Minus, Plus, Wallet, ShieldCheck, ChevronRight } from 'lucide-react';
import './_group.css';

export function CartCheckout() {
  const [useLoyalty, setUseLoyalty] = useState(true);
  const [useWallet, setUseWallet] = useState(true);
  const [couponCode, setCouponCode] = useState('');

  const cartItems = [
    {
      id: 1,
      name: 'Premium Wireless Headphones Pro Max',
      variant: 'Color: Black',
      price: 4999,
      qty: 2,
      gradient: 'from-gray-700 to-gray-900'
    },
    {
      id: 2,
      name: 'Smart Fitness Watch Series 5',
      variant: 'Color: Silver',
      price: 4999,
      qty: 1,
      gradient: 'from-gray-300 to-gray-500'
    },
    {
      id: 3,
      name: 'Wireless Bluetooth Earbuds Pro',
      variant: 'Color: White',
      price: 4999,
      qty: 1,
      gradient: 'from-gray-100 to-gray-300'
    }
  ];

  return (
    <div className="flex justify-center w-full min-h-screen bg-gray-100 p-4 font-sans">
      <div className="w-[390px] h-[844px] bg-[#F8F9FB] rounded-[40px] shadow-2xl overflow-hidden relative flex flex-col border-[8px] border-gray-900">
        
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-4 bg-white sticky top-0 z-20 border-b border-gray-100">
          <button className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors">
            <ChevronLeft className="w-6 h-6 text-gray-800" />
          </button>
          <div className="flex flex-col items-center">
            <h1 className="text-[17px] font-semibold text-gray-900">My Cart (3)</h1>
          </div>
          <button className="p-2 -mr-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors">
            <Trash2 size={20} />
          </button>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto pb-[100px] hide-scrollbar">
          
          {/* Cart Items */}
          <div className="px-4 py-4 space-y-3">
            {cartItems.map(item => (
              <div key={item.id} className="bg-white p-3 rounded-2xl shadow-sm flex gap-3 relative border border-gray-100 overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gray-200"></div>
                <button className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-full transition-colors">
                  <X size={16} />
                </button>
                <div className={`w-20 h-20 rounded-xl bg-gradient-to-br ${item.gradient} shrink-0 ml-1 border border-gray-100`} />
                <div className="flex-1 flex flex-col justify-between py-0.5">
                  <div className="pr-6">
                    <h3 className="text-sm font-bold text-gray-900 leading-tight line-clamp-2">{item.name}</h3>
                    <p className="text-[11px] text-gray-500 mt-1">{item.variant}</p>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center border border-gray-200 rounded-full p-0.5">
                      <button className="w-6 h-6 flex items-center justify-center text-gray-600 rounded-full hover:bg-gray-100 transition-colors">
                        <Minus size={12} />
                      </button>
                      <span className="w-6 text-center text-xs font-bold text-gray-900">{item.qty}</span>
                      <button className="w-6 h-6 flex items-center justify-center text-gray-600 rounded-full hover:bg-gray-100 transition-colors">
                        <Plus size={12} />
                      </button>
                    </div>
                    <div className="text-[14px] font-bold text-[#5FA800]">₨{item.price.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* You may also like mini-strip */}
          <div className="px-4 py-2 mb-2">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">You may also like</h4>
            <div className="flex gap-3 overflow-x-auto hide-scrollbar">
              <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-gray-100 min-w-[180px] shadow-sm">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-gray-800 to-gray-900"></div>
                <div>
                  <p className="text-xs font-semibold text-gray-900 line-clamp-1">Protective Case</p>
                  <p className="text-xs font-bold text-[#5FA800]">₨499</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-gray-100 min-w-[180px] shadow-sm">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-gray-400 to-gray-500"></div>
                <div>
                  <p className="text-xs font-semibold text-gray-900 line-clamp-1">Fast Charger</p>
                  <p className="text-xs font-bold text-[#5FA800]">₨999</p>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 space-y-3 mt-4">
            {/* Coupon */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Enter promo code" 
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#5FA800] transition-all font-medium placeholder:font-normal"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                />
                <button className="bg-[#5FA800] text-white px-6 rounded-xl text-sm font-bold shadow-sm active:bg-[#4d8a00] transition-colors">
                  Apply
                </button>
              </div>
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-500 mb-2">Available Coupons</p>
                <button className="flex items-center gap-2 border border-dashed border-[#5FA800] bg-green-50/50 px-3 py-2 rounded-lg hover:bg-green-50 transition-colors w-full text-left">
                  <Tag size={14} className="text-[#5FA800]" />
                  <div>
                    <span className="text-xs font-bold text-[#5FA800] block">SAVE20</span>
                    <span className="text-[10px] text-green-700">20% off total order</span>
                  </div>
                  <ChevronRight size={14} className="text-[#5FA800] ml-auto" />
                </button>
              </div>
            </div>

            {/* Loyalty Points */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
                  <ShieldCheck size={20} className="text-[#5FA800]" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900">Loyalty Points</h4>
                  <p className="text-[11px] text-gray-500 mt-0.5">250 Points Available = ₨250</p>
                </div>
              </div>
              <button 
                onClick={() => setUseLoyalty(!useLoyalty)}
                className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-1 ${useLoyalty ? 'bg-[#5FA800]' : 'bg-gray-200'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${useLoyalty ? 'translate-x-6' : 'translate-x-0'} shadow-sm`} />
              </button>
            </div>

            {/* Wallet */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center">
                  <Wallet size={20} className="text-gray-700" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900">Wallet Balance</h4>
                  <p className="text-[11px] text-gray-500 mt-0.5">Balance: ₨1,500</p>
                </div>
              </div>
              <button 
                onClick={() => setUseWallet(!useWallet)}
                className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-1 ${useWallet ? 'bg-[#5FA800]' : 'bg-gray-200'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${useWallet ? 'translate-x-6' : 'translate-x-0'} shadow-sm`} />
              </button>
            </div>

            {/* Order Summary */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-3 mb-6">
              <h4 className="text-sm font-bold text-gray-900 mb-2">Order Summary</h4>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-semibold text-gray-900">₨14,997</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Discount (SAVE20)</span>
                <span className="font-semibold text-[#5FA800]">-₨2,999</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Points Discount</span>
                <span className="font-semibold text-[#5FA800]">-₨250</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Wallet</span>
                <span className="font-semibold text-[#5FA800]">-₨1,500</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Delivery</span>
                <span className="font-semibold text-gray-900">₨199</span>
              </div>
              <div className="h-px bg-gray-100 my-3" />
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-900">Total</span>
                <span className="text-xl font-bold text-[#5FA800]">₨10,447</span>
              </div>
            </div>
          </div>
        </main>

        {/* Sticky Checkout Bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 pb-6 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-20">
          <button className="w-full bg-[#5FA800] text-white py-4 rounded-2xl font-bold text-[15px] shadow-lg shadow-green-600/20 active:bg-[#4d8a00] transition-colors flex items-center justify-center gap-2">
            <span>Proceed to Checkout</span>
            <span className="text-white/60">→</span>
          </button>
          <div className="text-center mt-3 text-xs font-semibold text-gray-500">
            Total to pay: <span className="text-gray-900">₨10,447</span>
          </div>
        </div>

      </div>
    </div>
  );
}
