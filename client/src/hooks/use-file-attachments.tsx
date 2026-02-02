import { useState, useCallback, useRef } from "react";

export interface Attachment {
  id: string;
  file: File;
  name: string;
  type: string;
  size: number;
  preview?: string;
  content?: string;
}

interface UseFileAttachmentsOptions {
  maxFiles?: number;
  maxSizeBytes?: number;
  acceptedTypes?: string[];
}

const DEFAULT_MAX_FILES = 10;
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024;
const DEFAULT_ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/html",
  "text/css",
  "text/javascript",
  "application/json",
  "application/javascript",
  "text/typescript",
  "text/markdown",
];

export function useFileAttachments(options: UseFileAttachmentsOptions = {}) {
  const {
    maxFiles = DEFAULT_MAX_FILES,
    maxSizeBytes = DEFAULT_MAX_SIZE,
    acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  } = options;

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateId = () => Math.random().toString(36).substring(2, 11);

  const isImageFile = (type: string) => type.startsWith("image/");

  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const processFile = useCallback(
    async (file: File): Promise<Attachment | null> => {
      if (file.size > maxSizeBytes) {
        setError(`File "${file.name}" exceeds maximum size of ${Math.round(maxSizeBytes / 1024 / 1024)}MB`);
        return null;
      }

      const isAccepted = acceptedTypes.some(
        (type) => file.type === type || file.type.startsWith(type.replace("*", ""))
      );

      if (!isAccepted && acceptedTypes.length > 0) {
        setError(`File type "${file.type || 'unknown'}" is not supported`);
        return null;
      }

      const attachment: Attachment = {
        id: generateId(),
        file,
        name: file.name,
        type: file.type,
        size: file.size,
      };

      try {
        if (isImageFile(file.type)) {
          attachment.preview = await readFileAsDataURL(file);
        } else {
          attachment.content = await readFileAsText(file);
        }
      } catch (err) {
        console.error("Error reading file:", err);
      }

      return attachment;
    },
    [maxSizeBytes, acceptedTypes]
  );

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null);
      const fileArray = Array.from(files);

      if (attachments.length + fileArray.length > maxFiles) {
        setError(`Maximum ${maxFiles} files allowed`);
        return;
      }

      const newAttachments: Attachment[] = [];

      for (const file of fileArray) {
        const attachment = await processFile(file);
        if (attachment) {
          newAttachments.push(attachment);
        }
      }

      setAttachments((prev) => [...prev, ...newAttachments]);
    },
    [attachments.length, maxFiles, processFile]
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    setError(null);
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
    setError(null);
  }, []);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        addFiles(files);
      }
    },
    [addFiles]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        addFiles(files);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [addFiles]
  );

  const dragHandlers = {
    onDragEnter: handleDragEnter,
    onDragLeave: handleDragLeave,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
  };

  const acceptString = acceptedTypes.join(",");

  return {
    attachments,
    error,
    isDragging,
    fileInputRef,
    addFiles,
    removeAttachment,
    clearAttachments,
    openFilePicker,
    handleFileInputChange,
    dragHandlers,
    acceptString,
    hasAttachments: attachments.length > 0,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileIcon(type: string): string {
  if (type.startsWith("image/")) return "image";
  if (type.includes("javascript") || type.includes("typescript")) return "code";
  if (type.includes("json")) return "json";
  if (type.includes("html")) return "html";
  if (type.includes("css")) return "css";
  return "file";
}

export function toMessageAttachment(attachment: Attachment) {
  return {
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    size: attachment.size,
    preview: attachment.preview,
  };
}

export function toMessageAttachments(attachments: Attachment[]) {
  return attachments.map(toMessageAttachment);
}
