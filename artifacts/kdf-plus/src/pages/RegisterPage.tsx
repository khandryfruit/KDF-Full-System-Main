import { useLocation, Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useSiteSettings, logoSrc } from "@/hooks/useSiteSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().min(10, "Enter a valid phone number"),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
  city: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const registerMutation = useRegister();
  const { data: siteSettings } = useSiteSettings();
  const siteName = siteSettings?.siteName ?? "KDF Plus";
  const logoUrl  = logoSrc(siteSettings?.logoPath);

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", phone: "", email: "", password: "", confirmPassword: "", city: "" },
  });

  const onSubmit = (data: RegisterFormData) => {
    registerMutation.mutate(
      {
        data: {
          name: data.name,
          phone: data.phone,
          email: data.email || undefined,
          password: data.password,
          city: data.city || undefined,
        },
      },
      {
        onSuccess: (response) => {
          login(response.token, response.user);
          setLocation("/");
        },
        onError: () => {
          toast({
            title: "Registration failed",
            description: "This phone number may already be registered.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <>
      <Helmet>
        <title>Register — KDF Plus</title>
        <meta name="description" content="Create your KDF Plus account to start shopping premium nuts and dry fruits." />
        <link rel="canonical" href="/kdf-plus/register" />
      </Helmet>

      <main className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 bg-background">
        <div className="w-full max-w-md">
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
            <h1 className="text-2xl font-black text-foreground">Create Account</h1>
            <p className="text-muted-foreground text-sm mt-1">Join {siteName} for premium nuts &amp; dry fruits</p>
          </div>

          <div className="bg-white border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Your full name" autoComplete="name" data-testid="input-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input placeholder="03XX XXXXXXX" type="tel" autoComplete="tel" data-testid="input-phone" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="you@example.com" type="email" autoComplete="email" data-testid="input-email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Karachi" data-testid="input-city" {...field} />
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
                        <Input type="password" placeholder="Min. 6 characters" autoComplete="new-password" data-testid="input-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Repeat password" autoComplete="new-password" data-testid="input-confirm-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full font-semibold"
                  size="lg"
                  disabled={registerMutation.isPending}
                  data-testid="button-register"
                >
                  {registerMutation.isPending ? "Creating Account..." : "Create Account"}
                </Button>
              </form>
            </Form>

            <div className="mt-5 text-center">
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link href="/login" className="text-primary font-semibold hover:underline" data-testid="link-login">
                  Login
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
