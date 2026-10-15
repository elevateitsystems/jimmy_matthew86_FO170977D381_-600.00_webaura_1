"use client";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
const schema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});
type FormData = z.infer<typeof schema>;
export default function Login() {
  const [show, setShow] = useState(false);
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });
  const submit = async () => {
    localStorage.setItem("jm_authenticated", "true");
    router.replace("/dashboard");
  };
  return (
    <main className="login-page">
      <section className="login-hero">
        <div className="login-logo">
          JAVA <span>MARYLAND</span>
        </div>
        <div className="hero-copy">
          <div className="eyebrow" style={{ color: "#d6aa5d" }}>
            Import operations
          </div>
          <h1>Container tracking workspace.</h1>
          <p>
            Track milestones, coordinate delivery, and keep your team moving
            with a single source of shipment truth.
          </p>
        </div>
        <div className="hero-foot">
          Java Maryland · Operations platform · Phase 1 prototype
        </div>
      </section>
      <section className="login-form-area">
        <div className="login-box">
          <div className="eyebrow">Team access</div>
          <h2>Welcome back</h2>
          <p>Sign in to your container tracking workspace.</p>
          <form className="form-stack" onSubmit={handleSubmit(submit)}>
            <div className="field">
              <label htmlFor="email">Work email</label>
              <input
                id="email"
                type="email"
                placeholder="you@javamaryland.com"
                {...register("email")}
              />
              {errors.email && (
                <span className="error" role="alert">
                  {errors.email.message}
                </span>
              )}
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="password-wrap">
                <input
                  id="password"
                  type={show ? "text" : "password"}
                  placeholder="••••••••"
                  {...register("password")}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {errors.password && (
                <span className="error" role="alert">
                  {errors.password.message}
                </span>
              )}
            </div>
            <div className="login-small">
              <span>Prototype environment</span>
              <Link href="/register" style={{ color: "#1b578c" }}>
                Create account
              </Link>
            </div>
            <button
              className="primary-btn full"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing in…" : "Sign in to dashboard"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
