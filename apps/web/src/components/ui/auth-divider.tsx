import * as React from "react";

export function AuthDivider({ children }: { children: React.ReactNode }) {
	return (
		<div className="relative flex items-center py-2">
			<div className="flex-grow border-t border-border/60" />
			<span className="mx-4 flex-shrink text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
				{children}
			</span>
			<div className="flex-grow border-t border-border/60" />
		</div>
	);
}