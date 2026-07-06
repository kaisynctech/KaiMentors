import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Refund Policy',
}

const SECTIONS = [
  {
    title: 'Digital Products',
    highlight: 'All sales of digital products (Book/Course) are final and non-refundable once access is granted.',
    body: 'Due to the instant-access nature of our digital content, we cannot offer refunds after delivery. We encourage you to review our free content and thoroughly read product descriptions before purchasing.',
  },
  {
    title: 'Subscription Services',
    body: 'Monthly subscriptions (such as Trade Discussions) can be cancelled at any time. Cancellation takes effect at the end of the current billing period. No partial refunds are provided for unused portions of a billing period.',
  },
  {
    title: 'Breach of Terms',
    body: 'If your access is terminated due to a violation of our Terms of Service — including but not limited to leaking proprietary materials — no refund will be issued.',
  },
  {
    title: 'Contact',
    body: 'For questions about this policy, please reach out through our Discord community or email us at support@bandisharesfx.com.',
  },
]

export default function RefundPolicyPage() {
  return (
    <section className="section-padding min-h-[60vh]">
      <div className="mx-auto max-w-3xl">
        <span className="mb-4 block text-sm font-semibold uppercase tracking-widest text-primary">
          Legal
        </span>
        <h1 className="mb-8 text-4xl font-bold text-foreground">Refund Policy</h1>

        <div className="glass-card space-y-6 p-8">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <h2 className="mb-2 text-lg font-semibold text-foreground">{s.title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {s.highlight && (
                  <span className="font-medium text-foreground">{s.highlight} </span>
                )}
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
