import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cloud, Upload, File, Check, X, AlertCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

// Safe file types for reference uploads
const SAFE_FILE_TYPES = {
  // PDF files
  'application/pdf': ['.pdf'],
  // Word documents
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  // Images
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'image/bmp': ['.bmp'],
  'image/tiff': ['.tiff', '.tif'],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function FileUpload({ 
  onFileSelect, 
  accept = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff,.tif',
  label = 'Upload or paste a reference you like (optional)',
  helperText = 'Voira will learn the tone and structure — not copy the content.'
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

  const validateFile = (file) => {
    // Reset error
    setError(null);

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      const errorMsg = `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`;
      setError(errorMsg);
      toast({ 
        title: 'File too large', 
        description: errorMsg,
        variant: 'destructive'
      });
      return false;
    }

    // Check file type
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    const fileType = file.type.toLowerCase();
    
    // Check if file type is in our safe list
    const isSafeType = Object.keys(SAFE_FILE_TYPES).some(type => {
      return type === fileType && SAFE_FILE_TYPES[type].includes(fileExtension);
    });

    // Also check by extension if MIME type is not available or doesn't match
    const safeExtensions = Object.values(SAFE_FILE_TYPES).flat();
    const isValidExtension = safeExtensions.includes(fileExtension);

    if (!isSafeType && !isValidExtension) {
      const errorMsg = 'Unsupported file type. Please upload PDF, Word document (.doc, .docx), or image (JPG, PNG, GIF, WebP, BMP, TIFF)';
      setError(errorMsg);
      toast({ 
        title: 'Unsupported file type', 
        description: errorMsg,
        variant: 'destructive'
      });
      return false;
    }

    return true;
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && validateFile(file)) {
      handleFile(file);
    }
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file && validateFile(file)) {
      handleFile(file);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const handleFile = (file) => {
    setIsUploading(true);
    setError(null);
    setTimeout(() => {
      setUploadedFile(file);
      setIsUploading(false);
      onFileSelect?.(file);
    }, 800);
  };

  const removeFile = () => {
    setUploadedFile(null);
    onFileSelect?.(null);
  };

  return (
    <div>
      {label && (
        <label className="text-zinc-800 dark:text-zinc-300 text-sm mb-2 block">{label}</label>
      )}
      
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
          isDragging 
            ? 'border-zinc-900/40 dark:border-white/40 bg-zinc-100 dark:bg-white/5' 
            : 'border-zinc-300 dark:border-white/10 hover:border-zinc-900/40 dark:hover:border-white/40 hover:bg-zinc-100 dark:hover:bg-white/5'
        }`}
      >
        <input
          type="file"
          accept={accept}
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        
        <AnimatePresence mode="wait">
          {isUploading ? (
            <motion.div
              key="uploading"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <Upload className="w-8 h-8 text-zinc-600 dark:text-zinc-400 mx-auto mb-3 animate-pulse" />
              <p className="text-zinc-600 dark:text-zinc-500 text-sm">Uploading...</p>
            </motion.div>
          ) : uploadedFile ? (
            <motion.div
              key="uploaded"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center justify-center gap-3"
            >
              <div className="flex items-center gap-2 bg-zinc-100 dark:bg-[#1a1a24] rounded-lg px-4 py-2">
                <Check className="w-4 h-4 text-green-400" />
                <File className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                <span className="text-zinc-800 dark:text-zinc-300 text-sm">{uploadedFile.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile();
                  }}
                  className="ml-2 text-zinc-500 hover:text-rose-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <Cloud className="w-8 h-8 text-zinc-400 dark:text-zinc-500 mx-auto mb-3" />
              <p className="text-zinc-600 dark:text-zinc-500 text-sm mb-1">
                Drop a file or click to upload
              </p>
              {helperText && (
                <p className="text-xs text-zinc-500 dark:text-zinc-600">{helperText}</p>
              )}
              <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-2">
                Supported: PDF, Word (.doc, .docx), Images (JPG, PNG, GIF, WebP, BMP, TIFF) • Max 10MB
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Error message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 flex items-center gap-2 text-rose-500 text-sm"
          >
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </motion.div>
        )}
      </div>
    </div>
  );
}