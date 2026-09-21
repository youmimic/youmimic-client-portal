import { defineField, defineType } from "sanity";

// "Awards and Nominations" — the row of award/finalist badges below Featured
// At. Badges are detailed full-colour artwork (dark text on transparent
// backgrounds), so the page shows each on a light tile rather than the
// single-colour silhouette treatment Featured At uses. No fallback if
// items is left empty (same reasoning as the other logo arrays) — the
// whole section just won't render.
export const homepageAwards = defineType({
  name: "homepageAwards",
  title: "Homepage: Awards and Nominations",
  type: "document",
  fields: [
    defineField({
      name: "heading",
      title: "Heading",
      type: "string",
      initialValue: "Awards and Nominations",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "items",
      title: "Awards",
      type: "array",
      of: [
        {
          type: "object",
          name: "award",
          fields: [
            defineField({
              name: "name",
              title: "Name",
              type: "string",
              description: "Used as the image's alt text, e.g. \"TasICT Awards 2026 Finalist: Technology Industry Rising Star\".",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "logo",
              title: "Badge image",
              type: "image",
              validation: (rule) => rule.required(),
            }),
          ],
          preview: {
            select: { title: "name", media: "logo" },
          },
        },
      ],
    }),
  ],
  preview: {
    select: { title: "heading" },
  },
});
