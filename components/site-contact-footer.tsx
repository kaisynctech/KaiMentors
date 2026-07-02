import {
  Facebook,
  Instagram,
  Linkedin,
  Mail,
  MessageCircle,
  Phone,
  Send,
  Twitter,
  Youtube,
} from "lucide-react";
import styles from "./site-contact-footer.module.css";

function TikTokIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"/>
    </svg>
  );
}

export interface ContactInfo {
  phone:     string | null;
  email:     string | null;
  whatsapp:  string | null;
  telegram:  string | null;
  instagram: string | null;
  facebook:  string | null;
  youtube:   string | null;
  twitter:   string | null;
  tiktok:    string | null;
  linkedin:  string | null;
}

interface Props {
  contactInfo: ContactInfo;
  primaryColor: string;
  accentColor:  string;
}

export function SiteContactFooter({ contactInfo: c, primaryColor, accentColor }: Props) {
  const whatsappUrl = c.whatsapp
    ? `https://wa.me/${c.whatsapp.replace(/\D/g, "")}`
    : null;

  const hasAny = Object.values(c).some(Boolean);
  if (!hasAny) return null;

  return (
    <footer
      className={styles.footer}
      style={{ "--footer-primary": primaryColor, "--footer-accent": accentColor } as React.CSSProperties}
    >
      <div className={styles.inner}>
        <div className={styles.links}>
          {c.email     ? <a href={`mailto:${c.email}`} className={styles.link}><Mail size={16} /><span>Email</span></a> : null}
          {c.phone     ? <a href={`tel:${c.phone}`} className={styles.link}><Phone size={16} /><span>Call</span></a> : null}
          {whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noreferrer" className={styles.link}><MessageCircle size={16} /><span>WhatsApp</span></a> : null}
          {c.telegram  ? <a href={c.telegram} target="_blank" rel="noreferrer" className={styles.link}><Send size={16} /><span>Telegram</span></a> : null}
          {c.instagram ? <a href={c.instagram} target="_blank" rel="noreferrer" className={styles.link}><Instagram size={16} /><span>Instagram</span></a> : null}
          {c.facebook  ? <a href={c.facebook} target="_blank" rel="noreferrer" className={styles.link}><Facebook size={16} /><span>Facebook</span></a> : null}
          {c.youtube   ? <a href={c.youtube} target="_blank" rel="noreferrer" className={styles.link}><Youtube size={16} /><span>YouTube</span></a> : null}
          {c.twitter   ? <a href={c.twitter} target="_blank" rel="noreferrer" className={styles.link}><Twitter size={16} /><span>X</span></a> : null}
          {c.tiktok    ? <a href={c.tiktok} target="_blank" rel="noreferrer" className={styles.link}><TikTokIcon /><span>TikTok</span></a> : null}
          {c.linkedin  ? <a href={c.linkedin} target="_blank" rel="noreferrer" className={styles.link}><Linkedin size={16} /><span>LinkedIn</span></a> : null}
        </div>
      </div>
    </footer>
  );
}
