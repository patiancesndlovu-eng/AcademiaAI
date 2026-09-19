import { useEffect, useRef, type ReactNode, type RefObject } from "react";

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /* Ref of the button that anchors this popover; clicks on it are left to the button's own toggle. */
  anchorRef?: RefObject<HTMLElement>;
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
}

export function Popover({ open, onClose, anchorRef, align = "left", className = "", children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || anchorRef?.current?.contains(target)) return;
      onCloseRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={`absolute top-9 z-40 ${align === "left" ? "left-0" : "right-0"} overflow-hidden rounded-xl border border-[#3a3f49] bg-[#292c32] p-1.5 shadow-[0_12px_30px_rgba(0,0,0,.4)] animate-pop-in ${className}`}
    >
      {children}
    </div>
  );
}

interface PopoverItemProps {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}

export function PopoverItem({ icon, children, onClick, active = false, disabled = false, destructive = false }: PopoverItemProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] transition hover:bg-[#373b44] disabled:pointer-events-none disabled:opacity-40 ${active ? "text-[#9ebaff]" : destructive ? "text-[#ff9d9d]" : "text-[#d6d9df]"}`}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}
