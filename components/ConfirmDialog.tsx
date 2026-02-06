import React from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ isOpen, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm">
      <div className="bg-gray-800 p-6 rounded-lg shadow-2xl border border-gray-700 max-w-sm w-full transform transition-all scale-100 animate-bounce-in">
        <div className="text-center mb-4">
             <span className="text-4xl">❓</span>
        </div>
        <h3 className="text-xl font-bold text-white mb-3 text-center">Konfirmasi</h3>
        <p className="text-gray-300 mb-8 leading-relaxed text-center">{message}</p>
        <div className="flex justify-center space-x-4">
          <button
            onClick={onCancel}
            className="px-6 py-2 bg-gray-600 text-gray-200 rounded hover:bg-gray-500 transition focus:outline-none focus:ring-2 focus:ring-gray-500 font-medium"
          >
            Tidak
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition focus:outline-none focus:ring-2 focus:ring-red-500 font-medium shadow-lg shadow-red-900/50"
          >
            Ya
          </button>
        </div>
      </div>
    </div>
  );
};