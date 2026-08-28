import { Check, X } from "lucide-react";

interface ToastProps {
  message: string;
  onClose: () => void;
}

export function Toast({ message, onClose }: ToastProps) {
  return (
    <div className="fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-full border border-[#4c5361] bg-[#2c3038] px-4 py-2.5 text-sm text-[#f3f4f6] shadow-[0_16px_40px_rgba(0,0,0,.35)] animate-toast-in">
      <Check size={15} className="text-[#9ebaff]" />
      <span>{message}</span>
      <button onClick={onClose} className="ml-1 rounded-full p-0.5 text-[#9da4b0] hover:text-white" aria-label="Dismiss notification">
        <X size={14} />
      </button>
    </div>
  );
}