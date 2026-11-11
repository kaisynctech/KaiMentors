export function marketNotesTabLabel(portalSlug: string) {
  return portalSlug === "bandi-shares" ? "Bandile's notes" : "Notes";
}

export function academyPublishesExternalNews(portalSlug: string) {
  return portalSlug === "bandi-shares";
}

export type MarketArticle = {
  id: string;
  title: string;
  yesterday: string;
  today: string;
  published: boolean;
  published_at: string | null;
  created_at: string;
};
