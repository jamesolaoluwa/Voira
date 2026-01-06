import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cloud, Upload, File, Check, X } from 'lucide-react';

export default function FileUpload({ 
  onFileSelect, 
  accept = '*',
  label = 'Upload or paste a reference you like (optional)',
  helperText = 'Voira will learn the tone and structure — not copy the content.'
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

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
    if (file) handleFile(file);
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  };

  const handleFile = (file) => {
    setIsUploading(true);
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
            ? 'border-violet-500/50 bg-violet-500/5' 
            : 'border-zinc-300 dark:border-white/10 hover:border-violet-500/50 hover:bg-violet-500/5'
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
              <Upload className="w-8 h-8 text-violet-400 mx-auto mb-3 animate-pulse" />
              <p className="text-zinc-400 text-sm">Uploading...</p>
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}