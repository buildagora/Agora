import type { BrowseAliasMatchType } from "@/lib/suppliers/schema/rankBrowseUrlsByQuery";
import type { RankedBrowseUrl } from "@/lib/suppliers/schema/rankBrowseUrlsByQuery";
import { extractHomepageCandidateLinks } from "./discoverHomepageCandidateUrls";
import {
  fetchHtmlScrapeUrl,
  type HtmlScrapeFetchDeps,
} from "./fetchHtmlScrape.server";

export type ExpandedCategoryCandidate = {
  url: string;
  aliasSourceProductType?: string;
  aliasMatchType: BrowseAliasMatchType;
};

export type ExpandCategoryCandidateUrlsInput = {
  domain: string;
  seedUrls: string[];
  parentRankByUrl: Map<string, RankedBrowseUrl>;
};

export type ExpandCategoryCandidateUrlsDeps = HtmlScrapeFetchDeps;

export async function expandCategoryCandidateUrls(
  input: ExpandCategoryCandidateUrlsInput,
  deps?: ExpandCategoryCandidateUrlsDeps
): Promise<ExpandedCategoryCandidate[]> {
  const discovered: ExpandedCategoryCandidate[] = [];

  for (const seedUrl of input.seedUrls) {
    const response = await fetchHtmlScrapeUrl(seedUrl, deps);
    if (response.status !== 200 || !response.html.trim()) continue;

    const parentRank = input.parentRankByUrl.get(seedUrl);
    const links = extractHomepageCandidateLinks(
      response.html,
      response.url || seedUrl,
      input.domain
    );

    for (const url of links) {
      if (input.seedUrls.includes(url)) continue;
      discovered.push({
        url,
        aliasSourceProductType: parentRank?.aliasSourceProductType,
        aliasMatchType: "subcategory_expansion",
      });
    }
  }

  return discovered;
}
