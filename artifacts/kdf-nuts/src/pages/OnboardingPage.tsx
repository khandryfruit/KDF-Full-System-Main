import React, { useState } from 'react';
import { ShoppingBag, Zap, Truck, ChevronRight } from 'lucide-react';
import { useLocation } from 'wouter';

export function OnboardingPage() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [, setLocation] = useLocation();

  const slides = [
    {
      title: "Discover Thousands of Products",
      desc: "Shop from a massive catalog of premium items at the best prices.",
      icon: <ShoppingBag className="w-16 h-16 text-white" />,
      color: "from-blue-500 to-cyan-400"
    },
    {
      title: "Exclusive Flash Deals Daily",
      desc: "Never miss a deal with real-time alerts and exclusive discounts.",
      icon: <Zap className="w-16 h-16 text-white" />,
      color: "from-[#F58300] to-amber-400"
    },
    {
      title: "Fast & Secure Delivery",
      desc: "Track your orders in real-time right to your doorstep.",
      icon: <Truck className="w-16 h-16 text-white" />,
      color: "from-[#5FA800] to-green-400"
    }
  ];

  const handleNext = () => {
    if (activeSlide === slides.length - 1) {
      setLocation('/login');
    } else {
      setActiveSlide(activeSlide + 1);
    }
  };

  return (
    <div className="w-full max-w-[430px] mx-auto min-h-[100dvh] bg-[#F8F9FB] flex flex-col relative overflow-hidden font-sans">
      
      {/* Skip Button */}
      <div className="absolute top-12 right-6 z-10">
        <button 
          onClick={() => setLocation('/login')}
          className="text-gray-400 font-medium text-sm hover:text-gray-600 transition-colors"
        >
          Skip
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="relative w-full aspect-square max-w-[300px] mb-12">
          {/* Decorative background circles */}
          <div className="absolute inset-0 bg-gradient-to-tr from-gray-200 to-gray-50 rounded-full scale-110 blur-xl opacity-50"></div>
          
          <div className={`absolute inset-0 bg-gradient-to-tr ${slides[activeSlide].color} rounded-full shadow-2xl flex items-center justify-center transform transition-all duration-500`}>
            {slides[activeSlide].icon}
          </div>
          
          {/* Decorative floating elements */}
          <div className="absolute -top-4 -right-4 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center animate-bounce" style={{ animationDuration: '3s' }}>
            <span className="text-xl font-bold" style={{ color: '#F58300' }}>%</span>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-4 transition-all duration-300">
          {slides[activeSlide].title}
        </h2>
        <p className="text-gray-500 leading-relaxed transition-all duration-300">
          {slides[activeSlide].desc}
        </p>
      </div>

      {/* Bottom Controls */}
      <div className="p-8 bg-white rounded-t-[2.5rem] shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)]">
        
        {/* Indicators */}
        <div className="flex justify-center gap-2 mb-8">
          {slides.map((_, idx) => (
            <div 
              key={idx}
              className={`h-2 rounded-full transition-all duration-300 ${activeSlide === idx ? 'w-8 bg-[#5FA800]' : 'w-2 bg-gray-200'}`}
            ></div>
          ))}
        </div>

        {/* Action Button */}
        <button 
          onClick={handleNext}
          className="w-full py-4 rounded-2xl text-white font-bold text-lg flex items-center justify-center gap-2 transition-transform active:scale-[0.98] shadow-lg shadow-[#5FA800]/30"
          style={{ backgroundColor: '#5FA800' }}
        >
          {activeSlide === slides.length - 1 ? 'Get Started' : 'Next'}
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

    </div>
  );
}
