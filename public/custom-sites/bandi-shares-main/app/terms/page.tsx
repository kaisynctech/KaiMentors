import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service',
}

const SECTIONS = [
  {
    title: '1. No Financial Advice',
    body: 'Bandi Shares FX provides educational content only. Nothing on this website, in our e-books, Discord community, mentorship calls, or any other medium constitutes financial advice, investment advice, trading advice, or any other form of professional advice. All content is for informational and educational purposes only. You are solely responsible for your own trading decisions.',
  },
  {
    title: '2. Proprietary Materials',
    body: 'All content provided through Bandi Shares FX — including but not limited to The Blueprint e-book, course modules, Discord content, live session recordings, and supplementary materials — is proprietary and protected by copyright.',
    highlight:
      'We maintain a zero-tolerance policy for leaking, sharing, redistributing, or reproducing proprietary materials.',
    tail: 'Violations will result in immediate termination of access without refund and may result in legal action.',
  },
  {
    title: '3. Risk Acknowledgment',
    body: 'Trading Forex and other financial instruments involves significant risk of loss. You should only trade with money you can afford to lose. Past performance discussed in any Bandi Shares FX material is not indicative of future results. By purchasing our products or services, you acknowledge and accept this risk.',
  },
  {
    title: '4. User Conduct',
    body: 'Members of the Bandi Shares FX community are expected to maintain professional conduct. Harassment, spam, promotion of competing services, or any behaviour deemed disruptive may result in removal from the community without refund.',
  },
  {
    title: '5. Modifications',
    body: 'Bandi Shares FX reserves the right to modify these terms at any time. Continued use of our services constitutes acceptance of any updated terms.',
  },
]

export default function TermsPage() {
  return (
    <section className="section-padding min-h-[60vh]">
      <div className="mx-auto max-w-3xl">
        <span className="mb-4 block text-sm font-semibold uppercase tracking-widest text-primary">
          Legal
        </span>
        <h1 className="mb-8 text-4xl font-bold text-foreground">Terms of Service</h1>

        <div className="glass-card space-y-6 p-8">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <h2 className="mb-2 text-lg font-semibold text-foreground">{s.title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {s.body}{' '}
                {s.highlight && (
                  <span className="font-medium text-foreground">{s.highlight}</span>
                )}{' '}
                {s.tail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
