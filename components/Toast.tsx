import React, { useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  duration?: number;
  position?: 'top-right' | 'center';
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ 
  message, 
  type, 
  duration = 3000, 
  position = 'top-right', 
  onClose 
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const bgColor = type === 'success' ? 'bg-green-600' : 'bg-red-600';
  
  // Render Center Toast (Modal Style)
  if (position === 'center') {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none bg-black/40 backdrop-blur-[2px]">
        <div className={`pointer-events-auto ${bgColor} text-white rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col items-center justify-center p-8 min-w-[320px] max-w-sm animate-bounce-in border-2 border-white/20 transform scale-100`}>
          <div className="bg-white/20 p-4 rounded-full mb-4 backdrop-blur-sm shadow-inner">
             <span className="text-5xl drop-shadow-md filter">{type === 'success' ? '✅' : '⚠️'}</span>
          </div>
          <h4 className="font-bold text-2xl mb-2 text-center drop-shadow-sm">
             {type === 'success' ? 'Berhasil!' : 'Perhatian'}
          </h4>
          <p className="font-medium text-lg text-center leading-relaxed opacity-95">
             {message}
          </p>
        </div>
      </div>
    );
  }

  // Render Default Top-Right Toast
  return (
    <div className={`fixed z-[100] top-4 right-4 ${bgColor} text-white rounded shadow-2xl flex items-start gap-3 px-6 py-4 max-w-sm animate-slide-in transition-all duration-300 border border-white/10`}>
      <span className="text-2xl">{type === 'success' ? '✅' : '⚠️'}</span>
      <div className="flex-1">
        <h4 className="font-bold mb-1 text-base">{type === 'success' ? 'Berhasil' : 'Peringatan'}</h4>
        <p className="font-medium text-sm whitespace-pre-wrap leading-relaxed opacity-90">{message}</p>
      </div>
      <button onClick={onClose} className="opacity-75 hover:opacity-100 text-xl font-bold p-1 leading-none">✕</button>
    </div>
  );
};