import { Link } from "react-router-dom";
import { Home, AlertTriangle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center bg-[#202226] text-[#eef0f4] px-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[#2c3038] text-[#9ebaff] mb-6">
        <AlertTriangle size={40} />
      </div>
      <h1 className="font-display text-5xl font-medium tracking-[-0.05em] text-[#f0f2f6]">404</h1>
      <p className="mt-3 text-[17px] text-[#a2a9b5]">This page doesn&rsquo;t exist.</p>
      <p className="mt-1 text-sm text-[#7e8693]">The notebook or route you requested could not be found.</p>
      <Link
        to="/"
        className="mt-8 inline-flex items-center gap-2 rounded-full border border-[#3b3f48] bg-[#23262b]/75 px-5 py-2.5 text-[13px] font-medium text-[#d6d9e0] transition hover:border-[#5a6070] hover:bg-[#2d3037]"
      >
        <Home size={15} /> Go back home
      </Link>
    </div>
  );
}