'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { submitXmVerification } from '@/lib/verify-client'
import { PortalAuthLink } from '@/components/portal-auth-link'
import { PARTNER_CODE } from '@/config/site'

const verifySchema = z.object({
  xmAccountId: z
    .string()
    .trim()
    .min(4, { message: 'Enter a valid XM Account ID' })
    .max(40, { message: 'XM Account ID must be under 40 characters' })
    .regex(/^[A-Za-z0-9-]+$/, { message: 'Only letters, numbers and dashes allowed' }),
  fullName: z
    .string()
    .trim()
    .min(2, { message: 'Full name is required' })
    .max(120, { message: 'Full name must be under 120 characters' }),
  email: z
    .string()
    .trim()
    .email({ message: 'Enter a valid email' })
    .max(255, { message: 'Email must be under 255 characters' }),
  whatsapp: z
    .string()
    .trim()
    .min(7, { message: 'Enter a valid WhatsApp number' })
    .max(20, { message: 'WhatsApp number must be under 20 characters' })
    .regex(/^[+\d\s()-]+$/, { message: 'Only digits, spaces, +, -, ( ) allowed' }),
})

type VerifyForm = z.infer<typeof verifySchema>

export default function VerifyPage() {
  const { toast } = useToast()
  const [submitted, setSubmitted] = useState(false)
  const [pendingSignup, setPendingSignup] = useState<{
    affiliateCode?: string
    affiliateLink?: string | null
  } | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<VerifyForm>({
    resolver: zodResolver(verifySchema),
    defaultValues: { xmAccountId: '', fullName: '', email: '', whatsapp: '' },
  })

  const onSubmit = async (data: VerifyForm) => {
    try {
      const result = await submitXmVerification(data) as Record<string, unknown>

      if (result?.type === 'PENDING_SIGNUP') {
        setPendingSignup({
          affiliateCode: typeof result.affiliateCode === 'string' ? result.affiliateCode : undefined,
          affiliateLink: typeof result.affiliateLink === 'string' ? result.affiliateLink : null,
        })
        toast({
          title: 'Details saved!',
          description: 'Please open an XM account using our referral code below.',
        })
      } else {
        toast({
          title: 'Verification submitted!',
          description: "We'll confirm your XM partnership and reach out on WhatsApp.",
        })
      }

      setSubmitted(true)
      reset()
    } catch (err: unknown) {
      toast({
        title: 'Submission failed',
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    }
  }


  return (
    <section className="section-padding flex min-h-[80vh] items-center">
      <div className="mx-auto w-full max-w-2xl">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10 text-center"
        >
          <span className="mb-4 block text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            Verify Access
          </span>
          <h1 className="mb-4 text-4xl font-bold leading-tight text-foreground md:text-5xl">
            Verify Your <span className="gradient-text-emerald">XM Account</span>
          </h1>
          <p className="mx-auto max-w-lg text-muted-foreground">
            Confirm your XM Account ID is registered under our partner link to unlock your
            Bandi Shares access.{' '}
            <PortalAuthLink kind="login" className="text-primary hover:underline">
              Already a member? Login
            </PortalAuthLink>
          </p>
        </motion.div>

        {/* Form */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="glass-card space-y-5 p-8 md:p-10"
        >
          {/* Info banner */}
          <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <ShieldCheck className="mt-0.5 shrink-0 text-primary" size={18} />
            <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
              <p>
                Your XM Account ID is the 8-digit number from your XM trading account. We use it to
                confirm you&apos;re registered under our IB partner link (
                <b className="font-mono text-foreground">{PARTNER_CODE}</b>).
              </p>
              <p>
                Need to open an account first?{' '}
                <Link href="/xm" className="font-medium text-primary hover:underline">
                  See full XM setup &amp; benefits →
                </Link>
              </p>
            </div>
          </div>

          {/* XM Account ID */}
          <div className="space-y-2">
            <Label
              htmlFor="xmAccountId"
              className="text-xs uppercase tracking-wider text-foreground"
            >
              XM Account ID
            </Label>
            <Input
              id="xmAccountId"
              placeholder="e.g. 12345678"
              {...register('xmAccountId')}
              className="border-[hsla(0,0%,100%,0.1)] bg-background/40 font-mono tracking-wider"
            />
            {errors.xmAccountId && (
              <p className="text-xs text-destructive">{errors.xmAccountId.message}</p>
            )}
          </div>

          {/* Full Name */}
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-xs uppercase tracking-wider text-foreground">
              Full Name
            </Label>
            <Input
              id="fullName"
              autoComplete="name"
              placeholder="Jane Doe"
              {...register('fullName')}
              className="border-[hsla(0,0%,100%,0.1)] bg-background/40"
            />
            {errors.fullName && (
              <p className="text-xs text-destructive">{errors.fullName.message}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs uppercase tracking-wider text-foreground">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              {...register('email')}
              className="border-[hsla(0,0%,100%,0.1)] bg-background/40"
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          {/* WhatsApp */}
          <div className="space-y-2">
            <Label htmlFor="whatsapp" className="text-xs uppercase tracking-wider text-foreground">
              WhatsApp Number
            </Label>
            <Input
              id="whatsapp"
              type="tel"
              autoComplete="tel"
              placeholder="+27 71 234 5678"
              {...register('whatsapp')}
              className="border-[hsla(0,0%,100%,0.1)] bg-background/40"
            />
            {errors.whatsapp && (
              <p className="text-xs text-destructive">{errors.whatsapp.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary-glow w-full text-sm uppercase tracking-wide disabled:opacity-60"
          >
            {isSubmitting ? 'Verifying…' : 'Verify XM ID'}
          </button>

          {submitted && !pendingSignup && (
            <p className="text-center text-xs font-medium text-primary">
              Thanks — we'll confirm your verification shortly.
            </p>
          )}

          {pendingSignup && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-5"
            >
              <p className="text-sm text-muted-foreground">
                Your details are saved. To qualify for verification, open a new XM account using
                our referral code:
              </p>
              <div className="flex items-center justify-center rounded-lg border border-primary/20 bg-primary/10 px-6 py-4">
                <span className="font-mono text-xl font-bold tracking-widest text-primary">
                  {pendingSignup.affiliateCode ?? PARTNER_CODE}
                </span>
              </div>
              {pendingSignup.affiliateLink && (
                <a
                  href={pendingSignup.affiliateLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary-glow block w-full text-center text-sm uppercase tracking-wide"
                >
                  Open XM Account →
                </a>
              )}
              <p className="text-center text-xs text-muted-foreground">
                Once your account is active, we'll verify your submission and reach out automatically.
              </p>
            </motion.div>
          )}
        </motion.form>
      </div>
    </section>
  )
}
