import { useState } from "react";
import { useAuth, useSignIn, useSignUp } from "@clerk/clerk-react";
import { Navigate, useNavigate } from "react-router-dom";

import { GithubIcon } from "@/components/icons/github-icon";
import { GoogleIcon } from "@/components/icons/google-icon";
import logoUrl from "@/components/logo.png";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { AuthDivider } from "@/components/ui/auth-divider";

import {
  AtSignIcon,
  LockIcon,
  Loader2,
} from "lucide-react";

type AuthStep = "idle" | "verifying";

interface AuthPageProps {
  mode?: "sign-in" | "sign-up";
}

export function AuthPage({
  mode: initialMode = "sign-in",
}: AuthPageProps) {
  const navigate = useNavigate();

  const { isSignedIn } = useAuth();

  const {
    isLoaded: signInLoaded,
    signIn,
    setActive: setSignInActive,
  } = useSignIn();

  const {
    isLoaded: signUpLoaded,
    signUp,
    setActive: setSignUpActive,
  } = useSignUp();

  /* =========================
     STATE
  ========================== */

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const [step, setStep] = useState<AuthStep>("idle");

  const [mode, setMode] = useState<"sign-in" | "sign-up">(
    initialMode
  );

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReady = signInLoaded && signUpLoaded;

  /* =========================
     REDIRECT IF ALREADY SIGNED IN
  ========================== */

  if (isSignedIn) {
    return <Navigate to="/" replace />;
  }

  /* =========================
     OAUTH
  ========================== */

  const handleOAuth = async (
    strategy: "oauth_google" | "oauth_github"
  ) => {
    if (!isReady || !signIn) return;

    setIsLoading(true);
    setError(null);

    try {
      await signIn.authenticateWithRedirect({
        strategy,
        redirectUrl: `${window.location.origin}/sso-callback`,
        redirectUrlComplete: `${window.location.origin}/`,
      });
    } catch (err: any) {
      console.error("OAuth error:", err);

      const clerkError = err?.errors?.[0];

      setError(
        clerkError?.longMessage ||
          clerkError?.message ||
          "OAuth sign in failed. Please try again."
      );

      setIsLoading(false);
    }
  };

  /* =========================
     EMAIL + PASSWORD
  ========================== */

  const handleEmailSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (
      !isReady ||
      !email.trim() ||
      !password
    ) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      /* =========================
         SIGN IN
      ========================== */

      if (mode === "sign-in") {
        const result = await signIn!.create({
          identifier: email.trim(),
          password,
        });

        console.log(
          "========== CLERK SIGN IN =========="
        );
        console.log("status:", result.status);
        console.log(
          "createdSessionId:",
          result.createdSessionId
        );
        console.log(
          "signIn:",
          result
        );
        console.log(
          "==================================="
        );

        if (result.status === "complete") {
          if (result.createdSessionId) {
            await setSignInActive!({
              session: result.createdSessionId,
            });
          }

          navigate("/", { replace: true });
          return;
        }

        setError(
          "Sign in could not be completed. Please check your email and password."
        );

        return;
      }

      /* =========================
         SIGN UP
      ========================== */

      const result = await signUp!.create({
        emailAddress: email.trim(),
        password,
      });

      console.log(
        "========== CLERK SIGN UP =========="
      );
      console.log("status:", result.status);
      console.log(
        "requiredFields:",
        result.requiredFields
      );
      console.log(
        "missingFields:",
        result.missingFields
      );
      console.log(
        "unverifiedFields:",
        result.unverifiedFields
      );
      console.log(
        "createdSessionId:",
        result.createdSessionId
      );
      console.log(
        "==================================="
      );

      /* =========================
         EMAIL VERIFICATION REQUIRED
      ========================== */

      if (
        result.status === "missing_requirements" &&
        result.unverifiedFields.includes(
          "email_address"
        )
      ) {
        await signUp!.prepareEmailAddressVerification(
          {
            strategy: "email_code",
          }
        );

        setStep("verifying");
        return;
      }

      /* =========================
         SIGNUP COMPLETE
      ========================== */

      if (result.status === "complete") {
        if (result.createdSessionId) {
          await setSignUpActive!({
            session: result.createdSessionId,
          });
        }

        navigate("/", { replace: true });
        return;
      }

      /* =========================
         STILL MISSING REQUIREMENTS
      ========================== */

      if (
        result.status === "missing_requirements"
      ) {
        const missing =
          result.missingFields?.join(", ");

        setError(
          missing
            ? `Additional information required: ${missing}`
            : "Additional information is required to complete signup."
        );

        return;
      }

      setError(
        "Unable to create your account. Please try again."
      );
    } catch (err: any) {
      console.error(
        "Email authentication error:",
        err
      );

      const clerkError = err?.errors?.[0];

      setError(
        clerkError?.longMessage ||
          clerkError?.message ||
          "Something went wrong. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  /* =========================
     VERIFY EMAIL OTP
  ========================== */

  const handleVerify = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (
      !isReady ||
      code.length !== 6
    ) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      /* =========================
         SIGNUP EMAIL VERIFICATION
      ========================== */

      const result =
        await signUp!.attemptEmailAddressVerification(
          {
            code,
          }
        );

      console.log(
        "========== CLERK SIGNUP VERIFICATION =========="
      );
      console.log("status:", result.status);
      console.log(
        "createdSessionId:",
        result.createdSessionId
      );
      console.log(
        "missingFields:",
        result.missingFields
      );
      console.log(
        "unverifiedFields:",
        result.unverifiedFields
      );
      console.log(
        "================================================"
      );

      /* =========================
         COMPLETE
      ========================== */

      if (result.status === "complete") {
        if (result.createdSessionId) {
          await setSignUpActive!({
            session: result.createdSessionId,
          });
        }

        navigate("/", { replace: true });
        return;
      }

      /* =========================
         STILL MISSING REQUIREMENTS
      ========================== */

      if (
        result.status === "missing_requirements"
      ) {
        const missing =
          result.missingFields?.join(", ");

        setError(
          missing
            ? `Account still requires: ${missing}`
            : "Account setup is not complete."
        );

        return;
      }

      setError(
        "Verification could not be completed. Please try again."
      );
    } catch (err: any) {
      console.error(
        "Verification error:",
        err
      );

      const clerkError = err?.errors?.[0];

      setError(
        clerkError?.longMessage ||
          clerkError?.message ||
          "Invalid verification code. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  /* =========================
     SWITCH SIGN IN / SIGN UP
  ========================== */

  const toggleMode = () => {
    setMode((prev) =>
      prev === "sign-in"
        ? "sign-up"
        : "sign-in"
    );

    setStep("idle");
    setError(null);
    setEmail("");
    setPassword("");
    setCode("");
    setIsLoading(false);
  };

  /* =========================
     DIFFERENT EMAIL
  ========================== */

  const handleDifferentEmail = () => {
    setStep("idle");
    setEmail("");
    setPassword("");
    setCode("");
    setError(null);
  };

  /* =========================
     CLERK LOADING
  ========================== */

  if (!isReady) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /* =========================
     PAGE
  ========================== */

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div className="relative mx-auto flex min-h-screen w-full max-w-sm flex-col justify-between p-6 md:p-8">

        {/* =========================
            LOGO
        ========================== */}

        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="cursor-pointer"
            aria-label="AcademiaAI home"
          >
            <img
              src={logoUrl}
              className="h-[40px] w-auto object-contain"
              alt="AcademiaAI"
            />
          </button>
        </div>

        {/* =========================
            AUTH CONTENT
        ========================== */}

        <div className="fade-in slide-in-from-bottom-4 w-full animate-in space-y-4 duration-600">

          {/* =========================
              EMAIL + PASSWORD SCREEN
          ========================== */}

          {step === "idle" && (
            <>
              {/* Heading */}

              <div className="flex flex-col space-y-1">
                <h1 className="text-2xl font-bold tracking-wide">
                  {mode === "sign-in"
                    ? "Welcome back!"
                    : "Join Now!"}
                </h1>

                <p className="text-base text-muted-foreground">
                  {mode === "sign-in"
                    ? "Login to your AcademiaAI account."
                    : "Create your AcademiaAI account."}
                </p>
              </div>

              {/* =========================
                  EMAIL + PASSWORD FORM
              ========================== */}

              <form
                onSubmit={handleEmailSubmit}
                className="space-y-3"
              >
                {/* Email */}

                <InputGroup>
                  <InputGroupAddon>
                    <AtSignIcon size={16} />
                  </InputGroupAddon>

                  <InputGroupInput
                    placeholder="your.email@example.com"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    autoComplete="email"
                    required
                  />
                </InputGroup>

                {/* Password */}

                <InputGroup>
                  <InputGroupAddon>
                    <LockIcon size={16} />
                  </InputGroupAddon>

                  <InputGroupInput
                    placeholder="Password"
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    autoComplete={
                      mode === "sign-in"
                        ? "current-password"
                        : "new-password"
                    }
                    required
                  />
                </InputGroup>

                {/* Submit */}

                <Button
                  className="w-full"
                  size="sm"
                  type="submit"
                  disabled={
                    isLoading ||
                    !email.trim() ||
                    !password
                  }
                >
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}

                  {mode === "sign-in"
                    ? "Sign In"
                    : "Create Account"}
                </Button>
              </form>

              {/* =========================
                  OAUTH
              ========================== */}

              <AuthDivider>
                OR CONTINUE WITH
              </AuthDivider>

              <div className="space-y-2">
                {/* Google */}

                <Button
                  className="w-full gap-2"
                  type="button"
                  variant="outline"
                  onClick={() =>
                    handleOAuth("oauth_google")
                  }
                  disabled={isLoading}
                >
                  <GoogleIcon className="h-4 w-4" />
                  Google
                </Button>

                {/* GitHub */}

                <Button
                  className="w-full gap-2"
                  type="button"
                  variant="outline"
                  onClick={() =>
                    handleOAuth("oauth_github")
                  }
                  disabled={isLoading}
                >
                  <GithubIcon className="h-4 w-4" />
                  GitHub
                </Button>
              </div>

              {/* =========================
                  MODE SWITCH
              ========================== */}

              <p className="text-center text-sm text-muted-foreground">
                {mode === "sign-in" ? (
                  <>
                    Don&apos;t have an account?{" "}
                    <button
                      type="button"
                      onClick={toggleMode}
                      className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                    >
                      Sign up
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={toggleMode}
                      className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </>
          )}

          {/* =========================
              EMAIL VERIFICATION
          ========================== */}

          {step === "verifying" && (
            <>
              <div className="flex flex-col space-y-1">
                <h1 className="text-2xl font-bold tracking-wide">
                  Check your email
                </h1>

                <p className="text-base text-muted-foreground">
                  We sent a 6-digit code to{" "}
                  <span className="font-medium text-foreground">
                    {email}
                  </span>
                </p>
              </div>

              <form
                onSubmit={handleVerify}
                className="space-y-4"
              >
                {/* OTP */}

                <div className="flex justify-center">
                  <InputGroup className="max-w-[200px]">
                    <InputGroupInput
                      placeholder="000000"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={code}
                      onChange={(e) =>
                        setCode(
                          e.target.value
                            .replace(/\D/g, "")
                            .slice(0, 6)
                        )
                      }
                      required
                      className="text-center text-lg tracking-[0.25em]"
                    />
                  </InputGroup>
                </div>

                {/* Verify */}

                <Button
                  className="w-full"
                  size="sm"
                  type="submit"
                  disabled={
                    isLoading ||
                    code.length !== 6
                  }
                >
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}

                  Verify Code
                </Button>

                {/* Different email */}

                <button
                  type="button"
                  onClick={handleDifferentEmail}
                  disabled={isLoading}
                  className="w-full text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  Use a different email
                </button>
              </form>
            </>
          )}

          {/* =========================
              ERROR
          ========================== */}

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}
        </div>

        {/* =========================
            FOOTER
        ========================== */}

        <p className="text-center text-sm text-muted-foreground">
          This site is protected by reCAPTCHA and the Google{" "}
          <a
            className="underline underline-offset-4 hover:text-primary"
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy Policy
          </a>{" "}
          and{" "}
          <a
            className="underline underline-offset-4 hover:text-primary"
            href="https://policies.google.com/terms"
            target="_blank"
            rel="noopener noreferrer"
          >
            Terms of Service
          </a>{" "}
          apply.
        </p>
      </div>
    </div>
  );
}