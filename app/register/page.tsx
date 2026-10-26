import Link from 'next/link';

export default function Register() {
  return <main className="login-page"><section className="login-hero"><div className="login-logo">JAVA <span>MARYLAND</span></div><div className="hero-copy"><div className="eyebrow" style={{color:'#d6aa5d'}}>Team access</div><h1>Your operations workspace.</h1><p>Contact your workspace administrator to get access to Java Maryland container tracking.</p></div></section><section className="login-form-area"><div className="login-box"><div className="eyebrow">Account access</div><h2>Need an account?</h2><p>Workspace accounts are managed by your operations team. Ask your administrator for your sign-in details.</p><Link href="/login" className="primary-btn full">Back to sign in</Link></div></section></main>;
}
