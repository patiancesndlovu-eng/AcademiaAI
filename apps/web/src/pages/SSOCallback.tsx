import { AuthenticateWithRedirectCallback } from "@clerk/clerk-react";

export default function SSOCallback() {
	return (
		<div className="flex h-screen w-full items-center justify-center">
			<AuthenticateWithRedirectCallback
    signInFallbackRedirectUrl="/"
    signUpFallbackRedirectUrl="/"
/>
			<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
		</div>
	);
}