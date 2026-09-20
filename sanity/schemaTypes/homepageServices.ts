import { defineField, defineType } from "sanity";

// "Our Services" section — a plain (non-accented) heading, unlike most
// other homepage sections. Each service card's icon stays code-driven,
// picked by array position (see app/(marketing)/page.tsx) rather than a
// CMS field — reordering services in Studio would otherwise risk a
// title/icon mismatch with no easy way to fix it from a simple dropdown.
// The closing "Get Started" button's destination stays code-driven too,
// same as every other CTA on this page.
export const homepageServices = defineType({
  name: "homepageServices",
  title: "Homepage: Services",
  type: "document",
  fields: [
    defineField({
      name: "heading",
      title: "Heading",
      type: "string",
      initialValue: "Our Services",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "subheading",
      title: "Subheading",
      type: "text",
      rows: 3,
      initialValue:
        "We capture your digital twin at your office, train and deploy it. Your team can create 4K content with a simple text prompt, in any language, on demand.",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "items",
      title: "Services",
      description:
        "No fallback if left empty (same reasoning as the Digital Twin Intro's image) — the grid simply won't render.",
      type: "array",
      of: [
        {
          type: "object",
          name: "service",
          fields: [
            defineField({ name: "title", title: "Title", type: "string", validation: (rule) => rule.required() }),
            defineField({ name: "body", title: "Body", type: "text", rows: 4, validation: (rule) => rule.required() }),
            defineField({ name: "image", title: "Image", type: "image", validation: (rule) => rule.required() }),
          ],
          preview: {
            select: { title: "title", media: "image" },
          },
        },
      ],
      validation: (rule) => rule.required().min(1),
    }),
    defineField({
      name: "ctaLabel",
      title: "Button label",
      type: "string",
      description: "Links to the signup/dashboard flow — the destination stays fixed, only the label is editable.",
      initialValue: "Get Started",
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: { title: "heading" },
  },
});
