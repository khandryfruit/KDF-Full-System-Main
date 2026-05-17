import { useState } from "react";
import { MessageSquare, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiPublicUrl } from "@/lib/apiBase";

async function apiFetch(url: string, opts?: RequestInit) {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  const res = await fetch(apiPublicUrl(url), {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
  return data;
}

type TestResult = {
  route: string;
  entity: string;
  confidence: number;
  intent: string;
  greetingPreview?: string | null;
  aiNote?: string | null;
  whatsappCardPreview?: string | null;
  product?: {
    name: string;
    price: string;
    imageUrl?: string | null;
    productUrl: string;
    inStock: boolean;
    stock: number;
    score: number;
    variants: Array<{ name: string; price: string }>;
  } | null;
  alternateProducts?: Array<{ name: string; score: number }>;
};

export function ProductWaChatTestDialog(props: {
  productId: number;
  productName: string;
  defaultQuery?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(props.defaultQuery ?? props.productName);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await apiFetch("/api/admin/products/wa-chat-test", {
        method: "POST",
        body: JSON.stringify({ query: query.trim(), productId: props.productId }),
      });
      setResult(data as TestResult);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="AI Chat Test (WhatsApp pipeline)"
          onClick={() => {
            setQuery(props.defaultQuery ?? props.productName);
            setResult(null);
            setError(null);
          }}
        >
          <MessageSquare className="w-4 h-4 text-violet-600" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-violet-600" />
            AI Chat Test
          </DialogTitle>
          <DialogDescription>
            Simulates live WhatsApp: Commerce DB → product card (image, price, URL). Product:{" "}
            <strong>{props.productName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Customer message</Label>
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Mujhe goji berry chahiye"
                onKeyDown={(e) => e.key === "Enter" && runTest()}
              />
              <Button onClick={runTest} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Test"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {["Salam", "goji", "badam price", "بادام کے فائدے"].map((s) => (
                <Button key={s} variant="outline" size="sm" className="h-7 text-xs" onClick={() => setQuery(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {result && (
            <div className="space-y-3 rounded-lg border p-3 bg-muted/30 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{result.route}</Badge>
                <Badge variant="outline">intent: {result.intent}</Badge>
                <Badge variant="outline">confidence: {result.confidence}%</Badge>
                {result.entity && <Badge variant="outline">entity: {result.entity}</Badge>}
              </div>

              {result.aiNote && <p className="text-muted-foreground">{result.aiNote}</p>}

              {result.greetingPreview && (
                <div>
                  <p className="font-medium mb-1">Greeting preview</p>
                  <pre className="whitespace-pre-wrap text-xs bg-background p-2 rounded border">{result.greetingPreview}</pre>
                </div>
              )}

              {result.product && (
                <div className="space-y-2">
                  <p className="font-medium">Product card (Commerce DB)</p>
                  {result.product.imageUrl && (
                    <img
                      src={result.product.imageUrl}
                      alt={result.product.name}
                      className="w-full max-h-40 object-contain rounded border bg-white"
                    />
                  )}
                  <p className="font-semibold">{result.product.name}</p>
                  <p>💰 {result.product.price}</p>
                  <p>
                    {result.product.inStock ? "📦 In stock" : "📦 Out of stock"} ({result.product.stock})
                  </p>
                  <p className="text-xs text-muted-foreground">Score: {result.product.score}</p>
                  {result.product.variants?.length > 0 && (
                    <ul className="text-xs list-disc pl-4">
                      {result.product.variants.map((v) => (
                        <li key={v.name}>
                          {v.name} — {v.price}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button variant="outline" size="sm" asChild>
                    <a href={result.product.productUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="w-3 h-3 mr-1" />
                      View Product URL
                    </a>
                  </Button>
                </div>
              )}

              {result.whatsappCardPreview && (
                <div>
                  <p className="font-medium mb-1">WhatsApp text preview</p>
                  <pre className="whitespace-pre-wrap text-xs bg-background p-2 rounded border">
                    {result.whatsappCardPreview}
                  </pre>
                </div>
              )}

              {result.alternateProducts && result.alternateProducts.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Alternates: {result.alternateProducts.map((a) => `${a.name} (${a.score})`).join(", ")}
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
