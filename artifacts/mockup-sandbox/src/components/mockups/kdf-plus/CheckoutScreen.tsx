import React, { useState } from 'react';
import { ChevronLeft, MapPin, Edit3, ChevronDown, Check, Circle, Truck, CreditCard, Banknote, Plus } from 'lucide-react';
import './_group.css';

export function CheckoutScreen() {
  const [deliveryType, setDeliveryType] = useState('standard');
  const [courier, setCourier] = useState('tcs');
  const [paymentMethod, setPaymentMethod] = useState('cod');

  return (
    <div className="flex justify-center w-full min-h-screen bg-gray-100 p-4 font-sans">
      <div className="w-[390px] h-[844px] bg-[#F8F9FB] rounded-[40px] shadow-2xl overflow-hidden relative flex flex-col border-[8px] border-gray-900">
        
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-4 bg-white sticky top-0 z-20 border-b border-gray-100">
          <button className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors">
            <ChevronLeft className="w-6 h-6 text-gray-800" />
          </button>
          <div className="flex flex-col items-center">
            <h1 className="text-[17px] font-semibold text-gray-900">Checkout</h1>
            <span className="text-[11px] text-gray-500 font-medium">Step 2 of 3</span>
          </div>
          <div className="w-10"></div> {/* Spacer for center alignment */}
        </header>

        {/* Progress Bar */}
        <div className="bg-white px-8 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-gray-100 -z-10 -translate-y-1/2"></div>
            <div className="absolute left-0 w-1/2 top-1/2 h-0.5 bg-[#5FA800] -z-10 -translate-y-1/2"></div>
            
            <div className="flex flex-col items-center gap-1 bg-white">
              <div className="w-5 h-5 rounded-full bg-[#5FA800] text-white flex items-center justify-center">
                <Check size={12} />
              </div>
              <span className="text-[10px] font-bold text-[#5FA800]">Address</span>
            </div>
            
            <div className="flex flex-col items-center gap-1 bg-white px-2">
              <div className="w-5 h-5 rounded-full border-2 border-[#5FA800] bg-white flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-[#5FA800]"></div>
              </div>
              <span className="text-[10px] font-bold text-[#5FA800]">Payment</span>
            </div>
            
            <div className="flex flex-col items-center gap-1 bg-white">
              <div className="w-5 h-5 rounded-full border-2 border-gray-200 bg-white"></div>
              <span className="text-[10px] font-bold text-gray-400">Review</span>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto pb-[100px] hide-scrollbar p-4 space-y-5">
          
          {/* Address Section */}
          <section>
            <h2 className="text-sm font-bold text-gray-900 mb-3 px-1">Shipping Address</h2>
            <div className="bg-white border-2 border-[#5FA800] rounded-2xl p-4 shadow-sm relative overflow-hidden mb-3">
              <div className="absolute top-0 right-0 bg-[#5FA800] text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                DEFAULT
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-[#5FA800] mt-0.5" />
                <div className="flex-1 pr-6">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-gray-900 text-sm">Home — Ali Hassan</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    123 DHA Phase 5<br />
                    Lahore, Punjab<br />
                    0300-1234567
                  </p>
                </div>
                <button className="text-gray-400 hover:text-gray-600 transition-colors">
                  <Edit3 size={16} />
                </button>
              </div>
            </div>
            <button className="w-full py-3.5 border-2 border-dashed border-gray-300 rounded-2xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
              <Plus size={16} />
              Add New Address
            </button>
          </section>

          {/* Delivery Options */}
          <section>
            <h2 className="text-sm font-bold text-gray-900 mb-3 px-1">Delivery Options</h2>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-3">
              <button 
                onClick={() => setDeliveryType('standard')}
                className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${deliveryType === 'standard' ? 'border-[#5FA800]' : 'border-gray-300'}`}>
                  {deliveryType === 'standard' && <div className="w-2.5 h-2.5 rounded-full bg-[#5FA800]"></div>}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900">Standard Delivery</p>
                  <p className="text-[11px] text-gray-500">3-5 business days</p>
                </div>
                <span className="text-sm font-bold text-gray-900">₨199</span>
              </button>
              <div className="h-px bg-gray-100 ml-12"></div>
              <button 
                onClick={() => setDeliveryType('express')}
                className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${deliveryType === 'express' ? 'border-[#5FA800]' : 'border-gray-300'}`}>
                  {deliveryType === 'express' && <div className="w-2.5 h-2.5 rounded-full bg-[#5FA800]"></div>}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900">Express Delivery</p>
                  <p className="text-[11px] text-gray-500">1-2 business days</p>
                </div>
                <span className="text-sm font-bold text-gray-900">₨499</span>
              </button>
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => setCourier('tcs')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${courier === 'tcs' ? 'border-[#5FA800] bg-green-50 text-[#5FA800]' : 'border-gray-200 bg-white text-gray-600'}`}
              >
                TCS Courier
              </button>
              <button 
                onClick={() => setCourier('leopard')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${courier === 'leopard' ? 'border-[#5FA800] bg-green-50 text-[#5FA800]' : 'border-gray-200 bg-white text-gray-600'}`}
              >
                Leopard Courier
              </button>
            </div>
          </section>

          {/* Payment Method */}
          <section>
            <h2 className="text-sm font-bold text-gray-900 mb-3 px-1">Payment Method</h2>
            <div className="space-y-3">
              <button 
                onClick={() => setPaymentMethod('cod')}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${paymentMethod === 'cod' ? 'border-[#5FA800] bg-green-50/30' : 'border-transparent bg-white shadow-sm'}`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${paymentMethod === 'cod' ? 'border-[#5FA800]' : 'border-gray-300'}`}>
                  {paymentMethod === 'cod' && <div className="w-2.5 h-2.5 rounded-full bg-[#5FA800]"></div>}
                </div>
                <div className="w-10 h-10 rounded-xl bg-[#F8F9FB] flex items-center justify-center text-[#5FA800]">
                  <Banknote size={20} />
                </div>
                <span className="text-sm font-bold text-gray-900 flex-1">Cash on Delivery</span>
              </button>
              
              <button 
                onClick={() => setPaymentMethod('jazzcash')}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${paymentMethod === 'jazzcash' ? 'border-[#5FA800] bg-green-50/30' : 'border-transparent bg-white shadow-sm'}`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${paymentMethod === 'jazzcash' ? 'border-[#5FA800]' : 'border-gray-300'}`}>
                  {paymentMethod === 'jazzcash' && <div className="w-2.5 h-2.5 rounded-full bg-[#5FA800]"></div>}
                </div>
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600 font-black text-xs italic">
                  JC
                </div>
                <span className="text-sm font-bold text-gray-900 flex-1">JazzCash</span>
              </button>
              
              <button 
                onClick={() => setPaymentMethod('easypaisa')}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${paymentMethod === 'easypaisa' ? 'border-[#5FA800] bg-green-50/30' : 'border-transparent bg-white shadow-sm'}`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${paymentMethod === 'easypaisa' ? 'border-[#5FA800]' : 'border-gray-300'}`}>
                  {paymentMethod === 'easypaisa' && <div className="w-2.5 h-2.5 rounded-full bg-[#5FA800]"></div>}
                </div>
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600 font-black text-xs italic">
                  EP
                </div>
                <span className="text-sm font-bold text-gray-900 flex-1">EasyPaisa</span>
              </button>

              <button 
                onClick={() => setPaymentMethod('card')}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${paymentMethod === 'card' ? 'border-[#5FA800] bg-green-50/30' : 'border-transparent bg-white shadow-sm'}`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${paymentMethod === 'card' ? 'border-[#5FA800]' : 'border-gray-300'}`}>
                  {paymentMethod === 'card' && <div className="w-2.5 h-2.5 rounded-full bg-[#5FA800]"></div>}
                </div>
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-600">
                  <CreditCard size={20} />
                </div>
                <span className="text-sm font-bold text-gray-900 flex-1">Credit/Debit Card</span>
              </button>
            </div>
          </section>

          {/* Mini Summary */}
          <section className="mb-4">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <span className="text-xs text-gray-500 font-medium">Order Summary (3 items)</span>
                <p className="text-sm font-bold text-gray-900 mt-0.5">Total: ₨10,447</p>
              </div>
              <button className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-600 hover:bg-gray-100">
                <ChevronDown size={16} />
              </button>
            </div>
          </section>

        </main>

        {/* Sticky Checkout Bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 pb-6 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-20">
          <button className="w-full bg-[#5FA800] text-white py-4 rounded-2xl font-bold text-[16px] shadow-lg shadow-green-600/20 active:bg-[#4d8a00] transition-colors flex items-center justify-between px-6">
            <span>Place Order</span>
            <span>₨10,447</span>
          </button>
        </div>

      </div>
    </div>
  );
}
