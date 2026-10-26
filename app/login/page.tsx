"use client";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { showToast } from "../../components/toast";
import { apiJson, errorMessage } from "../../lib/api";
const schema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});
type FormData = z.infer<typeof schema>;
export default function Login() {
  const [show, setShow] = useState(false);
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });
  const submit = async (values: FormData) => {
    clearErrors('root');
    try {
      await apiJson('/auth/login', { method: 'POST', body: JSON.stringify(values) });
      showToast('Signed in successfully', 'Welcome back to your container tracking workspace.');
      router.replace('/containers');
    } catch (error) { setError('root', { message: errorMessage(error) }); }
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
          Java Maryland · Operations platform
        </div>
      </section>
      <section className="login-form-area">
        <div className="login-box">
          <div className="eyebrow">Team access</div>
          <h2>Welcome back</h2>
          <p>Sign in to your container tracking workspace.</p>
          <form className="form-stack" onSubmit={handleSubmit(submit)} onChange={() => clearErrors('root')}>
            {errors.root && <div className="notice error" role="alert">{errors.root.message}</div>}
            <div className="field">
              <label htmlFor="email">Work email</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
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
                  autoComplete="current-password"
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
<div className="login-small"><span>Use your workspace account to sign in.</span></div>
            <button
              className="primary-btn full"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle size={16} className="spin" /> Signing in…
                </>
              ) : (
                "Sign in to containers"
              )}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
