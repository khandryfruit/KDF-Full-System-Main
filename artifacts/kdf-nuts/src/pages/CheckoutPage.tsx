import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, MapPin, Check, CheckCircle2, Truck, CreditCard, Banknote, ChevronDown, ChevronUp, Loader2, AlertCircle, Building2, Navigation, Sparkles } from 'lucide-react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useCart } from '../context/CartContext';
import { useApp } from '../context/AppContext';
import { useCreateOrder, useGetWalletBalance } from '@workspace/api-client-react';

const PAYMENT_DESCRIPTIONS: Record<string, string> = {
  cod: 'Pay cash when your order arrives at your door',
  jazzcash: 'Pay instantly via JazzCash mobile wallet',
  easypaisa: 'Pay via Easypaisa mobile account',
  card: 'Pay with credit or debit card',
  wallet: 'Use your KDF Wallet balance',
  bank_transfer: 'Bank transfer — reference number required',
};

const DELIVERY_FEE_EXPRESS = 499;

async function fetchShippingCalc(items: { productId: number; qty: number; price: number }[], city: string) {
  try {
    const res = await fetch('/api/shipping/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, city }),
    });
    if (!res.ok) return null;
    return res.json() as Promise<{ fee: number; isFree: boolean; methodName: string; deliveryTime: string; ruleName: string }>;
  } catch {
    return null;
  }
}

async function fetchSameDaySettings() {
  try {
    const res = await fetch('/api/shipping/same-day');
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

const FALLBACK_COURIERS = [
  { id: 'tcs', label: 'TCS Couriers' },
  { id: 'leopards', label: 'Leopards' },
  { id: 'postex', label: 'PostEx' },
  { id: 'trax', label: 'Trax' },
];

const PAYMENT_ICONS: Record<string, React.ReactNode> = {
  cod: <Banknote size={18} className="text-[#5FA800]" />,
  jazzcash: <span className="font-black text-xs text-red-600 italic">JC</span>,
  easypaisa: <span className="font-black text-xs text-green-600 italic">EP</span>,
  card: <CreditCard size={18} className="text-gray-600" />,
  wallet: <span className="font-black text-xs text-purple-600 italic">W</span>,
  bank_transfer: <Building2 size={18} className="text-amber-600" />,
};

async function fetchPaymentOptions() {
  const res = await fetch('/api/payment-gateways/active');
  if (!res.ok) return { gateways: [], manualPayments: [] };
  return res.json();
}

async function fetchActiveCouriers() {
  const res = await fetch('/api/couriers/active');
  if (!res.ok) return [];
  return res.json();
}

async function fetchCities(): Promise<string[]> {
  const res = await fetch('/api/cities');
  if (!res.ok) return [];
  return res.json();
}

async function fetchCityShippingInfo(city: string) {
  if (!city.trim()) return null;
  const res = await fetch(`/api/shipping/city-info?city=${encodeURIComponent(city.trim())}`);
  if (!res.ok) return null;
  return res.json() as Promise<{ fee: number; isFree: boolean; methodName: string; deliveryTime: string; hasSpecialRule: boolean }>;
}

async function reverseGeocode(lat: number, lng: number) {
  const res = await fetch('/api/geocode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ city: string; area: string; street: string; province: string; postalCode: string; fullAddress: string }>;
}

const FALLBACK_CITIES = [
  'Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad',
  'Multan', 'Peshawar', 'Quetta', 'Sialkot', 'Hyderabad',
  'Gujranwala', 'Bahawalpur', 'Sargodha',
];

export function CheckoutPage() {
  const [, setLocation] = useLocation();
  const { items, totalPrice, clearCart } = useCart();
  const { user, isAuthenticated, token } = useApp();

  const [deliveryType, setDeliveryType] = useState('standard');
  const [courier, setCourier] = useState('tcs');
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [showSummary, setShowSummary] = useState(false);
  const [error, setError] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [debouncedCity, setDebouncedCity] = useState('');
  const cityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: walletData } = useGetWalletBalance({ query: { enabled: isAuthenticated } as any });
  const walletBalance = walletData ? Number(walletData.balance) : 0;

  const [address, setAddress] = useState({
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    address: user?.address ?? '',
    city: user?.city ?? '',
    country: user?.country ?? 'Pakistan',
    postalCode: user?.postalCode ?? '',
  });

  const { data: paymentOptions } = useQuery({
    queryKey: ['/api/payment-gateways/active'],
    queryFn: fetchPaymentOptions,
  });

  const { data: activeCouriers } = useQuery({
    queryKey: ['/api/couriers/active'],
    queryFn: fetchActiveCouriers,
  });

  const { data: citiesData } = useQuery({
    queryKey: ['/api/cities'],
    queryFn: fetchCities,
  });

  const { data: sameDayData } = useQuery({
    queryKey: ['/api/shipping/same-day'],
    queryFn: fetchSameDaySettings,
  });

  /* ── Debounced city → shipping info ── */
  useEffect(() => {
    if (cityDebounceRef.current) clearTimeout(cityDebounceRef.current);
    cityDebounceRef.current = setTimeout(() => setDebouncedCity(address.city), 450);
    return () => { if (cityDebounceRef.current) clearTimeout(cityDebounceRef.current); };
  }, [address.city]);

  const { data: cityShippingInfo } = useQuery({
    queryKey: ['/api/shipping/city-info', debouncedCity],
    queryFn: () => fetchCityShippingInfo(debouncedCity),
    enabled: debouncedCity.trim().length > 1,
    staleTime: 60_000,
  });

  const shippingCalcItems = items.map((i) => ({
    productId: i.id,
    qty: i.qty,
    price: i.price,
  }));
  const { data: shippingCalcData } = useQuery({
    queryKey: ['/api/shipping/calculate', shippingCalcItems, address.city],
    queryFn: () => fetchShippingCalc(shippingCalcItems, address.city),
    staleTime: 30_000,
  });

  const cities = (citiesData && citiesData.length > 0) ? citiesData : FALLBACK_CITIES;

  // Reset same_day if user switches away from eligible city
  useEffect(() => {
    if (deliveryType === 'same_day') {
      const sdCityCheck = (sameDayData?.city ?? 'Lahore').toLowerCase();
      if (address.city.trim().toLowerCase() !== sdCityCheck) {
        setDeliveryType('standard');
      }
    }
  }, [address.city, sameDayData?.city, deliveryType]);

  const [detectError, setDetectError] = useState<string | null>(null);
  const [detectSuccess, setDetectSuccess] = useState(false);

  const handleDetectLocation = async () => {
    if (!navigator.geolocation) {
      setDetectError("GPS not supported on this device.");
      return;
    }
    setIsDetecting(true);
    setDetectError(null);
    setDetectSuccess(false);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 12000, enableHighAccuracy: true })
      );
      const { latitude, longitude } = pos.coords;
      const geo = await reverseGeocode(latitude, longitude);
      if (geo) {
        const detectedAddress = [geo.area, geo.street].filter(Boolean).join(", ") || geo.fullAddress || "";
        setAddress(prev => ({
          ...prev,
          ...(geo.city      && { city:       geo.city }),
          ...(detectedAddress && { address:   detectedAddress }),
          ...(geo.postalCode && { postalCode: geo.postalCode }),
        }));
        setDetectSuccess(true);
        setTimeout(() => setDetectSuccess(false), 4000);
      } else {
        setDetectError("Could not fetch address. Please enter manually.");
      }
    } catch (err: any) {
      if (err?.code === 1) setDetectError("Location permission denied. Please allow access in browser settings.");
      else if (err?.code === 3) setDetectError("GPS timed out. Please try again or enter address manually.");
      else setDetectError("Could not detect location. Try again.");
    } finally {
      setIsDetecting(false);
    }
  };

  // Same Day Delivery logic
  const nowHour = new Date().getHours();
  const sdEnabled = sameDayData?.enabled === true;
  const sdCity = (sameDayData?.city ?? 'Lahore').toLowerCase();
  const sdCutoff = sameDayData?.cutoffHour ?? 15;
  const sdPrice = sameDayData?.price ?? 250;
  const isLahore = address.city.trim().toLowerCase() === sdCity;
  const beforeCutoff = nowHour < sdCutoff;
  const showSameDay = sdEnabled && isLahore;

  const fmt12h = (h: number) => {
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:00 ${suffix}`;
  };

  const couriers = (activeCouriers && (activeCouriers as any[]).length > 0)
    ? (activeCouriers as any[]).map((c: any) => ({ id: c.slug, label: c.name }))
    : FALLBACK_COURIERS;

  const gateways = paymentOptions?.gateways ?? [];
  const manualPayments = paymentOptions?.manualPayments ?? [];

  const paymentMethods = gateways.length > 0
    ? gateways.map((g: any) => ({ id: g.type, label: g.displayName, icon: PAYMENT_ICONS[g.type] ?? <CreditCard size={18} className="text-gray-500" /> }))
    : [
        { id: 'cod', label: 'Cash on Delivery', icon: PAYMENT_ICONS.cod },
        { id: 'jazzcash', label: 'JazzCash', icon: PAYMENT_ICONS.jazzcash },
        { id: 'easypaisa', label: 'EasyPaisa', icon: PAYMENT_ICONS.easypaisa },
        { id: 'card', label: 'Credit / Debit Card', icon: PAYMENT_ICONS.card },
      ];

  const selectedBankDetails = paymentMethod === 'bank_transfer' && manualPayments.length > 0
    ? (manualPayments as any[]).filter((b: any) => b.isActive)
    : [];

  const dynamicStandardFee = shippingCalcData?.fee ?? 150;
  const dynamicMethodName = shippingCalcData?.methodName ?? 'Standard Delivery';
  const dynamicDeliveryTime = shippingCalcData?.deliveryTime ?? '3–5 business days';

  const createOrderMutation = useCreateOrder();
  const deliveryFee = deliveryType === 'same_day'
    ? sdPrice
    : deliveryType === 'express'
      ? DELIVERY_FEE_EXPRESS
      : dynamicStandardFee;
  const total = totalPrice + deliveryFee;
  const isFreeOrder = total === 0;

  const handleField = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setAddress(prev => ({ ...prev, [field]: e.target.value }));

  const handlePlaceOrder = () => {
    setError('');
    if (!address.name.trim() || !address.phone.trim() || !address.address.trim() || !address.city.trim()) {
      setError('Please fill in all required shipping fields.');
      return;
    }
    if (items.length === 0) { setError('Your cart is empty.'); return; }

    const effectivePaymentMethod = isFreeOrder ? 'free' : paymentMethod;

    if (!isFreeOrder && paymentMethod === 'bank_transfer' && !referenceNumber.trim()) {
      setError('Please enter the bank transfer reference / transaction number.');
      return;
    }
    if (!isFreeOrder && paymentMethod === 'wallet' && walletBalance < total) {
      setError(`Insufficient wallet balance (₨${walletBalance.toLocaleString()}). Please choose another payment method.`);
      return;
    }

    createOrderMutation.mutate({
      data: {
        items: items.map(item => ({
          productId: item.id,
          name: item.name,
          price: String(item.price),
          qty: item.qty,
          variant: item.variant || undefined,
          variantId: item.variantId || undefined,
          gradient: item.gradient || undefined,
        })),
        deliveryType,
        courier,
        paymentMethod: effectivePaymentMethod,
        ...(!isFreeOrder && paymentMethod === 'bank_transfer' && referenceNumber.trim() ? { referenceNumber: referenceNumber.trim() } : {}),
        shippingAddress: {
          name: address.name.trim(),
          phone: address.phone.trim(),
          address: address.address.trim(),
          city: address.city.trim(),
          country: address.country || 'Pakistan',
          postalCode: address.postalCode || undefined,
        },
      },
    }, {
      onSuccess: async (order) => {
        clearCart();
        const pm = effectivePaymentMethod;

        /* ── JazzCash / Easypaisa: initiate hosted payment then form-redirect ── */
        if (pm === 'jazzcash' || pm === 'easypaisa') {
          try {
            const endpoint = pm === 'jazzcash'
              ? '/api/payments/jazzcash/initiate'
              : '/api/payments/easypaisa/initiate';

            const resp = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId:        order.id,
                amount:         Number(order.total ?? total),
                customerMobile: address.phone.trim(),
                orderDesc:      `KDF NUTS Order #${order.orderNumber}`,
              }),
            });

            if (!resp.ok) throw new Error('Payment gateway unavailable');
            const data = await resp.json();

            if (pm === 'jazzcash') {
              /* Submit as hidden HTML form to JazzCash hosted page */
              const form = document.createElement('form');
              form.method = 'POST';
              form.action = data.actionUrl;
              for (const [key, value] of Object.entries(data.formFields as Record<string, string>)) {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = key;
                input.value = value;
                form.appendChild(input);
              }
              document.body.appendChild(form);
              form.submit();
              return;
            }

            if (pm === 'easypaisa') {
              /* POST to Easypaisa API then redirect to web URL */
              const epResp = await fetch(data.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data.payload),
              });
              const epData = await epResp.json();
              const webUrl = `${data.webUrl}?${new URLSearchParams({ ...data.payload, ...epData }).toString()}`;
              window.location.href = webUrl;
              return;
            }
          } catch (payErr: any) {
            /* Gateway error — fall back to order-success with pending payment status */
            setError(`Payment gateway error: ${payErr.message}. Your order was placed — please retry payment.`);
            setLocation(`/order-success?orderId=${order.id}&orderNumber=${order.orderNumber}&paymentMethod=${pm}&referenceNumber=&total=${order.total ?? total}&paymentPending=1`);
            return;
          }
        }

        /* All other methods → go straight to order success */
        const ref = pm === 'bank_transfer' ? encodeURIComponent(referenceNumber) : "";
        setLocation(`/order-success?orderId=${order.id}&orderNumber=${order.orderNumber}&paymentMethod=${pm}&referenceNumber=${ref}&total=${order.total ?? total}`);
      },
      onError: (err: any) => {
        setError(err?.message ?? 'Failed to place order. Please try again.');
      },
    });
  };

  if (items.length === 0 && !createOrderMutation.isPending) {
    return (
      <div className="w-full max-w-[430px] mx-auto min-h-[100dvh] bg-[#F8F9FB] flex flex-col items-center justify-center gap-4 font-sans px-6">
        <div className="text-5xl">🛒</div>
        <h2 className="text-lg font-bold text-gray-800">Your cart is empty</h2>
        <p className="text-sm text-gray-500 text-center">Add some products before checking out.</p>
        <button onClick={() => setLocation('/home')} className="mt-2 bg-[#5FA800] text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-transform">
          Browse Products
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[430px] mx-auto min-h-[100dvh] bg-[#F8F9FB] flex flex-col font-sans relative pb-24">

      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 bg-white sticky top-0 z-20 border-b border-gray-100">
        <button onClick={() => setLocation('/cart')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors">
          <ChevronLeft className="w-6 h-6 text-gray-800" />
        </button>
        <div className="flex flex-col items-center">
          <h1 className="text-[17px] font-semibold text-gray-900">Checkout</h1>
          <span className="text-[11px] text-gray-500">{items.length} item{items.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="w-10" />
      </header>

      {/* Progress */}
      <div className="bg-white px-8 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-gray-100 -z-10 -translate-y-1/2" />
          <div className="absolute left-0 w-1/2 top-1/2 h-0.5 bg-[#5FA800] -z-10 -translate-y-1/2" />
          {['Address', 'Payment', 'Review'].map((step, i) => (
            <div key={step} className="flex flex-col items-center gap-1 bg-white px-1">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${i === 0 ? 'bg-[#5FA800]' : i === 1 ? 'border-2 border-[#5FA800] bg-white' : 'border-2 border-gray-200 bg-white'}`}>
                {i === 0 ? <Check size={11} className="text-white" /> : i === 1 ? <div className="w-2 h-2 rounded-full bg-[#5FA800]" /> : null}
              </div>
              <span className={`text-[10px] font-bold ${i <= 1 ? 'text-[#5FA800]' : 'text-gray-400'}`}>{step}</span>
            </div>
          ))}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto pb-[110px] p-4 space-y-4">

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span>
          </div>
        )}

        {/* Shipping Address */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div className="flex items-center gap-2.5">
              <MapPin className="w-4 h-4 text-[#5FA800]" />
              <h2 className="text-sm font-bold text-gray-900">Shipping Address</h2>
            </div>
            <button
              type="button"
              onClick={handleDetectLocation}
              disabled={isDetecting}
              className="group relative flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden"
              style={{ borderColor: "#5FA800", color: "#3d7200", background: isDetecting ? "linear-gradient(135deg,#e8f5d4,#d4edaa)" : "linear-gradient(135deg,#f0fae3,#e4f5c4)" }}
            >
              {isDetecting ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Detecting…</>
              ) : (
                <>
                  <span className="relative flex items-center justify-center">
                    <Navigation className="w-3 h-3 relative z-10" style={{ color: "#5FA800" }} />
                    <span className="absolute inline-flex w-3 h-3 rounded-full opacity-40 animate-ping" style={{ backgroundColor: "#5FA800" }} />
                  </span>
                  Auto-detect Address
                </>
              )}
            </button>
          </div>

          {/* Detect status */}
          {detectError && (
            <div className="mx-4 mb-1 flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="flex-1">{detectError}</span>
              <button onClick={() => setDetectError(null)} className="text-red-400 hover:text-red-600 underline text-[10px]">Dismiss</button>
            </div>
          )}
          {detectSuccess && (
            <div className="mx-4 mb-1 flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-3 py-2 text-xs text-green-700 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-green-600" />
              <span>Address auto-filled from GPS!</span>
            </div>
          )}

          <div className="px-4 pb-4 space-y-2.5">
            {[
              { id: 'name', label: 'Full Name *', type: 'text', placeholder: 'Ali Hassan' },
              { id: 'phone', label: 'Phone *', type: 'tel', placeholder: '0300-1234567' },
              { id: 'address', label: 'Street Address *', type: 'text', placeholder: '123 DHA Phase 5' },
            ].map(({ id, label, type, placeholder }) => (
              <div key={id}>
                <label className="text-[11px] text-gray-500 font-medium mb-1 block">{label}</label>
                <input type={type} value={(address as any)[id]} onChange={handleField(id)} placeholder={placeholder}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#5FA800] focus:ring-2 focus:ring-[#5FA800]/10 transition-all bg-gray-50 focus:bg-white" />
              </div>
            ))}

            {/* City — combobox: type or pick from list */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-gray-500 font-medium">City *</label>
              </div>
              <input
                list="checkout-cities-list"
                value={address.city}
                onChange={handleField('city')}
                placeholder="Type or select city…"
                autoComplete="off"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#5FA800] focus:ring-2 focus:ring-[#5FA800]/10 transition-all bg-gray-50 focus:bg-white"
              />
              <datalist id="checkout-cities-list">
                {cities.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>

              {/* ── Live Delivery Info Badge ── */}
              {cityShippingInfo && address.city.trim().length > 1 && (
                <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs border transition-all ${
                  cityShippingInfo.hasSpecialRule
                    ? 'bg-[#eef7e6] border-[#5FA800]/30'
                    : 'bg-blue-50 border-blue-200/60'
                }`}>
                  <Truck className={`w-3.5 h-3.5 flex-shrink-0 ${cityShippingInfo.hasSpecialRule ? 'text-[#5FA800]' : 'text-blue-500'}`} />
                  <div className="flex-1 min-w-0">
                    <span className={`font-bold ${cityShippingInfo.hasSpecialRule ? 'text-[#0D2B00]' : 'text-blue-800'}`}>
                      {cityShippingInfo.methodName}
                    </span>
                    <span className={`${cityShippingInfo.hasSpecialRule ? 'text-[#5FA800]' : 'text-blue-600'}`}>
                      {' '}· {cityShippingInfo.deliveryTime}
                    </span>
                    {cityShippingInfo.isFree
                      ? <span className="ml-1.5 text-[10px] font-bold bg-[#5FA800] text-white px-1.5 py-0.5 rounded-full">FREE</span>
                      : <span className={`font-bold ${cityShippingInfo.hasSpecialRule ? 'text-[#5FA800]' : 'text-blue-700'}`}> · ₨{cityShippingInfo.fee}</span>
                    }
                  </div>
                  {cityShippingInfo.hasSpecialRule && (
                    <span className="flex items-center gap-0.5 text-[10px] font-bold text-[#5FA800] flex-shrink-0">
                      <Sparkles className="w-3 h-3" />Special
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-gray-500 font-medium mb-1 block">Country</label>
                <select value={address.country} onChange={handleField('country')} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#5FA800] bg-gray-50">
                  <option value="Pakistan">Pakistan</option>
                  <option value="UAE">UAE</option>
                  <option value="UK">UK</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-gray-500 font-medium mb-1 block">Postal Code</label>
                <input type="text" value={address.postalCode} onChange={handleField('postalCode')} placeholder="54000"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#5FA800] focus:ring-2 focus:ring-[#5FA800]/10 bg-gray-50 focus:bg-white transition-all" />
              </div>
            </div>
          </div>
        </section>

        {/* Delivery */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
            <Truck className="w-4 h-4 text-[#5FA800]" />
            <h2 className="text-sm font-bold text-gray-900">Delivery</h2>
          </div>
          <div className="px-4 pb-4 space-y-3">
            <div className="space-y-2">
              {[
                { id: 'standard', label: dynamicMethodName, desc: dynamicDeliveryTime, fee: dynamicStandardFee },
                { id: 'express', label: 'Express Delivery', desc: '1–2 business days', fee: DELIVERY_FEE_EXPRESS },
              ].map(opt => (
                <button key={opt.id} onClick={() => setDeliveryType(opt.id)} className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left ${deliveryType === opt.id ? 'border-[#5FA800] bg-green-50/30' : 'border-gray-100'}`}>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${deliveryType === opt.id ? 'border-[#5FA800]' : 'border-gray-300'}`}>
                    {deliveryType === opt.id && <div className="w-2.5 h-2.5 rounded-full bg-[#5FA800]" />}
                  </div>
                  <div className="flex-1"><p className="text-sm font-bold text-gray-900">{opt.label}</p><p className="text-[11px] text-gray-500">{opt.desc}</p></div>
                  <span className="font-bold text-sm text-gray-900">₨{opt.fee}</span>
                </button>
              ))}

              {/* Same Day Delivery — only for configured city */}
              {showSameDay && (
                beforeCutoff ? (
                  <button
                    onClick={() => setDeliveryType('same_day')}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left ${deliveryType === 'same_day' ? 'border-[#F58300] bg-orange-50/40' : 'border-gray-100'}`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${deliveryType === 'same_day' ? 'border-[#F58300]' : 'border-gray-300'}`}>
                      {deliveryType === 'same_day' && <div className="w-2.5 h-2.5 rounded-full bg-[#F58300]" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900">Same Day Delivery</p>
                        <span className="text-[10px] font-bold bg-[#F58300] text-white px-2 py-0.5 rounded-full">TODAY</span>
                      </div>
                      <p className="text-[11px] text-gray-500">Order now — delivered today in {sameDayData?.city ?? 'Lahore'}</p>
                    </div>
                    <span className="font-bold text-sm text-[#F58300]">₨{sdPrice}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 p-3.5 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 opacity-70">
                    <div className="w-5 h-5 rounded-full border-2 border-gray-200 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-400">Same Day Delivery</p>
                      <p className="text-[11px] text-red-400">Not available after {fmt12h(sdCutoff)}</p>
                    </div>
                    <span className="text-xs text-gray-400">₨{sdPrice}</span>
                  </div>
                )
              )}
            </div>
          </div>
        </section>

        {/* Payment */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
            <CreditCard className="w-4 h-4 text-[#5FA800]" />
            <h2 className="text-sm font-bold text-gray-900">Payment Method</h2>
          </div>

          {/* Free Order Banner */}
          {isFreeOrder && (
            <div className="mx-4 mb-4 flex items-start gap-3 bg-[#eef7e6] border border-[#5FA800]/30 rounded-xl p-4">
              <div className="w-9 h-9 rounded-full bg-[#5FA800] flex items-center justify-center flex-shrink-0">
                <Check className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#0D2B00]">No Payment Required</p>
                <p className="text-xs text-[#5FA800] mt-0.5">Your order total is ₨0. Just fill in your address and place the order!</p>
              </div>
            </div>
          )}

          {!isFreeOrder && (
            <>
              <div className="px-4 pb-3 space-y-2">
                {paymentMethods.map((pm: any) => {
                  const desc = PAYMENT_DESCRIPTIONS[pm.id] ?? '';
                  const isSelected = paymentMethod === pm.id;
                  return (
                    <button key={pm.id} type="button"
                      onClick={() => { setPaymentMethod(pm.id); setReferenceNumber(''); setError(''); }}
                      className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left ${isSelected ? 'border-[#5FA800] bg-[#eef7e6]' : 'border-gray-100 active:bg-gray-50'}`}>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? 'border-[#5FA800] bg-[#5FA800]' : 'border-gray-300'}`}>
                        {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm transition-colors ${isSelected ? 'bg-white' : 'bg-[#F8F9FB]'}`}>
                        {pm.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900">{pm.label}</p>
                        {desc && <p className="text-[11px] text-gray-500 mt-0.5">{desc}</p>}
                      </div>
                      {pm.id === 'wallet' && isAuthenticated && (
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0 ${walletBalance >= total ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-500'}`}>
                          ₨{walletBalance.toLocaleString()}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* COD note */}
              {paymentMethod === 'cod' && (
                <div className="mx-4 mb-4 flex items-start gap-2.5 bg-green-50 border border-green-100 rounded-xl p-3">
                  <span className="text-xl leading-none">💵</span>
                  <div>
                    <p className="text-xs font-bold text-green-800">Pay at your door</p>
                    <p className="text-[11px] text-green-700 mt-0.5">No advance payment required. Pay in cash when your order is delivered.</p>
                  </div>
                </div>
              )}

              {/* Wallet balance warning */}
              {paymentMethod === 'wallet' && isAuthenticated && walletBalance < total && (
                <div className="mx-4 mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-red-700">Insufficient Wallet Balance</p>
                    <p className="text-[11px] text-red-600 mt-0.5">
                      Your balance ₨{walletBalance.toLocaleString()} is less than the order total ₨{total.toLocaleString()}.
                    </p>
                  </div>
                </div>
              )}
              {paymentMethod === 'wallet' && !isAuthenticated && (
                <div className="mx-4 mb-4 bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-800">
                  Please log in to use your KDF Wallet balance.
                </div>
              )}

              {/* Bank Transfer details + reference number */}
              {paymentMethod === 'bank_transfer' && (
                <div className="mx-4 mb-4 space-y-3">
                  {selectedBankDetails.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-amber-700" />
                        <p className="text-xs font-bold text-amber-800 uppercase tracking-widest">Bank Transfer Details</p>
                      </div>
                      {selectedBankDetails.map((bank: any) => (
                        <div key={bank.id} className="space-y-1.5 bg-white rounded-xl p-3 border border-amber-100">
                          {[
                            { label: 'Bank', value: bank.bankName },
                            { label: 'Account Title', value: bank.accountTitle },
                            { label: 'Account #', value: bank.accountNumber, mono: true },
                            ...(bank.iban ? [{ label: 'IBAN', value: bank.iban, mono: true }] : []),
                          ].filter(r => r.value).map(({ label, value, mono }) => (
                            <div key={label} className="flex justify-between items-center text-xs">
                              <span className="text-gray-500">{label}</span>
                              <span className={`font-semibold text-gray-900 ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</span>
                            </div>
                          ))}
                          {bank.instructions && <p className="text-[11px] text-amber-700 border-t border-amber-100 pt-2 mt-1">{bank.instructions}</p>}
                        </div>
                      ))}
                      <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                        <span className="text-base leading-none mt-0.5">📸</span>
                        <p className="text-[11px] text-blue-700 font-medium">After transferring, send the payment screenshot to us via WhatsApp or chat. Your order will be confirmed once payment is verified.</p>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-[11px] text-gray-600 font-semibold mb-1.5 block">
                      Reference / Transaction ID <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={referenceNumber}
                      onChange={e => setReferenceNumber(e.target.value)}
                      placeholder="e.g. TID123456789 or TRX-ABC12345"
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#5FA800] focus:ring-2 focus:ring-[#5FA800]/10 transition-all bg-gray-50 focus:bg-white"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Enter the transaction ID from your bank app. Order is confirmed after payment verification.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* Order Summary (expandable) */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <button onClick={() => setShowSummary(v => !v)} className="w-full flex items-center justify-between px-4 py-3.5 active:bg-gray-50 transition-colors">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900">Order Summary</span>
              <span className="bg-[#5FA800]/10 text-[#5FA800] text-[10px] font-bold px-2 py-0.5 rounded-full">{items.length} items</span>
            </div>
            {showSummary ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {showSummary && (
            <div className="border-t border-gray-50 divide-y divide-gray-50">
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${item.gradient} flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{item.name}</p>
                    <p className="text-[10px] text-gray-400">{item.variant} · Qty {item.qty}</p>
                  </div>
                  <span className="text-xs font-bold text-gray-800">₨{(item.price * item.qty).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-gray-100 px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>₨{totalPrice.toLocaleString()}</span></div>
            <div className="flex justify-between text-sm text-gray-500"><span>Delivery</span><span>₨{deliveryFee}</span></div>
            <div className="flex justify-between text-sm font-bold text-gray-900 pt-1 border-t border-gray-100">
              <span>Total</span><span className="text-[#5FA800]">₨{total.toLocaleString()}</span>
            </div>
          </div>
        </section>

      </main>

      {/* Fixed Place Order Bar */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 px-4 py-4 shadow-[0_-10px_30px_rgba(0,0,0,0.06)] z-20">
        <button onClick={handlePlaceOrder} disabled={createOrderMutation.isPending}
          className="w-full bg-[#5FA800] disabled:bg-gray-300 text-white py-4 rounded-2xl font-bold text-[15px] shadow-lg shadow-green-600/20 active:bg-[#4d8a00] transition-all flex items-center justify-between px-6">
          {createOrderMutation.isPending
            ? <><Loader2 className="w-5 h-5 animate-spin mx-auto" /></>
            : isFreeOrder
              ? <><span>Place Order</span><span className="font-black bg-white/20 px-2 py-0.5 rounded-lg text-sm">FREE</span></>
              : <><span>Place Order</span><span className="font-black">₨{total.toLocaleString()}</span></>}
        </button>
      </div>
    </div>
  );
}
