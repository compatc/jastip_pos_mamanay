import { useState } from "react";

interface ConfirmationModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmationModal({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  const [animating, setAnimating] = useState(false);

  if (!visible) return null;

  function handleConfirm() {
    setAnimating(true);
    setTimeout(() => {
      onConfirm();
      setAnimating(false);
    }, 150);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className={`bg-white rounded-2xl p-6 shadow-2xl shadow-pink-200/30 border border-pink-100 w-full max-w-sm mx-4 transition-all duration-200 ${
          animating ? "scale-95 opacity-0" : "scale-100 opacity-100"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-gray-800 mb-2">{title}</h3>
        <p className="text-base text-gray-500 mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-pink-50 text-gray-500 border border-pink-100 rounded-xl font-semibold text-base hover:bg-pink-100 transition-all"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-3 bg-gradient-to-r from-pink-400 to-rose-500 text-white rounded-xl font-semibold text-base shadow-lg shadow-pink-200/40 hover:from-pink-500 hover:to-rose-600 transition-all active:scale-95"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
