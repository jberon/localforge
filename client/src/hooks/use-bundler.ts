import { useState, useEffect, useCallback, useRef } from 'react';
import { bundleProject, generatePreviewHtml, generateErrorHtml, type VirtualFile, type BundleResult } from '@/lib/bundler';

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

interface UseBundlerOptions {
  files: VirtualFile[];
  enabled: boolean;
  nonce: string;
}

interface UseBundlerResult {
  previewHtml: string;
  isCompiling: boolean;
  errors: string[];
  warnings: string[];
  lastBundleTime: number;
  rebundle: () => void;
}

export function useBundler({ files, enabled, nonce }: UseBundlerOptions): UseBundlerResult {
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lastBundleTime, setLastBundleTime] = useState(0);
  
  const bundleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFilesRef = useRef<string>('');
  
  const bundle = useCallback(async () => {
    if (!enabled || files.length === 0) {
      setPreviewHtml('');
      return;
    }
    
    const sourceFiles = files.filter(f => 
      !f.path.includes('.test.') && 
      !f.path.includes('__tests__') &&
      !f.path.endsWith('.md') &&
      !f.path.endsWith('.json') &&
      !f.path.includes('Dockerfile')
    );
    
    if (sourceFiles.length === 0) {
      setPreviewHtml('');
      return;
    }
    
    setIsCompiling(true);
    const startTime = performance.now();
    
    try {
      const result = await bundleProject(sourceFiles);
      
      if (result.errors.length > 0) {
        setErrors(result.errors);
        setWarnings(result.warnings);
        setPreviewHtml(`data:text/html;charset=utf-8,${encodeURIComponent(generateErrorHtml(result.errors, nonce))}`);
      } else {
        setErrors([]);
        setWarnings(result.warnings);
        const html = generatePreviewHtml(result.code, nonce);
        setPreviewHtml(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      }
      
      setLastBundleTime(Math.round(performance.now() - startTime));
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      setErrors([errorMessage]);
      setPreviewHtml(`data:text/html;charset=utf-8,${encodeURIComponent(generateErrorHtml([errorMessage], nonce))}`);
    } finally {
      setIsCompiling(false);
    }
  }, [files, enabled, nonce]);
  
  const debouncedBundle = useCallback(() => {
    if (bundleTimeoutRef.current) {
      clearTimeout(bundleTimeoutRef.current);
    }
    bundleTimeoutRef.current = setTimeout(() => {
      bundle();
    }, 300);
  }, [bundle]);
  
  useEffect(() => {
    if (!enabled) return;
    
    const filesKey = files.map(f => `${f.path}:${simpleHash(f.content)}`).join('|');
    if (filesKey === lastFilesRef.current) return;
    lastFilesRef.current = filesKey;
    
    debouncedBundle();
  }, [files, enabled, debouncedBundle]);
  
  useEffect(() => {
    return () => {
      if (bundleTimeoutRef.current) {
        clearTimeout(bundleTimeoutRef.current);
      }
    };
  }, []);
  
  const rebundle = useCallback(() => {
    lastFilesRef.current = '';
    bundle();
  }, [bundle]);
  
  return {
    previewHtml,
    isCompiling,
    errors,
    warnings,
    lastBundleTime,
    rebundle,
  };
}
