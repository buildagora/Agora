import {
  rankOrganicCandidates,
  scoreOrganicCandidateUrl,
} from "../scoreOrganicCandidateUrl";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

const domain = "example.com";
const query = "metal roofing panel";

const productScore = scoreOrganicCandidateUrl({
  link: "https://www.example.com/products/metal-roofing-panel-123",
  title: "Metal Roofing Panel 24ga",
  thumbnail: "https://cdn.example.com/thumb.jpg",
  query,
  domain,
});

const blogScore = scoreOrganicCandidateUrl({
  link: "https://www.example.com/blog/metal-roofing-trends",
  title: "Metal Roofing Trends",
  query,
  domain,
});

const homepageScore = scoreOrganicCandidateUrl({
  link: "https://www.example.com/",
  title: "Example Supply Home",
  query,
  domain,
});

assert(productScore > blogScore, "product URL outscores blog URL");
assert(productScore > homepageScore, "product URL outscores homepage");
assert(blogScore < homepageScore, "blog URL scores below neutral homepage");

const ranked = rankOrganicCandidates([
  {
    link: "https://www.example.com/about",
    title: "About Us",
    query,
    domain,
  },
  {
    link: "https://www.example.com/catalog/metal-roofing/",
    title: "Metal Roofing Catalog",
    query,
    domain,
  },
  {
    link: "https://www.example.com/products/panel-123",
    title: "Metal Roofing Panel",
    thumbnail: "https://cdn.example.com/p.jpg",
    query,
    domain,
  },
]);

assert(
  ranked[0]?.link.includes("/products/"),
  "rankOrganicCandidates prefers product page first"
);

console.log("\nAll scoreOrganicCandidateUrl tests passed.\n");
