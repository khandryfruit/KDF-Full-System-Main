import React, { useState } from 'react';
import { ArrowLeft, MessageCircle, Phone, Mail, ChevronDown, ChevronUp, Headphones, ExternalLink } from 'lucide-react';
import { useLocation } from 'wouter';
import { BottomNav } from '../components/BottomNav';

const FAQS = [
  {
    q: 'How do I track my order?',
    a: 'Go to Account → My Orders, then tap "Track Order" next to your order. You\'ll see real-time status updates.',
  },
  {
    q: 'What is your return policy?',
    a: 'We offer free returns within 7 days of delivery for any quality-related issue. Contact our support team to initiate a return.',
  },
  {
    q: 'How long does delivery take?',
    a: 'Standard delivery takes 2–5 working days within Pakistan. Lahore, Karachi, and Islamabad orders are usually delivered within 2 days.',
  },
  {
    q: 'Can I change or cancel my order?',
    a: 'You can cancel or modify your order within 1 hour of placing it. After that, contact our support team as soon as possible.',
  },
  {
    q: 'How do I earn loyalty points?',
    a: 'You earn 1 point for every ₨10 spent. Points can be redeemed in your wallet. Visit Wallet & Loyalty for details.',
  },
  {
    q: 'Are your products fresh and authentic?',
    a: 'Absolutely. All KDF NUTS products are 100% natural, freshly sourced, and quality-tested before packaging.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept Cash on Delivery (COD), bank transfer, and major debit/credit cards at checkout.',
  },
];

export function HelpSupportPage() {
  const [, setLocation] = useLocation();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="w-full max-w-[430px] mx-auto min-h-[100dvh] bg-[#F8F9FB] pb-20 font-sans">
      {/* Header */}
      <div className="bg-white sticky top-0 z-20 px-4 py-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={() => setLocation('/account')} className="p-2 -ml-2 rounded-full active:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-800" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">Help & Support</h1>
      </div>

      <div className="p-4 space-y-5">
        {/* Hero banner */}
        <div className="bg-gradient-to-br from-[#4d8a00] to-[#5FA800] rounded-2xl p-5 text-white flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Headphones className="w-7 h-7 text-white" />
          </div>
          <div>
            <p className="font-bold text-base">We're here to help!</p>
            <p className="text-white/80 text-xs mt-0.5 leading-relaxed">Our support team is available Mon–Sat, 9am–6pm</p>
          </div>
        </div>

        {/* Contact options */}
        <div>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 px-1">Contact Us</h2>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <a href="tel:+923001234567" className="flex items-center gap-4 p-4 active:bg-gray-50 transition-colors border-b border-gray-50">
              <div className="w-10 h-10 rounded-xl bg-[#eef7e6] flex items-center justify-center flex-shrink-0">
                <Phone className="w-5 h-5 text-[#5FA800]" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 text-sm">Call Support</p>
                <p className="text-xs text-gray-400 mt-0.5">+92 300 123 4567</p>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-300" />
            </a>
            <a href="https://wa.me/923001234567" target="_blank" rel="noreferrer" className="flex items-center gap-4 p-4 active:bg-gray-50 transition-colors border-b border-gray-50">
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-5 h-5 text-green-500" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 text-sm">WhatsApp Chat</p>
                <p className="text-xs text-gray-400 mt-0.5">Usually replies within 1 hour</p>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-300" />
            </a>
            <a href="mailto:support@kdfnuts.com" className="flex items-center gap-4 p-4 active:bg-gray-50 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Mail className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 text-sm">Email Support</p>
                <p className="text-xs text-gray-400 mt-0.5">support@kdfnuts.com</p>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-300" />
            </a>
          </div>
        </div>

        {/* FAQs */}
        <div>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 px-1">Frequently Asked Questions</h2>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {FAQS.map((faq, i) => (
              <div key={i} className={i < FAQS.length - 1 ? 'border-b border-gray-50' : ''}>
                <button
                  onClick={() => setOpenIndex(openIndex === i ? null : i)}
                  className="w-full flex items-center justify-between p-4 text-left active:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-gray-900 text-sm pr-4 leading-snug">{faq.q}</span>
                  {openIndex === i
                    ? <ChevronUp className="w-4 h-4 text-[#5FA800] flex-shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </button>
                {openIndex === i && (
                  <div className="px-4 pb-4">
                    <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* App version */}
        <p className="text-center text-[11px] text-gray-300 font-medium pb-2">KDF NUTS v1.0.0 • Made with ❤️ in Pakistan</p>
      </div>

      <BottomNav />
    </div>
  );
}
