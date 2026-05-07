import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, MessageSquare, CheckCircle2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { useApp } from '../context/AppContext';

export function OTPPage() {
  const [, setLocation] = useLocation();
  const { setAuth } = useApp();
  const [otp, setOtp] = useState<string[]>(['8', '3', '1', '9', '', '']);
  const [focusedIndex, setFocusedIndex] = useState<number>(4);
  const [timeLeft, setTimeLeft] = useState(45);
  const [isSuccess, setIsSuccess] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (timeLeft > 0) {
      const timerId = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timerId);
    }
    return undefined;
  }, [timeLeft]);

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) {
      value = value.slice(-1);
    }
    
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value !== '') {
      if (index < 5) {
        inputRefs.current[index + 1]?.focus();
        setFocusedIndex(index + 1);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (otp[index] === '' && index > 0) {
        inputRefs.current[index - 1]?.focus();
        setFocusedIndex(index - 1);
      } else {
        const newOtp = [...otp];
        newOtp[index] = '';
        setOtp(newOtp);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
      setFocusedIndex(index - 1);
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
      setFocusedIndex(index + 1);
    }
  };

  const handleFocus = (index: number) => {
    setFocusedIndex(index);
  };

  const isComplete = otp.every((digit) => digit !== '');

  const handleVerify = () => {
    if (isComplete) {
      const code = otp.join('');
      // Dummy validation for demo
      if (code === '831900' || code.length === 6) {
        setIsSuccess(true);
        setTimeout(() => {
          setAuth('demo-otp-token', { id: 0, name: 'User', phone: '+92 300 1234567', role: 'user' });
          setLocation('/home');
        }, 1500);
      }
    }
  };

  const handleResend = () => {
    setTimeLeft(45);
  };

  if (isSuccess) {
    return (
      <div className="w-full max-w-[430px] mx-auto min-h-[100dvh] bg-[#F8F9FB] flex flex-col font-sans relative overflow-hidden items-center justify-center">
        <div className="flex flex-col items-center animate-in zoom-in duration-500">
          <CheckCircle2 className="w-24 h-24 text-[#5FA800] mb-4" />
          <h2 className="text-3xl font-bold text-gray-900">Verified!</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[430px] mx-auto min-h-[100dvh] bg-[#F8F9FB] flex flex-col font-sans relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center h-16 px-4 shrink-0 bg-white shadow-sm z-10 relative">
        <button onClick={() => setLocation('/login')} className="p-2 -ml-2 text-gray-800 hover:bg-gray-100 rounded-full transition-colors active:scale-95">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex-1 text-center font-bold text-lg text-gray-900 pr-8">
          Verify Phone
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-10 pb-32 flex flex-col items-center">
        {/* Hero Area */}
        <div className="flex flex-col items-center text-center mb-10 w-full">
          <div className="w-24 h-24 bg-[#5FA800]/10 rounded-full flex items-center justify-center mb-6">
            <MessageSquare className="w-10 h-10 text-[#5FA800]" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Enter Verification Code</h1>
          <p className="text-gray-500 text-sm mb-1">We sent a 6-digit code to</p>
          <p className="text-gray-900 font-bold text-lg mb-2">+92 300 1234567</p>
          <button className="text-[#5FA800] font-bold text-sm hover:underline active:opacity-70 transition-opacity">
            Change number
          </button>
        </div>

        {/* OTP Input */}
        <div className="w-full max-w-[340px] mb-10">
          <div className="flex justify-between gap-2">
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { inputRefs.current[index] = el; }}
                type="text"
                inputMode="numeric"
                pattern="\d*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onFocus={() => handleFocus(index)}
                className={`w-12 h-14 text-center text-2xl font-bold rounded-xl outline-none transition-all duration-200 select-none ${
                  focusedIndex === index
                    ? 'border-2 border-[#5FA800] ring-2 ring-[#5FA800]/20 bg-white otp-cursor-blink shadow-sm'
                    : digit !== ''
                    ? 'border-2 border-[#5FA800] bg-white text-gray-900 otp-digit-pop shadow-sm'
                    : 'border-2 border-gray-200 bg-white text-gray-900'
                }`}
                style={{ caretColor: 'transparent' }}
              />
            ))}
          </div>
        </div>

        {/* Resend Section */}
        <div className="flex flex-col items-center">
          <p className="text-gray-500 text-sm mb-2">Didn't receive the code?</p>
          {timeLeft > 0 ? (
            <p className="text-[#5FA800] font-bold text-sm">
              Resend in 00:{timeLeft.toString().padStart(2, '0')}
            </p>
          ) : (
            <button
              onClick={handleResend}
              className="text-[#5FA800] font-bold text-sm hover:underline active:opacity-70 transition-opacity"
            >
              Resend OTP
            </button>
          )}
        </div>
      </div>

      {/* Bottom Sticky Area */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 p-4 pb-6 flex flex-col items-center gap-3 z-30 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
        <button
          onClick={handleVerify}
          disabled={!isComplete}
          className={`w-full h-14 flex items-center justify-center rounded-xl text-white font-bold text-lg transition-all ${
            isComplete
              ? 'bg-[#5FA800] active:scale-[0.98] shadow-lg shadow-[#5FA800]/30'
              : 'bg-gray-300 cursor-not-allowed opacity-50'
          }`}
        >
          Verify & Continue
        </button>
        <p className="text-xs text-gray-500 mt-2 text-center w-full px-4 leading-relaxed">
          By verifying, you agree to our{' '}
          <button className="text-[#5FA800] font-medium hover:underline">Terms</button> &{' '}
          <button className="text-[#5FA800] font-medium hover:underline">Privacy Policy</button>
        </p>
      </div>
    </div>
  );
}
