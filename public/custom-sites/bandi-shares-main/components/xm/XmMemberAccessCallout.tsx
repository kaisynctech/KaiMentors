import { PortalAuthLink } from '@/components/portal-auth-link'
import { PARTNER_CODE, xmMemberDiscountLabel, XM_MEMBER_DISCOUNT_PERCENT } from '@/config/site'
import { SiteLink } from '@/components/site-link'

const STEPS = [
  {
    step: '1',
    title: 'Sign in to the student portal',
    body: 'Discount links are not on this public site — you need an active portal session first.',
  },
  {
    step: '2',
    title: 'Verify your XM account',
    body: `Confirm your real XM account is linked under partner code ${PARTNER_CODE}.`,
  },
  {
    step: '3',
    title: 'Access member pricing inside',
    body: 'Once signed in and verified, discounted program links appear in your portal courses — not the full-price Whop links shown here.',
  },
]

interface XmMemberAccessCalloutProps {
  showActions?: boolean
  compact?: boolean
}

export default function XmMemberAccessCallout({
  showActions = true,
  compact = false,
}: XmMemberAccessCalloutProps) {
  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'}>
      <div>
        <p className="mb-1 text-sm font-semibold text-foreground">{xmMemberDiscountLabel()}</p>
        <p className="text-sm text-muted-foreground">
          Public pages show standard Whop rates.{' '}
          <b className="text-foreground">Sign in + XM verification</b> unlocks discounted checkout
          links inside your student portal.
          {!XM_MEMBER_DISCOUNT_PERCENT && (
            <span className="mt-1 block text-xs">
              Exact discount percentage coming soon from Bandile.
            </span>
          )}
        </p>
      </div>

      <ol className={`grid gap-3 ${compact ? '' : 'sm:grid-cols-3'}`}>
        {STEPS.map((item) => (
          <li
            key={item.step}
            className="rounded-lg border border-[hsla(var(--glass-border))] bg-[hsla(var(--glass-bg))] p-4"
          >
            <span className="mb-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-bold text-primary">
              {item.step}
            </span>
            <p className="mb-1 text-sm font-medium text-foreground">{item.title}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{item.body}</p>
          </li>
        ))}
      </ol>

      {showActions && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <PortalAuthLink
            kind="login"
            className="btn-primary-glow text-center text-sm uppercase tracking-wide"
          >
            Sign in to portal
          </PortalAuthLink>
          <SiteLink href="/xm#verify" className="btn-ghost-glass text-center text-sm">
            Verify XM account
          </SiteLink>
          <PortalAuthLink kind="join" className="btn-ghost-glass text-center text-sm">
            Sign up
          </PortalAuthLink>
        </div>
      )}
    </div>
  )
}
