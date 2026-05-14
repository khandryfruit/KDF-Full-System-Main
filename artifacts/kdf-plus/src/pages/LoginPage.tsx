import { useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useSiteSettings, logoSrc } from "@/hooks/useSiteSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

const loginSchema = z.object({
  phone: z.string().min(10, "Enter a valid phone number"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [location, setLocation] = useLocation();
  const { login } = useAuth();
  const { data: siteSettings } = useSiteSettings();
  const siteName = siteSettings?.siteName ?? "KDF Plus";
  const logoUrl  = logoSrc(siteSettings?.logoPath);
  const { toast } = useToast();
  const loginMutation = useLogin();

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: "", password: "" },
  });

  const onSubmit = (data: LoginFormData) => {
    loginMutation.mutate(
      { data: { phone: data.phone, password: data.password } },
      {
        onSuccess: (response) => {
          login(response.token, response.user);
          setLocation("/");
        },
        onError: () => {
          toast({
            title: "Login failed",
            description: "Invalid phone number or password.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <>
      <Helmet>
        <title>Login — KDF Plus</title>
        <meta name="description" content="Login to your KDF Plus account to manage orders, wallet, and more." />
        <link rel="canonical" href="/kdf-plus/login" />
      </Helmet>

      <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-b from-slate-50/90 via-background to-background px-4 py-12 md:py-16 lg:px-8">
        <div className="w-full max-w-md md:max-w-lg">
          {/* Back button */}
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Back
          </button>

          {/* Logo */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-3">
              {logoUrl ? (
                <img src={logoUrl} alt={siteName} className="h-14 w-auto max-w-[160px] object-contain" />
              ) : (
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary">
                  <span className="text-white font-black text-lg">KDF</span>
                </div>
              )}
            </div>
            <h1 className="text-2xl font-black text-foreground">Welcome back</h1>
            <p className="text-muted-foreground text-sm mt-1">Login to your {siteName} account</p>
          </div>

          <div className="rounded-2xl border border-gray-100/90 bg-white/90 p-6 shadow-xl shadow-slate-900/[0.06] ring-1 ring-black/[0.04] backdrop-blur-xl sm:p-8 md:rounded-[1.75rem] md:p-9">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="03XX XXXXXXX"
                          type="tel"
                          autoComplete="tel"
                          data-testid="input-phone"
                          className="md:h-11 md:rounded-xl"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Enter your password"
                          autoComplete="current-password"
                          data-testid="input-password"
                          className="md:h-11 md:rounded-xl"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full rounded-xl font-semibold shadow-md shadow-[#5FA800]/20 transition-[transform,box-shadow] hover:scale-[1.01] active:scale-[0.99] md:h-12"
                  size="lg"
                  style={{ background: "linear-gradient(135deg, #5FA800 0%, #3d7000 100%)" }}
                  disabled={loginMutation.isPending}
                  data-testid="button-login"
                >
                  {loginMutation.isPending ? "Logging in..." : "Login"}
                </Button>
              </form>
            </Form>

            <div className="mt-5 text-center">
              <p className="text-sm text-muted-foreground">
                Don't have an account?{" "}
                <Link href="/register" className="text-primary font-semibold hover:underline" data-testid="link-register">
                  Register now
                </Link>
              </p>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-4">
            By logging in, you agree to our terms and privacy policy.
          </p>
        </div>
      </main>
    </>
  );
}
