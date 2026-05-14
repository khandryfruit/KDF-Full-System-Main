import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { getSessionId, trackAbandonedCheckout, markCheckoutRecovered } from "@/lib/abandonedCheckout";
import { Helmet } from "react-helmet-async";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { useUserLocation } from "@/context/LocationContext";
import { useCreateOrder, useGetWalletBalance } from "@workspace/api-client-react";
import { getProductImageSrc } from "@/lib/imageUrl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Wallet, Package, Banknote, Building2, Smartphone, MapPin, Navigation, ChevronDown, Truck, Zap, Clock, Loader2, Sparkles, ShieldCheck, Lock } from "lucide-react";

const checkoutSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().min(10, "Enter a valid phone number"),
  address: z.string().min(5, "Please enter your address"),
  city: z.string().min(2, "City is required"),
  country: z.string().default("Pakistan"),
  postalCode: z.string().optional(),
  paymentMethod: z.string().min(1),
  notes: z.string().optional(),
});

type CheckoutFormData = z.infer<typeof checkoutSchema>;

async function fetchShippingCalc(items: { productId: number; qty: number; price: number }[], city: string) {
  try {
    const res = await fetch("/api/shipping/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, city }),
    });
    if (!res.ok) return null;
    return res.json() as Promise<{ fee: number; isFree: boolean; methodName: string; deliveryTime: string; ruleName: string }>;
  } catch {
    return null;
  }
}

async function fetchCityShippingInfo(city: string) {
  if (!city.trim()) return null;
  const res = await fetch(`/api/shipping/city-info?city=${encodeURIComponent(city.trim())}`);
  if (!res.ok) return null;
  return res.json() as Promise<{ fee: number; isFree: boolean; methodName: string; deliveryTime: string; hasSpecialRule: boolean }>;
}

async function fetchSameDaySettings() {
  try {
    const res = await fetch("/api/shipping/same-day");
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

const PAYMENT_ICONS: Record<string, React.ReactNode> = {
  cod: <Banknote className="w-4 h-4 text-primary" />,
  jazzcash: <Smartphone className="w-4 h-4 text-red-600" />,
  easypaisa: <Smartphone className="w-4 h-4 text-emerald-600" />,
  card: <CreditCard className="w-4 h-4 text-blue-600" />,
  wallet: <Wallet className="w-4 h-4 text-purple-600" />,
  bank_transfer: <Building2 className="w-4 h-4 text-amber-600" />,
};

const FALLBACK_GATEWAYS = [
  { type: "cod", displayName: "Cash on Delivery", description: "Pay when your order arrives" },
  { type: "wallet", displayName: "KDF Wallet", description: "Pay using your wallet balance" },
];

async function fetchPaymentOptions() {
  const res = await fetch("/api/payment-gateways/active");
  if (!res.ok) return { gateways: [], manualPayments: [] };
  return res.json();
}

export default function CheckoutPage() {
  const [, setLocation] = useLocation();
  const { items, totalPrice, clearCart } = useCart();
  const { user } = useAuth();
  const { toast } = useToast();
  const createOrder = useCreateOrder();
  const { city: detectedCity, cities, detectLocation, isDetecting, mapsLoaded, initAutocomplete } = useUserLocation();

  const [referenceNumber, setReferenceNumber] = useState("");
  const [deliveryType, setDeliveryType] = useState<"standard" | "same_day">("standard");
  const [locationFilling, setLocationFilling] = useState(false);
  const [locationError, setLocationError] = useState("");
  const { data: walletData } = useGetWalletBalance({ query: { enabled: true } as any });
  const walletBalance = walletData ? Number(walletData.balance) : 0;

  const { data: paymentOptions } = useQuery({
    queryKey: ["/api/payment-gateways/active"],
    queryFn: fetchPaymentOptions,
  });

  const { data: sameDayData } = useQuery({
    queryKey: ["/api/shipping/same-day"],
    queryFn: fetchSameDaySettings,
  });

  const gateways = (paymentOptions?.gateways && paymentOptions.gateways.length > 0)
    ? paymentOptions.gateways
    : FALLBACK_GATEWAYS;

  const manualPayments: any[] = paymentOptions?.manualPayments ?? [];

  const form = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      name: user?.name ?? "",
      phone: user?.phone ?? "",
      address: user?.address ?? "",
      city: user?.city ?? detectedCity ?? "Karachi",
      country: "Pakistan",
      postalCode: user?.postalCode ?? "",
      paymentMethod: gateways[0]?.type ?? "cod",
      notes: "",
    },
  });

  const [debouncedCity, setDebouncedCity] = useState(form.getValues("city") || "");
  const cityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: cityShippingInfo } = useQuery({
    queryKey: ["/api/shipping/city-info", debouncedCity],
    queryFn: () => fetchCityShippingInfo(debouncedCity),
    enabled: debouncedCity.length >= 2,
    staleTime: 60_000,
  });

  const shippingCalcItems = items.map((i) => ({
    productId: i.product.id,
    qty: i.quantity,
    price: parseFloat(i.product.price ?? "0") || 0,
  }));

  /* Track: checkout page opened */
  useEffect(() => {
    if (items.length === 0) return;
    const subtotal = items.reduce((sum, item) => {
      return sum + (parseFloat(item.product.price ?? "0") || 0) * item.quantity;
    }, 0);
    trackAbandonedCheckout({
      sessionId: getSessionId(),
      userId: user?.id,
      customerName: user?.name,
      phone: user?.phone,
      cartItems: items.map((item) => ({
        productId: item.product.id,
        name: item.product.name,
        price: item.product.price ?? "0",
        qty: item.quantity,
        variant: item.variantId,
        variantLabel: item.variantLabel,
        image: (item.product as any).imagePath ?? undefined,
      })),
      subtotal,
      checkoutStep: "checkout",
    });
  }, []);

  /* Sync detected city into form if not already filled by user */
  useEffect(() => {
    const cur = form.getValues("city");
    if ((!cur || cur === "Karachi") && detectedCity) {
      form.setValue("city", detectedCity);
    }
  }, [detectedCity]);

  /* Address autocomplete — attaches to a hidden dummy input; manual textarea always works */
  const addressInputRef = useRef<HTMLInputElement>(null);
  const addressTextareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!mapsLoaded || !addressInputRef.current) return;
    const cleanup = initAutocomplete(addressInputRef.current, (address, city) => {
      form.setValue("address", address, { shouldValidate: true });
      if (city) form.setValue("city", city, { shouldValidate: true });
      if (addressTextareaRef.current) addressTextareaRef.current.value = address;
    });
    return cleanup;
  }, [mapsLoaded, initAutocomplete]);

  const selectedPayment = form.watch("paymentMethod");
  const watchedAddress = form.watch("address");
  const watchedName = form.watch("name");
  const watchedPhone = form.watch("phone");
  const watchedCity = form.watch("city");

  const { data: shippingCalcData } = useQuery({
    queryKey: ["/api/shipping/calculate", shippingCalcItems.map(i => `${i.productId}:${i.qty}`).join(","), watchedCity ?? ""],
    queryFn: () => fetchShippingCalc(shippingCalcItems, watchedCity ?? ""),
    staleTime: 30_000,
    enabled: shippingCalcItems.length > 0,
  });

  // Same-day delivery logic
  const nowHour = new Date().getHours();
  const sdEnabled = sameDayData?.enabled === true;
  const sdCity = (sameDayData?.city ?? "Lahore").toLowerCase();
  const sdCutoff = sameDayData?.cutoffHour ?? 15;
  const sdPrice = sameDayData?.price ?? 250;
  const isSdCity = watchedCity.trim().toLowerCase() === sdCity;
  const beforeCutoff = nowHour < sdCutoff;
  const showSameDay = sdEnabled && isSdCity;

  // Reset same_day if city changes and no longer eligible
  useEffect(() => {
    if (deliveryType === "same_day" && !isSdCity) {
      setDeliveryType("standard");
    }
  }, [watchedCity, isSdCity]);

  const fmt12h = (h: number) => {
    const suffix = h >= 12 ? "PM" : "AM";
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:00 ${suffix}`;
  };

  const standardFee = shippingCalcData?.fee ?? 150;
  const standardMethodName = shippingCalcData?.methodName ?? "Standard Delivery";
  const standardDeliveryTime = shippingCalcData?.deliveryTime ?? "2–5 business days";
  const deliveryFee = deliveryType === "same_day" ? sdPrice : standardFee;
  const grandTotal = totalPrice + deliveryFee;
  const activeBankDetails = manualPayments.filter((b: any) => b.isActive);

  /* Track: address step when name+phone+address are filled */
  useEffect(() => {
    if (!watchedName || !watchedPhone || !watchedAddress) return;
    const subtotal = totalPrice;
    trackAbandonedCheckout({
      sessionId: getSessionId(),
      userId: user?.id,
      customerName: watchedName,
      phone: watchedPhone,
      cartItems: items.map((item) => ({
        productId: item.product.id,
        name: item.product.name,
        price: item.product.price ?? "0",
        qty: item.quantity,
        variant: item.variantId,
        variantLabel: item.variantLabel,
        image: (item.product as any).imagePath ?? undefined,
      })),
      subtotal,
      checkoutStep: "address",
    });
  }, [watchedAddress, watchedName, watchedPhone]);

  if (items.length === 0) {
    setLocation("/cart");
    return null;
  }

  const onSubmit = (data: CheckoutFormData) => {
    if (data.paymentMethod === "bank_transfer" && !referenceNumber.trim()) {
      toast({ title: "Reference number required", description: "Please enter your bank transfer reference/transaction number.", variant: "destructive" });
      return;
    }
    if (data.paymentMethod === "wallet" && walletBalance < grandTotal) {
      toast({ title: "Insufficient wallet balance", description: `Your wallet balance (Rs. ${walletBalance.toLocaleString()}) is less than the total (Rs. ${grandTotal.toLocaleString()}).`, variant: "destructive" });
      return;
    }
    trackAbandonedCheckout({
      sessionId: getSessionId(),
      userId: user?.id,
      customerName: data.name,
      phone: data.phone,
      cartItems: items.map((item) => ({
        productId: item.product.id,
        name: item.product.name,
        price: item.product.price ?? "0",
        qty: item.quantity,
        variant: item.variantId,
        variantLabel: item.variantLabel,
        image: (item.product as any).imagePath ?? undefined,
      })),
      subtotal: totalPrice,
      checkoutStep: "payment",
    });
    /* Auto-save city if not in the existing list */
    if (data.city.trim() && !cities.includes(data.city.trim())) {
      fetch("/api/cities/auto-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cityName: data.city.trim() }),
      }).catch(() => {});
    }

    createOrder.mutate(
      {
        data: {
          paymentMethod: data.paymentMethod,
          deliveryType,
          shippingAddress: {
            name: data.name,
            phone: data.phone,
            address: data.address,
            city: data.city,
            country: data.country,
            postalCode: data.postalCode,
          },
          items: items.map((item) => ({
            productId: item.product.id,
            name: item.product.name,
            price: item.product.price,
            qty: item.quantity,
            variant: item.variantId,
            gradient: item.product.gradient,
          })),
          notes: data.notes,
          ...(data.paymentMethod === "bank_transfer" && referenceNumber.trim() ? { referenceNumber: referenceNumber.trim() } : {}),
        },
      },
      {
        onSuccess: (order) => {
          markCheckoutRecovered(getSessionId());
          clearCart();
          const pm = (order as any).paymentMethod ?? data.paymentMethod ?? "cod";
          const ref = (order as any).referenceNumber ? encodeURIComponent((order as any).referenceNumber) : "";
          const total = (order as any).total ?? "";
          const num = (order as any).orderNumber ?? "";
          setLocation(`/order/${order.id}?orderNumber=${encodeURIComponent(num)}&paymentMethod=${pm}&referenceNumber=${ref}&total=${total}`);
        },
        onError: () => {
          toast({
            title: "Order failed",
            description: "Could not place your order. Please try again.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <>
      <Helmet>
        <title>Checkout — KDF Plus</title>
      </Helmet>

      <main className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 sm:pb-6 lg:px-8 lg:py-8">
        <div className="mb-6 flex flex-col gap-4 md:mb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight md:text-3xl">Checkout</h1>
            <p className="mt-1 hidden text-sm text-muted-foreground md:block">Secure checkout — your details are encrypted in transit.</p>
          </div>
          <div className="hidden flex-wrap items-center gap-2 md:flex lg:justify-end">
            {[
              { icon: ShieldCheck, label: "Secure checkout" },
              { icon: Truck, label: "Nationwide delivery" },
              { icon: Lock, label: "Privacy protected" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-black/[0.03] backdrop-blur-sm"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-[#5FA800]" />
                {label}
              </div>
            ))}
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
              {/* Left: Delivery + Payment */}
              <div className="space-y-5 md:space-y-6 lg:col-span-2">
                {/* Delivery Address */}
                <div className="rounded-2xl border border-gray-100/90 bg-white/90 p-5 shadow-lg shadow-slate-900/[0.04] ring-1 ring-black/[0.04] backdrop-blur-xl md:rounded-[1.75rem] md:p-6 [&_input]:md:h-11 [&_input]:md:rounded-xl [&_textarea]:md:rounded-xl">
                  <h2 className="mb-1 flex items-center gap-2 text-base font-bold md:text-lg">
                    <Package className="h-4 w-4 text-[#5FA800]" /> Delivery Address
                  </h2>
                  <p className="mb-4 text-xs text-muted-foreground md:text-sm">We use this for delivery updates and order confirmation.</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input placeholder="Your full name" data-testid="input-name" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="phone" render={({ field }) => (
                      <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input placeholder="03XX XXXXXXX" data-testid="input-phone" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />

                    {/* Address — manual textarea + optional location helper */}
                    <FormField control={form.control} name="address" render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <div className="flex items-center justify-between mb-1">
                          <FormLabel>Street Address</FormLabel>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!navigator.geolocation) return;
                              setLocationFilling(true);
                              setLocationError("");
                              try {
                                const pos = await new Promise<GeolocationPosition>((res, rej) =>
                                  navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000, enableHighAccuracy: true })
                                );
                                const r = await fetch("/api/geocode", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                                });
                                if (!r.ok) throw new Error("Geocoding failed");
                                const geo = await r.json();
                                const parts = [geo.street, geo.area, geo.city].filter(Boolean);
                                const addr = parts.join(", ") || geo.fullAddress || "";
                                if (addr) form.setValue("address", addr, { shouldValidate: true });
                                if (addressTextareaRef.current) addressTextareaRef.current.value = addr;
                                if (geo.city) {
                                  form.setValue("city", geo.city, { shouldValidate: true });
                                  setDebouncedCity(geo.city);
                                }
                                if (geo.postalCode) form.setValue("postalCode", geo.postalCode, { shouldValidate: true });
                              } catch (e: any) {
                                setLocationError(e?.code === 1 ? "Location permission denied. Please allow access." : "Could not detect location. Try again.");
                              } finally {
                                setLocationFilling(false);
                              }
                            }}
                            disabled={locationFilling}
                            className="group relative flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all duration-200 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden"
                            style={{
                              background: locationFilling
                                ? "linear-gradient(135deg,#e8f5d4,#d4edaa)"
                                : "linear-gradient(135deg,#f0fae3,#e4f5c4)",
                              borderColor: "#5FA800",
                              color: "#3d7200",
                            }}
                          >
                            <span
                              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-full"
                              style={{ background: "linear-gradient(135deg,#e0f7b8,#c9ee90)" }}
                            />
                            {locationFilling ? (
                              <>
                                <Loader2 className="relative z-10 w-3.5 h-3.5 animate-spin" style={{ color: "#5FA800" }} />
                                <span className="relative z-10">Detecting…</span>
                              </>
                            ) : (
                              <>
                                <span className="relative z-10 flex items-center justify-center">
                                  <Navigation className="w-3.5 h-3.5" style={{ color: "#5FA800" }} />
                                  <span
                                    className="absolute inline-flex w-3.5 h-3.5 rounded-full opacity-40 animate-ping"
                                    style={{ backgroundColor: "#5FA800" }}
                                  />
                                </span>
                                <span className="relative z-10">Use my location</span>
                              </>
                            )}
                          </button>
                        </div>
                        {locationError && (
                          <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-2">
                            <span>{locationError}</span>
                            <button type="button" className="ml-auto text-red-400 hover:text-red-600 underline text-xs" onClick={() => setLocationError("")}>Retry</button>
                          </div>
                        )}
                        <FormControl>
                          <div className="space-y-1.5">
                            {/* Google Maps Places Autocomplete search input (only shown when Maps loaded) */}
                            {mapsLoaded && (
                              <div className="relative">
                                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-400 pointer-events-none" />
                                <input
                                  ref={addressInputRef}
                                  type="text"
                                  placeholder="Search address with Google Maps…"
                                  autoComplete="off"
                                  className="w-full border border-blue-200 bg-blue-50/40 rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-1 placeholder:text-blue-300"
                                />
                              </div>
                            )}
                            {/* Manual address textarea — always visible */}
                            <div className="relative">
                              {!mapsLoaded && <MapPin className="absolute left-3 top-3 w-4 h-4 text-muted-foreground pointer-events-none" />}
                              <textarea
                                ref={addressTextareaRef}
                                placeholder="House no., street, area, landmark…"
                                data-testid="input-address"
                                rows={2}
                                className={`w-full border border-input rounded-md ${!mapsLoaded ? "pl-9" : "pl-3"} pr-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-none`}
                                value={field.value}
                                onChange={(e) => field.onChange(e.target.value)}
                                onBlur={field.onBlur}
                                name={field.name}
                              />
                            </div>
                            {mapsLoaded && (
                              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                                Type in the blue field to search via Google Maps, or type directly below
                              </p>
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {/* City — type or pick from list; unknown cities are auto-saved */}
                    <FormField control={form.control} name="city" render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <>
                            <input
                              list="kdf-plus-cities-list"
                              value={field.value}
                              onChange={(e) => {
                                field.onChange(e.target.value);
                                if (cityDebounceRef.current) clearTimeout(cityDebounceRef.current);
                                cityDebounceRef.current = setTimeout(() => setDebouncedCity(e.target.value), 450);
                              }}
                              onBlur={field.onBlur}
                              ref={field.ref}
                              data-testid="input-city"
                              autoComplete="off"
                              placeholder="Type or select your city…"
                              className="w-full h-10 border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                            />
                            <datalist id="kdf-plus-cities-list">
                              {cities.map((c) => (
                                <option key={c} value={c} />
                              ))}
                            </datalist>
                            {cityShippingInfo && debouncedCity.length >= 2 && (
                              <div
                                className="flex items-center gap-2 mt-1.5 px-3 py-2 rounded-lg text-xs font-medium border"
                                style={
                                  cityShippingInfo.isFree
                                    ? { background: "#f0fae3", borderColor: "#5FA800", color: "#3d7200" }
                                    : cityShippingInfo.hasSpecialRule
                                    ? { background: "#fff7ed", borderColor: "#F58300", color: "#c26000" }
                                    : { background: "#eff6ff", borderColor: "#93c5fd", color: "#1d4ed8" }
                                }
                              >
                                {cityShippingInfo.isFree ? (
                                  <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
                                ) : (
                                  <Truck className="w-3.5 h-3.5 flex-shrink-0" />
                                )}
                                <span>
                                  {cityShippingInfo.isFree
                                    ? "Free delivery to " + debouncedCity
                                    : "Delivery to " + debouncedCity + ": Rs. " + cityShippingInfo.fee}
                                  {" · "}
                                  <span className="opacity-80">{cityShippingInfo.deliveryTime}</span>
                                </span>
                              </div>
                            )}
                          </>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="postalCode" render={({ field }) => (
                      <FormItem><FormLabel>Postal Code (optional)</FormLabel><FormControl><Input placeholder="75000" data-testid="input-postal" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="notes" render={({ field }) => (
                      <FormItem className="sm:col-span-2"><FormLabel>Order Notes (optional)</FormLabel><FormControl><Input placeholder="Special instructions for delivery..." data-testid="input-notes" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </div>

                {/* Shipping Method */}
                <div className="rounded-2xl border border-gray-100/90 bg-white/90 p-5 shadow-lg shadow-slate-900/[0.04] ring-1 ring-black/[0.04] backdrop-blur-xl md:rounded-[1.75rem] md:p-6">
                  <h2 className="mb-4 flex items-center gap-2 text-base font-bold md:text-lg">
                    <Truck className="h-4 w-4 text-[#5FA800]" /> Shipping Method
                  </h2>
                  <div className="space-y-2">
                    {/* Standard Delivery */}
                    <button
                      type="button"
                      onClick={() => setDeliveryType("standard")}
                      className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left ${
                        deliveryType === "standard"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        deliveryType === "standard" ? "border-primary bg-primary" : "border-muted-foreground/30"
                      }`}>
                        {deliveryType === "standard" && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <div className="w-9 h-9 rounded-xl bg-muted/30 flex items-center justify-center flex-shrink-0">
                        <Truck className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{standardMethodName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{standardDeliveryTime}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {standardFee === 0 ? (
                          <span className="text-sm font-bold text-green-600">FREE</span>
                        ) : (
                          <span className="text-sm font-bold">Rs. {standardFee}</span>
                        )}
                      </div>
                    </button>

                    {/* Same-Day Delivery — shown only when enabled + eligible city */}
                    {showSameDay && (
                      <button
                        type="button"
                        onClick={() => beforeCutoff && setDeliveryType("same_day")}
                        disabled={!beforeCutoff}
                        className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed ${
                          deliveryType === "same_day"
                            ? "border-orange-500 bg-orange-50"
                            : "border-border hover:border-orange-300"
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          deliveryType === "same_day" ? "border-orange-500 bg-orange-500" : "border-muted-foreground/30"
                        }`}>
                          {deliveryType === "same_day" && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                        <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                          <Zap className="w-4 h-4 text-orange-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold">Same-Day Delivery</p>
                            <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold">Express</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {beforeCutoff
                              ? `Order before ${fmt12h(sdCutoff)} — delivered today`
                              : `Cutoff time passed (${fmt12h(sdCutoff)})`}
                          </p>
                        </div>
                        <span className="text-sm font-bold flex-shrink-0">Rs. {sdPrice}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Payment Method */}
                <div className="rounded-2xl border border-gray-100/90 bg-white/90 p-5 shadow-lg shadow-slate-900/[0.04] ring-1 ring-black/[0.04] backdrop-blur-xl md:rounded-[1.75rem] md:p-6">
                  <h2 className="mb-4 flex items-center gap-2 text-base font-bold md:text-lg">
                    <CreditCard className="h-4 w-4 text-[#5FA800]" /> Payment Method
                  </h2>
                  <FormField control={form.control} name="paymentMethod" render={({ field }) => (
                    <FormItem>
                      <div className="space-y-2" data-testid="radio-payment">
                        {gateways.map((gw: any) => (
                          <button
                            type="button"
                            key={gw.type}
                            data-testid={`radio-${gw.type}`}
                            onClick={() => { field.onChange(gw.type); setReferenceNumber(""); }}
                            className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all text-left ${
                              field.value === gw.type
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/30"
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                              field.value === gw.type ? "border-primary bg-primary" : "border-muted-foreground/30"
                            }`}>
                              {field.value === gw.type && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>
                            <div className="w-9 h-9 rounded-xl bg-muted/30 flex items-center justify-center flex-shrink-0">
                              {PAYMENT_ICONS[gw.type] ?? <CreditCard className="w-4 h-4 text-muted-foreground" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold">{gw.displayName}</p>
                              {gw.description && <p className="text-xs text-muted-foreground mt-0.5">{gw.description}</p>}
                            </div>
                            {gw.type === "wallet" && (
                              <span className={`text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0 ${
                                walletBalance >= grandTotal ? "bg-green-100 text-green-700" : "bg-red-50 text-red-500"
                              }`}>
                                Rs. {walletBalance.toLocaleString()}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* COD note */}
                  {selectedPayment === "cod" && (
                    <div className="mt-4 flex items-start gap-2.5 bg-green-50 border border-green-100 rounded-xl p-3">
                      <span className="text-lg leading-none">💵</span>
                      <div>
                        <p className="text-xs font-bold text-green-800">Cash on Delivery</p>
                        <p className="text-xs text-green-700 mt-0.5">No advance payment required. Pay in cash when your order is delivered to you.</p>
                      </div>
                    </div>
                  )}

                  {/* Wallet balance warning */}
                  {selectedPayment === "wallet" && walletBalance < grandTotal && (
                    <div className="mt-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                      <Wallet className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-red-700">Insufficient Wallet Balance</p>
                        <p className="text-xs text-red-600 mt-0.5">
                          Your balance (Rs. {walletBalance.toLocaleString()}) is less than the order total (Rs. {grandTotal.toLocaleString()}). Please top up or choose another payment method.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Bank transfer details + reference number */}
                  {selectedPayment === "bank_transfer" && (
                    <div className="mt-4 space-y-3">
                      {activeBankDetails.length > 0 && activeBankDetails.map((bank: any) => (
                        <div key={bank.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5" />{bank.bankName}
                          </p>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between"><span className="text-muted-foreground">Account Title</span><span className="font-medium">{bank.accountTitle}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Account #</span><span className="font-mono font-semibold">{bank.accountNumber}</span></div>
                            {bank.iban && <div className="flex justify-between"><span className="text-muted-foreground">IBAN</span><span className="font-mono text-xs">{bank.iban}</span></div>}
                            {bank.instructions && <p className="text-xs text-amber-700 mt-2">{bank.instructions}</p>}
                          </div>
                        </div>
                      ))}
                      <div>
                        <label className="text-xs font-semibold text-foreground mb-1.5 block">
                          Reference / Transaction ID <span className="text-destructive">*</span>
                        </label>
                        <input
                          type="text"
                          value={referenceNumber}
                          onChange={e => setReferenceNumber(e.target.value)}
                          placeholder="e.g. TID123456789"
                          className="w-full border border-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-background"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Enter the transaction ID from your bank or mobile banking app.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Order Summary */}
              <div className="lg:sticky lg:top-24 lg:self-start">
                <div className="rounded-2xl border border-gray-100/90 bg-white/90 p-5 shadow-xl shadow-slate-900/[0.06] ring-1 ring-black/[0.04] backdrop-blur-xl md:rounded-[1.75rem] md:p-6">
                  <h2 className="mb-1 text-base font-bold md:text-lg">Order Summary</h2>
                  <p className="mb-4 text-xs text-muted-foreground">Items in your bag</p>
                  <div className="mb-4 max-h-52 space-y-3 overflow-y-auto pr-1 md:max-h-64">
                    {items.map((item) => (
                      <div key={`${item.product.id}-${item.variantId}`} className="group flex items-center gap-3 rounded-xl border border-transparent px-1 py-1 transition-colors hover:border-[#5FA800]/15 hover:bg-[#5FA800]/[0.04]">
                        <img src={getProductImageSrc(item.product.images?.[0])} alt={item.product.name} loading="lazy"
                          className="h-12 w-12 flex-shrink-0 rounded-lg bg-muted/20 object-cover ring-1 ring-black/[0.04] transition-transform duration-300 group-hover:scale-105 md:h-14 md:w-14 md:rounded-xl" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium line-clamp-1">{item.product.name}</p>
                          <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                        </div>
                        <p className="text-xs font-bold flex-shrink-0">Rs. {(parseFloat(item.product.price) * item.quantity).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                  <Separator className="my-3" />
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>Rs. {totalPrice.toLocaleString()}</span></div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Delivery</span>
                      <span>{deliveryFee === 0 ? <span className="text-green-600 font-medium">FREE</span> : `Rs. ${deliveryFee}`}</span>
                    </div>
                  </div>
                  <Separator className="my-3" />
                  <div className="flex justify-between font-bold">
                    <span>Total</span>
                    <span data-testid="text-checkout-total">Rs. {grandTotal.toLocaleString()}</span>
                  </div>
                  <Button
                    type="submit"
                    size="lg"
                    className="mt-4 w-full rounded-xl font-semibold shadow-lg shadow-[#5FA800]/20 transition-[transform,box-shadow] duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:hover:scale-100"
                    style={{ background: "linear-gradient(135deg, #5FA800 0%, #3d7000 100%)" }}
                    disabled={createOrder.isPending}
                    data-testid="button-place-order"
                  >
                    {createOrder.isPending ? "Placing Order..." : "Place Order"}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </Form>
      </main>
    </>
  );
}
