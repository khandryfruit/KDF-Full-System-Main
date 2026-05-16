import { useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Zap, Calculator, Plus } from "lucide-react";
import {
  PRESET_WEIGHTS_GRAMS,
  calculateLinearPrice,
  formatWeightLabel,
  generateWeightVariants,
  parseWeightToGrams,
  suggestWeightsForProduct,
  type VariantPriceMode,
  type VariantStockMode,
  type WeightVariantInput,
} from "@/lib/weightVariationGenerator";

export interface AutoVariationConfig {
  baseWeightGrams: number;
  basePrice: number;
  baseStock: number;
  selectedGrams: number[];
  stockMode: VariantStockMode;
  priceMode: VariantPriceMode;
  customPrices: Record<number, string>;
  individualStocks: Record<number, string>;
}

export const defaultAutoVariationConfig = (): AutoVariationConfig => ({
  baseWeightGrams: 250,
  basePrice: 1200,
  baseStock: 100,
  selectedGrams: [250, 500, 1000],
  stockMode: "shared",
  priceMode: "linear",
  customPrices: {},
  individualStocks: {},
});

interface AutoWeightVariationPanelProps {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  config: AutoVariationConfig;
  onConfigChange: (c: AutoVariationConfig) => void;
  productName: string;
  onGenerate: (variants: WeightVariantInput[], meta: { stockMode: VariantStockMode; baseStock: number }) => void;
}

export function AutoWeightVariationPanel({
  enabled,
  onEnabledChange,
  config,
  onConfigChange,
  productName,
  onGenerate,
}: AutoWeightVariationPanelProps) {
  const [customWeightInput, setCustomWeightInput] = useState("");

  const patch = (partial: Partial<AutoVariationConfig>) =>
    onConfigChange({ ...config, ...partial });

  const sortedSelected = useMemo(
    () => [...new Set(config.selectedGrams)].sort((a, b) => a - b),
    [config.selectedGrams]
  );

  const buildVariantOpts = () => ({
    baseWeightGrams: config.baseWeightGrams,
    basePrice: config.basePrice,
    baseStock: config.baseStock,
    weightGramsList: sortedSelected,
    stockMode: config.stockMode,
    priceMode: config.priceMode,
    customPrices: Object.fromEntries(
      Object.entries(config.customPrices)
        .map(([g, p]) => [Number(g), parseFloat(p)])
        .filter(([, p]) => Number.isFinite(p))
    ) as Record<number, number>,
    individualStocks: Object.fromEntries(
      Object.entries(config.individualStocks)
        .map(([g, s]) => [Number(g), parseInt(s, 10)])
        .filter(([, s]) => Number.isFinite(s))
    ) as Record<number, number>,
    createId: () => uuidv4(),
  });

  const preview = useMemo(() => {
    if (!enabled || !sortedSelected.length || config.baseWeightGrams <= 0) return [];
    return generateWeightVariants(buildVariantOpts());
  }, [enabled, config, sortedSelected]);

  const toggleWeight = (grams: number, checked: boolean) => {
    const next = checked
      ? [...new Set([...config.selectedGrams, grams])]
      : config.selectedGrams.filter((g) => g !== grams);
    patch({ selectedGrams: next.sort((a, b) => a - b) });
  };

  const addCustomWeight = () => {
    const g = parseWeightToGrams(customWeightInput);
    if (!g) return;
    if (!config.selectedGrams.includes(g)) {
      patch({ selectedGrams: [...config.selectedGrams, g].sort((a, b) => a - b) });
    }
    setCustomWeightInput("");
  };

  const applyAiSuggest = () => {
    const suggested = suggestWeightsForProduct(productName || "product");
    const base = suggested[0] ?? 250;
    patch({ selectedGrams: suggested, baseWeightGrams: base });
  };

  const handleGenerate = () => {
    if (!sortedSelected.length) return;
    const variants = generateWeightVariants(buildVariantOpts());
    onGenerate(variants, { stockMode: config.stockMode, baseStock: config.baseStock });
  };

  return (
    <div className="rounded-xl border-2 border-[#5FA800]/30 bg-gradient-to-br from-[#5FA800]/5 to-transparent overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div>
          <p className="text-sm font-semibold flex items-center gap-2">
            <Calculator className="w-4 h-4 text-[#5FA800]" />
            Smart Variation Auto-Calculator
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Enter base weight + price — system generates all variants
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{enabled ? "Auto" : "Manual"}</span>
          <Switch checked={enabled} onCheckedChange={onEnabledChange} />
        </div>
      </div>

      {enabled && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Base weight</Label>
              <Input
                className="h-9"
                placeholder="250GM"
                value={formatWeightLabel(config.baseWeightGrams)}
                onChange={(e) => {
                  const g = parseWeightToGrams(e.target.value);
                  if (g) patch({ baseWeightGrams: g });
                }}
              />
              <WeightPresetChips value={config.baseWeightGrams} onSelect={(g) => patch({ baseWeightGrams: g })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Base price (Rs.)</Label>
              <Input
                type="number"
                min={0}
                className="h-9"
                value={config.basePrice || ""}
                onChange={(e) => patch({ basePrice: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Base stock</Label>
              <Input
                type="number"
                min={0}
                className="h-9"
                value={config.baseStock}
                onChange={(e) => patch({ baseStock: parseInt(e.target.value, 10) || 0 })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Label className="text-xs">Weight options</Label>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={applyAiSuggest}>
                <Sparkles className="w-3 h-3 mr-1" />
                AI suggest{productName ? ` (${productName.slice(0, 24)}${productName.length > 24 ? "…" : ""})` : ""}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESET_WEIGHTS_GRAMS.map((g) => (
                <label
                  key={g}
                  className="flex items-center gap-1.5 text-xs border rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-muted/50 has-[:checked]:border-[#5FA800] has-[:checked]:bg-[#5FA800]/10"
                >
                  <Checkbox
                    checked={config.selectedGrams.includes(g)}
                    onCheckedChange={(c) => toggleWeight(g, !!c)}
                  />
                  {formatWeightLabel(g)}
                </label>
              ))}
            </div>
            <div className="flex gap-2 max-w-xs">
              <Input
                className="h-8 text-xs"
                placeholder="Custom e.g. 750GM"
                value={customWeightInput}
                onChange={(e) => setCustomWeightInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomWeight())}
              />
              <Button type="button" size="sm" variant="secondary" className="h-8" onClick={addCustomWeight}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Stock</Label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="stockMode"
                  checked={config.stockMode === "shared"}
                  onChange={() => patch({ stockMode: "shared" })}
                />
                Shared — {config.baseStock} on each variant (product stock = {config.baseStock})
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="stockMode"
                  checked={config.stockMode === "individual"}
                  onChange={() => patch({ stockMode: "individual" })}
                />
                Individual stock per variant
              </label>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Pricing</Label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="priceMode"
                  checked={config.priceMode === "linear"}
                  onChange={() => patch({ priceMode: "linear" })}
                />
                Linear (250GM=1200 → 500GM=2400 → 1KG=4800)
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="priceMode"
                  checked={config.priceMode === "custom"}
                  onChange={() => patch({ priceMode: "custom" })}
                />
                Custom override per size
              </label>
            </div>
          </div>

          {config.stockMode === "individual" && sortedSelected.length > 0 && (
            <div className="rounded-lg border p-3 bg-muted/20 space-y-2">
              <Label className="text-xs">Stock per variant</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {sortedSelected.map((g) => (
                  <div key={g} className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] shrink-0">{formatWeightLabel(g)}</Badge>
                    <Input
                      className="h-8 text-xs"
                      type="number"
                      min={0}
                      placeholder={String(config.baseStock)}
                      value={config.individualStocks[g] ?? ""}
                      onChange={(e) =>
                        patch({ individualStocks: { ...config.individualStocks, [g]: e.target.value } })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {config.priceMode === "custom" && sortedSelected.length > 0 && (
            <div className="rounded-lg border p-3 bg-muted/20 space-y-2">
              <Label className="text-xs">Custom prices (Rs.)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {sortedSelected.map((g) => (
                  <div key={g} className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] shrink-0">{formatWeightLabel(g)}</Badge>
                    <Input
                      className="h-8 text-xs"
                      type="number"
                      min={0}
                      placeholder={String(
                        calculateLinearPrice(config.basePrice, config.baseWeightGrams, g)
                      )}
                      value={config.customPrices[g] ?? ""}
                      onChange={(e) =>
                        patch({ customPrices: { ...config.customPrices, [g]: e.target.value } })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-2 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase">
                Preview
              </div>
              <div className="divide-y">
                {preview.map((v) => (
                  <div key={v.id} className="grid grid-cols-3 gap-2 px-3 py-2 text-xs">
                    <span className="font-semibold">{v.value}</span>
                    <span>Rs. {Number(v.price).toLocaleString("en-PK")}</span>
                    <span className="text-muted-foreground">
                      Stock {v.stock}
                      {config.stockMode === "shared" ? " · shared" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            type="button"
            className="w-full sm:w-auto text-white"
            style={{ background: "#5FA800" }}
            onClick={handleGenerate}
            disabled={!sortedSelected.length || config.basePrice <= 0}
          >
            <Zap className="w-4 h-4 mr-1.5" />
            Generate {sortedSelected.length} variations
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Weight options are also saved automatically when you click Update Product — Generate updates the form preview immediately.
          </p>
        </div>
      )}
    </div>
  );
}

function WeightPresetChips({ value, onSelect }: { value: number; onSelect: (g: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {PRESET_WEIGHTS_GRAMS.map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => onSelect(g)}
          className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
            value === g ? "bg-[#5FA800] text-white border-[#5FA800]" : "hover:bg-muted"
          }`}
        >
          {formatWeightLabel(g)}
        </button>
      ))}
    </div>
  );
}
