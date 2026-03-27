'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, Eraser, Download, Loader2, Trash2, RotateCcw } from 'lucide-react';

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [maskImage, setMaskImage] = useState<string | null>(null);
  const [maskFile, setMaskFile] = useState<File | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useAutoMask, setUseAutoMask] = useState(true);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const maskInputRef = useRef<HTMLInputElement>(null);
  
  // Handle image upload
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImageFile(file);
    setResult(null);
    setError(null);
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        setImage(ev.target?.result as string);
        // Reset mask when new image is uploaded
        setMaskImage(null);
        setMaskFile(null);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, []);
  
  // Handle mask upload
  const handleMaskUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setMaskFile(file);
    setUseAutoMask(false);
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      setMaskImage(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);
  
  // Draw mask on canvas (bottom 15%)
  const drawAutoMask = useCallback(() => {
    if (!image || !maskCanvasRef.current) return;
    
    const canvas = maskCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw bottom 15% as white mask
      const maskHeight = Math.floor(img.height * 0.15);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(0, img.height - maskHeight, img.width, maskHeight);
      
      // Set mask image from canvas
      setMaskImage(canvas.toDataURL('image/png'));
      setUseAutoMask(true);
      setMaskFile(null);
    };
    img.src = image;
  }, [image]);
  
  // Process image
  const processImage = async () => {
    if (!imageFile) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      
      if (maskFile) {
        formData.append('mask', maskFile);
      } else if (useAutoMask && maskImage) {
        // Convert data URL to file
        const res = await fetch(maskImage);
        const blob = await res.blob();
        const maskFileFromCanvas = new File([blob], 'mask.png', { type: 'image/png' });
        formData.append('mask', maskFileFromCanvas);
      }
      
      const response = await fetch('/api/watermark', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '处理失败');
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setResult(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '处理失败');
    } finally {
      setLoading(false);
    }
  };
  
  // Download result
  const downloadResult = () => {
    if (!result) return;
    
    const a = document.createElement('a');
    a.href = result;
    a.download = 'result.png';
    a.click();
  };
  
  // Reset
  const reset = () => {
    setImage(null);
    setImageFile(null);
    setMaskImage(null);
    setMaskFile(null);
    setResult(null);
    setError(null);
    setUseAutoMask(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (maskInputRef.current) maskInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      {/* Header */}
      <header className="border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            🖼️ Image Watermark Remover
          </h1>
          <p className="text-slate-400 text-sm mt-1">腾讯云 CI 智能去水印</p>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Upload Area */}
        {!image && (
          <div
            className="border-2 border-dashed border-slate-600 rounded-2xl p-12 text-center hover:border-blue-500 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <Upload className="w-16 h-16 mx-auto mb-4 text-slate-500" />
            <p className="text-lg text-slate-300">点击或拖拽上传图片</p>
            <p className="text-sm text-slate-500 mt-2">支持 PNG, JPG, WEBP</p>
          </div>
        )}
        
        {/* Editor Area */}
        {image && (
          <div className="space-y-6">
            {/* Image Preview + Mask */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Original Image */}
              <div className="bg-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-slate-200">原图</h2>
                  <button
                    onClick={reset}
                    className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                    title="重置"
                  >
                    <RotateCcw className="w-5 h-5 text-slate-400" />
                  </button>
                </div>
                <div className="relative rounded-lg overflow-hidden bg-slate-900">
                  <img src={image} alt="原图" className="w-full h-auto" />
                </div>
              </div>
              
              {/* Mask */}
              <div className="bg-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-slate-200">遮罩（白色区域将被去除）</h2>
                  <div className="flex gap-2">
                    {!useAutoMask && maskImage && (
                      <button
                        onClick={() => { setMaskImage(null); setMaskFile(null); setUseAutoMask(true); }}
                        className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                        title="清除"
                      >
                        <Trash2 className="w-5 h-5 text-slate-400" />
                      </button>
                    )}
                    <button
                      onClick={() => maskInputRef.current?.click()}
                      className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                      title="上传遮罩"
                    >
                      <Upload className="w-5 h-5 text-slate-400" />
                    </button>
                  </div>
                  <input
                    ref={maskInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleMaskUpload}
                    className="hidden"
                  />
                </div>
                
                {/* Mask Preview */}
                <div className="relative rounded-lg overflow-hidden bg-slate-900">
                  {maskImage ? (
                    <img src={maskImage} alt="遮罩" className="w-full h-auto" />
                  ) : (
                    <div className="aspect-video flex items-center justify-center text-slate-500">
                      <p>点击下方按钮生成遮罩</p>
                    </div>
                  )}
                  {/* Hidden canvas for mask generation */}
                  <canvas ref={maskCanvasRef} className="hidden" />
                </div>
                
                {/* Auto Mask Button */}
                <button
                  onClick={drawAutoMask}
                  className="mt-3 w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Eraser className="w-4 h-4" />
                  自动生成底部遮罩（15%）
                </button>
                
                <p className="text-xs text-slate-500 mt-2 text-center">
                  或上传自定义遮罩图（白色=去除区域）
                </p>
              </div>
            </div>
            
            {/* Error */}
            {error && (
              <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-300">
                ❌ {error}
              </div>
            )}
            
            {/* Result */}
            {result && (
              <div className="bg-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-slate-200">处理结果</h2>
                  <button
                    onClick={downloadResult}
                    className="flex items-center gap-2 py-2 px-4 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    下载
                  </button>
                </div>
                <div className="rounded-lg overflow-hidden bg-slate-900">
                  <img src={result} alt="结果" className="w-full h-auto" />
                </div>
              </div>
            )}
            
            {/* Process Button */}
            {!result && (
              <button
                onClick={processImage}
                disabled={loading || !maskImage}
                className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-xl font-bold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    处理中，请稍候...
                  </>
                ) : (
                  <>
                    <Eraser className="w-6 h-6" />
                    开始去水印
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </main>
      
      {/* Footer */}
      <footer className="border-t border-slate-700 mt-12">
        <div className="max-w-6xl mx-auto px-4 py-4 text-center text-slate-500 text-sm">
          Powered by 腾讯云数据万象 CI + Next.js
        </div>
      </footer>
    </div>
  );
}
