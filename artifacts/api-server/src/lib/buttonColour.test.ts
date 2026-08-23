import { describe, expect, it } from "vitest";
import {
  BUTTON_VARIANTS,
  buildItem17Email,
  type ButtonVariant,
} from "./email";

/**
 * The guard for the colour leak that bit three times in one weekend.
 *
 * A button label's colour has to be stated in THREE places, and every one of
 * them is load-bearing:
 *
 *   1. on the <a>            — most clients
 *   2. on the inner <span>   — clients that impose their own link colour
 *   3. in the MSO <style>    — Outlook classic, which repaints a FOLLOWED link
 *                              its own purple and cannot be reached inline,
 *                              because there is no inline syntax for :visited
 *
 * Miss any one and it looks fine until the wrong client, or the second click.
 * That is exactly how the quiet variant shipped purple.
 *
 * This iterates BUTTON_VARIANTS itself rather than a list written out here, so
 * a variant added tomorrow is tested tomorrow — without anyone remembering to
 * come back and add it.
 */
const LINK = "https://www.auntlucy.com.au/manage/a91c0f3d5e";

function renderWith(variant: ButtonVariant): string {
  return buildItem17Email({
    to: "helper@example.com",
    subject: "Subject",
    // The link alone on its own paragraph is what gets promoted to the button.
    body: `A sentence.\n\n${LINK}`,
    link: LINK,
    ctaLabel: "Do the thing",
    ctaVariant: variant,
  }).html;
}

const variants = Object.keys(BUTTON_VARIANTS) as ButtonVariant[];

it("there is at least one variant to check", () => {
  expect(variants.length).toBeGreaterThan(0);
});

describe.each(variants)("the %s button", (variant) => {
  const { fg } = BUTTON_VARIANTS[variant];
  const html = renderWith(variant);

  const anchor =
    html.match(
      new RegExp(`<a class="al-btn al-btn--${variant}"[^>]*>.*?</a>`, "s"),
    )?.[0] ?? "";

  it("renders at all", () => {
    expect(anchor).not.toBe("");
  });

  it(`forces ${fg} on the <a>`, () => {
    expect(anchor.match(/<a [^>]*>/)?.[0]).toContain(`color:${fg}`);
  });

  it(`forces ${fg} on the inner <span>`, () => {
    const span = anchor.match(/<span [^>]*>/)?.[0] ?? "";
    expect(span).toContain(`color:${fg}`);
  });

  it(`forces ${fg} on :visited inside an MSO conditional`, () => {
    const mso = html.match(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/)?.[0] ?? "";
    expect(mso).not.toBe("");

    // Find this variant's rule by substring rather than by regex: the selector
    // list is long and the escaping is easy to get subtly wrong, which is the
    // same class of mistake this file exists to catch.
    const rule =
      mso
        .split("\n")
        .find((line) => line.includes(`a.al-btn--${variant}:visited`)) ?? "";

    expect(rule).not.toBe("");
    expect(rule).toContain(`color: ${fg} !important`);
  });
});
