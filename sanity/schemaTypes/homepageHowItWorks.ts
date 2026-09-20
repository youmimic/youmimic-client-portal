import { defineField, defineType } from "sanity";

// "How It [Works]" section — heading/subheading, the 3-step list, and the
// closing "Get Started" button label (the button's destination stays
// code-driven — it depends on the visitor's auth state — same as the
// hero's CTA). Step numbers are derived from array position at render
// time, not stored, so reordering steps in Studio can't create a mismatch.
export const homepageHowItWorks = defineType({
  name: "homepageHowItWorks",
  title: "Homepage: How It Works",
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
      description: 'E.g. "Works" — rendered in the brand teal color',
      initialValue: "Works",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "subheading",
      title: "Subheading",
      type: "text",
      rows: 2,
      initialValue: "We create a photorealistic digital twin of your staff.",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "steps",
      title: "Steps",
      type: "array",
      of: [
        {
          type: "object",
          name: "step",
          fields: [
            defineField({ name: "title", title: "Title", type: "string", validation: (rule) => rule.required() }),
            defineField({ name: "body", title: "Body", type: "text", rows: 3, validation: (rule) => rule.required() }),
          ],
          preview: {
            select: { title: "title" },
          },
        },
      ],
      validation: (rule) => rule.required().min(1),
      initialValue: [
        {
          _type: "step",
          _key: "choose-plan",
          title: "Choose your Plan",
          body: "Choose your plan. Our team visits your workplace, anywhere in Australia. 30 minutes per person, up to 10 staff in one day.",
        },
        {
          _type: "step",
          _key: "build-avatar",
          title: "We Build Your Avatar",
          body: "We create and train your avatar. No technical setup required from your team.",
        },
        {
          _type: "step",
          _key: "avatar-ready",
          title: "Your Avatar Is Ready",
          body: "We deploy your avatar and give you access to our platform. Your team can create business content on demand, in 175+ languages.",
        },
      ],
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
    select: { title: "headingAccent" },
  },
});
