import { defineField, defineType } from "sanity";

// Singleton — there is exactly one homepage hero, so the desk structure
// (sanity.config.ts) links straight to this one document instead of a
// list. Deliberately narrow: only the copy/image an admin actually asked
// to edit, not every prop the hero section renders. The "Get Started"
// button's destination stays code-driven (depends on the visitor's auth
// state), so it isn't a CMS field.
export const homepageHero = defineType({
  name: "homepageHero",
  title: "Homepage Hero",
  type: "document",
  fields: [
    defineField({
      name: "heading",
      title: "Heading",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "backgroundImage",
      title: "Background image",
      type: "image",
      options: { hotspot: true },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "ctaLabel",
      title: "Button label",
      type: "string",
      initialValue: "Get Started",
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: { title: "heading", media: "backgroundImage" },
  },
});
