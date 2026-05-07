import React, { useState } from 'react';
import { 
  ChevronLeft, 
  Share2, 
  Heart, 
  Star, 
  Minus, 
  Plus,
  Wifi,
  Battery,
  ShieldCheck,
  ChevronDown,
  RotateCcw,
  Lock,
  Truck
} from 'lucide-react';
import './_group.css';

export function ProductDetail() {
  const [quantity, setQuantity] = useState(1);
  const [selectedColor, setSelectedColor] = useState('black');
  const [isDescExpanded, setIsDescExpanded] = useState(false);

  return (
    <div className="flex justify-center w-full min-h-screen bg-gray-100 p-4 font-sans">
      <div className="w-[390px] h-[844px] bg-[#F8F9FB] rounded-[40px] shadow-2xl overflow-hidden relative flex flex-col border-[8px] border-gray-900">
        
        {/* Top Navigation */}
        <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-100">
          <button className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors">
            <ChevronLeft className="w-6 h-6 text-gray-800" />
          </button>
          <h1 className="text-[17px] font-semibold text-gray-900">Product Details</h1>
          <div className="flex items-center gap-1 -mr-2">
            <button className="p-2 rounded-full hover:bg-gray-100 transition-colors">
              <Share2 className="w-5 h-5 text-gray-800" />
            </button>
            <button className="p-2 rounded-full hover:bg-gray-100 transition-colors">
              <Heart className="w-5 h-5 text-gray-800" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto pb-[90px] hide-scrollbar flex-1">
          {/* Product Image Area */}
          <div className="relative w-full aspect-square bg-gradient-to-br from-gray-100 to-gray-200">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-56 h-56 bg-gradient-to-tr from-gray-400 to-gray-600 rounded-3xl shadow-xl transform rotate-[-5deg]"></div>
            </div>
            
            {/* Zoom Hint */}
            <div className="absolute bottom-4 right-4 bg-white/80 backdrop-blur text-xs px-2.5 py-1 rounded-full text-gray-700 font-medium shadow-sm flex items-center gap-1">
              Zoom
            </div>

            {/* Image Dots */}
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5">
              <div className="w-5 h-1.5 rounded-full bg-[#5FA800]"></div>
              <div className="w-1.5 h-1.5 rounded-full bg-gray-300"></div>
              <div className="w-1.5 h-1.5 rounded-full bg-gray-300"></div>
            </div>
          </div>

          {/* Product Info Section */}
          <div className="bg-white px-4 py-5 mb-2">
            <div className="flex items-start justify-between mb-2">
              <span className="text-[10px] font-bold text-[#5FA800] tracking-wider uppercase border border-[#5FA800] px-2 py-0.5 rounded-full">
                TechBrand PRO
              </span>
              <div className="flex items-center gap-1 bg-yellow-50 px-1.5 py-0.5 rounded text-xs font-medium text-yellow-700">
                <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                4.5 <span className="text-yellow-600/60 font-normal underline decoration-yellow-600/30">(2,847 reviews)</span>
              </div>
            </div>
            
            <h2 className="text-[22px] font-bold text-gray-900 leading-tight mb-2">
              Premium Wireless<br />Headphones Pro Max
            </h2>
            
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold text-[#5FA800] bg-green-50 px-2 py-1 rounded-sm">
                In Stock
              </span>
            </div>

            <div className="flex items-end gap-2 mb-1">
              <span className="text-[28px] font-bold text-[#5FA800] leading-none">₨4,999</span>
              <span className="text-sm text-gray-400 line-through mb-1">₨9,999</span>
              <span className="text-[10px] font-bold text-white bg-[#F58300] px-2 py-1 rounded-md mb-1 ml-1">
                50% OFF
              </span>
            </div>
          </div>

          {/* Color & Quantity Selector */}
          <div className="bg-white px-4 py-5 mb-2">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Color: <span className="font-normal text-gray-600 capitalize">{selectedColor}</span></h3>
            <div className="flex gap-4 mb-6">
              <button 
                onClick={() => setSelectedColor('black')}
                className={`w-11 h-11 rounded-full flex items-center justify-center border-2 transition-all ${selectedColor === 'black' ? 'border-[#5FA800]' : 'border-transparent'}`}
              >
                <div className="w-9 h-9 rounded-full bg-gray-900 border border-gray-200 shadow-sm"></div>
              </button>
              <button 
                onClick={() => setSelectedColor('white')}
                className={`w-11 h-11 rounded-full flex items-center justify-center border-2 transition-all ${selectedColor === 'white' ? 'border-[#5FA800]' : 'border-transparent'}`}
              >
                <div className="w-9 h-9 rounded-full bg-white border border-gray-200 shadow-sm"></div>
              </button>
              <button 
                onClick={() => setSelectedColor('midnight blue')}
                className={`w-11 h-11 rounded-full flex items-center justify-center border-2 transition-all ${selectedColor === 'midnight blue' ? 'border-[#5FA800]' : 'border-transparent'}`}
              >
                <div className="w-9 h-9 rounded-full bg-slate-800 border border-gray-200 shadow-sm"></div>
              </button>
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Quantity</h3>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-10 flex items-center justify-center text-gray-600 border border-gray-200 rounded-full hover:bg-gray-50 transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-6 text-center font-semibold text-gray-900 text-lg">{quantity}</span>
                <button 
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 flex items-center justify-center text-gray-600 border border-gray-200 rounded-full hover:bg-gray-50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Key Specs */}
          <div className="bg-white px-4 py-5 mb-2">
            <div className="flex justify-between items-center">
              <div className="flex flex-col items-center gap-2 flex-1">
                <div className="w-12 h-12 bg-[#F8F9FB] border border-gray-100 rounded-xl flex items-center justify-center text-[#5FA800]">
                  <Wifi className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-semibold text-gray-700 text-center leading-tight">Wireless</span>
              </div>
              <div className="flex flex-col items-center gap-2 flex-1">
                <div className="w-12 h-12 bg-[#F8F9FB] border border-gray-100 rounded-xl flex items-center justify-center text-[#5FA800]">
                  <Battery className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-semibold text-gray-700 text-center leading-tight">30hr</span>
              </div>
              <div className="flex flex-col items-center gap-2 flex-1">
                <div className="w-12 h-12 bg-[#F8F9FB] border border-gray-100 rounded-xl flex items-center justify-center text-[#5FA800]">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-semibold text-gray-700 text-center leading-tight">Noise Cancel</span>
              </div>
            </div>
          </div>

          {/* Product Description */}
          <div className="bg-white px-4 py-5 mb-2">
            <h3 className="text-sm font-bold text-gray-900 mb-2">Description</h3>
            <p className={`text-sm text-gray-600 leading-relaxed ${!isDescExpanded ? 'line-clamp-3' : ''}`}>
              Experience pristine audio quality with the Premium Wireless Headphones Pro Max. 
              Engineered for audiophiles, these headphones deliver deep bass, clear mids, 
              and crisp highs. The industry-leading active noise cancellation ensures an 
              immersive listening experience anywhere you go.
            </p>
            <button 
              onClick={() => setIsDescExpanded(!isDescExpanded)}
              className="flex items-center gap-1 text-[#5FA800] text-sm font-semibold mt-2"
            >
              {isDescExpanded ? 'Read less ▲' : 'Read more ▼'}
            </button>
          </div>

          {/* Why Buy From Us */}
          <div className="bg-white px-4 py-5 mb-2">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Why Buy From Us</h3>
            <div className="flex justify-between items-start gap-2">
              <div className="flex flex-col items-center text-center flex-1">
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mb-2">
                  <RotateCcw className="w-4 h-4 text-gray-700" />
                </div>
                <span className="text-[10px] font-medium text-gray-600">Free Returns</span>
              </div>
              <div className="flex flex-col items-center text-center flex-1">
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mb-2">
                  <Lock className="w-4 h-4 text-gray-700" />
                </div>
                <span className="text-[10px] font-medium text-gray-600">Secure Payment</span>
              </div>
              <div className="flex flex-col items-center text-center flex-1">
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mb-2">
                  <Truck className="w-4 h-4 text-gray-700" />
                </div>
                <span className="text-[10px] font-medium text-gray-600">Fast Delivery</span>
              </div>
            </div>
          </div>

          {/* Reviews */}
          <div className="bg-white px-4 py-5 mb-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900">Reviews (2,847)</h3>
            </div>
            
            <div className="space-y-4">
              <div className="border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">AK</div>
                    <span className="text-sm font-bold text-gray-900">Ali Khan</span>
                  </div>
                  <span className="text-[10px] text-gray-400">2 days ago</span>
                </div>
                <div className="flex gap-0.5 mb-2">
                  {[1,2,3,4,5].map(i => <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />)}
                </div>
                <p className="text-sm text-gray-600">Amazing sound quality and battery life. Definitely worth the price! Premium feel.</p>
              </div>
              
              <div className="border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">SA</div>
                    <span className="text-sm font-bold text-gray-900">Sara Ahmed</span>
                  </div>
                  <span className="text-[10px] text-gray-400">1 week ago</span>
                </div>
                <div className="flex gap-0.5 mb-2">
                  {[1,2,3,4].map(i => <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />)}
                  <Star className="w-3 h-3 fill-gray-200 text-gray-200" />
                </div>
                <p className="text-sm text-gray-600">Good product, but the delivery took a bit long. The noise cancellation is great though.</p>
              </div>
            </div>
          </div>

          {/* Related Products */}
          <div className="bg-white py-5 mb-4">
            <h3 className="text-sm font-bold text-gray-900 px-4 mb-4">Related Products</h3>
            <div className="flex overflow-x-auto gap-4 px-4 pb-2 snap-x hide-scrollbar">
              {[
                { name: "Pro Earbuds X", price: "₨2,499", old: "₨4,000", bg: "from-gray-700 to-gray-900" },
                { name: "Wireless Speaker", price: "₨3,299", old: "₨5,500", bg: "from-[#5FA800] to-green-700" },
                { name: "Smart Watch V2", price: "₨5,999", old: "₨8,999", bg: "from-gray-300 to-gray-500" }
              ].map((prod, i) => (
                <div key={i} className="min-w-[150px] border border-gray-100 rounded-2xl overflow-hidden snap-start shadow-sm">
                  <div className={`w-full aspect-square bg-gradient-to-br ${prod.bg} relative`}>
                    <div className="absolute inset-0 opacity-10 bg-white pattern-dots"></div>
                  </div>
                  <div className="p-3">
                    <h4 className="text-sm font-semibold text-gray-900 truncate mb-1">{prod.name}</h4>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-[#5FA800]">{prod.price}</span>
                      <span className="text-[10px] text-gray-400 line-through">{prod.old}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sticky Bottom Bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 z-50 flex gap-2.5 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
          <button className="flex-none w-11 h-11 border border-gray-200 rounded-xl text-gray-500 flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-all duration-150 shadow-sm">
            <Heart className="w-5 h-5" />
          </button>
          <button className="flex-1 bg-gradient-to-b from-[#6BC500] to-[#5FA800] text-white font-bold rounded-xl h-11 active:scale-[0.97] active:from-[#5FA800] active:to-[#4d8a00] transition-all duration-150 shadow-[0_3px_12px_rgba(95,168,0,0.35)] text-[13px] flex items-center justify-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
            Add to Cart
          </button>
          <button className="flex-1 bg-gradient-to-b from-[#FF9A1A] to-[#F58300] text-white font-bold rounded-xl h-11 active:scale-[0.97] active:from-[#F58300] active:to-[#d97300] transition-all duration-150 shadow-[0_3px_12px_rgba(245,131,0,0.32)] text-[13px]">
            Buy Now
          </button>
        </div>

      </div>
    </div>
  );
}
