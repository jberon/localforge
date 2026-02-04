import { X, Image, FileCode, FileJson, FileText, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Attachment } from "@/hooks/use-file-attachments";
import { formatFileSize } from "@/hooks/use-file-attachments";

interface AttachmentPreviewProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  compact?: boolean;
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return Image;
  if (type.includes("javascript") || type.includes("typescript")) return FileCode;
  if (type.includes("json")) return FileJson;
  if (type.includes("text") || type.includes("html") || type.includes("css")) return FileText;
  return File;
}

export function AttachmentPreview({ attachments, onRemove, compact = false }: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 p-2 bg-muted/30 rounded-lg border border-dashed" data-testid="attachment-preview-container">
      {attachments.map((attachment) => {
        const IconComponent = getFileIcon(attachment.type);
        const isImage = attachment.type.startsWith("image/");

        return (
          <div
            key={attachment.id}
            className={`relative group flex items-center gap-2 rounded-md border bg-background ${
              compact ? "p-1.5 pr-7" : "p-2 pr-8"
            }`}
            data-testid={`attachment-item-${attachment.id}`}
          >
            {isImage && attachment.preview ? (
              <div className={`${compact ? "w-8 h-8" : "w-12 h-12"} rounded overflow-hidden flex-shrink-0`}>
                <img
                  src={attachment.preview}
                  alt={attachment.name}
                  className="w-full h-full object-cover"
                  data-testid={`attachment-image-${attachment.id}`}
                />
              </div>
            ) : (
              <div className={`${compact ? "w-8 h-8" : "w-10 h-10"} rounded bg-muted flex items-center justify-center flex-shrink-0`}>
                <IconComponent className={`${compact ? "h-4 w-4" : "h-5 w-5"} text-muted-foreground`} />
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className={`${compact ? "text-xs" : "text-sm"} font-medium truncate max-w-[120px]`} title={attachment.name}>
                {attachment.name}
              </span>
              {!compact && (
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(attachment.size)}
                </span>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={`absolute ${compact ? "right-0.5 top-0.5 h-5 w-5" : "right-1 top-1 h-6 w-6"} opacity-70 hover:opacity-100`}
              onClick={() => onRemove(attachment.id)}
              data-testid={`button-remove-attachment-${attachment.id}`}
            >
              <X className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

interface DropZoneOverlayProps {
  isDragging: boolean;
}

export function DropZoneOverlay({ isDragging }: DropZoneOverlayProps) {
  if (!isDragging) return null;

  return (
    <div 
      className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center z-10 pointer-events-none"
      data-testid="drop-zone-overlay"
    >
      <div className="text-center">
        <Image className="h-8 w-8 text-primary mx-auto mb-2" />
        <p className="text-sm font-medium text-primary">Drop files here</p>
      </div>
    </div>
  );
}
