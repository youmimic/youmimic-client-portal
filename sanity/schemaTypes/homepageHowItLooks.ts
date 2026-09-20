import { defineField, defineType } from "sanity";

// "How It [Looks]" section intro — heading/subheading above the video,
// which stays hardcoded (not a CMS field). Same prefix/accent split as
// homepageIntro, for the same two-tone-heading reason.
export const homepageHowItLooks = defineType({
  name: "homepageHowItLooks",
  title: "Homepage: How It Looks",
  type: "document",
  fields: [
    defineField({
      name: "headingPrefix",
      title: "Heading (plain part)",
      type: "string",
      description: 'E.g. "How It"',
      initialValue: "How It",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "headingAccent",
      title: "Heading (accent part)",
      type: "string",
      description: 'E.g. "Looks" — rendered in the brand teal color',
      initialValue: "Looks",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "subheading",
      title: "Subheading",
      type: "text",
      rows: 3,
      initialValue:
        "We create a photorealistic digital twin of your team, capable of producing 4K-quality video content from a simple text prompt, no camera, no studio, no reshoots.",
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: { title: "headingAccent" },
  },
});
