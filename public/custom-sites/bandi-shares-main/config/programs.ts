import {
  BookOpen,
  LineChart,
  Zap,
  BookMarked,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { EXTERNAL_LINKS } from '@/config/links'

export type ProgramTier = {
  icon: LucideIcon
  tag: string
  title: string
  price: string
  priceMeta: string
  sub: string
  body: string
  features: string[]
  cta: string
  href: string
  span: string
  featured: boolean
}

export const PROGRAMS: ProgramTier[] = [
  {
    icon: BookOpen,
    tag: '6-Month Educational Program',
    title: "The Economist's Playbook: A 6-Month Transformation",
    price: 'R6,000.00',
    priceMeta: 'One-time enrolment',
    sub: 'Move beyond retail strategies. Master the macroeconomic framework used to position ahead of global shifts.',
    body: "This isn't theory. It's an operational system for reading Yield Curves, Central Bank signals, and Global Risk shifts.",
    features: [
      '26 weeks of structured macro curriculum',
      'Yield Curve & Central Bank signal modules',
      'Live cohort case studies',
      'Lifetime access to recordings',
    ],
    cta: 'Claim Your Edge',
    href: EXTERNAL_LINKS.education6Months,
    span: 'md:col-span-2',
    featured: true,
  },
  {
    icon: LineChart,
    tag: 'Trade Discussions',
    title: 'Macro-Driven Alpha',
    price: 'R1,000.00',
    priceMeta: '/ month',
    sub: 'Signals rooted in economic reality, not lagging indicators.',
    body: "We track the pulse of global GDP, CPI, and FOMC so you don't have to.",
    features: [
      'Macro-anchored trade ideas',
      'GDP, CPI & FOMC briefings',
      'Entry, exit & rationale',
      'Cancel anytime',
    ],
    cta: 'Enter the War Room',
    href: EXTERNAL_LINKS.tradeDiscussions,
    span: 'md:col-span-1',
    featured: false,
  },
  {
    icon: Zap,
    tag: '7-Day Bootcamp Recordings',
    title: 'The Macro Intensive: 7 Days to Market Mastery',
    price: 'R1,540.00',
    priceMeta: 'One-time access',
    sub: 'A deep-dive for busy traders into the mechanics of price.',
    body: 'From Liquidity Conditions to Regime Identification — compressed into a 7-day blueprint.',
    features: [
      '7 full-length intensive sessions',
      'Liquidity & regime frameworks',
      'Watch on your own schedule',
      'Workbook & references included',
    ],
    cta: 'Claim Your Edge',
    href: EXTERNAL_LINKS.bootcamp,
    span: 'md:col-span-1',
    featured: false,
  },
  {
    icon: BookMarked,
    tag: 'The Book',
    title: 'The Gospel of Fundamental Analysis',
    price: 'R2,500.00',
    priceMeta: 'Lifetime updates',
    sub: 'The structured guide to reading the economy before the chart reacts.',
    body: 'For traders ready to treat trading like the economic science it actually is.',
    features: [
      'Full digital edition',
      'Lifetime revision updates',
      'Annotated economic case studies',
      'Companion glossary',
    ],
    cta: 'See the Mechanics',
    href: EXTERNAL_LINKS.book,
    span: 'md:col-span-1',
    featured: false,
  },
  {
    icon: Sparkles,
    tag: 'The Free Community',
    title: 'The Inner Circle',
    price: 'Free',
    priceMeta: 'Access',
    sub: 'Your first step into professional macro trading.',
    body: 'Risk less, profit more, and grow with a community of high-conviction traders.',
    features: [
      'Open access to community channels',
      'Weekly macro previews',
      'Foundational learning resources',
      'No commitment required',
    ],
    cta: 'Enter the War Room',
    href: EXTERNAL_LINKS.overallBusiness,
    span: 'md:col-span-1',
    featured: false,
  },
]

/** Shown on home preview — subset of full programs list. */
export const HOME_PROGRAM_PREVIEW = PROGRAMS.filter((p) =>
  ['6-Month Educational Program', 'Trade Discussions', 'The Free Community'].includes(p.tag),
)
