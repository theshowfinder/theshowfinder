import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'How TheShowFinder uses cookies and similar tracking technologies.',
}

export default function CookiesPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-2">Cookie Policy</h1>
        <p className="text-slate-500 text-sm mb-10">Last updated: 15 May 2026</p>

        <div className="prose prose-slate max-w-none space-y-10">

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">1. What are cookies?</h2>
            <p className="text-slate-600 leading-relaxed">
              Cookies are small text files placed on your device when you visit a website. They are widely used to make websites work, to remember your preferences, and to provide information to the site owners. TheShowFinder uses cookies and similar technologies such as local storage and session storage.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">2. Cookies we use</h2>

            <h3 className="text-base font-extrabold text-slate-800 mt-6 mb-2">Essential cookies</h3>
            <p className="text-slate-600 leading-relaxed mb-3">
              These cookies are necessary for the site to function. They cannot be disabled. Without them, features like staying logged in would not work.
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-700 font-semibold text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-left">Cookie</th>
                    <th className="px-4 py-3 text-left">Purpose</th>
                    <th className="px-4 py-3 text-left">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-4 py-3 font-mono text-xs">sb-*-auth-token</td>
                    <td className="px-4 py-3">Supabase authentication session token — keeps you logged in.</td>
                    <td className="px-4 py-3 whitespace-nowrap">Session / 1 week</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono text-xs">sb-*-auth-token-code-verifier</td>
                    <td className="px-4 py-3">PKCE code verifier used during the sign-in flow.</td>
                    <td className="px-4 py-3 whitespace-nowrap">Session</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-base font-extrabold text-slate-800 mt-8 mb-2">Analytics cookies</h3>
            <p className="text-slate-600 leading-relaxed mb-3">
              We may use anonymised analytics to understand how visitors use the site — for example, which pages are most popular and how users navigate between them. These cookies do not identify you personally.
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-700 font-semibold text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-left">Cookie</th>
                    <th className="px-4 py-3 text-left">Purpose</th>
                    <th className="px-4 py-3 text-left">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-4 py-3 font-mono text-xs">_analytics</td>
                    <td className="px-4 py-3">Anonymised page-view and session analytics.</td>
                    <td className="px-4 py-3 whitespace-nowrap">Up to 2 years</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-base font-extrabold text-slate-800 mt-8 mb-2">Affiliate and third-party cookies</h3>
            <p className="text-slate-600 leading-relaxed">
              When you click an affiliate link (for example a &ldquo;Get tickets&rdquo; link that leads to Ticketmaster or another vendor), the destination website may place its own cookies on your device to track the referral and attribute any commission to us. These cookies are set by the third party — not by TheShowFinder — and are governed by that third party&apos;s cookie policy.
            </p>
            <p className="text-slate-600 leading-relaxed mt-3">
              Ticketmaster&apos;s cookie policy is available at <a href="https://www.ticketmaster.co.uk/h/cookies-policy.html" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>ticketmaster.co.uk</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">3. Managing cookies</h2>
            <p className="text-slate-600 leading-relaxed">
              You can control and delete cookies through your browser settings. Here are links to guidance for the most common browsers:
            </p>
            <ul className="space-y-2 mt-4 text-slate-600">
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>Google Chrome</a>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <a href="https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>Mozilla Firefox</a>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <a href="https://support.apple.com/en-gb/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>Safari</a>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <a href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>Microsoft Edge</a>
              </li>
            </ul>
            <p className="text-slate-600 leading-relaxed mt-4">
              Please note that disabling essential cookies will prevent you from logging in or using personalised features on TheShowFinder.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">4. Do Not Track</h2>
            <p className="text-slate-600 leading-relaxed">
              Some browsers offer a &ldquo;Do Not Track&rdquo; (DNT) signal. At present, there is no universal standard for responding to DNT signals, and TheShowFinder does not currently alter its data collection practices in response to DNT signals. We will review this position as standards evolve.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">5. Changes to this policy</h2>
            <p className="text-slate-600 leading-relaxed">
              We may update this Cookie Policy from time to time, for example as we introduce new features or third-party services. The &ldquo;last updated&rdquo; date at the top of this page will reflect any changes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">6. Contact</h2>
            <p className="text-slate-600 leading-relaxed">
              If you have any questions about how we use cookies, contact us at{' '}
              <a href="mailto:hello@theshowfinder.com" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>
                hello@theshowfinder.com
              </a>.
            </p>
          </section>

          <div className="pt-6 border-t border-slate-200">
            <p className="text-sm text-slate-500">
              See also:{' '}
              <Link href="/privacy-policy" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>Privacy Policy</Link>
              {' · '}
              <Link href="/terms" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>Terms of Service</Link>
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
