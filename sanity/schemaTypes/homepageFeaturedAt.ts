import { defineField, defineType } from "sanity";

// "Featured At" — the small uppercase eyebrow label plus the row of press/
// event logos below it. No fallback if items is left empty (same
// reasoning as the client-logos array on Testimonials Intro) — the whole
// block just won't render.
export const homepageFeaturedAt = defineType({
  name: "homepageFeaturedAt",
  title: "Homepage: Featured At",
  type: "document",
  fields: [
    defineField({
      name: "heading",
      title: "Heading",
      type: "string",
      initialValue: "Featured At",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "items",
      title: "Logos",
      type: "array",
      of: [
        {
          type: "object",
          name: "featuredLogo",
          fields: [
            defineField({
              name: "name",
              title: "Name",
              type: "string",
              description: "Used as the image's alt text.",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "logo",
              title: "Logo",
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
