import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageIcon, Upload } from "lucide-react";
import { MediaPicker } from "./MediaPicker";
import { getProductImageSrc } from "@/lib/imageUrl";

export interface ImageFieldWithPickerProps {
  value: string;
  onChange: (path: string) => void;
  folderSlug?: string;
  label?: string;
  className?: string;
  /** Optional: upload handler when user picks "replace" via file input */
  onUploadFile?: (file: File) => Promise<string>;
  children?: React.ReactNode;
}

/**
 * Shows current image preview + "Media Library" + optional custom upload UI via children.
 */
export function ImageFieldWithPicker({
  value,
  onChange,
  folderSlug = "general",
  label = "Image",
  className,
  onUploadFile,
  children,
}: ImageFieldWithPickerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
            <ImageIcon className="h-3.5 w-3.5 mr-1" />
            Media Library
          </Button>
        </div>
      </div>

      {children}

      {value && !children && (
        <img
          src={getProductImageSrc(value)}
          alt=""
          className="max-h-32 rounded-lg border object-cover"
          loading="lazy"
        />
      )}

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        folderSlug={folderSlug}
        title={`Choose ${label.toLowerCase()}`}
        onSelect={(path) => onChange(path)}
      />
    </div>
  );
}
