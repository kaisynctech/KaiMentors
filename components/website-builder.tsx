"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Eye,
  ImagePlus,
  LayoutTemplate,
  Loader2,
  Save,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  getWebsiteMediaUrl,
  type WebsiteNavigationItem,
  type WebsitePage,
  type WebsiteSection,
  type WebsiteTemplate,
  type WebsiteTheme,
} from "@/lib/website-types";
import styles from "./website-builder.module.css";

interface WebsiteBuilderProps {
  portal: {
    portal_name: string;
    slug: string;
    is_published: boolean;
  };
  templates: WebsiteTemplate[];
  theme: WebsiteTheme;
  pages: WebsitePage[];
  sections: WebsiteSection[];
  navigation: WebsiteNavigationItem[];
}

const fontOptions = ["Inter", "Georgia", "Arial", "Verdana", "Times New Roman"];

export function WebsiteBuilder({
  portal,
  templates,
  theme,
  pages: initialPages,
  sections: initialSections,
  navigation: initialNavigation,
}: WebsiteBuilderProps) {
  const router = useRouter();
  const [activePageId, setActivePageId] = useState(
    initialPages.find((page) => page.is_home)?.id ?? initialPages[0]?.id ?? "",
  );
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState<"logo" | "hero" | null>(null);
  const [logoPath, setLogoPath] = useState(theme.logo_path);
  const [heroPath, setHeroPath] = useState(theme.hero_image_path);
  const [identity, setIdentity] = useState({
    name: portal.portal_name,
    slug: portal.slug,
    isPublished: portal.is_published,
  });
  const [themeValues, setThemeValues] = useState({
    primaryColor: theme.primary_color,
    accentColor: theme.accent_color,
    backgroundColor: theme.background_color,
    surfaceColor: theme.surface_color,
    textColor: theme.text_color,
    headingFont: theme.heading_font,
    bodyFont: theme.body_font,
    socialLinks: {
      whatsapp: theme.social_links.whatsapp ?? "",
      telegram: theme.social_links.telegram ?? "",
      instagram: theme.social_links.instagram ?? "",
    },
  });
  const [pages, setPages] = useState(initialPages);
  const [sections, setSections] = useState(initialSections);
  const [navigation, setNavigation] = useState(initialNavigation);

  const activeTemplate = templates.find(
    (template) => template.id === theme.template_id,
  );
  const managedDesign = Boolean(activeTemplate?.is_managed);
  const activePage = pages.find((page) => page.id === activePageId);
  const activeSections = useMemo(
    () =>
      sections
        .filter((section) => section.page_id === activePageId)
        .sort((a, b) => a.sort_order - b.sort_order),
    [activePageId, sections],
  );

  function markDirty() {
    setState("idle");
    setMessage("");
  }

  async function applyTemplate(templateId: string) {
    setState("saving");
    setMessage("");
    const response = await fetch("/api/website-builder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "apply_template", templateId }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setState("error");
      setMessage(payload.error ?? "The template could not be applied.");
      return;
    }
    setState("saved");
    setMessage("Template applied. Your matching content was preserved.");
    window.location.reload();
  }

  async function uploadMedia(
    type: "logo" | "hero",
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(type);
    setMessage("");
    const formData = new FormData();
    formData.set("mediaType", type);
    formData.set("file", file);
    formData.set("altText", `${identity.name} ${type}`);
    const response = await fetch("/api/website-builder/media", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) {
      setState("error");
      setMessage(payload.error ?? "The image could not be uploaded.");
    } else {
      if (type === "logo") setLogoPath(payload.path);
      if (type === "hero") setHeroPath(payload.path);
      setState("saved");
      setMessage(`${type === "logo" ? "Logo" : "Hero image"} uploaded.`);
      router.refresh();
    }
    setUploading(null);
  }

  function updateSectionContent(
    sectionId: string,
    key: string,
    value: string | string[],
  ) {
    setSections((current) =>
      current.map((section) =>
        section.id === sectionId
          ? { ...section, content: { ...section.content, [key]: value } }
          : section,
      ),
    );
    markDirty();
  }

  async function saveWebsite() {
    setState("saving");
    setMessage("");
    const response = await fetch("/api/website-builder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save",
        portal: identity,
        theme: themeValues,
        pages: pages.map((page) => ({
          id: page.id,
          title: page.title,
          isEnabled: page.is_enabled,
          seoTitle: page.seo_title ?? "",
          seoDescription: page.seo_description ?? "",
        })),
        sections: sections.map((section) => ({
          id: section.id,
          content: section.content,
          isEnabled: section.is_enabled,
          sortOrder: section.sort_order,
        })),
        navigation: navigation.map((item) => ({
          id: item.id,
          label: item.label,
          isEnabled: item.is_enabled,
          sortOrder: item.sort_order,
        })),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setState("error");
      setMessage(payload.error ?? "The website could not be saved.");
      return;
    }
    setIdentity((current) => ({ ...current, slug: payload.slug }));
    setState("saved");
    setMessage(
      payload.isPublished
        ? "Website saved and published."
        : "Website draft saved.",
    );
    router.refresh();
  }

  return (
    <div className={styles.builder}>
      <section className={styles.toolbar}>
        <div>
          <span className={styles.status}>
            {identity.isPublished ? "Published" : "Draft"}
          </span>
          <p>
            {managedDesign ? "Managed design" : "Template"}:{" "}
            <strong>{activeTemplate?.name ?? "Website template"}</strong>
          </p>
        </div>
        <div>
          <a
            className={styles.previewButton}
            href="/dashboard/website-builder/preview"
            target="_blank"
          >
            <Eye size={17} /> Preview
          </a>
          <button
            className={styles.saveButton}
            disabled={state === "saving"}
            onClick={saveWebsite}
            type="button"
          >
            {state === "saving" ? (
              <Loader2 className={styles.spin} size={17} />
            ) : (
              <Save size={17} />
            )}
            Save website
          </button>
        </div>
      </section>

      {message ? (
        <p className={state === "error" ? styles.error : styles.success}>
          {state === "saved" ? <CheckCircle2 size={17} /> : null}
          {message}
        </p>
      ) : null}

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <LayoutTemplate size={20} />
          <div>
            <span>Template library</span>
            <h2>Choose the visual direction</h2>
            <p>
              {managedDesign
                ? "This custom design is assigned to your workspace. You can edit its content without replacing its design system."
                : "Templates define page and section composition. Your tenant content remains independent."}
            </p>
          </div>
        </div>
        <div className={styles.templateGrid}>
          {templates.map((template) => {
            const selected = template.id === theme.template_id;
            return (
              <article className={selected ? styles.selectedTemplate : ""} key={template.id}>
                <div className={styles.templateVisual}>
                  <span>{template.category}</span>
                  <strong>{template.name}</strong>
                </div>
                <div>
                  <span>Version {template.version}</span>
                  <h3>{template.name}</h3>
                  <p>{template.description}</p>
                  <button
                    disabled={managedDesign || selected || state === "saving"}
                    onClick={() => applyTemplate(template.id)}
                    type="button"
                  >
                    {selected
                      ? managedDesign
                        ? "Managed design"
                        : "Selected"
                      : managedDesign
                        ? "Unavailable"
                        : "Use template"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className={styles.columns}>
        <div className={styles.stack}>
          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <ImagePlus size={20} />
              <div>
                <span>Brand identity</span>
                <h2>Website name and media</h2>
              </div>
            </div>
            <div className={styles.twoColumns}>
              <label>
                Academy website name
                <input
                  maxLength={120}
                  onChange={(event) => {
                    setIdentity((current) => ({
                      ...current,
                      name: event.target.value,
                    }));
                    markDirty();
                  }}
                  value={identity.name}
                />
              </label>
              <label>
                Website address
                <span className={styles.slugInput}>
                  <small>/portal/</small>
                  <input
                    maxLength={80}
                    onChange={(event) => {
                      setIdentity((current) => ({
                        ...current,
                        slug: event.target.value,
                      }));
                      markDirty();
                    }}
                    value={identity.slug}
                  />
                </span>
              </label>
            </div>
            <div className={styles.mediaGrid}>
              <MediaUpload
                label="Logo"
                loading={uploading === "logo"}
                onChange={(event) => uploadMedia("logo", event)}
                path={logoPath}
              />
              <MediaUpload
                label="Hero image"
                loading={uploading === "hero"}
                onChange={(event) => uploadMedia("hero", event)}
                path={heroPath}
              />
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span>Theme settings</span>
                <h2>Colors and typography</h2>
              </div>
            </div>
            <div className={styles.colorGrid}>
              {[
                ["primaryColor", "Primary"],
                ["accentColor", "Accent"],
                ["backgroundColor", "Background"],
                ["surfaceColor", "Cards"],
                ["textColor", "Text"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <span className={styles.colorInput}>
                    <input
                      onChange={(event) => {
                        setThemeValues((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }));
                        markDirty();
                      }}
                      type="color"
                      value={
                        themeValues[key as keyof typeof themeValues] as string
                      }
                    />
                    <input
                      onChange={(event) => {
                        setThemeValues((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }));
                        markDirty();
                      }}
                      value={
                        themeValues[key as keyof typeof themeValues] as string
                      }
                    />
                  </span>
                </label>
              ))}
            </div>
            <div className={styles.twoColumns}>
              <label>
                Heading font
                <select
                  onChange={(event) => {
                    setThemeValues((current) => ({
                      ...current,
                      headingFont: event.target.value,
                    }));
                    markDirty();
                  }}
                  value={themeValues.headingFont}
                >
                  {fontOptions.map((font) => <option key={font}>{font}</option>)}
                </select>
              </label>
              <label>
                Body font
                <select
                  onChange={(event) => {
                    setThemeValues((current) => ({
                      ...current,
                      bodyFont: event.target.value,
                    }));
                    markDirty();
                  }}
                  value={themeValues.bodyFont}
                >
                  {fontOptions.map((font) => <option key={font}>{font}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span>Social links</span>
                <h2>Connect your community</h2>
              </div>
            </div>
            <div className={styles.threeColumns}>
              {(["whatsapp", "telegram", "instagram"] as const).map((key) => (
                <label key={key}>
                  {key[0].toUpperCase() + key.slice(1)}
                  <input
                    onChange={(event) => {
                      setThemeValues((current) => ({
                        ...current,
                        socialLinks: {
                          ...current.socialLinks,
                          [key]: event.target.value,
                        },
                      }));
                      markDirty();
                    }}
                    value={themeValues.socialLinks[key]}
                  />
                </label>
              ))}
            </div>
          </section>
        </div>

        <aside className={styles.stack}>
          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span>Publishing</span>
                <h2>Website visibility</h2>
              </div>
            </div>
            <label className={styles.publishToggle}>
              <input
                checked={identity.isPublished}
                onChange={(event) => {
                  setIdentity((current) => ({
                    ...current,
                    isPublished: event.target.checked,
                  }));
                  markDirty();
                }}
                type="checkbox"
              />
              <span>
                <strong>Publish website</strong>
                <small>
                  Make `/portal/{identity.slug}` publicly available.
                </small>
              </span>
            </label>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span>Navigation</span>
                <h2>Header menu</h2>
              </div>
            </div>
            <div className={styles.compactList}>
              {navigation
                .filter((item) => item.location === "header")
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((item) => (
                  <div key={item.id}>
                    <input
                      checked={item.is_enabled}
                      onChange={(event) => {
                        setNavigation((current) =>
                          current.map((entry) =>
                            entry.id === item.id
                              ? { ...entry, is_enabled: event.target.checked }
                              : entry,
                          ),
                        );
                        markDirty();
                      }}
                      type="checkbox"
                    />
                    <input
                      onChange={(event) => {
                        setNavigation((current) =>
                          current.map((entry) =>
                            entry.id === item.id
                              ? { ...entry, label: event.target.value }
                              : entry,
                          ),
                        );
                        markDirty();
                      }}
                      value={item.label}
                    />
                  </div>
                ))}
            </div>
          </section>
        </aside>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span>Page editor</span>
            <h2>Edit website pages and sections</h2>
            <p>
              Each page is assembled from reusable section records supplied by
              the selected template.
            </p>
          </div>
        </div>
        <div className={styles.pageEditor}>
          <nav className={styles.pageTabs}>
            {pages.map((page) => (
              <button
                className={page.id === activePageId ? styles.activePage : ""}
                key={page.id}
                onClick={() => setActivePageId(page.id)}
                type="button"
              >
                {page.title}
              </button>
            ))}
          </nav>
          {activePage ? (
            <div className={styles.pageSettings}>
              <div className={styles.twoColumns}>
                <label>
                  Page title
                  <input
                    onChange={(event) => {
                      setPages((current) =>
                        current.map((page) =>
                          page.id === activePage.id
                            ? { ...page, title: event.target.value }
                            : page,
                        ),
                      );
                      markDirty();
                    }}
                    value={activePage.title}
                  />
                </label>
                <label className={styles.checkboxLabel}>
                  <input
                    checked={activePage.is_enabled}
                    disabled={activePage.is_home}
                    onChange={(event) => {
                      setPages((current) =>
                        current.map((page) =>
                          page.id === activePage.id
                            ? { ...page, is_enabled: event.target.checked }
                            : page,
                        ),
                      );
                      markDirty();
                    }}
                    type="checkbox"
                  />
                  Show this page
                </label>
              </div>
              <div className={styles.twoColumns}>
                <label>
                  SEO title
                  <input
                    maxLength={180}
                    onChange={(event) => {
                      setPages((current) =>
                        current.map((page) =>
                          page.id === activePage.id
                            ? { ...page, seo_title: event.target.value }
                            : page,
                        ),
                      );
                      markDirty();
                    }}
                    value={activePage.seo_title ?? ""}
                  />
                </label>
                <label>
                  SEO description
                  <input
                    maxLength={320}
                    onChange={(event) => {
                      setPages((current) =>
                        current.map((page) =>
                          page.id === activePage.id
                            ? { ...page, seo_description: event.target.value }
                            : page,
                        ),
                      );
                      markDirty();
                    }}
                    value={activePage.seo_description ?? ""}
                  />
                </label>
              </div>
              <div className={styles.sectionList}>
                {activeSections.map((section) => (
                  <SectionEditor
                    key={section.id}
                    onChange={(key, value) =>
                      updateSectionContent(section.id, key, value)
                    }
                    onToggle={(enabled) => {
                      setSections((current) =>
                        current.map((entry) =>
                          entry.id === section.id
                            ? { ...entry, is_enabled: enabled }
                            : entry,
                        ),
                      );
                      markDirty();
                    }}
                    section={section}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function MediaUpload({
  label,
  loading,
  onChange,
  path,
}: {
  label: string;
  loading: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  path: string | null;
}) {
  const url = getWebsiteMediaUrl(path);
  return (
    <label className={styles.mediaUpload}>
      <div>
        {url ? (
          <Image alt="" fill sizes="180px" src={url} unoptimized />
        ) : (
          <ImagePlus size={24} />
        )}
      </div>
      <span>
        <strong>{loading ? "Uploading..." : label}</strong>
        <small>PNG, JPG, WebP, or SVG. Maximum 10 MB.</small>
      </span>
      <input
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        disabled={loading}
        onChange={onChange}
        type="file"
      />
    </label>
  );
}

function SectionEditor({
  onChange,
  onToggle,
  section,
}: {
  onChange: (key: string, value: string | string[]) => void;
  onToggle: (enabled: boolean) => void;
  section: WebsiteSection;
}) {
  const content = section.content;
  const get = (key: string) =>
    typeof content[key] === "string" ? (content[key] as string) : "";
  const list = Array.isArray(content.items)
    ? content.items.filter((item): item is string => typeof item === "string")
    : [];

  return (
    <article className={styles.sectionEditor}>
      <header>
        <div>
          <span>{section.section_type.replace("_", " ")}</span>
          <strong>{section.section_key}</strong>
        </div>
        <label>
          <input
            checked={section.is_enabled}
            onChange={(event) => onToggle(event.target.checked)}
            type="checkbox"
          />
          Visible
        </label>
      </header>
      <div className={styles.twoColumns}>
        <label>
          Eyebrow
          <input
            onChange={(event) => onChange("eyebrow", event.target.value)}
            value={get("eyebrow")}
          />
        </label>
        <label>
          Heading
          <input
            onChange={(event) => onChange("title", event.target.value)}
            value={get("title")}
          />
        </label>
      </div>
      <label>
        Body copy
        <textarea
          onChange={(event) => onChange("body", event.target.value)}
          rows={4}
          value={get("body")}
        />
      </label>
      {["hero", "cta"].includes(section.section_type) ? (
        <div className={styles.twoColumns}>
          <label>
            Primary button
            <input
              onChange={(event) =>
                onChange(
                  section.section_type === "cta" ? "buttonText" : "primaryCta",
                  event.target.value,
                )
              }
              value={
                get(
                  section.section_type === "cta"
                    ? "buttonText"
                    : "primaryCta",
                )
              }
            />
          </label>
          {section.section_type === "hero" ? (
            <label>
              Secondary button
              <input
                onChange={(event) =>
                  onChange("secondaryCta", event.target.value)
                }
                value={get("secondaryCta")}
              />
            </label>
          ) : null}
        </div>
      ) : null}
      {["features", "testimonials", "faq"].includes(section.section_type) ? (
        <label>
          {section.section_type === "faq"
            ? "Questions and answers (Question|Answer, one per line)"
            : "Items (one per line)"}
          <textarea
            onChange={(event) =>
              onChange(
                "items",
                event.target.value
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean),
              )
            }
            rows={6}
            value={list.join("\n")}
          />
        </label>
      ) : null}
    </article>
  );
}
