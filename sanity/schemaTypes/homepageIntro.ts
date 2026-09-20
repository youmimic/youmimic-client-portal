import { defineField, defineType } from "sanity";

// "We create your [digital twin]." — split into a plain prefix and a
// teal-accented word/phrase (not one plain string) so the existing
// two-tone heading style stays intact after an edit instead of collapsing
// to one flat color. Same singleton pattern as homepageHero.
export const homepageIntro = defineType({
  name: "homepageIntro",
  title: "Homepage: Digital Twin Intro",
  type: "document",
  fields: [
    defineField({
      name: "headingPrefix",
      title: "Heading (plain part)",
      type: "string",
      description: 'E.g. "We create your"',
      initialValue: "We create your",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "headingAccent",
      title: "Heading (accent part)",
      type: "string",
      description: 'E.g. "digital twin" — rendered in the brand teal color',
      initialValue: "digital twin",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "body",
      title: "Body text",
      type: "text",
      rows: 4,
      initialValue:
        "One capture. Infinite communication. It speaks, looks, and sounds exactly like you, training teams, updating clients, and pitching investors in 175+ languages, at 4K quality, anywhere, anytime.",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "image",
      title: "Image",
      type: "image",
      options: { hotspot: true },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "ctaLabel",
      title: "Button label",
      type: "string",
      description: 'Links to /solutions — the destination stays fixed, only the label is editable.',
      initialValue: "Learn More",
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: { title: "headingAccent", media: "image" },
  },
});
