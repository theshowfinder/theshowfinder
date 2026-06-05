import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for TheShowFinder — UK events discovery platform.',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-2">Terms of Service</h1>
        <p className="text-slate-500 text-sm mb-10">Last updated: 15 May 2026</p>

        <div className="prose prose-slate max-w-none space-y-10">

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">1. About these terms</h2>
            <p className="text-slate-600 leading-relaxed">
              These Terms of Service govern your use of TheShowFinder (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;). By using TheShowFinder you agree to these terms. If you do not agree, please do not use the site.
            </p>
            <p className="text-slate-600 leading-relaxed mt-3">
              For questions about these terms, contact us at{' '}
              <a href="mailto:hello@theshowfinder.com" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>
                hello@theshowfinder.com
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">2. Use of the site</h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              You may use TheShowFinder for personal, non-commercial purposes to discover and find tickets for events in the UK. You agree not to:
            </p>
            <ul className="space-y-3 text-slate-600">
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span>Scrape, crawl, or systematically copy content from the site without our written permission.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span>Use the site in any way that violates applicable laws or regulations.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span>Attempt to gain unauthorised access to any part of the site or its underlying systems.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span>Transmit any harmful, offensive, or disruptive content through the site.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span>Reproduce, redistribute, or exploit the site&apos;s content for commercial purposes without written consent.</span>
              </li>
            </ul>
            <p className="text-slate-600 leading-relaxed mt-4">
              We reserve the right to suspend or terminate access for users who breach these terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">3. Accounts</h2>
            <p className="text-slate-600 leading-relaxed">
              If you create an account, you are responsible for keeping your login credentials secure and for all activity that occurs under your account. You must notify us immediately at{' '}
              <a href="mailto:hello@theshowfinder.com" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>
                hello@theshowfinder.com
              </a>{' '}
              if you suspect unauthorised use of your account. You must be at least 13 years old to create an account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">4. Affiliate disclosure</h2>
            <p className="text-slate-600 leading-relaxed">
              TheShowFinder participates in affiliate programmes. This means that when you click certain links on our site and go on to purchase a ticket or product, we may receive a commission from the ticket vendor or affiliate partner at no additional cost to you.
            </p>
            <p className="text-slate-600 leading-relaxed mt-3">
              Affiliate relationships do not affect the event listings, reviews, or recommendations displayed on the site. We list events based on relevance and availability, not on commercial relationships. Where we have a commercial relationship with a vendor, this does not influence our editorial coverage.
            </p>
            <p className="text-slate-600 leading-relaxed mt-3">
              Ticket sales and purchases are processed entirely by third-party vendors (such as Ticketmaster). TheShowFinder is not party to any ticket sale transaction and does not handle any payment information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">5. No liability for ticket prices or availability</h2>
            <p className="text-slate-600 leading-relaxed">
              Event information on TheShowFinder — including ticket prices, availability, dates, venues, and artist line-ups — is sourced from third parties (primarily the Ticketmaster API) and is provided for informational purposes only. We make reasonable efforts to keep this information accurate and up to date, but we cannot guarantee its accuracy.
            </p>
            <p className="text-slate-600 leading-relaxed mt-3">
              TheShowFinder is not responsible for:
            </p>
            <ul className="space-y-3 text-slate-600 mt-3">
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span>Inaccurate, outdated, or missing event information.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span>Events that are cancelled, postponed, or rescheduled after publication.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span>Ticket price changes or dynamic pricing applied by the ticket vendor.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span>Tickets being sold out or unavailable when you attempt to purchase.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" />
                <span>Any loss suffered as a result of relying on information displayed on TheShowFinder.</span>
              </li>
            </ul>
            <p className="text-slate-600 leading-relaxed mt-4">
              Always verify ticket availability, pricing, and event details directly with the ticket vendor before making a purchase.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">6. Third-party links</h2>
            <p className="text-slate-600 leading-relaxed">
              TheShowFinder contains links to third-party websites, including ticket vendors and affiliate partners. These links are provided for your convenience. We have no control over the content, privacy practices, or terms of third-party sites, and we accept no responsibility for them. Following a link to another site is at your own risk. We encourage you to read the terms and privacy policy of any site you visit.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">7. Intellectual property</h2>
            <p className="text-slate-600 leading-relaxed">
              All content on TheShowFinder that is our own — including the site design, branding, copy, and code — is the property of TheShowFinder and is protected by applicable intellectual property law. Event data, images, and descriptions sourced from Ticketmaster remain the property of their respective owners and are used under licence.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">8. Disclaimer of warranties</h2>
            <p className="text-slate-600 leading-relaxed">
              TheShowFinder is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not warrant that the site will be uninterrupted, error-free, or free of viruses or other harmful components.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">9. Limitation of liability</h2>
            <p className="text-slate-600 leading-relaxed">
              To the fullest extent permitted by law, TheShowFinder shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of TheShowFinder, even if we have been advised of the possibility of such damages. Our total liability to you for any claims arising out of or related to these terms or the site shall not exceed £100.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">10. Governing law</h2>
            <p className="text-slate-600 leading-relaxed">
              These terms are governed by the laws of <strong>England and Wales</strong>. Any disputes arising from these terms or your use of the site shall be subject to the exclusive jurisdiction of the courts of England and Wales, without prejudice to any mandatory consumer protection rights you may have under the law of your country of residence.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">11. Changes to these terms</h2>
            <p className="text-slate-600 leading-relaxed">
              We may update these Terms of Service from time to time. We will notify registered users of material changes by email. Your continued use of the site after any update constitutes acceptance of the revised terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">12. Contact</h2>
            <p className="text-slate-600 leading-relaxed">
              For any questions about these terms, contact us at{' '}
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
              <Link href="/cookies" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>Cookie Policy</Link>
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
