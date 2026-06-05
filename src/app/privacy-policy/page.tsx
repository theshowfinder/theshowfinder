import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How TheShowFinder collects, uses, and protects your personal data.',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-2">Privacy Policy</h1>
        <p className="text-slate-500 text-sm mb-10">Last updated: 15 May 2026</p>

        <div className="prose prose-slate max-w-none space-y-10">

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">1. Who we are</h2>
            <p className="text-slate-600 leading-relaxed">
              TheShowFinder is a UK events discovery and ticket comparison platform. When we say &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;, we mean TheShowFinder. For any privacy-related questions, contact us at{' '}
              <a href="mailto:hello@theshowfinder.com" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>
                hello@theshowfinder.com
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">2. What data we collect</h2>
            <p className="text-slate-600 leading-relaxed mb-4">We collect the following categories of personal data:</p>
            <ul className="space-y-3 text-slate-600">
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span><strong>Account information</strong> — if you create an account, we collect your email address and a hashed password. We do not store your password in plain text.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span><strong>Newsletter email</strong> — if you subscribe to our newsletter, we store your email address in order to send you event recommendations and updates.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span><strong>Usage data</strong> — we may collect anonymised data about how you use the site, such as pages visited, search queries, and referring URLs, in order to improve the service.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span><strong>Cookies</strong> — we use cookies and similar tracking technologies. See our <Link href="/cookies" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>Cookie Policy</Link> for full details.</span>
              </li>
            </ul>
            <p className="text-slate-600 leading-relaxed mt-4">
              We do not collect payment card details. Any ticket purchases are completed directly on Ticketmaster&apos;s platform or the relevant ticket vendor&apos;s platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">3. How we use your data</h2>
            <ul className="space-y-3 text-slate-600">
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span>To create and manage your account and provide access to saved or personalised features.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span>To send you our newsletter if you have subscribed. You can unsubscribe at any time via the link in any email.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span>To analyse how the site is used and improve our content, search, and event recommendations.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span>To comply with legal obligations.</span>
              </li>
            </ul>
            <p className="text-slate-600 leading-relaxed mt-4">
              Our legal basis for processing your data is your consent (for newsletter sign-up and non-essential cookies) and our legitimate interest in operating and improving the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">4. Cookies</h2>
            <p className="text-slate-600 leading-relaxed">
              We use essential cookies to keep you logged in and to secure your session, and optional analytics cookies to understand how the site is used. For full details on the cookies we use and how to control them, see our{' '}
              <Link href="/cookies" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>Cookie Policy</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">5. Third-party services</h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              We use the following third-party services which may process personal data on our behalf:
            </p>
            <ul className="space-y-3 text-slate-600">
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span><strong>Supabase</strong> — our database and authentication provider. Your account data and newsletter email are stored in Supabase. Supabase operates data centres in the EU. See <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>supabase.com/privacy</a>.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span><strong>Ticketmaster</strong> — event data displayed on TheShowFinder is sourced from the Ticketmaster Discovery API. When you click through to buy tickets, you are subject to Ticketmaster&apos;s own privacy policy. See <a href="https://www.ticketmaster.co.uk/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>ticketmaster.co.uk/privacy</a>.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span><strong>Affiliate partners</strong> — some links on TheShowFinder are affiliate links. When you click these links and make a purchase, our affiliate partners may place cookies on your device to track the referral. We do not receive personal data about you from affiliate partners.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span><strong>Vercel</strong> — our hosting provider. Vercel may log your IP address and request metadata for security and operational purposes. See <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>vercel.com/legal/privacy-policy</a>.</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">6. Data retention</h2>
            <p className="text-slate-600 leading-relaxed">
              We retain your account data for as long as your account is active. Newsletter subscriber data is retained until you unsubscribe or request deletion. Anonymised usage data may be retained indefinitely for analytical purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">7. Your rights under UK GDPR</h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              If you are in the UK or EU, you have the following rights regarding your personal data:
            </p>
            <ul className="space-y-3 text-slate-600">
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span><strong>Right of access</strong> — you can request a copy of the personal data we hold about you.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span><strong>Right to rectification</strong> — you can ask us to correct inaccurate data.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span><strong>Right to erasure</strong> — you can request that we delete your personal data (&ldquo;right to be forgotten&rdquo;).</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span><strong>Right to data portability</strong> — you can request your data in a structured, machine-readable format.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span><strong>Right to object</strong> — you can object to processing based on our legitimate interests, including direct marketing.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span><strong>Right to withdraw consent</strong> — where processing is based on consent, you can withdraw it at any time.</span>
              </li>
            </ul>
            <p className="text-slate-600 leading-relaxed mt-4">
              To exercise any of these rights, email us at{' '}
              <a href="mailto:hello@theshowfinder.com" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>
                hello@theshowfinder.com
              </a>. We will respond within 30 days. You also have the right to lodge a complaint with the UK Information Commissioner&apos;s Office (ICO) at <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>ico.org.uk</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">8. Children</h2>
            <p className="text-slate-600 leading-relaxed">
              TheShowFinder is not directed at children under 13. We do not knowingly collect personal data from children. If you believe a child has provided us with personal data, contact us and we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">9. Changes to this policy</h2>
            <p className="text-slate-600 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify registered users of material changes by email. The &ldquo;last updated&rdquo; date at the top of this page will always reflect the current version.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">10. Contact us</h2>
            <p className="text-slate-600 leading-relaxed">
              For any questions about this Privacy Policy or how we handle your data, contact us at{' '}
              <a href="mailto:hello@theshowfinder.com" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>
                hello@theshowfinder.com
              </a>.
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}
